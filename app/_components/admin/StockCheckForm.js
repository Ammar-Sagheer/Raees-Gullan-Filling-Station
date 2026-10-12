'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createStockCheck, deleteStockCheck, previewDipLitres } from '@/app/_lib/actions';
import { shiftISODate } from '@/app/_lib/date-helpers';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import Toast from '@/app/_components/ui/Toast';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import { fuelColor } from '@/app/_lib/fuel-colors';
import { DIP_DEFAULT } from '@/app/_lib/pump-settings';
import Icon from '@/app/_components/ui/Icon';
import TankGauge from '@/app/_components/admin/dashboard/TankGauge';
import { useI18n } from '@/app/_components/i18n/I18nProvider';
import { rich } from '@/app/_lib/i18n/core';

const litreFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/*
 * The whole card wears its fuel's colour, not just a badge.
 *
 * Two cards side by side, identical but for a name, and the figures typed into
 * them are four-digit numbers that look alike - so petrol's reading going into
 * diesel's box is an easy slip and an expensive one, because a dip is the
 * baseline every later day is measured from.
 *
 * The colours themselves, and the reasoning behind the dark/light pairing, live
 * in `app/_lib/fuel-colors.js` - one definition shared with the badges, the
 * dashboard cards and the charts. Here the band and the border take them; the
 * BODY STAYS WHITE so the figures keep full contrast on a tablet in poor light.
 *
 * Colour is not the only cue and must not be. The tank name is large and bold
 * in the header, and the dip box's own label names the tank again - so the card
 * still reads correctly for anyone who cannot use the colours at all. The
 * FuelBadge that used to sit in this header is gone: on a band that is already
 * the fuel's colour, beside a name that already says "Petrol Tank", it said a
 * third time what had been said twice.
 */

/*
 * A dip is a MOMENT, not a day, and which day it judges depends on when the rod
 * went in.
 *
 * This pump dips first thing in the morning, before the pumps are switched on,
 * so a dip taken on the 11th measures the tank as it stood at the close of the
 * 10th - and has to be compared against the 10th's books. Recording it against
 * the 11th, as the app did until migration 039, compared it against a book
 * figure that still had the 10th's fuel in it and reported a whole day's sales
 * as a loss, every single day.
 *
 * Which one the form opens on is the pump's habit, DIP_DEFAULT in
 * pump-settings.js, and the usual one is listed first. Both options are
 * legal and only the person holding the rod knows which is right, so this
 * follows the rule in docs/UI_CONVENTIONS.md for exactly that shape of control:
 * name the choice in plain words, then SHOW THE CONSEQUENCE - the day it closes
 * and the book figure that produces - before it is committed.
 */
const DEFAULT_TIMING = DIP_DEFAULT === 'evening' ? 'evening' : 'morning';

// The two choices, in the page's language (079), the usual one first.
const timings = (t) =>
  DEFAULT_TIMING === 'evening'
    ? [
        { value: 'evening', title: t('dip.closingTitle'), detail: t('dip.closingDetail') },
        { value: 'morning', title: t('dip.beforeTitle'), detail: t('dip.beforeDetail') },
      ]
    : [
        { value: 'morning', title: t('dip.morningTitle'), detail: t('dip.morningDetail') },
        { value: 'evening', title: t('dip.eveningTitle'), detail: t('dip.eveningDetail') },
      ];

export default function StockCheckForm({
  tank,
  date,
  existingCheck,
  earliestBooksDate = null,
  openingStock = null,
  canManage = false,
  // { min_mm, max_mm, lines } when this tank has a dip chart (075), else null.
  chart = null,
}) {
  const [state, formAction] = useActionState(createStockCheck, null);
  const { t, fmt } = useI18n();
  const showLitres = (n) => fmt.litres(n || 0);
  const day = (iso) => fmt.date(iso);
  const [clearState, clearAction] = useActionState(deleteStockCheck, null);
  const [dip, setDip] = useState('');
  /*
   * WITH A CHART, THE ROD READING IN MM. The litres it comes to are asked of
   * the database as he types (previewDipLitres) and shown under the box; the
   * database works them out again when the dip is saved, so what is shown is
   * what is stored. "Enter litres instead" is there for a reading off another
   * chart, or a chart that turns out to be wrong.
   */
  const [byMm, setByMm] = useState(Boolean(chart));
  const [mm, setMm] = useState('');
  const [chartLitres, setChartLitres] = useState({ litres: null, error: null, pending: false });
  const [taken, setTaken] = useState(DEFAULT_TIMING);
  const [notice, setNotice] = useState(null);
  const formRef = useRef(null);

  /*
   * Carry the confirmation out of the form and empty the box behind it.
   *
   * Both halves matter, and skipping them caused a real near-miss. This page is
   * date-driven, so stepping to the next day is a client-side navigation that
   * does NOT remount this component - the typed reading and the "Saved…" line
   * both survived it. The next morning's card opened with YESTERDAY'S DIP
   * already in the box, one tap from being saved again as today's measurement,
   * under a green message describing a different day.
   *
   * `Toast` exists for precisely this and says so in its own comment; this form
   * was one of the last that had not adopted it. Failures deliberately stay
   * inline via <FormMessage> - an error has to survive long enough to act on.
   */
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setNotice({ message: state.message });
      formRef.current?.reset();
      setDip('');
      setMm('');
      setChartLitres({ litres: null, error: null, pending: false });
      setByMm(Boolean(chart));
      setTaken(DEFAULT_TIMING);
    }
    // `chart` only decides the box to go back to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // A different day is a different measurement. Belt to the effect's braces:
  // if a save is ever missed, the box still empties when the date changes.
  useEffect(() => {
    setDip('');
    setMm('');
    setChartLitres({ litres: null, error: null, pending: false });
    setTaken(DEFAULT_TIMING);
  }, [date]);

  // Ask the database what the rod reading comes to, a moment after typing stops.
  useEffect(() => {
    if (!byMm || mm === '') {
      setChartLitres({ litres: null, error: null, pending: false });
      return undefined;
    }
    setChartLitres((current) => ({ ...current, pending: true }));
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewDipLitres(tank.id, mm);
      if (cancelled) return;
      setChartLitres(
        result?.ok
          ? { litres: result.litres, error: null, pending: false }
          : { litres: null, error: result?.message ?? t('dip.chartFailed'), pending: false },
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [byMm, mm, tank.id]);

  // Clearing a dip confirms the same way. ConfirmAction closes its own dialog
  // on success, so without this the only trace of it would be the row vanishing.
  const handledClear = useRef(clearState);
  useEffect(() => {
    if (clearState === handledClear.current) return;
    handledClear.current = clearState;
    if (clearState?.ok) setNotice({ message: clearState.message });
  }, [clearState]);

  // The day this dip closes, and so the books it is judged against.
  const closesDate = taken === 'morning' ? shiftISODate(date, -1) : date;

  /*
   * Once a dip is recorded, its OWN stored figures are what the card shows -
   * not a live recomputation for whichever timing the toggle happens to be
   * sitting on. They cannot go stale: migration 039 rebuilds expected_stock
   * from history whenever anything behind it moves.
   */
  const shownClosesDate = existingCheck
    ? (existingCheck.books_date ?? shiftISODate(date, -1))
    : closesDate;
  const expected = existingCheck
    ? Number(existingCheck.expected_stock ?? 0)
    : Number((taken === 'morning' ? tank.expected_if_morning : tank.expected_if_evening) ?? 0);

  /*
   * A dip with no dip behind it is measured against the tank's OPENING STOCK
   * from Settings, because there is nothing else to measure it against. That
   * makes any difference a disagreement between two typed figures, not fuel
   * that appeared or vanished - so it must not be dressed up as a gain.
   *
   * This is not hypothetical: the pump's first dip read 5,556 L against an
   * opening of 854 L and the page announced "Gain of 4,702 L" in green. The two
   * tanks' figures had been entered into each other's cards.
   */
  const isFirstDip = existingCheck
    ? !earliestBooksDate || (existingCheck.books_date ?? '') <= earliestBooksDate
    : !earliestBooksDate || closesDate <= earliestBooksDate;

  const dipValue = byMm ? chartLitres.litres : dip === '' ? null : Number(dip);
  const hasDip = dipValue !== null && Number.isFinite(dipValue);
  const difference = hasDip ? round2(dipValue - expected) : null;

  /* 14px sentences, up from the 12px these warnings were set in: they are
     read before a figure is committed, and the caption floor is for captions. */
  const openingNote = isFirstDip ? (
    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm font-medium text-amber-900">
      {rich(t, 'dip.firstDip', {
        opening: <strong>{t('dip.openingStock')}</strong>,
        litres: showLitres(openingStock ?? expected),
      })}
    </p>
  ) : null;

  const capacity = Number(tank.capacity_litres ?? 0);
  const fillPercent = capacity ? Math.min(100, Math.max(0, (expected / capacity) * 100)) : 0;

  // More fuel on the books than the tank can physically hold, or less than
  // nothing in it. Either way the books are wrong, not the tank.
  const overCapacity = capacity > 0 && expected > capacity;
  const belowZero = expected < 0;

  const color = fuelColor(tank.fuel_type);

  /*
   * THE ONE CARD ON THE PAGE THAT KEEPS THE LOUD BAND. The fuel's `solid` fill
   * is rationed to surfaces where typing into the wrong one costs something,
   * and this is that surface: a dip is the baseline every later day is measured
   * from. In the new look it is a `.panel`, lifted a step further than the rest
   * (`shadow-xl`) for the same reason, with `.fuel-band`'s wide sheen on the
   * band - the treatment the Readings unit header wears - and the tank drawn as
   * a tank, the Dashboard's gauge, beside the book figure.
   */
  return (
    <section data-card className="panel flex flex-col overflow-hidden shadow-xl">
      <header
        className={`fuel-band flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3.5 ${color.solid}`}
      >
        {/* The tank's name is the loudest text on the card: it says which tank
            the reading is going into. The capacity is the quiet half. */}
        <h2 className="text-lg font-bold">
          <bdi>{tank.name}</bdi>
        </h2>
        <span className={`text-sm font-semibold ${color.solidMuted}`}>
          {rich(t, 'dip.holds', {
            litres: <span className="whitespace-nowrap">{showLitres(tank.capacity_litres)}</span>,
          })}
        </span>
      </header>

      <div className="@container flex flex-1 flex-col p-5">
        {/* ---- what the books say is down there ---- */}
        <div className="flex items-center gap-4 @[19rem]:gap-5">
          <TankGauge
            fuelType={tank.fuel_type}
            percent={fillPercent}
            label={t('dip.percentFull', { tank: tank.name, pct: Math.round(fillPercent) })}
          />
          <div className="min-w-0 flex-1">
            <p className="caption">{t('dip.expected')}</p>
            {/* nowrap: at a phone's width this figure once broke between the
                number and its unit, leaving a bare "L" on the next line. */}
            <p
              /* 24px below 19rem of card, 30px above: at 320px the card
                 leaves about 160px beside the gauge, and "12,480.62 L" at
                 30px needs 190. The figure steps down; it never wraps. */
              className={`tabular whitespace-nowrap text-2xl font-bold tracking-tight @[19rem]:text-3xl ${
                overCapacity || belowZero ? 'text-red-700' : 'text-ink-900'
              }`}
            >
              {showLitres(expected)}
            </p>
            {/* Which day's books that is - its own line, so the date can never
                squeeze the figure. */}
            <p className="caption">{t('dip.atClose', { date: day(shownClosesDate) })}</p>
            <p className="tabular mt-2 text-base text-ink-700">
              {rich(t, 'dip.fullOnBooks', {
                pct: <span className="font-semibold text-ink-900">{fmt.isolate(`${Math.round(fillPercent)}%`)}</span>,
              })}
            </p>
          </div>
        </div>

        {openingNote}

        {overCapacity ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">
            {t('dip.overCapacity', {
              expected: showLitres(expected),
              capacity: showLitres(capacity),
              over: showLitres(expected - capacity),
            })}
          </p>
        ) : null}

        {belowZero ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">
            {t('dip.belowZero')}
          </p>
        ) : null}

        {/* The page makes the two tanks one height, and a tank whose dip is
            recorded is shorter than one still showing the form. The spare
            height goes HERE, above the dip, so the recorded dip sits at the
            foot of its card level with the other card's button, rather than
            leaving blank card under it. At least the 20px gap this always had. */}
        <div aria-hidden="true" className="min-h-5 flex-1" />

        <div className="border-t border-ink-200/70 pt-5">
          {existingCheck ? (
            <div className="rounded-2xl border border-ink-200 bg-ink-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="caption">{t('dip.recorded')}</p>
                  <p className="tabular whitespace-nowrap text-2xl font-bold text-ink-900">
                    {showLitres(existingCheck.actual_dip_reading)}
                  </p>
                  {existingCheck.dip_mm !== null && existingCheck.dip_mm !== undefined ? (
                    <p className="tabular text-sm font-semibold text-ink-800">
                      {t('dip.rodReading', { mm: fmt.isolate(litreFormat.format(Number(existingCheck.dip_mm))) })}
                    </p>
                  ) : null}
                  <p className="text-sm text-ink-700">
                    {t(existingCheck.taken === 'evening' ? 'dip.takenEvening' : 'dip.takenMorning', { date: day(date) })}
                  </p>
                </div>

                {/* A mistyped rod reading has to be correctable, and a dip is
                    the baseline every later figure is built on - so a wrong one
                    is wrong for every day after it. Cleared and re-entered
                    rather than edited, the same as a purchase. */}
                {canManage ? (
                  <ConfirmAction
                    triggerLabel={t('dip.clearTank', { tank: tank.name })}
                    title={t('dip.clearTitle')}
                    confirmLabel={t('dip.clearConfirm')}
                    pendingLabel={t('dip.clearing')}
                    action={clearAction}
                    state={clearState}
                    hidden={{ check_id: existingCheck.id }}
                  >
                    <p>
                      {t('dip.clearBody1', { litres: showLitres(existingCheck.actual_dip_reading), date: day(date) })}
                    </p>
                    <p>{t('dip.clearBody2')}</p>
                    {clearState?.ok === false ? <FormMessage state={clearState} /> : null}
                  </ConfirmAction>
                ) : null}
              </div>

              <DipDifference
                difference={Number(existingCheck.gain_loss)}
                isFirstDip={isFirstDip}
                forDate={shownClosesDate}
              />
            </div>
          ) : (
            <form ref={formRef} action={formAction} className="space-y-4">
              <input type="hidden" name="tank_id" value={tank.id} />
              <input type="hidden" name="check_date" value={date} />

              <div>
                <span className="label block">{t('dip.when')}</span>
                {/* The chosen option wears the TANK'S colour, not the app's
                    green - a green card inside a diesel-banded card reads as a
                    third, unrelated hue dropped into the middle of it. */}
                <BalanceDirection
                  name="taken"
                  value={taken}
                  onChange={setTaken}
                  options={timings(t)}
                  activeClass={color.selected}
                />
                <p className="mt-1.5 text-sm text-ink-700">
                  {taken === 'evening'
                    ? t('dip.eveningLine', { date: day(date) })
                    : t('dip.morningLine', { date: day(date), previous: day(shiftISODate(date, -1)) })}
                </p>
              </div>

              {byMm ? (
              <div>
                {/* Same rule as the litres box: the tank is named in the label. */}
                <label className="label" htmlFor={`dipmm-${tank.id}`}>
                  {rich(t, 'dip.rodLabel', {
                    tank: <bdi className={`font-bold ${color.onWhite}`}>{tank.name}</bdi>,
                    unit: <span className="font-semibold text-ink-900">{t('dip.inMm')}</span>,
                  })}
                </label>
                <NumberInput
                  id={`dipmm-${tank.id}`}
                  name="dip_mm"
                  step="0.1"
                  min="0"
                  max={chart?.max_mm}
                  required
                  value={mm}
                  onChange={(event) => setMm(event.target.value)}
                  className="input-number"
                  placeholder="0"
                  aria-describedby={`dipmm-help-${tank.id}`}
                />
                {mm !== '' ? (
                  <div className="figure-box mt-2" aria-live="polite">
                    <p className="caption">{t('dip.fromChart')}</p>
                    {chartLitres.error ? (
                      <p className="text-sm font-semibold text-red-700">{chartLitres.error}</p>
                    ) : chartLitres.pending || chartLitres.litres === null ? (
                      <p className="text-sm text-ink-700">{t('dip.readingChart')}</p>
                    ) : (
                      <p className="tabular whitespace-nowrap text-2xl font-bold text-ink-900">
                        = {showLitres(chartLitres.litres)}
                      </p>
                    )}
                  </div>
                ) : null}
                <p id={`dipmm-help-${tank.id}`} className="mt-1.5 text-sm text-ink-700">
                  {rich(t, 'dip.rodHelp', {
                    range: (
                      <span className="tabular whitespace-nowrap">
                        {t('dip.range', {
                          from: fmt.isolate(litreFormat.format(Number(chart?.min_mm ?? 0))),
                          to: fmt.isolate(litreFormat.format(Number(chart?.max_mm ?? 0))),
                        })}
                      </span>
                    ),
                  })}
                </p>
                <button
                  type="button"
                  onClick={() => setByMm(false)}
                  className="mt-1 text-sm font-semibold text-brand-700 underline underline-offset-2"
                >
                  {t('dip.litresInstead')}
                </button>
              </div>
              ) : (
              <div>
                {/* The fuel is named in the label, not left to the card's
                    colour. Two four-digit readings typed into the wrong boxes
                    look perfectly plausible, and nothing downstream can catch
                    it - so the box itself says which tank it belongs to. */}
                <label className="label" htmlFor={`dip-${tank.id}`}>
                  {rich(t, 'dip.dipLabel', {
                    tank: <bdi className={`font-bold ${color.onWhite}`}>{tank.name}</bdi>,
                    unit: <span className="font-semibold text-ink-900">{t('dip.inLitres')}</span>,
                  })}
                </label>
                <NumberInput
                  id={`dip-${tank.id}`}
                  name="actual_dip_reading"
                  step="0.01"
                  min="0"
                  required
                  value={dip}
                  onChange={(event) => setDip(event.target.value)}
                  className="input-number"
                  placeholder="0.00"
                  aria-describedby={`dip-help-${tank.id}`}
                />
                <p id={`dip-help-${tank.id}`} className="mt-1.5 text-sm text-ink-700">
                  {chart
                    ? t('dip.byHandWithChart')
                    : t('dip.byHand')}
                </p>
                {chart ? (
                  <button
                    type="button"
                    onClick={() => setByMm(true)}
                    className="mt-1 text-sm font-semibold text-brand-700 underline underline-offset-2"
                  >
                    {t('dip.mmInstead')}
                  </button>
                ) : null}
              </div>
              )}

              {difference !== null ? (
                <DipDifference difference={difference} isFirstDip={isFirstDip} forDate={closesDate} />
              ) : null}

              <div>
                <label className="label" htmlFor={`note-${tank.id}`}>
                  {t('dip.noteLabel')} <span className="font-normal text-ink-600">{t('dip.optional')}</span>
                </label>
                <input
                  id={`note-${tank.id}`}
                  name="note"
                  type="text"
                  className="input"
                  placeholder={t('dip.notePlaceholder')}
                />
              </div>

              {/* Errors only. A success goes to the toast, so it cannot sit
                  here describing a day that is no longer on screen. */}
              {state?.ok === false ? <FormMessage state={state} /> : null}

              <SubmitButton fullWidth>{t('dip.record')}</SubmitButton>
            </form>
          )}
        </div>
      </div>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}

/**
 * What the dip found against the books, in words with a shape beside them -
 * a tick for a match, an arrow up for a gain, down for a loss - and the colour
 * as the third cue, never the only one. A FIRST dip is measured against the
 * typed opening stock rather than an earlier measurement, so its difference is
 * a disagreement between two figures, not fuel: amber, no arrow, and never the
 * word "gain" (the pump's first dip once announced "Gain of 4,702 L" in green
 * for two tanks' figures typed into each other's cards).
 */
function DipDifference({ difference, isFirstDip, forDate }) {
  const { t, fmt } = useI18n();
  const showLitres = (n) => fmt.litres(n || 0);
  const shape =
    difference === 0
      ? {
          cls: 'bg-white text-ink-800 ring-1 ring-inset ring-ink-200',
          glyph: 'check',
          text: isFirstDip ? t('dip.matchesOpening') : t('dip.matchesBooks'),
        }
      : isFirstDip
        ? {
            cls: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
            glyph: null,
            text: t('dip.awayFromOpening', { litres: showLitres(Math.abs(difference)) }),
          }
        : difference > 0
          ? {
              cls: 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100',
              glyph: 'up',
              text: t('dip.gain', { litres: showLitres(difference) }),
            }
          : {
              cls: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-100',
              glyph: 'down',
              text: t('dip.loss', { litres: showLitres(Math.abs(difference)) }),
            };

  return (
    <div className={`mt-4 flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 ${shape.cls}`}>
      {shape.glyph === 'check' ? (
        <Icon name="check" className="mt-0.5 h-5 w-5" />
      ) : shape.glyph ? (
        <svg viewBox="0 0 12 12" className="mt-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true">
          <path d={shape.glyph === 'up' ? 'M6 2 10.5 9h-9Z' : 'M6 10 1.5 3h9Z'} fill="currentColor" />
        </svg>
      ) : null}
      <p className="tabular text-base font-semibold">
        {shape.text}
        <span className="block text-sm font-medium opacity-90">{t('dip.forDate', { date: fmt.date(forDate) })}</span>
      </p>
    </div>
  );
}
