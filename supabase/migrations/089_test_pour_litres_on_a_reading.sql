-- =============================================================================
-- 089: a reading can carry TEST LITRES - fuel that went through the meter and
-- straight back into the tank.
--
-- Built first for Al Tufail (his 902), carried to Raees Gullan as 089. The master
-- and Mubeen do not have it yet.
--
-- A test pour (the measure check at the start of the day, a calibration run)
-- turns the dial and puts nothing in a customer's car: the litres go back into
-- the tank. The meter counts turns, not litres, so the closing reading must stay
-- exactly what the machine shows. Until now the only way to say "24 L of that came
-- back" was a workaround: a "Unit check" delivery for the stock and a slip on a
-- dummy customer for the cash, which also inflated the Dashboard's Credit.
--
-- This adds one nullable column, test_litres, and makes the two generated figures
-- net of it:
--
--   litres_sold = closing - opening - test_litres
--   sale_amount = round(litres_sold * rate, 2)
--
-- Every report, the stock calculation and the Dashboard already read litres_sold
-- and sale_amount, so none of them changes: the 24 L is simply not a sale, and
-- is never taken out of the tank, so no delivery is needed to put it back. The
-- meter chain (opening of one day = closing of the last) reads the meter columns,
-- which stay gross.
--
--   * test_litres is NULLABLE (a backup from before it reads as none).
--   * It cannot exceed what the meter moved.
--   * The cash + credit check, create_nozzle_reading (now with p_test_litres,
--     default 0) and the re-price of a backdated rate all use the net litres.
--
-- Existing rows have no test litres, so their litres_sold and sale_amount come
-- out exactly as they were. One transaction.
-- =============================================================================

begin;

alter table public.nozzle_readings
  add column test_litres numeric(12, 2)
  check (test_litres is null or test_litres >= 0);

alter table public.nozzle_readings
  drop constraint nozzle_readings_split_matches_sale,
  drop column sale_amount,
  drop column litres_sold;

alter table public.nozzle_readings
  add column litres_sold numeric(12, 2) generated always as
    (closing_reading - opening_reading - coalesce(test_litres, 0)) stored,
  add column sale_amount numeric(14, 2) generated always as
    (round((closing_reading - opening_reading - coalesce(test_litres, 0)) * rate_per_litre, 2)) stored,
  add constraint nozzle_readings_test_within_meter
    check (coalesce(test_litres, 0) <= closing_reading - opening_reading),
  add constraint nozzle_readings_split_matches_sale
    check (round(cash_amount + credit_amount, 2)
           = round((closing_reading - opening_reading - coalesce(test_litres, 0)) * rate_per_litre, 2));

comment on column public.nozzle_readings.test_litres is
  'Litres that went through the meter and back into the tank (a test pour). Not a sale; litres_sold and sale_amount are net of it. See 089.';

-- create_nozzle_reading: the same function with one more argument.
drop function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb);

create or replace function public.create_nozzle_reading(
  p_nozzle_id    uuid,
  p_reading_date date,
  p_opening      numeric,
  p_closing      numeric,
  p_rate         numeric,
  p_cash         numeric,
  p_credit_lines jsonb default '[]'::jsonb,
  p_test_litres  numeric default 0
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_reading_id   uuid;
  v_credit_total numeric(14, 2);
  v_sale         numeric(14, 2);
  v_cash         numeric(14, 2);
  v_line         jsonb;
begin
  select coalesce(sum((l ->> 'amount')::numeric), 0)
    into v_credit_total
    from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb)) l;

  v_sale := round((p_closing - p_opening - coalesce(p_test_litres, 0)) * p_rate, 2);
  v_cash := v_sale - v_credit_total;

  if v_cash < 0 then
    raise exception
      'The credit slips come to Rs %, which is more than the Rs % sold on this nozzle. '
      'Check the slips.',
      to_char(v_credit_total, 'FM999,999,999,990.00'),
      to_char(v_sale, 'FM999,999,999,990.00')
      using errcode = '23514';
  end if;

  insert into public.nozzle_readings (
    nozzle_id, reading_date, opening_reading, closing_reading,
    rate_per_litre, cash_amount, credit_amount, test_litres, created_by
  )
  values (
    p_nozzle_id, p_reading_date, p_opening, p_closing,
    p_rate, v_cash, v_credit_total, nullif(p_test_litres, 0), auth.uid()
  )
  returning id into v_reading_id;

  for v_line in
    select value from jsonb_array_elements(coalesce(p_credit_lines, '[]'::jsonb))
  loop
    insert into public.credit_sales (reading_id, customer_id, litres, amount, vehicle_id)
    values (
      v_reading_id,
      (v_line ->> 'customer_id')::uuid,
      (v_line ->> 'litres')::numeric,
      (v_line ->> 'amount')::numeric,
      nullif(v_line ->> 'vehicle_id', '')::uuid
    );
  end loop;

  return v_reading_id;
end;
$$;

revoke all on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb, numeric) from public, anon;
grant execute on function public.create_nozzle_reading(uuid, date, numeric, numeric, numeric, numeric, jsonb, numeric) to authenticated;

-- The re-price of a backdated rate (066), net of test litres.
create or replace function public.reprice_readings_for_span(
  p_fuel_type public.fuel_type,
  p_from      date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until        date;
  v_count        int;
  v_first        date;
  v_last         date;
  v_old_rates    text;
  v_new_rate     numeric;
  v_before       numeric(14, 2);
  v_after        numeric(14, 2);
  v_short        record;
  v_unpriced     int;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may change a fuel price' using errcode = '42501';
  end if;

  -- The span this date's price governs: up to, not including, the next price.
  select min(fp.effective_from) into v_until
    from public.fuel_prices fp
   where fp.fuel_type = p_fuel_type and fp.effective_from > p_from;

  -- Readings in the span with no price at all to fall back to (a price removed
  -- with nothing before it). Left as they are and counted.
  select count(*) into v_unpriced
    from public.nozzle_readings r
    join public.nozzles n on n.id = r.nozzle_id
    join public.tanks t on t.id = n.tank_id
   where t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is null;

  -- The re-price would leave a nozzle's credit slips larger than its sale.
  -- Refused here, with a sentence, rather than by the check constraint.
  select r.reading_date, n.unit_number, n.nozzle_label, r.credit_amount,
         round((r.closing_reading - r.opening_reading - coalesce(r.test_litres, 0))
               * public.current_fuel_rate(p_fuel_type, r.reading_date), 2) as new_sale
    into v_short
    from public.nozzle_readings r
    join public.nozzles n on n.id = r.nozzle_id
    join public.tanks t on t.id = n.tank_id
   where t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is not null
     and r.rate_per_litre <> public.current_fuel_rate(p_fuel_type, r.reading_date)
     and r.credit_amount > round((r.closing_reading - r.opening_reading - coalesce(r.test_litres, 0))
                                 * public.current_fuel_rate(p_fuel_type, r.reading_date), 2)
   order by r.reading_date
   limit 1;

  if found then
    raise exception
      'At the new rate, Unit % Nozzle % on % sold Rs %, but its credit slips come to Rs %. '
      'Correct the slips on that day first, then set the rate again.',
      v_short.unit_number, v_short.nozzle_label, to_char(v_short.reading_date, 'DD Mon YYYY'),
      to_char(v_short.new_sale, 'FM999,999,999,990.00'),
      to_char(v_short.credit_amount, 'FM999,999,999,990.00')
      using errcode = '23514';
  end if;

  -- What is about to move, for the answer. Read before the update.
  select count(*), min(r.reading_date), max(r.reading_date),
         string_agg(distinct to_char(r.rate_per_litre, 'FM999,990.00'), ', '),
         sum(r.sale_amount),
         sum(round((r.closing_reading - r.opening_reading - coalesce(r.test_litres, 0))
                   * public.current_fuel_rate(p_fuel_type, r.reading_date), 2))
    into v_count, v_first, v_last, v_old_rates, v_before, v_after
    from public.nozzle_readings r
    join public.nozzles n on n.id = r.nozzle_id
    join public.tanks t on t.id = n.tank_id
   where t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is not null
     and r.rate_per_litre <> public.current_fuel_rate(p_fuel_type, r.reading_date);

  v_new_rate := public.current_fuel_rate(p_fuel_type, p_from);

  -- The same derivation as create_nozzle_reading (052): the sale is exactly
  -- the generated column's expression, the cash is exactly sale - credit.
  update public.nozzle_readings r
     set rate_per_litre = public.current_fuel_rate(p_fuel_type, r.reading_date),
         cash_amount    = round((r.closing_reading - r.opening_reading - coalesce(r.test_litres, 0))
                                * public.current_fuel_rate(p_fuel_type, r.reading_date), 2)
                          - r.credit_amount
    from public.nozzles n
    join public.tanks t on t.id = n.tank_id
   where n.id = r.nozzle_id
     and t.fuel_type = p_fuel_type
     and r.reading_date >= p_from
     and (v_until is null or r.reading_date < v_until)
     and public.current_fuel_rate(p_fuel_type, r.reading_date) is not null
     and r.rate_per_litre <> public.current_fuel_rate(p_fuel_type, r.reading_date);

  return jsonb_build_object(
    'fuel_type',  p_fuel_type,
    'repriced',   coalesce(v_count, 0),
    'first_day',  v_first,
    'last_day',   v_last,
    'old_rates',  v_old_rates,
    'new_rate',   v_new_rate,
    'before',     coalesce(v_before, 0),
    'after',      coalesce(v_after, 0),
    'unpriced',   v_unpriced
  );
end;
$$;

comment on function public.reprice_readings_for_span(public.fuel_type, date) is
  'Brings the readings of one fuel, in the span the price dated p_from governs, '
  'onto the rate now in force for each day. Owner only. See 066 and 089.';

revoke execute on function public.reprice_readings_for_span(public.fuel_type, date) from public, anon;
grant execute on function public.reprice_readings_for_span(public.fuel_type, date) to authenticated;

commit;
