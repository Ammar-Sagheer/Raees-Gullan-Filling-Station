import { requirePageRole, ROLES, todayISO } from '@/app/_lib/helpers';
import {
  getReadingSheet,
  getLatestReadingDate,
  getCustomers,
  getCreditSalesForReadings,
  getRatesInForce,
  getLubricantStock,
  getExpectedStockForAllTanks,
  getStockChecks,
  getDipChartRanges,
  getBankAccounts,
  getExpenseCategories,
  getDaySheet,
  getTanks,
  getPurchases,
  getSupplierNames,
} from '@/app/_lib/data-service';
import { shiftISODate, formatDate } from '@/app/_lib/date-helpers';
import { DAY_SHEET_FROM } from '@/app/_lib/pump-settings';
import ReadingsView from '@/app/_components/admin/readings/ReadingsView';
import DaySheetView from '@/app/_components/admin/readings/DaySheetView';

import { getI18n } from '@/app/_lib/i18n/server';

// The tab's title in the login's language (079).
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('readings.title') };
}

/**
 * The daily entry screen - the one thing that gets used every evening.
 *
 * This file is the role check and the queries; `ReadingsView` draws it, in the
 * new look (docs/UI_CONVENTIONS.md -> "The new look"). Split the same way as the
 * Dashboard so the real page can be rendered from fixtures for a screenshot.
 *
 * Each nozzle is its own small form, saved on its own. That way a mistake on
 * one nozzle never blocks the other five, and staff can work through the slip
 * book at their own pace.
 */
export default async function ReadingsPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  const params = await searchParams;
  const askedFor =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;

  // With no date asked for, the page opens on the first day still to enter: the
  // day after the last day with readings, but never past today. So days typed in
  // after the fact (a catch-up, a month entered again) open on the next gap
  // instead of on today. A last day with a nozzle still missing opens on itself.
  const today = todayISO();
  let date = askedFor ?? today;
  if (!askedFor) {
    try {
      const latest = await getLatestReadingDate();
      if (latest && latest < today) {
        const latestSheet = await getReadingSheet(latest);
        const unfinished = latestSheet.some((row) => !row.reading_id);
        date = unfinished ? latest : shiftISODate(latest, 1);
      }
    } catch {
      // A failure here only means the page opens on today.
    }
  }

  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  // The day's expense, bank entry and deposit are entered from this page too
  // (Al Hakeem). Expenses and banking are the owner's, so a staff login neither
  // sees the bar nor has these read for it; a failure here only hides the bar.
  const [sheet, customers, ratesInForce, bankAccounts, expenseCategories, oilStock, dipTanks, dipChecks, chartRanges] = await Promise.all([
    getReadingSheet(date),
    getCustomers(),
    getRatesInForce(date),
    isOwner ? getBankAccounts().catch(() => []) : Promise.resolve([]),
    isOwner ? getExpenseCategories().catch(() => []) : Promise.resolve([]),
    // The oil on the shelf and in the drum, for the Oil sale buttons (Al Tufail).
    // A failure here only hides the buttons.
    getLubricantStock(date).catch(() => []),
    // The tanks, their dips and charts, for the Record the dip button (Al Tufail).
    getExpectedStockForAllTanks(date).catch(() => []),
    getStockChecks().catch(() => []),
    getDipChartRanges().catch(() => ({})),
  ]);

  // The same two lookups the Stock page makes: the dip already taken on this
  // day, and the day each tank's first dip closes (a first dip is measured
  // against the opening stock, not an earlier dip).
  const checksByTank = {};
  const earliestByTank = {};
  for (const check of dipChecks) {
    if (check.check_date === date) checksByTank[check.tank_id] = check;
    const closes = check.books_date ?? check.check_date;
    if (!earliestByTank[check.tank_id] || closes < earliestByTank[check.tank_id]) {
      earliestByTank[check.tank_id] = closes;
    }
  }

  // THE DAY SHEET (091): from DAY_SHEET_FROM the owner's Readings page is one form
  // shaped like his register page. Earlier days, a staff login, and ?classic=1
  // (the link on the sheet) keep the page as it was.
  if (DAY_SHEET_FROM && isOwner && date >= DAY_SHEET_FROM && params?.classic !== '1') {
    const [daySheet, allTanks, purchases, suppliers] = await Promise.all([
      getDaySheet(date).catch(() => null),
      getTanks().catch(() => []),
      getPurchases().catch(() => []),
      getSupplierNames().catch(() => []),
    ]);
    // The day's tanker deliveries, for Invoice detail and Stock position.
    const deliveries = purchases
      .filter((purchase) => purchase.purchase_date === date)
      .map((purchase) => ({
        id: purchase.id,
        tank_id: purchase.tank_id,
        tank_name: purchase.tank?.name ?? '',
        litres: purchase.quantity_litres,
        invoice_number: purchase.invoice_number,
        supplier_name: purchase.supplier_name,
        total_cost: purchase.total_cost,
      }));
    // The day's dip per tank: millimetres and litres, as the register's top boxes.
    const dips = Object.fromEntries(
      Object.entries(checksByTank).map(([tankId, check]) => [
        tankId,
        { mm: check.dip_mm, litres: check.actual_dip_reading },
      ]),
    );
    return (
      <DaySheetView
        date={date}
        dateLabel={formatDate(date)}
        sheetRows={sheet}
        customers={customers}
        bankAccounts={bankAccounts}
        daySheet={daySheet}
        tanks={dipTanks.map((tank) => ({
          id: tank.id,
          name: tank.name,
          fuel_type: tank.fuel_type,
          opening_stock: tank.expected_if_morning ?? null,
        }))}
        deliveries={deliveries}
        dips={dips}
        dipTanks={dipTanks}
        checksByTank={checksByTank}
        earliestByTank={earliestByTank}
        chartRanges={chartRanges}
        purchaseTanks={allTanks}
        suppliers={suppliers}
        lang={profile.language}
      />
    );
  }

  const savedReadingIds = sheet.filter((row) => row.reading_id).map((row) => row.reading_id);
  const creditSalesByReading = await getCreditSalesForReadings(savedReadingIds);

  return (
    <ReadingsView
      date={date}
      sheet={sheet}
      customers={customers}
      creditSalesByReading={creditSalesByReading}
      ratesInForce={ratesInForce}
      isOwner={isOwner}
      dipTanks={dipTanks}
      checksByTank={checksByTank}
      earliestByTank={earliestByTank}
      chartRanges={chartRanges}
      oilProducts={oilStock.filter((row) => row.is_active && !row.sold_loose)}
      oilDrums={oilStock.filter((row) => row.is_active && row.sold_loose)}
      bankAccounts={bankAccounts}
      expenseCategories={expenseCategories}
      lang={profile.language}
    />
  );
}
