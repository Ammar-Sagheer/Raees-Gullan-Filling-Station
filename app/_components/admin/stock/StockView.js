import PendingLink from '@/app/_components/ui/PendingLink';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import Pager from '@/app/_components/ui/Pager';
import StockCheckForm from '@/app/_components/admin/StockCheckForm';
import DipChecker from '@/app/_components/admin/DipChecker';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';

import { i18nFor, rich } from '@/app/_lib/i18n/core';
import { Translated } from '@/app/_components/i18n/I18nProvider';
import { DIP_DEFAULT } from '@/app/_lib/pump-settings';

const PER_PAGE = 25;

/*
 * `.table-scroll` bleeds to the screen edges on a phone (-mx-4 px-4) - right
 * for a card that IS the scroller, wrong inside a `.panel` that clips: the
 * bleed is cut off and the render check reports the table escaping its card.
 * `mx-0 px-0` at the call site, so the panel is the edge and the table scrolls
 * inside it. Its height cap stays: it is what keeps the column headings pinned
 * while reading down 25 dips (the first cut of this page switched it off with
 * `max-h-none`, which lost them).
 */

/**
 * The Stock page, drawn - in the new look the Dashboard set.
 *
 * Three zones, as before: the two tanks' dips, the lubricant shelf, and the
 * dips already taken. What each one says is unchanged; how it looks moved over.
 */
export default function StockView({
  date,
  page,
  tanks,
  checks,
  lubricants,
  chartRanges = {},
  canManage,
  lang = 'en',
}) {
  // The login's language (079): words from the dictionaries, figures from fmt.
  const { t, fmt } = i18nFor(lang);
  const checksOnDate = new Map(
    checks.filter((check) => check.check_date === date).map((check) => [check.tank_id, check]),
  );

  /*
   * The earliest day each tank has a dip closing. A dip with nothing before it
   * is measured against the tank's OPENING STOCK from Settings, not against an
   * earlier measurement, so a difference there is two typed figures
   * disagreeing, not fuel that moved - and must not be called a gain. Derived
   * here because getStockChecks() is uncapped: the first dip is the one with
   * the smallest books_date.
   */
  const earliestByTank = new Map();
  for (const check of checks) {
    const closes = check.books_date ?? check.check_date;
    const seen = earliestByTank.get(check.tank_id);
    if (!seen || closes < seen) earliestByTank.set(check.tank_id, closes);
  }

  /*
   * Sliced rather than paged in Postgres: the lookup above needs whichever
   * check belongs to the DATE ON SCREEN, and that row is not necessarily on the
   * page of history being shown. Paging in the database would make a card offer
   * to re-record a dip that had already been taken.
   */
  const pageChecks = checks.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <Translated>
      <DayHeader date={date} basePath="/admin/stock-checks" title={t('stock.title')} icon="stock" lang={lang} />

      {/* ================= the tanks ================= */}
      <section aria-labelledby="tanks-heading" className="@container mt-10">
        <SectionHeader
          id="tanks-heading"
          icon="stock"
          tone="held"
          title={t('stock.tanksHeading')}
          description={
            DIP_DEFAULT === 'evening' ? t('stock.tanksTextEvening') : t('stock.tanksTextMorning')
          }
        />
        {/* ONE HEIGHT FOR THE PAIR. This was `items-start`: a tank with its
            dip recorded is shorter than one still showing the form, and the
            stretched one had blank card under it. Two tanks of different
            heights side by side read as broken too (reported 27 Sep 2026),
            so the pair stretches, and StockCheckForm puts the space above the
            dip, so the dip sits at the foot of its card. */}
        <div className="grid gap-5 @[50rem]:grid-cols-2">
          {tanks.map((tank) => (
            <StockCheckForm
              key={tank.id}
              tank={tank}
              date={date}
              existingCheck={checksOnDate.get(tank.id) ?? null}
              earliestBooksDate={earliestByTank.get(tank.id) ?? null}
              openingStock={tank.opening_stock_litres}
              chart={chartRanges[tank.id] ?? null}
              canManage={canManage}
            />
          ))}
        </div>
      </section>

      {/* ================= dip to litres, at any time (Al Tufail, October 2026) =================
          Only where a tank has a chart: without one there is nothing to convert. */}
      {Object.keys(chartRanges).length > 0 ? (
        <section aria-labelledby="dip-check-heading" className="@container mt-12">
          <SectionHeader
            id="dip-check-heading"
            icon="stock"
            tone="held"
            title={t('dipCheck.heading')}
            description={t('dipCheck.text')}
          />
          <div data-card className="panel p-5">
            <DipChecker tanks={tanks} charts={chartRanges} />
          </div>
        </section>
      ) : null}

      {/* ================= the lubricant shelf ================= */}
      <section aria-labelledby="shelf-heading" className="@container mt-12">
        <SectionHeader
          id="shelf-heading"
          icon="lubricants"
          tone="oil"
          title={t('stock.shelfHeading')}
          description={t('stock.shelfText', { date: fmt.date(date) })}
        />

        {lubricants.length === 0 ? (
          <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
            {t('stock.noLubricants')}{' '}
            <PendingLink
              href="/admin/lubricants"
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              {t('stock.addBrands')}
            </PendingLink>{' '}
            {t('stock.listedHere')}
          </div>
        ) : (
          <>
            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[40rem]">
                  <thead className="border-b border-ink-200 bg-ink-50">
                    <tr>
                      <th className="th ps-5">{t('stock.lubricant')}</th>
                      <th className="th text-end">{t('stock.opening')}</th>
                      <th className="th text-end">{t('stock.bought')}</th>
                      <th className="th text-end">{t('stock.sold')}</th>
                      <th className="th pe-5 text-end">{t('stock.inStock')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {lubricants.map((row) => (
                      <ShelfRow key={row.id} row={row} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-base text-ink-700">
              {rich(t, 'stock.whereRecorded', {
                lubricants: (
                  <PendingLink
                    href="/admin/lubricants"
                    className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                  >
                    {t('stock.lubricantsLink')}
                  </PendingLink>
                ),
                purchases: (
                  <PendingLink
                    href="/admin/purchases"
                    className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                  >
                    {t('stock.purchasesLink')}
                  </PendingLink>
                ),
              })}
            </p>
          </>
        )}
      </section>

      {/* ================= dips already taken ================= */}
      <section aria-labelledby="history-heading" className="@container mt-12">
        <SectionHeader
          id="history-heading"
          icon="activity"
          tone="neutral"
          title={t('stock.historyHeading')}
          description={t('stock.historyText')}
        />

        {checks.length === 0 ? (
          <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
            {t('stock.noDips')}
          </div>
        ) : (
          <>
            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[44rem]">
                  <thead className="border-b border-ink-200 bg-ink-50">
                    <tr>
                      {/* The day the dip CLOSES leads: that is the day its gain
                          or loss belongs to, and the one it lines up with on
                          Readings. When the rod went in is the second line. */}
                      <th className="th ps-5">{t('stock.dayChecked')}</th>
                      <th className="th">{t('stock.tank')}</th>
                      <th className="th text-end">{t('stock.expected')}</th>
                      <th className="th text-end">{t('stock.measured')}</th>
                      <th className="th pe-5 text-end">{t('stock.gainLoss')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {pageChecks.map((check) => {
                      const difference = Number(check.gain_loss);
                      // A tank's first dip has no earlier measurement behind
                      // it, so its "gain" is a disagreement with the opening
                      // stock in Settings. Named, and not coloured as a surplus.
                      const firstDip =
                        (check.books_date ?? check.check_date) ===
                        earliestByTank.get(check.tank_id);
                      return (
                        <tr key={check.id}>
                          <td className="td whitespace-nowrap ps-5">
                            <span className="font-semibold text-ink-900">
                              {fmt.date(check.books_date ?? check.check_date)}
                            </span>
                            <span className="block text-sm text-ink-600">
                              {t(check.taken === 'evening' ? 'stock.dippedEvening' : 'stock.dippedMorning', {
                                date: fmt.date(check.check_date),
                              })}
                            </span>
                            {/* THE NOTE IS A LINE UNDER THE DAY, not a column
                                of its own - the way Banking and Lubricants
                                carry theirs. As a sixth column it was what was
                                left after five nowrap ones: 112px, a note one
                                word to a line and its row four times the
                                height of the rest, and a table too wide for a
                                tablet held upright. Here it wraps to the
                                width the date lines set, and is read without
                                scrolling on a phone. */}
                            {check.note ? (
                              <span className="mt-1 block max-w-[48ch] whitespace-normal text-sm text-ink-700 [overflow-wrap:anywhere]">
                                <span className="font-semibold text-ink-800">{t('stock.note')}</span>{' '}
                                {check.note}
                              </span>
                            ) : null}
                          </td>
                          <td className="td">
                            <FuelBadge fuelType={check.tank?.fuel_type} lang={lang} />
                          </td>
                          <td className="td-num">{fmt.litres(check.expected_stock)}</td>
                          <td className="td-num font-semibold text-ink-900">
                            {fmt.litres(check.actual_dip_reading)}
                          </td>
                          <td
                            className={[
                              'td-num pe-5 font-bold',
                              difference === 0
                                ? 'text-ink-700'
                                : firstDip
                                  ? 'text-amber-900'
                                  : difference > 0
                                    ? 'text-brand-700'
                                    : 'text-red-700',
                            ].join(' ')}
                          >
                            {/* The sign is written out, so a gain and a loss
                                differ in shape as well as colour. */}
                            {firstDip
                              ? fmt.litres(Math.abs(difference))
                              : fmt.litresSigned(difference)}
                            {firstDip ? (
                              <span className="block text-sm font-normal text-ink-600">
                                {t('stock.vsOpening')}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Pager
              page={page}
              perPage={PER_PAGE}
              total={checks.length}
              hrefFor={(n) => `/admin/stock-checks?date=${date}&page=${n}`}
              label={t('stock.pagesLabel')}
              lang={lang}
            />
          </>
        )}
      </section>
    </Translated>
  );
}

/**
 * One product on the shelf.
 *
 * LOW AND OUT OF STOCK IN WORDS, not only in colour. This column used to say
 * "run out" by printing the figure red and "running low" by printing it amber,
 * and nothing else - the same shape as a healthy figure to a red-green
 * colourblind reader in a dim office. It now carries the same badge the
 * Lubricants page does, on the same rule: below one pack there is nothing left
 * to sell as a pack; for the drum, ten litres is roughly a week.
 *
 * The drum is not a pack. This row used to print "0 L pack" beside it, a
 * figure that described nothing; it says "loose, from the drum" instead, and
 * its litres carry the drum's third decimal.
 */
function ShelfRow({ row, lang }) {
  const { t, fmt } = i18nFor(lang);
  const formatLitres = fmt.litres;
  const formatLitresFine = fmt.litresFine;
  const left = Number(row.stock_litres ?? 0);
  const pack = Number(row.pack_size_litres ?? 0);
  const lowAt = row.sold_loose ? 10 : pack;
  const state = left <= 0 ? 'out' : left < lowAt ? 'low' : 'ok';
  const show = row.sold_loose ? formatLitresFine : formatLitres;

  return (
    <tr>
      <td className="td ps-5">
        <bdi className="font-semibold text-ink-900">{row.name}</bdi>
        <span className="block text-sm text-ink-600">
          {row.sold_loose ? t('stock.loose') : t('stock.pack', { size: formatLitres(pack) })}
          {row.is_active ? null : t('stock.retired')}
        </span>
      </td>
      <td className="td-num text-ink-600">{show(row.opening_stock_litres)}</td>
      <td className="td-num">{show(row.purchased_litres)}</td>
      <td className="td-num">{show(row.sold_litres)}</td>
      <td className="td-num pe-5">
        <span className="inline-flex items-center justify-end gap-2">
          {state === 'ok' ? null : (
            <span
              className={`badge text-xs ${
                state === 'out' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {state === 'out' ? t('stock.out') : t('stock.low')}
            </span>
          )}
          <span
            className={`font-bold ${
              state === 'out' ? 'text-red-700' : state === 'low' ? 'text-amber-900' : 'text-ink-900'
            }`}
          >
            {show(left)}
          </span>
        </span>
      </td>
    </tr>
  );
}
