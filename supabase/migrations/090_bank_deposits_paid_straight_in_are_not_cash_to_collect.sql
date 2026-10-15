-- =============================================================================
-- 090: money paid straight into the bank is not cash the staff must hand in.
--
-- RAEES GULLAN ONLY, for now (carried from Mubeen's 090, 15 Oct 2026).
--
-- THE FAULT. The Dashboard's "To collect from the staff" expects the day's sales
-- (plus customers' payments, less credit and expenses) as cash handed to the safe.
-- Here the daily cash is taken to the bank and paid in at the counter, and
-- customers' money arrives as transfers, so the panel kept asking the staff for
-- cash that was already in the bank.
--
-- THE FIX. A nullable flag on a bank deposit, paid_in_directly (nullable: 051, a
-- column on a backed-up table), says "this went into the bank, it was never in the
-- safe". The day's flagged deposits come off what is to be collected and are
-- returned as bank_direct so the panel can show them. After this the flag is set
-- by whoever records the deposit, with a tick box on the bank form.
--
-- WHAT IS FLAGGED NOW. Nothing. His cash goes to the bank in lump sums (Rs 700,000
-- on 6 Oct against Rs 119,908 of that day's sales), so flagging a deposit on its
-- own date would push that day far below zero and leave its neighbours unmatched.
-- The flag is for a deposit that matches the day it is dated; the tick box on the
-- bank form sets it from here on. No existing row changes.
-- =============================================================================

alter table public.bank_transactions
  add column if not exists paid_in_directly boolean;

comment on column public.bank_transactions.paid_in_directly is
  'True on a deposit that came straight into the bank (card, JazzCash, a customer''s transfer) and was never cash in the safe. The Dashboard''s cash to collect leaves it out (090). Null on everything else.';

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_received   numeric;
  v_entered    numeric;
  v_bank       numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(le.amount), 0) into v_received
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'credit'
     and le.is_payment is true
     and not exists (select 1 from public.ledger_entries x where x.corrects_entry_id = le.id);

  select coalesce(sum(le.amount), 0) into v_entered
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'debit'
     and le.credit_sale_id is null
     and le.lubricant_sale_id is null
     and le.corrects_entry_id is null
     and coalesce(le.note, '') not ilike 'Fuel taken on credit%'
     and coalesce(le.note, '') not ilike 'Lubricant%'
     and coalesce(le.note, '') not ilike 'Opening balance%'
     and not exists (select 1 from public.ledger_entries x where x.corrects_entry_id = le.id);

  -- Money that never reached the staff: card, JazzCash and a customer's transfer
  -- paid straight into the bank, entered as a bank deposit and marked so.
  select coalesce(sum(b.amount), 0) into v_bank
    from public.bank_transactions b
   where b.txn_date = p_date
     and b.txn_type = 'deposit'
     and b.paid_in_directly is true;

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit + v_entered;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'received', v_received,
    'entered_credit', v_entered,
    'bank_direct', v_bank,
    'expenses', v_exp,
    'to_collect', v_total + v_received - v_total_cr - v_exp - v_bank,
    'handed_in', v_handed,
    'still_to_collect', v_total + v_received - v_total_cr - v_exp - v_bank - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;
