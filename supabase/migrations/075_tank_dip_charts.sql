-- =============================================================================
-- 075_tank_dip_charts.sql
--
-- A tank's dip chart, so a dip is entered as the rod reads it: in millimetres.
--
-- Until now the owner read the rod, looked the depth up on the printed chart
-- that came with the tank, and typed the LITRES. Two steps where a mistake can
-- creep in, and nothing kept the reading itself. Here a tank may carry its
-- chart (millimetres -> litres, as printed), the Stock page asks for the dip in
-- mm, and the database works out the litres:
--
--   tank_dip_charts         one row per printed line: dip_mm, litres. The
--                           litres must rise with the depth (checked at
--                           commit), or the chart was mistyped.
--   tank_dip_litres()       the conversion. On a printed line, that line; in
--                           between two lines, the straight line between them
--                           (a chart printed every 10 mm is read that way by
--                           hand too); below the first line, from 0 mm = 0 L.
--                           Beyond the last line: refused, never guessed.
--   dip_to_litres()         the same, for the form to show the litres before
--                           saving. Staff only.
--   stock_checks.dip_mm     the rod reading, kept beside the litres, so a dip
--                           can be checked against the stick later. Nullable:
--                           every dip before this, and any tank without a
--                           chart, is litres only, exactly as before.
--
-- THE LITRES ARE THE DATABASE'S. A dip saved with dip_mm has its
-- actual_dip_reading set from the chart on the way in (BEFORE trigger), so the
-- browser cannot send one figure and store another. Expected stock and
-- gain/loss go on being worked out from the litres by the AFTER triggers that
-- were already there; nothing downstream knows or cares about millimetres.
--
-- A CHART CHANGED LATER does not move a saved dip: the litres are stored. Only
-- dips recorded after the change read the new chart.
--
-- BACKUPS (051): the new table joins backup_table_order() after tanks; the new
-- column is nullable, so an older backup restores unchanged.
-- No existing row is touched.
-- =============================================================================

-- ------------------------------------------------------------------ the chart
create table public.tank_dip_charts (
  tank_id  uuid not null references public.tanks (id) on delete cascade,
  dip_mm   numeric(7, 1) not null check (dip_mm >= 0),
  litres   numeric(12, 2) not null check (litres >= 0),
  primary key (tank_id, dip_mm)
);

comment on table public.tank_dip_charts is
  'A tank''s dip chart (075): litres at each printed depth. Read by tank_dip_litres().';

alter table public.tank_dip_charts enable row level security;

create policy "tank_dip_charts: staff read" on public.tank_dip_charts
  for select using (public.is_active_staff());
create policy "tank_dip_charts: super admin writes" on public.tank_dip_charts
  for all using (public.is_super_admin()) with check (public.is_super_admin());

grant select, insert, update, delete on public.tank_dip_charts to authenticated;

-- A chart whose litres do not rise with the depth was mistyped: a deeper dip
-- would read as less fuel. Checked at commit, so a whole chart can be loaded
-- in any order first.
create or replace function public.trg_tank_dip_chart_rises()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bad record;
begin
  select x.dip_mm, x.litres, x.prev_mm, x.prev_litres
    into v_bad
    from (
      select c.dip_mm, c.litres,
             lag(c.dip_mm) over (order by c.dip_mm) as prev_mm,
             lag(c.litres) over (order by c.dip_mm) as prev_litres
        from public.tank_dip_charts c
       where c.tank_id = new.tank_id
    ) x
   where x.litres <= x.prev_litres
   order by x.dip_mm
   limit 1;

  if v_bad.dip_mm is not null then
    raise exception 'The dip chart goes down at % mm: % L there, but % L at % mm. Check that line against the printed chart.',
      v_bad.dip_mm, v_bad.litres, v_bad.prev_litres, v_bad.prev_mm
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger tank_dip_chart_rises
  after insert or update on public.tank_dip_charts
  deferrable initially deferred
  for each row execute function public.trg_tank_dip_chart_rises();

-- ------------------------------------------------------------ the conversion
-- Null when the tank has no chart at all (the caller decides what that means).
create or replace function public.tank_dip_litres(p_tank_id uuid, p_mm numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lo_mm numeric; v_lo_l numeric;
  v_hi_mm numeric; v_hi_l numeric;
  v_max   numeric;
begin
  if p_mm is null then
    return null;
  end if;
  if not exists (select 1 from public.tank_dip_charts where tank_id = p_tank_id) then
    return null;
  end if;
  if p_mm < 0 then
    raise exception 'A dip cannot be below 0 mm.' using errcode = '23514';
  end if;

  select dip_mm, litres into v_hi_mm, v_hi_l
    from public.tank_dip_charts
   where tank_id = p_tank_id and dip_mm >= p_mm
   order by dip_mm limit 1;

  if v_hi_mm is null then
    select max(dip_mm) into v_max from public.tank_dip_charts where tank_id = p_tank_id;
    raise exception 'A dip of % mm is deeper than this tank''s chart, which ends at % mm. Check the reading.',
      trim(to_char(p_mm, 'FM999,990.0')), trim(to_char(v_max, 'FM999,990.0'))
      using errcode = '23514';
  end if;

  if v_hi_mm = p_mm then
    return v_hi_l;
  end if;

  select dip_mm, litres into v_lo_mm, v_lo_l
    from public.tank_dip_charts
   where tank_id = p_tank_id and dip_mm < p_mm
   order by dip_mm desc limit 1;

  -- Below the chart's first line: from an empty tank, 0 mm = 0 L.
  if v_lo_mm is null then
    v_lo_mm := 0;
    v_lo_l := 0;
  end if;

  return round(v_lo_l + (v_hi_l - v_lo_l) * (p_mm - v_lo_mm) / (v_hi_mm - v_lo_mm), 2);
end;
$$;

-- For the Stock form, to show the litres before saving.
create or replace function public.dip_to_litres(p_tank_id uuid, p_mm numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return public.tank_dip_litres(p_tank_id, p_mm);
end;
$$;

-- Which tanks have a chart, and its range: for the Stock page and Settings.
create or replace function public.get_dip_chart_ranges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tank_id', r.tank_id, 'min_mm', r.min_mm, 'max_mm', r.max_mm,
             'max_litres', r.max_litres, 'lines', r.lines))
      from (select c.tank_id, min(c.dip_mm) as min_mm, max(c.dip_mm) as max_mm,
                   max(c.litres) as max_litres, count(*) as lines
              from public.tank_dip_charts c
             group by c.tank_id) r
  ), '[]'::jsonb);
end;
$$;

-- --------------------------------------------------------- the dip itself
alter table public.stock_checks add column dip_mm numeric(7, 1) check (dip_mm >= 0);

comment on column public.stock_checks.dip_mm is
  'The rod reading in mm (075). When set, actual_dip_reading is the tank''s chart at that depth.';

create or replace function public.trg_stock_check_dip_from_chart()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_litres numeric;
begin
  if new.dip_mm is null then
    return new;
  end if;
  v_litres := public.tank_dip_litres(new.tank_id, new.dip_mm);
  if v_litres is null then
    raise exception 'This tank has no dip chart, so a dip in mm cannot be turned into litres. Enter the litres instead.'
      using errcode = '23514';
  end if;
  new.actual_dip_reading := v_litres;
  return new;
end;
$$;

create trigger stock_checks_dip_from_chart
  before insert or update of dip_mm, tank_id on public.stock_checks
  for each row execute function public.trg_stock_check_dip_from_chart();

-- ------------------------------------------------------------- the backup
create or replace function public.backup_table_order()
returns text[]
language sql
immutable
as $$
  select array[
    'tanks', 'tank_dip_charts', 'nozzles', 'customers', 'customer_vehicles', 'lubricants', 'bank_accounts', 'suppliers',
    'staff_members', 'staff_rates',
    'fuel_prices', 'company_assets', 'expenses', 'treasury_entries',
    'nozzle_readings', 'fuel_purchases', 'lubricant_purchases', 'stock_checks',
    'lubricant_sales', 'credit_sales', 'ledger_entries', 'bank_transactions',
    'supplier_ledger_entries', 'staff_attendance', 'salary_payments'
  ]::text[];
$$;

-- ---------------------------------------------------------------- grants
revoke all on function public.dip_to_litres(uuid, numeric) from public, anon;
grant execute on function public.dip_to_litres(uuid, numeric) to authenticated;
revoke all on function public.get_dip_chart_ranges() from public, anon;
grant execute on function public.get_dip_chart_ranges() to authenticated;

-- ------------------------------------------------- closed, as 072 requires
-- The conversion itself, the two trigger functions and the redefined backup
-- list are only ever called from triggers and SECURITY DEFINER functions.
-- Fails, and so changes nothing, if any of them is still open.
do $$
declare
  f text;
  v_list text[] := array[
    'tank_dip_litres(uuid, numeric)',
    'trg_tank_dip_chart_rises()',
    'trg_stock_check_dip_from_chart()',
    'backup_table_order()'
  ];
  v_open text;
begin
  foreach f in array v_list loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;

  select string_agg(p.oid::regprocedure::text, ', ')
    into v_open
    from pg_proc p
   where p.oid = any (select ('public.' || x)::regprocedure::oid from unnest(v_list) x)
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_open is not null then
    raise exception '075: still callable from outside: %', v_open;
  end if;
end;
$$;
