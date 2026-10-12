import FuelBadge from '@/app/_components/ui/FuelBadge';

import { i18nFor, rich } from '@/app/_lib/i18n/core';
import { byFuelOrder } from '@/app/_lib/fuel-colors';

/**
 * The stock on one date, per fuel, written out the way an accountant writes a
 * closing stock: litres, rate, value (migration 068).
 *
 * WHY IT EXISTS. Profit takes the opening and closing stock values, and until
 * this they were only ever printed as one combined sum inside a sentence on
 * Reports. The owner's accountant works the month out by hand, the two
 * profits disagreed for September 2026, and there was nowhere to read "749 L
 * of diesel at Rs 392.89 = Rs 294,276" to tick against the accountant's sheet.
 *
 * TWO VALUES, SIDE BY SIDE, and the one profit used. Stock is carried at the
 * LOWER of what it cost (the deliveries it is made of, newest first - 049) and
 * the pump price that day (069, the IAS 2 / Income Tax Ordinance s.35 rule).
 * Usually that is the cost, and an accountant who values closing stock at the
 * pump price gets a higher profit by the gap, which is said in words
 * underneath. After a price cut below cost it is the pump price, and the
 * sentence says the stock was written down instead.
 *
 * Nothing is added up here: every total, including the gap, comes back from
 * Postgres (`stock_totals`).
 *
 * `side` is 'closing' or 'opening'; `stock` is get_month_end_stock's result.
 */
export default function MonthEndStock({ stock, side = 'closing', asOf = null, lang = 'en' }) {
  // `lang` from a translated page (079); Reports, still English, leaves it.
  const { t, fmt } = i18nFor(lang);
  const formatLitres = fmt.litres;
  const formatPKR = fmt.rupees;
  const formatRate = fmt.rate;
  const usedLabel = (row) => (row.written_down ? t('monthEnd.usedPumpBelow') : t('monthEnd.usedCost'));
  // A month that has not ended has no closing stock yet: the database holds
  // nothing past today, so "the close of 31 Oct" is simply what is in the
  // tanks now. The caller passes today as `asOf` and the words follow it.
  const onDate = asOf ?? stock?.[side]?.on;
  const fuels = [...(stock?.fuels ?? [])].sort(byFuelOrder);
  const totals = stock?.[side] ?? {};
  const lubricantsValue = Number(totals.lubricants_value ?? 0);
  const gap = Number(totals.fuel_sell_gap ?? 0);
  const writtenDown = fuels.filter((fuel) => fuel[side]?.written_down);

  return (
    <div data-card className="panel @container overflow-hidden">
      {/* NARROW: one block per fuel, every figure on its own line. A sideways
          table on a phone hid the value column, which is the figure the page
          exists to show. */}
      <div className="divide-y divide-ink-200 @[52rem]:hidden">
        {fuels.map((fuel) => {
          const row = fuel[side] ?? {};
          const hasStock = Number(row.litres ?? 0) > 0;
          return (
            <dl key={fuel.fuel_type} className="grid gap-1.5 px-4 py-4">
              <div className="mb-1">
                <FuelBadge fuelType={fuel.fuel_type} lang={lang} />
              </div>
              <Line label={t('monthEnd.litresLeft')} value={formatLitres(row.litres)} strong />
              <Line label={t('monthEnd.costRate')} value={hasStock && row.cost_rate !== null ? formatRate(row.cost_rate) : t('monthEnd.none')} />
              <Line label={t('monthEnd.valueAtCost')} value={formatPKR(row.cost_value)} />
              <Line label={t('monthEnd.pumpPrice')} value={row.sell_rate != null ? formatRate(row.sell_rate) : t('monthEnd.notSet')} />
              <Line label={t('monthEnd.valueAtPump')} value={row.sell_value != null ? formatPKR(row.sell_value) : t('monthEnd.none')} />
              <Line label={t('monthEnd.usedIn', { how: usedLabel(row) })} value={formatPKR(row.value)} strong />
            </dl>
          );
        })}
        {lubricantsValue > 0 ? (
          <dl className="grid gap-1.5 px-4 py-4">
            <div className="mb-1">
              <FuelBadge fuelType="lubricant" lang={lang} />
            </div>
            <Line label={t('monthEnd.shelfAtCost')} value={formatPKR(lubricantsValue)} strong />
          </dl>
        ) : null}
        <dl className="grid gap-1.5 bg-ink-50 px-4 py-4">
          <Line
            label={lubricantsValue > 0 ? t('monthEnd.fuelAtCost') : t('monthEnd.totalAtCost')}
            value={formatPKR(totals.fuel_cost_value)}
          />
          <Line
            label={lubricantsValue > 0 ? t('monthEnd.fuelAtPump') : t('monthEnd.totalAtPump')}
            value={totals.fuel_sell_value != null ? formatPKR(totals.fuel_sell_value) : t('monthEnd.none')}
          />
          <Line label={t('monthEnd.totalUsed')} value={formatPKR(totals.value)} strong large />
        </dl>
      </div>

      <div className="table-scroll mx-0 hidden px-0 @[52rem]:block">
        <table className="w-full min-w-[52rem]">
          <thead>
            <tr>
              <th className="th ps-5">{t('monthEnd.fuel')}</th>
              <th className="th whitespace-nowrap text-end">{t('monthEnd.litresLeft')}</th>
              <th className="th whitespace-nowrap text-end">{t('monthEnd.costRate')}</th>
              <th className="th whitespace-nowrap text-end">{t('monthEnd.valueAtCost')}</th>
              <th className="th whitespace-nowrap text-end">{t('monthEnd.pumpPrice')}</th>
              <th className="th whitespace-nowrap text-end">{t('monthEnd.valueAtPump')}</th>
              <th className="th whitespace-nowrap pe-5 text-end">
                {t('monthEnd.usedInProfit')}
                <span className="block text-xs font-medium normal-case text-brand-700">{t('monthEnd.lowerOfTwo')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {fuels.map((fuel) => {
              const row = fuel[side] ?? {};
              const hasStock = Number(row.litres ?? 0) > 0;
              return (
                <tr key={fuel.fuel_type}>
                  <td className="td ps-5">
                    <FuelBadge fuelType={fuel.fuel_type} lang={lang} />
                  </td>
                  <td className="td-num font-semibold text-ink-900">{formatLitres(row.litres)}</td>
                  <td className="td-num">{hasStock && row.cost_rate !== null ? formatRate(row.cost_rate) : t('monthEnd.none')}</td>
                  <td className="td-num">{formatPKR(row.cost_value)}</td>
                  <td className="td-num">{row.sell_rate != null ? formatRate(row.sell_rate) : t('monthEnd.notSet')}</td>
                  <td className="td-num">{row.sell_value != null ? formatPKR(row.sell_value) : t('monthEnd.none')}</td>
                  <td className="td-num pe-5 font-bold text-ink-900">
                    {formatPKR(row.value)}
                    <span
                      className={`block text-xs font-semibold ${row.written_down ? 'text-red-700' : 'text-ink-600'}`}
                    >
                      {usedLabel(row)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {lubricantsValue > 0 ? (
              <tr>
                <td className="td ps-5">
                  <FuelBadge fuelType="lubricant" lang={lang} />
                </td>
                <td className="td-num text-ink-600" colSpan={2}>
                  {t('monthEnd.onShelf')}
                </td>
                <td className="td-num">{formatPKR(lubricantsValue)}</td>
                <td className="td-num text-ink-600" colSpan={2}>
                  {t('monthEnd.atCostOnly')}
                </td>
                <td className="td-num pe-5 font-bold text-ink-900">{formatPKR(lubricantsValue)}</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-200 bg-ink-50">
              <td className="td ps-5 font-bold text-ink-900" colSpan={3}>
                {t('monthEnd.totalStock')}
              </td>
              <td className="td-num font-semibold text-ink-900">
                {formatPKR(totals.fuel_cost_value)}
                {lubricantsValue > 0 ? <span className="block text-xs font-medium text-ink-600">{t('monthEnd.fuelOnly')}</span> : null}
              </td>
              <td className="td" />
              <td className="td-num font-semibold text-ink-900">
                {totals.fuel_sell_value != null ? formatPKR(totals.fuel_sell_value) : t('monthEnd.none')}
                {lubricantsValue > 0 ? <span className="block text-xs font-medium text-ink-600">{t('monthEnd.fuelOnly')}</span> : null}
              </td>
              <td className="td-num pe-5 text-lg font-bold text-ink-900">{formatPKR(totals.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* The sentences that answer "why does the accountant get a different
          profit?" A fuel written down below cost says so first, fuel by fuel;
          otherwise the usual gap between cost and the pump price. */}
      {writtenDown.length > 0 ? (
        <div className="space-y-2 border-t border-ink-200 px-5 py-3.5 text-base text-ink-700">
          {writtenDown.map((fuel) => (
            <p key={fuel.fuel_type}>
              {rich(t, 'monthEnd.writtenDown', {
                date: fmt.date(onDate),
                fuel: lang === 'en' ? fuel.fuel_type : t(`fuel.${fuel.fuel_type}`),
                amount: (
                  <span className="tabular whitespace-nowrap font-semibold text-red-700">
                    {formatPKR(Math.abs(Number(fuel[side].sell_gap)))}
                  </span>
                ),
                when: side === 'closing' ? t('monthEnd.whenThis') : t('monthEnd.whenBefore'),
              })}
            </p>
          ))}
        </div>
      ) : gap > 0 ? (
        <p className="border-t border-ink-200 px-5 py-3.5 text-base text-ink-700">
          {/* A higher closing stock raises a month's profit; a higher opening
              stock lowers it. */}
          {rich(t, 'monthEnd.gap', {
            date: fmt.date(onDate),
            amount: <span className="tabular whitespace-nowrap font-semibold text-ink-900">{formatPKR(gap)}</span>,
            what: asOf ? t('monthEnd.profitSoFar') : t('monthEnd.monthsProfit'),
            direction: side === 'closing' ? t('monthEnd.higher') : t('monthEnd.lower'),
          })}
        </p>
      ) : null}
    </div>
  );
}

/** One caption and figure, for the narrow layout. The figure never wraps. */
function Line({ label, value, strong = false, large = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base text-ink-700">{label}</dt>
      <dd
        className={`tabular whitespace-nowrap text-end ${strong ? 'font-bold text-ink-900' : 'text-ink-800'} ${
          large ? 'text-lg' : 'text-base'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Which value the profit used for a fuel, in a word or two. */
