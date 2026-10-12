-- =============================================================================
-- RAEES GULLAN FILLING STATION: the forecourt and the first two days of his
-- register (1 and 2 October 2026), so the Dashboard can be checked against his books.
--
-- Run ONCE, in his Supabase SQL Editor, after the migrations, raees-gullan-tanks.sql and
-- raees-gullan-dip-charts.sql, and after the owner login exists (umraniakram@gmail.com,
-- made owner). Refuses if anything has traded already. One transaction.
--
-- THE DATES (settled with the owner, 12 Oct): the cash sheet of a day carries that day's
-- own sale, so the meter page with sale Rs 187,129.42 is 1 OCTOBER and the page with
-- Rs 66,188.82 is 2 OCTOBER. (They were first read one day earlier.) His 30 September
-- meter page has not been seen, so the app starts at the close of 30 September.
--
-- WHAT IS IN IT (every figure read off his register pages):
--   Tanks      Petrol Tank 25,000 L, opening 1,123.09 L; Diesel Tank (his two diesel tanks
--              joined as one) 50,000 L, opening 2,000 L; both as of 1 Oct. The register shows
--              diesel "purchase 2,000" on 1 Oct and a stray -32.85 as the existing stock; the
--              app cannot hold a negative opening stock, so the 2,000 L starts the day in the
--              tank. Expected stock at the close of 1 Oct is then the register's own 1,670.37 L.
--   Nozzles    Super: unit 1, nozzle 1, meter 62,595.98. Diesel: unit 2, nozzle 1, meter
--              95,461.65; unit 2, nozzle 2, meter 67,445.45 (it did not move on either day).
--              The names are placeholders: rename them under Settings -> nozzle settings.
--   Prices     1 Oct: petrol 395.50, diesel 407.95. From 2 Oct: petrol 398.75, diesel 406.95.
--   Readings   1 and 2 Oct, closing readings as written, all as CASH until the credit slips go in.
--   Dips       Midnight dips as written, dated the day that closed, mm read through the chart:
--              1 Oct petrol 372 mm, diesel 400 mm; 2 Oct petrol 348 mm, diesel 388 mm.
--   1 Oct cash Expense: Local 8,350. Takings after it, 83,098.42, into the safe as "Cash of shift
--              closing"; 12,022 paid in cash to the diesel supplier (a placeholder supplier,
--              rename it); the safe is left holding 71,076.42, his cash in hand.
--
-- NOT IN IT YET: customers, the credit (Rs 156,681 on 1 Oct) and the Rs 61,000 received from
-- customers, which need the customers' names and which fuel each slip took.
--
-- Expected on the Dashboard afterwards (a paisa differs from his register because it cuts
-- 116.82 x 398.75 = 46,581.975 down and the database rounds it up):
--   1 Oct    sales 187,129.43; 2 Oct sales 66,188.83.
--   Dips     1 Oct petrol 1,265.50 L (275.55 over the books), diesel 1,799.00 L (128.63 over);
--            2 Oct petrol 1,151.47 L (2.79 over), diesel 1,722.20 L (28.62 short).
-- =============================================================================
begin;

-- The owner's own login, so the functions that are for the owner alone accept us.
select set_config(
  'request.jwt.claim.sub',
  (select u.id::text from auth.users u where lower(u.email) = 'umraniakram@gmail.com'),
  true
);

do $$
declare
  v_owner  uuid := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  v_petrol uuid;
  v_diesel uuid;
  n_super  uuid;
  n_dsl1   uuid;
  n_dsl2   uuid;
  v_exp    numeric;
  v_lit    numeric;
  v_day    date;
  v_tank   uuid;
  v_mm     numeric;
  v_sup    uuid;
begin
  if v_owner is null or not exists (select 1 from public.profiles where id = v_owner and role = 'super_admin') then
    raise exception 'STOPPED: umraniakram@gmail.com is not an owner login yet. Nothing was changed.';
  end if;
  if exists (select 1 from public.nozzle_readings) or exists (select 1 from public.stock_checks)
     or exists (select 1 from public.fuel_purchases) or exists (select 1 from public.nozzles) then
    raise exception 'STOPPED: this database already has nozzles, readings, dips or deliveries. Nothing was changed.';
  end if;

  select id into v_petrol from public.tanks where name = 'Petrol Tank' and fuel_type = 'petrol';
  select id into v_diesel from public.tanks where name = 'Diesel Tank' and fuel_type = 'diesel';
  if v_petrol is null or v_diesel is null then
    raise exception 'STOPPED: expected the tanks called Petrol Tank and Diesel Tank (run raees-gullan-tanks.sql first). Nothing was changed.';
  end if;

  -- Tanks: size and what was in them at the start of 1 October.
  update public.tanks set capacity_litres = 25000, opening_stock_litres = 1123.09, opening_stock_date = date '2026-10-01'
   where id = v_petrol;
  update public.tanks set capacity_litres = 50000, opening_stock_litres = 2000, opening_stock_date = date '2026-10-01'
   where id = v_diesel;

  -- Nozzles, with the meter at the START of 1 October (the close of 30 September).
  n_super := public.add_nozzle(1, '1', v_petrol, 62595.98);
  n_dsl1  := public.add_nozzle(2, '1', v_diesel, 95461.65);
  n_dsl2  := public.add_nozzle(2, '2', v_diesel, 67445.45);

  -- Prices, oldest first.
  perform public.set_fuel_price('petrol', 395.50, date '2026-10-01');
  perform public.set_fuel_price('diesel', 407.95, date '2026-10-01');
  perform public.set_fuel_price('petrol', 398.75, date '2026-10-02');
  perform public.set_fuel_price('diesel', 406.95, date '2026-10-02');

  -- Readings. The cash figure is what is left after credit, and there is no credit yet.
  -- 1 October
  perform public.create_nozzle_reading(n_super, date '2026-10-01', 62595.98, 62729.12, 395.50,
            round((62729.12 - 62595.98) * 395.50, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl1,  date '2026-10-01', 95461.65, 95791.28, 407.95,
            round((95791.28 - 95461.65) * 407.95, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl2,  date '2026-10-01', 67445.45, 67445.45, 407.95, 0, '[]'::jsonb);
  -- 1 October
  perform public.create_nozzle_reading(n_super, date '2026-10-02', 62729.12, 62845.94, 398.75,
            round((62845.94 - 62729.12) * 398.75, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl1,  date '2026-10-02', 95791.28, 95839.46, 406.95,
            round((95839.46 - 95791.28) * 406.95, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl2,  date '2026-10-02', 67445.45, 67445.45, 406.95, 0, '[]'::jsonb);

  -- Dips: taken at midnight after the last sale, so each closes the day it is dated.
  for v_day, v_tank, v_mm in
    select * from (values
      (date '2026-10-01', v_petrol, 372::numeric),
      (date '2026-10-01', v_diesel, 400::numeric),
      (date '2026-10-02', v_petrol, 348::numeric),
      (date '2026-10-02', v_diesel, 388::numeric)
    ) as d(day, tank, mm)
    order by 1, 2
  loop
    v_lit := public.dip_to_litres(v_tank, v_mm);
    v_exp := public.calculate_expected_stock(v_tank, v_day);
    insert into public.stock_checks (tank_id, check_date, taken, expected_stock, actual_dip_reading, dip_mm, created_by)
    values (v_tank, v_day, 'evening', coalesce(v_exp, 0), v_lit, v_mm, v_owner);
  end loop;

  -- 1 October, from his cash sheet. One expense (Local, 8,350). The takings after that expense,
  -- 83,098.42, came into the safe; then 12,022 was paid in cash to the diesel supplier, leaving
  -- the 71,076.42 he says was left in hand.
  insert into public.expenses (category, amount, expense_date, note, created_by)
  values ('Local expenses', 8350, date '2026-10-01', 'From his register, 1 Oct', v_owner);

  insert into public.suppliers (name, note, created_by)
  values ('Diesel supplier (rename)', 'Placeholder. Rename it under Suppliers.', v_owner)
  returning id into v_sup;

  insert into public.treasury_entries (entry_date, direction, amount, category, details, created_by)
  values (date '2026-10-01', 'in', 83098.42, 'shift_closing', 'Takings after expenses, 1 Oct', v_owner);

  perform public.record_supplier_payment(v_sup, 12022, date '2026-10-01', 'cash', null, 'Paid for diesel, 1 Oct');
end;
$$;

-- What landed. Expect 3 nozzles, 6 readings, 4 dips, sales 187,129.43 and 66,188.83.
select r.reading_date, count(*) as readings, round(sum(r.litres_sold), 2) as litres, round(sum(r.sale_amount), 2) as sales
  from public.nozzle_readings r group by r.reading_date order by 1;
select t.name, t.capacity_litres, t.opening_stock_litres, t.opening_stock_date, t.current_stock_litres from public.tanks t order by t.fuel_type;
select t.name, s.check_date, s.dip_mm, s.actual_dip_reading, s.expected_stock, s.gain_loss
  from public.stock_checks s join public.tanks t on t.id = s.tank_id order by s.check_date, t.fuel_type;

commit;
