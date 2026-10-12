-- =============================================================================
-- 078_owner_loads_a_dip_chart.sql
--
-- The owner loads (or replaces) a tank's dip chart himself, under Settings.
--
-- Until now a chart (075) went in by a setup file written for one pump, so a
-- new pump needed us to type it in. Here Settings takes the chart the tank
-- company gave him (an Excel file, a CSV, or pasted from either), shows him
-- every line it read, and saves it through replace_dip_chart():
--
--   replace_dip_chart(tank, lines)   lines is [[mm, litres], ...]. The tank's
--                                    old chart, if any, goes and the new one
--                                    comes in, in one transaction. The rule
--                                    075 already enforces at commit still
--                                    holds: litres must rise with the depth,
--                                    or nothing is saved and he is told which
--                                    line is out.
--
-- A DIP ALREADY SAVED DOES NOT MOVE when its chart is replaced: its litres are
-- stored (075). Only dips recorded afterwards read the new chart.
--
-- Owner only. The table, its rules and its place in the backup are 075's;
-- nothing else changes and no existing row is touched.
-- =============================================================================

create or replace function public.replace_dip_chart(p_tank_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_bad   text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may load a dip chart' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tanks where id = p_tank_id) then
    raise exception 'That tank is no longer there. Reload the page.' using errcode = 'P0002';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A dip chart needs at least two lines.' using errcode = '23514';
  end if;

  -- Every line two numbers, neither below zero.
  select l::text into v_bad
    from jsonb_array_elements(p_lines) l
   where jsonb_typeof(l) <> 'array' or jsonb_array_length(l) <> 2
      or jsonb_typeof(l -> 0) <> 'number' or jsonb_typeof(l -> 1) <> 'number'
      or case when jsonb_typeof(l -> 0) = 'number' and jsonb_typeof(l -> 1) = 'number'
              then (l ->> 0)::numeric < 0 or (l ->> 1)::numeric < 0 end
   limit 1;
  if v_bad is not null then
    raise exception 'A chart line must be a depth in mm and litres, neither below zero: % is not.', v_bad
      using errcode = '23514';
  end if;

  -- The same depth twice (100 and 100.0 are one depth) is two readings of one
  -- line: one of them is a typo.
  select min(l ->> 0) into v_bad
    from jsonb_array_elements(p_lines) l
   group by (l ->> 0)::numeric
  having count(*) > 1
   limit 1;
  if v_bad is not null then
    raise exception 'The chart has % mm twice. Keep one of them.', v_bad using errcode = '23514';
  end if;

  delete from public.tank_dip_charts where tank_id = p_tank_id;

  insert into public.tank_dip_charts (tank_id, dip_mm, litres)
  select p_tank_id, (l ->> 0)::numeric, (l ->> 1)::numeric
    from jsonb_array_elements(p_lines) l;
  get diagnostics v_count = row_count;

  -- 075's rising-litres check is deferred to commit; run it now so the owner
  -- hears about a falling line while the dialog is still open.
  set constraints public.tank_dip_chart_rises immediate;

  return (select jsonb_build_object('lines', v_count, 'min_mm', min(dip_mm), 'max_mm', max(dip_mm),
                                    'max_litres', max(litres))
            from public.tank_dip_charts where tank_id = p_tank_id);
end;
$$;

revoke all on function public.replace_dip_chart(uuid, jsonb) from public, anon;
grant execute on function public.replace_dip_chart(uuid, jsonb) to authenticated;
