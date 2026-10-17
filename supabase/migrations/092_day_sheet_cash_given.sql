-- =============================================================================
-- 092: a day sheet's udhaar line can be CASH, not fuel.
--
-- RAEES GULLAN ONLY (17 Oct 2026). The register lists cash handed to a customer
-- in the same udhaar box as fuel on credit, and the old "Money taken" button wrote
-- "Cash given" on the customer's statement. The Udhaar list on the day sheet had
-- one note for both ("Udhaar, 17 Oct"), so a statement could not tell a litre of
-- diesel from a Rs 28,000 loan.
--
-- A line may now carry cash = true. Its ledger note is then "Cash given, 17 Oct"
-- (the same words recordCashGiven wrote, which the Dashboard's cash to collect
-- already counts as credit: 088), otherwise "Udhaar, 17 Oct" as before. Saving a
-- day again treats a line whose cash tick changed as a changed line: it is
-- cancelled with a correction entry and written again.
--
-- Only save_day_sheet() changes (091 is never edited once it has run); no table,
-- no column and no existing row.
-- =============================================================================

create or replace function public.save_day_sheet(p_date date, p_sheet jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_old        jsonb;           -- entry_ids of the previous save of this day
  v_ids        jsonb := jsonb_build_object('readings', '[]'::jsonb, 'credit', '[]'::jsonb,
                                           'received', '[]'::jsonb, 'expenses', '[]'::jsonb,
                                           'bank', '[]'::jsonb, 'treasury', '[]'::jsonb);
  r            jsonb;
  o            jsonb;
  v_n          int;
  v_amount     numeric;
  v_id         uuid;
  v_nozzle     uuid;
  v_fuel       public.fuel_type;
  v_rate       numeric;
  v_opening    numeric;
  v_closing    numeric;
  v_existing   record;
  v_kept       boolean;
  v_new        jsonb;
  v_new_count  int;
  v_used       boolean[];
  i            int;
  v_sales      numeric;
  v_credit     numeric;
  v_received   numeric;
  v_expenses   numeric;
  v_bank       numeric := 0;
  v_counted    numeric := 0;
  v_cat        text;
  v_kind       text;
  v_list       jsonb;
  v_today_cash numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may save the day sheet' using errcode = '42501';
  end if;

  if p_date is null then
    raise exception 'The day sheet needs a date' using errcode = '23502';
  end if;

  perform pg_advisory_xact_lock(hashtext('day_sheet:' || p_date::text));

  select entry_ids into v_old from public.day_sheets where sheet_date = p_date;

  -- ---- a day the sheet did not write -------------------------------------------
  if v_old is null and exists (
       select 1 from public.nozzle_readings where reading_date = p_date) then
    raise exception 'The readings for % were entered the old way, so this sheet cannot change them. '
                    'Use the old Readings page for that day.',
                    to_char(p_date, 'DD Mon YYYY') using errcode = '23505';
  end if;

  -- ======================= READINGS ===============================================
  -- A reading that is unchanged stays; a changed or removed one goes (it has no
  -- slips, so nothing is reversed) and the new one is written.
  for r in select value from jsonb_array_elements(coalesce(p_sheet -> 'readings', '[]'::jsonb)) loop
    v_nozzle  := (r ->> 'nozzle_id')::uuid;
    v_opening := (r ->> 'opening')::numeric;
    v_closing := (r ->> 'closing')::numeric;
    v_rate    := (r ->> 'rate')::numeric;

    if v_nozzle is null or v_opening is null or v_closing is null then
      raise exception 'Every nozzle needs its opening and closing meter' using errcode = '23502';
    end if;
    if v_closing < v_opening then
      raise exception 'A closing meter is lower than its opening (nozzle %)', v_nozzle using errcode = '23514';
    end if;
    if v_rate is null or v_rate <= 0 then
      raise exception 'Every nozzle needs a rate' using errcode = '23514';
    end if;

    select t.fuel_type into v_fuel
      from public.nozzles n join public.tanks t on t.id = n.tank_id
     where n.id = v_nozzle;
    if v_fuel is null then
      raise exception 'Unknown nozzle' using errcode = '23503';
    end if;

    select nr.id, nr.opening_reading, nr.closing_reading, nr.rate_per_litre
      into v_existing
      from public.nozzle_readings nr
     where nr.nozzle_id = v_nozzle and nr.reading_date = p_date;

    v_kept := v_existing.id is not null
              and v_existing.opening_reading = v_opening
              and v_existing.closing_reading = v_closing
              and v_existing.rate_per_litre  = v_rate;

    if v_kept then
      v_ids := jsonb_set(v_ids, '{readings}', (v_ids -> 'readings') || to_jsonb(v_existing.id));
      continue;
    end if;

    if v_existing.id is not null then
      perform public.delete_reading(v_existing.id);
    end if;

    -- A rate that is not the one in force that day is the day's new price: set it
    -- (owner only, re-prices the span) exactly as Settings would.
    if public.current_fuel_rate(v_fuel, p_date) is distinct from v_rate then
      if exists (select 1 from public.fuel_prices where fuel_type = v_fuel and effective_from = p_date) then
        update public.fuel_prices set rate = v_rate where fuel_type = v_fuel and effective_from = p_date;
        perform public.reprice_readings_for_span(v_fuel, p_date);
      else
        perform public.set_fuel_price(v_fuel, v_rate, p_date);
      end if;
    end if;

    v_id := public.create_nozzle_reading(v_nozzle, p_date, v_opening, v_closing, v_rate, 0, '[]'::jsonb, 0);
    v_ids := jsonb_set(v_ids, '{readings}', (v_ids -> 'readings') || to_jsonb(v_id));
  end loop;

  -- Readings of an earlier save that are no longer on the sheet.
  if v_old is not null then
    for r in select value from jsonb_array_elements(coalesce(v_old -> 'readings', '[]'::jsonb)) loop
      if not (v_ids -> 'readings') @> r and exists (
           select 1 from public.nozzle_readings where id = (r #>> '{}')::uuid) then
        perform public.delete_reading((r #>> '{}')::uuid);
      end if;
    end loop;
  end if;

  -- ======================= CUSTOMER LINES =========================================
  -- udhaar (a debit) and wasool (a credit): matched against the earlier save by
  -- customer and amount; a line that is the same stays, anything else is cancelled
  -- with a correction entry and the new line written.
  foreach v_kind in array array['credit', 'received'] loop
    v_list := coalesce(p_sheet -> v_kind, '[]'::jsonb);
    v_new_count := jsonb_array_length(v_list);
    v_used := array_fill(false, array[greatest(v_new_count, 1)]);

    -- what the earlier save wrote, kept when a line of the new sheet matches it
    if v_old is not null then
      for o in select value from jsonb_array_elements(coalesce(v_old -> v_kind, '[]'::jsonb)) loop
        v_kept := false;
        for i in 0 .. v_new_count - 1 loop
          if not v_used[i + 1]
             and (v_list -> i ->> 'customer_id')::uuid = (o ->> 'customer_id')::uuid
             and round((v_list -> i ->> 'amount')::numeric) = (o ->> 'amount')::numeric
             and coalesce((v_list -> i ->> 'cash')::boolean, false) = coalesce((o ->> 'cash')::boolean, false) then
            v_used[i + 1] := true;
            v_kept := true;
            v_ids := jsonb_set(v_ids, array[v_kind], (v_ids -> v_kind) || o);
            exit;
          end if;
        end loop;
        if not v_kept then
          if exists (select 1 from public.ledger_entries x where x.corrects_entry_id = (o ->> 'id')::uuid) then
            null;  -- already cancelled by hand: nothing to correct
          else
            perform public.correct_ledger_entry((o ->> 'id')::uuid, true, null, null,
                      'Cancelled when the day sheet for ' || to_char(p_date, 'DD Mon') || ' was saved again');
          end if;
        end if;
      end loop;
    end if;

    -- the lines that are new
    for i in 0 .. v_new_count - 1 loop
      continue when v_used[i + 1];
      v_amount := round((v_list -> i ->> 'amount')::numeric);
      if (v_list -> i ->> 'customer_id') is null or v_amount is null or v_amount <= 0 then
        raise exception 'Every customer line needs a customer and an amount of at least one rupee'
          using errcode = '23514';
      end if;

      if v_kind = 'credit' then
        insert into public.ledger_entries (customer_id, entry_type, amount, entry_date, note, created_by)
        values ((v_list -> i ->> 'customer_id')::uuid, 'debit', v_amount, p_date,
                case when coalesce((v_list -> i ->> 'cash')::boolean, false) then 'Cash given, ' else 'Udhaar, ' end
                  || to_char(p_date, 'DD Mon'), v_uid)
        returning id into v_id;
      else
        insert into public.ledger_entries (customer_id, entry_type, amount, entry_date, note, is_payment, created_by)
        values ((v_list -> i ->> 'customer_id')::uuid, 'credit', v_amount, p_date,
                'Wasool, ' || to_char(p_date, 'DD Mon'), true, v_uid)
        returning id into v_id;
      end if;

      v_ids := jsonb_set(v_ids, array[v_kind], (v_ids -> v_kind) ||
               jsonb_build_object('id', v_id, 'customer_id', v_list -> i ->> 'customer_id', 'amount', v_amount,
                                  'cash', v_kind = 'credit' and coalesce((v_list -> i ->> 'cash')::boolean, false)));
    end loop;
  end loop;

  -- ======================= EXPENSES, BANK, SAFE ===================================
  -- Removed and written again: none of them is a customer's statement.
  if v_old is not null then
    delete from public.expenses
     where id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(v_old -> 'expenses', '[]'::jsonb)));
    delete from public.bank_transactions
     where id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(v_old -> 'bank', '[]'::jsonb)));
    delete from public.treasury_entries
     where id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(v_old -> 'treasury', '[]'::jsonb)));
  end if;

  foreach v_kind in array array['local', 'pump', 'house'] loop
    v_cat := case v_kind when 'local' then 'Local expenses'
                         when 'pump'  then 'Pump expenses'
                         else 'Household expenses' end;
    for r in select value from jsonb_array_elements(coalesce(p_sheet -> v_kind, '[]'::jsonb)) loop
      v_amount := (r ->> 'amount')::numeric;
      if v_amount is null or v_amount <= 0 then
        raise exception 'Every expense line needs an amount above zero' using errcode = '23514';
      end if;
      insert into public.expenses (category, amount, expense_date, note, created_by)
      values (v_cat, v_amount, p_date, nullif(btrim(coalesce(r ->> 'name', '')), ''), v_uid)
      returning id into v_id;
      v_ids := jsonb_set(v_ids, '{expenses}', (v_ids -> 'expenses') || to_jsonb(v_id));
    end loop;
  end loop;

  r := p_sheet -> 'bank';
  if r is not null and jsonb_typeof(r) = 'object' and coalesce((r ->> 'amount')::numeric, 0) > 0 then
    v_bank := (r ->> 'amount')::numeric;
    if (r ->> 'account_id') is null then
      raise exception 'Choose the bank account the cash went to' using errcode = '23502';
    end if;
    insert into public.bank_transactions (account_id, txn_type, amount, txn_date, note, paid_in_directly, created_by)
    values ((r ->> 'account_id')::uuid, 'deposit', v_bank, p_date,
            'Cash deposit, ' || to_char(p_date, 'DD Mon') || ' (day sheet)', true, v_uid)
    returning id into v_id;
    v_ids := jsonb_set(v_ids, '{bank}', (v_ids -> 'bank') || to_jsonb(v_id));
  end if;

  v_counted := coalesce(nullif(p_sheet ->> 'cash_counted', '')::numeric, 0);
  if v_counted > 0 then
    insert into public.treasury_entries (entry_date, direction, amount, category, details, created_by)
    values (p_date, 'in', v_counted, 'shift_closing',
            'Cash counted into the safe, ' || to_char(p_date, 'DD Mon'), v_uid)
    returning id into v_id;
    v_ids := jsonb_set(v_ids, '{treasury}', (v_ids -> 'treasury') || to_jsonb(v_id));
  end if;

  insert into public.day_sheets (sheet_date, payload, entry_ids, saved_by, saved_at)
  values (p_date, p_sheet, v_ids, v_uid, now())
  on conflict (sheet_date) do update
     set payload = excluded.payload, entry_ids = excluded.entry_ids,
         saved_by = excluded.saved_by, saved_at = excluded.saved_at;

  -- ---- the day's figures, read back from the rows just written ------------------
  select coalesce(sum(sale_amount), 0) into v_sales from public.nozzle_readings where reading_date = p_date;

  select coalesce(sum((e ->> 'amount')::numeric), 0) into v_credit
    from jsonb_array_elements(v_ids -> 'credit') e;
  select coalesce(sum((e ->> 'amount')::numeric), 0) into v_received
    from jsonb_array_elements(v_ids -> 'received') e;
  select coalesce(sum(amount), 0) into v_expenses from public.expenses where expense_date = p_date
     and id in (select (value #>> '{}')::uuid from jsonb_array_elements(v_ids -> 'expenses'));

  v_today_cash := v_sales + v_received - v_credit - v_expenses - v_bank;

  return jsonb_build_object(
    'date', p_date,
    'sales', v_sales,
    'credit', v_credit,
    'received', v_received,
    'expenses', v_expenses,
    'bank', v_bank,
    'cash_from_today', v_today_cash,
    'cash_counted', v_counted,
    'difference', v_counted - v_today_cash
  );
end;
$$;

comment on function public.save_day_sheet(date, jsonb) is
  'Writes one whole day of the owner''s register in one transaction: readings, udhaar, '
  'wasool, local udhaar, pump and house expenses, the bank deposit and the cash counted. '
  'Saving a day again corrects only the difference. Owner only. See 091.';

revoke all on function public.save_day_sheet(date, jsonb) from public, anon;
grant execute on function public.save_day_sheet(date, jsonb) to authenticated;
