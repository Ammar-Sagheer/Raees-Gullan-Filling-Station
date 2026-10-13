-- =============================================================================
-- 087: a new supplier can start with what the pump already owed them, dated.
--
-- The Add a supplier form took a name, a phone and a note, and every account
-- started at zero (067). What the pump owed the company on the day it began
-- using the app went in afterwards, as an adjustment on the supplier's own page.
-- That second trip is the one that gets forgotten, and the account then starts
-- silently at zero while the pump owes money: the same trap the new-customer
-- form closed in 034. It is also dated by hand, so a pump that sets the app up
-- on the 1st and types the month in afterwards has to remember to date it the
-- day before.
--
-- create_supplier_with_opening() makes the supplier and, when an amount is
-- given, its opening entry (an adjustment, owe_more, dated p_opening_date,
-- today when null, never in the future) in ONE transaction, so the supplier
-- cannot exist without the balance that was typed with it. With no amount it is
-- exactly the old insert. Owner only, like the rest of the supplier account.
--
-- A NEW function, nothing dropped or replaced, no existing row touched.
-- =============================================================================

create or replace function public.create_supplier_with_opening(
  p_name           text,
  p_phone          text    default null,
  p_note           text    default null,
  -- What the pump owed them. Positive; null or 0 means nothing owed.
  p_opening_amount numeric default null,
  -- The day it stood. Null is today.
  p_opening_date   date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_amount numeric(14, 2) := round(coalesce(p_opening_amount, 0), 2);
  v_date   date := coalesce(p_opening_date, public.pump_today());
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may add a supplier' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter the supplier name.' using errcode = '23514';
  end if;

  if v_amount < 0 then
    raise exception 'Enter what the pump owed them as a positive figure.' using errcode = '23514';
  end if;

  if v_date > public.pump_today() then
    raise exception 'The opening balance cannot be dated in the future.' using errcode = '23514';
  end if;

  insert into public.suppliers (name, phone, note, created_by)
  values (btrim(p_name),
          nullif(btrim(coalesce(p_phone, '')), ''),
          nullif(btrim(coalesce(p_note, '')), ''),
          auth.uid())
  returning id into v_id;

  if v_amount > 0 then
    insert into public.supplier_ledger_entries
      (supplier_id, kind, direction, amount, entry_date, note, created_by)
    values
      (v_id, 'adjustment', 'owe_more', v_amount, v_date,
       'Opening balance - owed when the account was set up', auth.uid());
  end if;

  return v_id;
end;
$$;

comment on function public.create_supplier_with_opening(text, text, text, numeric, date) is
  'Creates a supplier and, in the same transaction, an opening-balance adjustment (owe_more) dated p_opening_date (today when null, never in the future) for any amount the pump already owed them. Owner only. See 067 and 087.';

revoke execute on function public.create_supplier_with_opening(text, text, text, numeric, date) from public, anon;
grant  execute on function public.create_supplier_with_opening(text, text, text, numeric, date) to authenticated;
