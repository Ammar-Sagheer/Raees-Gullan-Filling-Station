-- =============================================================================
-- RAEES GULLAN FILLING STATION: his two tanks, named after the charts he supplied.
-- Run once, after the migrations and start-empty.sql, BEFORE
-- raees-gullan-dip-charts.sql (which looks for these two names).
--
--   Petrol Tank: 6,695.17 L (the SRN Engineering chart, brim at 1,524 mm)
--   Diesel Tank: 15,691 L   (the Abdul Waheed Engineering Works chart)
--
-- Opening stock is 0: the owner sets it from his first dip (Settings -> the tank).
-- Inserted directly because add_tank() needs the owner's login, which the SQL
-- editor does not have. Refuses if any tank already exists. One transaction.
-- =============================================================================
begin;

do $$
begin
  if exists (select 1 from public.tanks) then
    raise exception 'STOPPED: this database already has tanks. Nothing was changed.';
  end if;
  insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
  values ('Petrol Tank', 'petrol', 6695.17, 0, public.pump_today()),
         ('Diesel Tank', 'diesel', 15691,   0, public.pump_today());
end;
$$;

-- Expect Petrol Tank 6695.17 and Diesel Tank 15691.00.
select name, fuel_type, capacity_litres from public.tanks order by fuel_type;

commit;
