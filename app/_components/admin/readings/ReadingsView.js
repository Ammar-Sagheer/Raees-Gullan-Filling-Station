import Icon from '@/app/_components/ui/Icon';
import ReadingForm from '@/app/_components/admin/ReadingForm';
import ClearDayButton from '@/app/_components/admin/ClearDayButton';
import DailyDipButton from '@/app/_components/admin/DailyDipButton';
import LubricantSaleForm from '@/app/_components/admin/LubricantSaleForm';
import LooseOilSaleForm from '@/app/_components/admin/LooseOilSaleForm';
import ReadingsCashUpBar from '@/app/_components/admin/ReadingsCashUpBar';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import QuickEntry from '@/app/_components/admin/dashboard/QuickEntry';
import CashInOutButton from '@/app/_components/admin/CashInOutButton';
import KpiCard from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';

import { todayISO, shiftISODate } from '@/app/_lib/date-helpers';
import { sumMoney } from '@/app/_lib/format-helpers';
import { i18nFor, rich } from '@/app/_lib/i18n/core';
import { Translated, InEnglish } from '@/app/_components/i18n/I18nProvider';
import { fuelColor, NEUTRAL_FUEL } from '@/app/_lib/fuel-colors';

/**
 * The daily entry screen, drawn - in the new look the Dashboard set.
 *
 * WHAT DID NOT CHANGE, ON PURPOSE. This page has more reverted designs recorded
 * against it than any other (docs/UI_CONVENTIONS.md): a day-completion strip
 * built three ways and removed, inline entry built and reverted ("model window
 * was better"), a dark strip across the top. None of that comes back. The unit
 * is still the card, entry is still a dialog with one nozzle in it, the unit
 * header still wears its fuel's band, entered nozzles are still washed in their
 * fuel's tint, and the cash-up bar still appears only once the totals at the
 * top have scrolled away. What changed is the surface: the day header, the
 * figure cards, the panels, the warnings and the dialog's insides.
 */
export default function ReadingsView({
  date,
  sheet,
  customers,
  creditSalesByReading,
  ratesInForce = {},
  isOwner,
  dipTanks = [],
  checksByTank = {},
  earliestByTank = {},
  chartRanges = {},
  oilProducts = [],
  oilDrums = [],
  bankAccounts = [],
  expenseCategories = [],
  lang = 'en',
}) {
  // The login's language (079): words from the dictionaries, figures from fmt.
  const { t, fmt } = i18nFor(lang);
  const today = todayISO();

  const done = sheet.filter((row) => row.reading_id);

  /* The day's totals, added in paisa by sumMoney rather than with a bare `+`:
     the reading sheet returns each nozzle's figures and no day total, and a
     column of two-decimal sums drifts in binary floating point. */
  const totals = {
    litres: done.reduce((sum, row) => sum + Number(row.litres_sold ?? 0), 0),
    cash: sumMoney(done.map((row) => row.cash_amount)),
    credit: sumMoney(done.map((row) => row.credit_amount)),
  };

  const missingRate = sheet.some((row) => !row.rate);

  /*
   * A RATE CARRIED OVER FROM AN EARLIER DAY, while there is still something to
   * enter at it. This pump's prices move most days, and the owner sets the new
   * one when he gets to it - four times now (14 Aug, 25 Aug, 12 Sep, 26-27
   * Sep) the day's readings went in first, on the previous day's rate, and the
   * new price was set straight afterwards. Migration 066 makes a price set
   * afterwards re-price those readings, so the books come right either way;
   * this says so BEFORE saving, which is where the mistake is cheapest.
   *
   * Only for a fuel with a nozzle still to enter: once the day is in, a
   * carried-over rate is either right or already re-priced, and a notice that
   * stays up after the work is done is one nobody reads.
   */
  const carriedOver = [...new Set(sheet.filter((row) => !row.reading_id).map((row) => row.fuel_type))]
    .map((fuelType) => ({ fuelType, price: ratesInForce[fuelType] }))
    .filter(({ price }) => price && price.effective_from < date);

  /*
   * A GAP BEFORE THIS DAY. get_reading_sheet gives every row the nearest
   * EARLIER reading for that nozzle (`previous_date`) - not necessarily
   * yesterday. When it isn't yesterday, whole days in between were never
   * opened, which is exactly the mistake this page is for: coming back after a
   * break and typing the day's numbers against today without noticing the day
   * before was left empty.
   *
   * A warning, not a block - migration 027 allows a day that leaves a genuine
   * gap behind it, because filling the gap later looks the same on the wire as
   * the mistake. This banner and the checkbox in the entry dialog are what make
   * the difference visible before saving.
   */
  const expectedPreviousDate = shiftISODate(date, -1);
  const gapRows = sheet.filter(
    (row) => row.previous_date && row.previous_date !== expectedPreviousDate,
  );
  const dayGap =
    gapRows.length === 0
      ? null
      : (() => {
          const earliestPrevious = gapRows.reduce(
            (min, row) => (row.previous_date < min ? row.previous_date : min),
            gapRows[0].previous_date,
          );
          return {
            from: shiftISODate(earliestPrevious, 1),
            to: expectedPreviousDate,
            partial: gapRows.length < sheet.length,
          };
        })();

  /*
   * Grouped by unit, because a unit is a physical pump on the forecourt with
   * two nozzles bolted to it. get_reading_sheet returns rows ordered by unit
   * then nozzle, so this keeps that order. A unit number outlives the hardware
   * wearing it, so the group is unit number AND commissioned_on (migration 056).
   */
  const units = [];
  for (const row of sheet) {
    const last = units[units.length - 1];
    if (last && last.unitNumber === row.unit_number && last.commissionedOn === row.commissioned_on) {
      last.rows.push(row);
    } else {
      units.push({
        key: `${row.unit_number}|${row.commissioned_on ?? 'original'}`,
        unitNumber: row.unit_number,
        commissionedOn: row.commissioned_on,
        retiredOn: row.retired_on,
        rows: [row],
      });
    }
  }

  /*
   * THE ONE DAY A UNIT NUMBER MEANS TWO PUMPS. A damaged dispenser can sell in
   * the morning and its replacement in the afternoon, so on the changeover date
   * the sheet holds two Unit 1s. On that day, and only that day, each card says
   * which of the two it is - getting them the wrong way round would put the old
   * pump's last figures onto the new pump's meters.
   */
  const generationsPerUnit = units.reduce((count, unit) => {
    count.set(unit.unitNumber, (count.get(unit.unitNumber) ?? 0) + 1);
    return count;
  }, new Map());

  return (
    <Translated>
      {/* The day, as the page's heading - the same header the Dashboard uses,
          with Clear this day on its control row (owner only: entering a day
          against the wrong date is the mistake it exists for, and it poisons
          every day after, because each opening comes from the day before). */}
      <DayHeader date={date} basePath="/admin/readings" title={t('readings.title')} icon="readings" lang={lang}>
        {/* OIL SALE and the DAY'S DIP, from the readings page (Al Tufail, now every copy); the oil dialogs are not in the dictionaries yet and read in English: the same two dialogs as on
            Lubricants, for the day on screen, so a sale of oil is entered while
            the day's readings are, without going to Lubricants and picking the
            date again. */}
        <div className="flex flex-wrap items-center gap-2">
          {oilProducts.length > 0 ? (
            <InEnglish>
              <LubricantSaleForm
                lubricants={oilProducts}
                customers={customers}
                date={date}
                dateLabel={fmt.date(date)}
              />
            </InEnglish>
          ) : null}
          {oilDrums.length > 0 ? (
            <InEnglish>
              <LooseOilSaleForm
                drums={oilDrums}
                customers={customers}
                date={date}
                dateLabel={fmt.date(date)}
              />
            </InEnglish>
          ) : null}
          <DailyDipButton
            tanks={dipTanks}
            date={date}
            checksByTank={checksByTank}
            earliestByTank={earliestByTank}
            chartRanges={chartRanges}
            canManage={isOwner}
          />
          {isOwner ? (
            <ClearDayButton date={date} dateLabel={fmt.date(date)} entryCount={done.length} />
          ) : null}
        </div>
      </DayHeader>

      {/* The day's expense, bank entry and cash to the bank, entered with the
          readings (Al Hakeem). Owner only: expenses and banking are his. The
          entries default to the day on screen. */}
      {isOwner ? (
        <QuickEntry
          heading="The day's entries"
          idPrefix="readings"
          date={date}
          accounts={bankAccounts}
          usedCategories={expenseCategories}
          customers={customers}
        />
      ) : (
        /* A staff login has no expense or bank entry, but may still write cash that
           went across the counter with a customer (the same rule as before: the
           actions allow the data-entry role), so the button stands alone. */
        <section aria-label="Cash with a customer" data-card className="panel mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <p className="text-base font-semibold text-ink-800">Cash with a customer</p>
          <CashInOutButton customers={customers} date={date} />
        </section>
      )}

      {dayGap || missingRate || carriedOver.length > 0 ? (
        <div className="mt-4 space-y-3">
          {dayGap ? (
            <Notice tone="danger" icon="warning">
              {rich(
                t,
                dayGap.from === dayGap.to
                  ? dayGap.partial
                    ? 'readings.gapSome'
                    : 'readings.gapAll'
                  : dayGap.partial
                    ? 'readings.gapSomeMany'
                    : 'readings.gapAllMany',
                {
                  days: (
                    <span className="font-semibold">
                      {dayGap.from === dayGap.to
                        ? fmt.dateLong(dayGap.from)
                        : t('readings.range', { from: fmt.dateLong(dayGap.from), to: fmt.dateLong(dayGap.to) })}
                    </span>
                  ),
                  when: date === today ? t('readings.today') : fmt.date(date),
                },
              )}
            </Notice>
          ) : null}

          {missingRate ? (
            <Notice tone="warn" icon="warning">
              {t('readings.noRate')}{' '}
              {isOwner ? t('readings.noRateOwner') : t('readings.noRateStaff')}
            </Notice>
          ) : null}

          {carriedOver.length > 0 ? (
            <Notice
              tone="warn"
              icon="warning"
              title={isOwner ? t('readings.carriedOwner') : t('readings.carriedStaff')}
            >
              {carriedOver.map(({ fuelType, price }) => (
                <p key={fuelType}>
                  {rich(t, 'readings.carriedLine', {
                    fuel: lang === 'en' ? fuelColor(fuelType).label : t(`fuel.${fuelType}`),
                    rate: <span className="tabular whitespace-nowrap font-semibold">{fmt.rate(price.rate)}</span>,
                    date: fmt.date(price.effective_from),
                  })}
                </p>
              ))}
            </Notice>
          ) : null}
        </div>
      ) : null}

      {/* The id is what the cash-up bar watches: it shows itself only once
          these cards have left the viewport, so the day's totals are on
          screen exactly once at any moment. See ReadingsCashUpBar. No
          sparklines: these are the day's running totals while it is being
          typed, not a trend. */}
      <section
        id="day-totals"
        aria-label={t('readings.progress')}
        className="@container mt-5"
      >
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <KpiCard
            label={t('readings.nozzlesEntered')}
            icon="readings"
            tone="neutral"
            value={t('readings.ofTotal', { done: done.length, total: sheet.length })}
            sub={
              done.length === sheet.length && sheet.length > 0
                ? t('readings.allIn')
                : t('readings.stillToEnter', { count: sheet.length - done.length })
            }
            lang={lang}
          />
          <KpiCard label={t('readings.litresSold')} icon="fuelPump" tone="held" value={fmt.litres(totals.litres)} lang={lang} />
          <KpiCard label={t('readings.cash')} icon="cash" tone="money" value={fmt.rupees(totals.cash)} lang={lang} />
          <KpiCard label={t('readings.credit')} icon="credit" tone="credit" value={fmt.rupees(totals.credit)} lang={lang} />
        </div>
      </section>

      {/* THE CARD IS THE UNIT - three pumps to work through, not six unrelated
          forms. Each nozzle opens a dialog to enter it, so the whole day stays
          visible and there is only ever one nozzle to type into. */}
      <div className="mt-10 space-y-8">
        {units.map((unit) => {
          const entered = unit.rows.filter((row) => row.reading_id).length;
          const allDone = entered === unit.rows.length;
          const percent = Math.round((entered / unit.rows.length) * 100);

          /*
           * THE HEADER WEARS THE UNIT'S FUEL in the colour the Stock page puts
           * on its tanks, at the owner's request, with `.fuel-band`'s wide soft
           * sheen over it. A unit selling two fuels falls back to neutral
           * rather than being labelled by whichever nozzle came first.
           */
          const fuels = new Set(unit.rows.map((row) => row.fuel_type));
          const unitColor = fuels.size === 1 ? fuelColor([...fuels][0]) : NEUTRAL_FUEL;
          const changeoverDay = (generationsPerUnit.get(unit.unitNumber) ?? 1) > 1;
          const outgoing = Boolean(unit.retiredOn);

          return (
            <section
              key={unit.key}
              data-card
              aria-label={
                changeoverDay
                  ? t(outgoing ? 'readings.unitOutgoingAria' : 'readings.unitIncomingAria', { n: unit.unitNumber })
                  : t('readings.unit', { n: unit.unitNumber })
              }
              className="panel overflow-hidden"
            >
              {/* Everything in the band takes its colour from the band -
                  currentColor for the icon, white-alpha for the chips and the
                  track - so the same classes serve petrol's dark band with white
                  text and diesel's light one with dark text. */}
              <div
                className={`fuel-band flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 ${unitColor.solid}`}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/25 ring-1 ring-inset ring-black/10"
                  aria-hidden="true"
                >
                  <Icon name={allDone ? 'check' : 'readings'} className="h-[22px] w-[22px]" />
                </span>

                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight">{t('readings.unit', { n: unit.unitNumber })}</h2>
                  {unitColor.label ? (
                    <p className="text-sm font-medium opacity-90">
                      {lang === 'en' || fuels.size !== 1 ? unitColor.label : t(`fuel.${[...fuels][0]}`)}
                    </p>
                  ) : null}
                </div>

                {/* Words, not colour: both cards are the same fuel on the one
                    day a unit number means two pumps. */}
                {changeoverDay ? (
                  <span className="badge bg-white/25 ring-1 ring-inset ring-black/10">
                    {outgoing ? t('readings.beingReplaced') : t('readings.newUnit')}
                  </span>
                ) : null}

                <span className="badge ms-auto bg-white/25 ring-1 ring-inset ring-black/10">
                  {allDone ? <Icon name="check" className="h-4 w-4" /> : null}
                  {t('readings.entered', { done: entered, total: unit.rows.length })}
                </span>

                {/* Only while there is progress to show: a full bar on a
                    filled band has no track left to contrast with and reads as
                    a stray white rule. The chip above says the same thing. */}
                {allDone ? null : (
                  <div className="w-full @container">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-white/40 ring-1 ring-inset ring-black/10"
                      role="img"
                      aria-label={t('readings.unitPercent', { n: unit.unitNumber, pct: percent })}
                    >
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Two nozzle cards side by side, the way two nozzles hang off
                  one dispenser. `@container`, not `sm:` - this sits inside a
                  sidebar layout, so the window is not the width it has. */}
              <div className="@container bg-ink-50/60 p-4">
                <div className="grid grid-cols-1 items-stretch gap-4 @[34rem]:grid-cols-2">
                  {unit.rows.map((row) => (
                    <ReadingForm
                      key={row.nozzle_id}
                      row={row}
                      date={date}
                      customers={customers}
                      creditSales={creditSalesByReading[row.reading_id] ?? []}
                      canDelete={isOwner}
                      showUnit={false}
                    />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Clears the last unit from under the cash-up bar - sized from the
          PHONE, where the bar wraps to two lines, not from the laptop. */}
      <div aria-hidden="true" className="h-28" />

      <ReadingsCashUpBar
        watchId="day-totals"
        entered={done.length}
        total={sheet.length}
        litres={fmt.litres(totals.litres)}
        cash={fmt.rupees(totals.cash)}
        credit={fmt.rupees(totals.credit)}
      />
    </Translated>
  );
}
