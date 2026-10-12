import { requirePageRole, ROLES, todayISO, shiftISODate } from '@/app/_lib/helpers';
import {
  getDailySummary,
  getDayCollection,
  getSalesTrend,
  getLubricantTrend,
  getMonthEndStock,
  getTanks,
  getNozzles,
  getCurrentRates,
} from '@/app/_lib/data-service';
import {
  getBankAccounts,
  getExpenseCategories,
  getStaffMembers,
  getAttendanceForDay,
  getDipChartRanges,
} from '@/app/_lib/data-service';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SetupChecklist from '@/app/_components/admin/dashboard/SetupChecklist';
import { trendDaysFrom } from '@/app/_components/admin/dashboard/TrendWindow';
import DashboardView from '@/app/_components/admin/dashboard/DashboardView';
import { Translated } from '@/app/_components/i18n/I18nProvider';
import { i18nFor } from '@/app/_lib/i18n/core';

import { getI18n } from '@/app/_lib/i18n/server';

// The tab's title in the login's language (079).
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t('dashboard.title') };
}

/**
 * The Dashboard: the role check and the three queries. Everything it draws is
 * in `DashboardView` - see that file for why the two are split.
 *
 * The new look (docs/UI_CONVENTIONS.md -> "The new look") starts here; the
 * rest of the site is to follow it. The data is exactly what the old page
 * fetched, in the same three calls, in parallel.
 */
export default async function DashboardPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN);
  const lang = profile.language;
  const { t } = i18nFor(lang);

  /* Migration 076: the owner sets up his own forecourt, so a new
     pump has no tanks or nozzles. Until it has a tank, a nozzle and a price
     for every fuel a tank holds, the Dashboard is the setup checklist - the
     page he lands on is the one that tells him what to do first. */
  const [tanks, nozzles, rates] = await Promise.all([getTanks(), getNozzles(), getCurrentRates()]);
  const liveNozzles = nozzles.filter((nozzle) => nozzle.is_active && !nozzle.retired_on);
  const fuels = [...new Set(tanks.map((tank) => tank.fuel_type))];
  const missingPrices = fuels.filter((fuel) => rates[fuel] == null);
  if (tanks.length === 0 || liveNozzles.length === 0 || missingPrices.length > 0) {
    return (
      <Translated>
        <TitleHeader
          title={t('dashboard.welcome')}
          icon="dashboard"
          tone="money"
          description={t('dashboard.welcomeText')}
        />
        <SetupChecklist
          status={{ tanks: tanks.length, nozzles: liveNozzles.length, missingPrices }}
          lang={lang}
        />
      </Translated>
    );
  }

  const params = await searchParams;
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  /* The charts end on the day the rest of the dashboard is showing; this is
     only how far back they reach. Both controls write to the query string, so
     each one has to carry the other's value forward or picking a window would
     silently throw the reader back to today. */
  const trendDays = trendDaysFrom(params);
  const trendFrom = shiftISODate(date, -(trendDays - 1));

  /* The month before the one being shown: its closing stock is this month's
     opening stock, and both are the figures the monthly profit is built on.
     Its own failure is caught, so the stock table cannot take the rest of
     the morning check down with it. */
  const [year, month] = date.split('-').map(Number);
  const closedYear = month === 1 ? year - 1 : year;
  const closedMonth = month === 1 ? 12 : month - 1;

  const [summary, trend, lubricantTrend, monthEndStock, bankAccounts, expenseCategories, staff, attendance, dipCharts, collection] = await Promise.all([
    getDailySummary(date),
    getSalesTrend(trendFrom, date),
    getLubricantTrend(trendFrom, date),
    getMonthEndStock(closedYear, closedMonth).catch((error) => ({ error: error.message })),
    // For the Quick entry strip . Neither may take the page down.
    getBankAccounts().catch(() => []),
    getExpenseCategories().catch(() => []),
    // Who is on duty (074's register): a failure here only hides the panel.
    getStaffMembers().catch(() => []),
    getAttendanceForDay(date).catch(() => ({})),
    // For the dip checker in Quick entry; {} on failure hides the button.
    getDipChartRanges(),
    // What the staff still owe for the day (082). A missing migration must not take the page down.
    getDayCollection(date).catch(() => null),
  ]);

  return (
    <DashboardView
      date={date}
      trendDays={trendDays}
      trendFrom={trendFrom}
      summary={summary}
      trend={trend}
      lubricantTrend={lubricantTrend}
      monthEndStock={monthEndStock}
      bankAccounts={bankAccounts}
      expenseCategories={expenseCategories}
      staff={staff}
      attendance={attendance}
      liveTanks={tanks.filter((tank) => tank.is_active !== false)}
      dipCharts={dipCharts}
      collection={collection}
      lang={lang}
    />
  );
}
