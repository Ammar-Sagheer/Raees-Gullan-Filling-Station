-- =============================================================================
-- 077_supplier_account_reads_like_a_khata.sql
--
-- A supplier's account as one running balance sheet, the way the owner keeps
-- it on paper: the opening balance at the top, each delivery added at its
-- rate, each payment taken off, and the balance after every line, read down
-- the page (Al Qaim's request, 9 Oct 2026).
--
-- get_supplier_ledger_page() gains two choices, both off by default so a caller
-- that does not pass them gets exactly what it got before:
--
--   p_oldest_first    the account in date order, top to bottom, like a khata.
--   p_show_cancelled  false hides every entry that has been cancelled AND the
--                     "Cancelled" line that cancels it. Each such pair nets to
--                     nothing, so hiding both changes no balance; the running
--                     balance is summed over the lines that are shown, in
--                     Postgres, so every line still reads true on its own.
--                     Nothing is removed: the ledger stays append-only, and the
--                     page can show the pairs again.
--
-- The answer also says how many cancelled pairs were hidden, so the page can
-- offer to show them. Owner only, as before. No row is touched.
-- =============================================================================

drop function if exists public.get_supplier_ledger_page(uuid, integer, integer);

create or replace function public.get_supplier_ledger_page(
  p_supplier_id    uuid,
  p_limit          integer default 25,
  p_offset         integer default 0,
  p_show_cancelled boolean default false,
  p_oldest_first   boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_show   boolean := coalesce(p_show_cancelled, false);
  v_asc    boolean := coalesce(p_oldest_first, false);
  v_result jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  with account as (
    select e.*
      from public.supplier_ledger_entries e
     where e.supplier_id = p_supplier_id
  ),
  shown as (
    select a.* from account a
     where v_show
        or (a.kind <> 'reversal'
            and not exists (select 1 from account r where r.corrects_entry_id = a.id))
  ),
  running as (
    select s.*,
           sum(case when s.direction = 'owe_more' then s.amount else -s.amount end)
             over (order by s.entry_date, s.created_at, s.id
                   rows between unbounded preceding and current row) as balance_after,
           case when s.litres > 0 then round(s.amount / s.litres, 2) end as rate,
           b.bank_name || coalesce(' · ' || b.account_label, '') as bank_label
      from shown s
      left join public.bank_accounts b on b.id = s.bank_account_id
  ),
  ordered as (
    select r.*,
           row_number() over (order by r.entry_date, r.created_at, r.id) as n_asc,
           row_number() over (order by r.entry_date desc, r.created_at desc, r.id desc) as n_desc
      from running r
  ),
  page as (
    select o.* from ordered o
     order by case when v_asc then o.n_asc else o.n_desc end
     limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce(
      (select jsonb_agg(to_jsonb(p) - 'n_asc' - 'n_desc'
                        order by case when v_asc then p.n_asc else p.n_desc end) from page p),
      '[]'::jsonb),
    'total', (select count(*) from running),
    'corrected_ids', coalesce(
      (select jsonb_agg(r.corrects_entry_id) from running r where r.corrects_entry_id is not null),
      '[]'::jsonb),
    'cancelled_pairs', (select count(*) from account a where a.kind = 'reversal')
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_supplier_ledger_page(uuid, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.get_supplier_ledger_page(uuid, integer, integer, boolean, boolean) to authenticated;
