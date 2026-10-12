-- =============================================================================
-- RAEES GULLAN FILLING STATION: the forecourt and the first two days of his
-- register (30 September and 1 October 2026), so the Dashboard can be checked
-- against his books.
--
-- Run ONCE, in his Supabase SQL Editor, after the migrations, raees-gullan-tanks.sql
-- and raees-gullan-dip-charts.sql, and after the owner login exists
-- (umraniakram@gmail.com, made owner). Refuses if anything has traded already.
-- One transaction: all of it or none of it.
--
-- WHAT IS IN IT (every figure read off his two register pages):
--   Tanks      Petrol Tank 25,000 L, opening 1,123.09 L; Diesel Tank (his two diesel
--              tanks joined as one) 50,000 L, opening 2,000 L; both as of 30 Sep.
--              The register shows diesel "purchase 2,000" on 30 Sep and a stray
--              -32.85 as the existing stock; the app cannot hold a negative opening
--              stock, so the 2,000 L starts the day in the tank. Expected stock at
--              the close of 30 Sep is then the register's own 1,670.37 L.
--   Nozzles    Super: unit 1, nozzle 1, meter 62,595.98.
--              Diesel: unit 2, nozzle 1, meter 95,461.65; unit 2, nozzle 2, meter 67,445.45
--              (the second diesel line did not move on either day). The names are
--              placeholders: rename them under Settings -> nozzle settings.
--   Prices     30 Sep: petrol 395.50, diesel 407.95. From 1 Oct: petrol 398.75, diesel 406.95.
--   Readings   30 Sep and 1 Oct, closing readings as written, all as CASH for now.
--   Dips       Midnight dips as written, dated the day that closed, mm read through
--              the chart: petrol 372 and 348 mm, diesel 400 and 388 mm.
--
-- NOT IN IT, on purpose: customers and credit slips, recoveries, expenses, the safe
-- and the bank. His register lists credit of Rs 156,681 on the page dated 1 Oct,
-- which is more than that day's fuel sales (Rs 66,188.83), so which day those
-- slips belong to has to be settled with the owner first. Until then every sale
-- shows as cash on the Dashboard.
--
-- Expected on the Dashboard afterwards (a paisa differs from his register because
-- it cuts 116.82 x 398.75 = 46,581.975 down and the database rounds it up):
--   30 Sep   sales 187,129.43 (petrol 133.14 L, diesel 329.63 L)
--   1 Oct    sales  66,188.83 (petrol 116.82 L, diesel 48.18 L)
--   Stock    close 30 Sep: petrol 989.95 L, diesel 1,670.37 L (books)
--            dips: petrol 1,265.50 / 1,151.47 L, diesel 1,799.00 / 1,722.20 L
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

  -- Tanks: size and what was in them at the start of 30 September.
  update public.tanks set capacity_litres = 25000, opening_stock_litres = 1123.09, opening_stock_date = date '2026-09-30'
   where id = v_petrol;
  update public.tanks set capacity_litres = 50000, opening_stock_litres = 2000, opening_stock_date = date '2026-09-30'
   where id = v_diesel;

  -- Nozzles, with the meter at the START of 30 September.
  n_super := public.add_nozzle(1, '1', v_petrol, 62595.98);
  n_dsl1  := public.add_nozzle(2, '1', v_diesel, 95461.65);
  n_dsl2  := public.add_nozzle(2, '2', v_diesel, 67445.45);

  -- Prices, oldest first.
  perform public.set_fuel_price('petrol', 395.50, date '2026-09-30');
  perform public.set_fuel_price('diesel', 407.95, date '2026-09-30');
  perform public.set_fuel_price('petrol', 398.75, date '2026-10-01');
  perform public.set_fuel_price('diesel', 406.95, date '2026-10-01');

  -- Readings. The cash figure is what is left after credit, and there is no credit yet.
  -- 30 September
  perform public.create_nozzle_reading(n_super, date '2026-09-30', 62595.98, 62729.12, 395.50,
            round((62729.12 - 62595.98) * 395.50, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl1,  date '2026-09-30', 95461.65, 95791.28, 407.95,
            round((95791.28 - 95461.65) * 407.95, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl2,  date '2026-09-30', 67445.45, 67445.45, 407.95, 0, '[]'::jsonb);
  -- 1 October
  perform public.create_nozzle_reading(n_super, date '2026-10-01', 62729.12, 62845.94, 398.75,
            round((62845.94 - 62729.12) * 398.75, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl1,  date '2026-10-01', 95791.28, 95839.46, 406.95,
            round((95839.46 - 95791.28) * 406.95, 2), '[]'::jsonb);
  perform public.create_nozzle_reading(n_dsl2,  date '2026-10-01', 67445.45, 67445.45, 406.95, 0, '[]'::jsonb);

  -- Dips: taken at midnight after the last sale, so each closes the day it is dated.
  for v_day, v_tank, v_mm in
    select * from (values
      (date '2026-09-30', v_petrol, 372::numeric),
      (date '2026-09-30', v_diesel, 400::numeric),
      (date '2026-10-01', v_petrol, 348::numeric),
      (date '2026-10-01', v_diesel, 388::numeric)
    ) as d(day, tank, mm)
    order by 1, 2
  loop
    v_lit := public.dip_to_litres(v_tank, v_mm);
    v_exp := public.calculate_expected_stock(v_tank, v_day);
    insert into public.stock_checks (tank_id, check_date, taken, expected_stock, actual_dip_reading, dip_mm, created_by)
    values (v_tank, v_day, 'evening', coalesce(v_exp, 0), v_lit, v_mm, v_owner);
  end loop;
end;
$$;

-- What landed. Expect 3 nozzles, 6 readings, 4 dips, sales 187,129.43 and 66,188.83.
select r.reading_date, count(*) as readings, round(sum(r.litres_sold), 2) as litres, round(sum(r.sale_amount), 2) as sales
  from public.nozzle_readings r group by r.reading_date order by 1;
select t.name, t.capacity_litres, t.opening_stock_litres, t.opening_stock_date, t.current_stock_litres from public.tanks t order by t.fuel_type;
select t.name, s.check_date, s.dip_mm, s.actual_dip_reading, s.expected_stock, s.gain_loss
  from public.stock_checks s join public.tanks t on t.id = s.tank_id order by s.check_date, t.fuel_type;

commit;
