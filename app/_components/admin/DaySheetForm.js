'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import { saveDaySheet } from '@/app/_lib/actions';
import { saleAmount, sumMoney, roundRupees, formatPKR } from '@/app/_lib/format-helpers';
import { fuelColor } from '@/app/_lib/fuel-colors';
import { customerLabel } from '@/app/_components/admin/VehiclePicker';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import NumberInput from '@/app/_components/ui/NumberInput';

/**
 * THE DAY SHEET (091): the owner's two register pages as one form, laid out the
 * way the pages are, with his own words on every box.
 *
 * WHY IT EXISTS. The app made him pick a screen and a button for each thing the
 * register holds, and for two days running the day's figures disagreed with his
 * page: credit entered under "Money received", local udhaar entered as customer
 * credit, a total typed beside its own parts. Here every box is the box on the
 * paper, a customer line can only be udhaar or wasool, and Save writes the whole
 * day in one database transaction (`save_day_sheet`).
 *
 * THE FRONT PAGE, top to bottom as on the paper:
 *   Dip (the day's dip per tank, its own dialog), Meters (previous, current and
 *   sale for each nozzle, with the fuel's total), Stock position (stock, purchase,
 *   total, sale, balance for each tank: all worked out here, nothing to type),
 *   Recovery (wasool) beside Daily sale (rate and litres and amount per fuel).
 * THE BACK PAGE:
 *   Invoice detail (the day's tanker deliveries, entered in their own dialog),
 *   Udhaar and Local udhaar, Pump expenses and House expenses, then the cash
 *   taken to the bank and counted, and the day's arithmetic as he does it.
 *
 * THE ARITHMETIC is a PREVIEW. The database writes the rows and the Dashboard
 * reads them, so the sheet and the Dashboard cannot disagree; this only lets him
 * see a missing line before he saves. The sale of each nozzle uses saleAmount()
 * (exact, as Postgres rounds it); litres are not money and are plain sums.
 *
 * A NOZZLE LEFT BLANK IS A NOZZLE THAT DID NOT SELL: its closing is saved equal
 * to its opening, and the confirmation lists every nozzle before anything is
 * written. Reads in English with his Urdu captions. Owner only.
 */

// Keys of the rows a saved day opens with are their positions (the same on the
// server and in the browser, or React reports a mismatch); a line added by hand
// takes the next number, which only ever happens in the browser.
let addedKey = 1;
const blank = () => ({ key: `a${addedKey++}`, who: '', amount: '', cash: false, slip: '' });

const toRows = (list, field) =>
  Array.isArray(list) && list.length
    ? list.map((line, index) => ({ key: `s${index}`, who: line[field] ?? '', amount: String(line.amount ?? ''), cash: Boolean(line.cash), slip: line.slip ?? '' }))
    : [];

// The saved udhaar lines, grouped under their customer in the order they appear: the
// sheet takes a customer once and then every slip under them (093).
const groupCredit = (list) => {
  const order = [];
  const byWho = new Map();
  (Array.isArray(list) ? list : []).forEach((line, index) => {
    const who = line.customer_id ?? '';
    if (!byWho.has(who)) {
      const group = { key: `g${order.length}`, who, lines: [] };
      byWho.set(who, group);
      order.push(group);
    }
    byWho.get(who).lines.push({ key: `s${index}`, slip: line.slip ?? '', amount: String(line.amount ?? ''), cash: Boolean(line.cash) });
  });
  return order;
};
const blankLine = () => ({ key: `a${addedKey++}`, slip: '', amount: '', cash: false });
const blankGroup = () => ({ key: `a${addedKey++}`, who: '', lines: [blankLine()] });

const num = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const litresText = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The fuel as the register names it. */
const FUEL_NAME = {
  petrol: { en: 'Super (petrol)', ur: 'سپر' },
  diesel: { en: 'Diesel', ur: 'ڈیزل' },
};
const fuelName = (fuel) => FUEL_NAME[fuel] ?? { en: fuel, ur: '' };

/** Urdu text, in the Urdu face, reading right to left. */
function Ur({ children, className = '' }) {
  return (
    <span lang="ur" dir="rtl" className={className}>
      {children}
    </span>
  );
}

/** A hint: the Urdu line first (the language he reads), the English under it, smaller. */
function Hint({ en, ur, className = '' }) {
  return (
    <div className={`text-sm text-ink-600 ${className}`}>
      {ur ? (
        <p lang="ur" dir="rtl" className="text-base leading-relaxed text-ink-800">
          {ur}
        </p>
      ) : null}
      <p className={ur ? 'mt-0.5 text-xs' : ''}>{en}</p>
    </div>
  );
}

/** A caption in English with the register's Urdu beside it. */
function Caption({ en, ur }) {
  return (
    <span>
      {en}
      {ur ? (
        <>
          {' '}
          <span lang="ur" dir="rtl" className="text-ink-600">
            {ur}
          </span>
        </>
      ) : null}
    </span>
  );
}

function Box({ en, ur, hint, hintUr, children, className = '' }) {
  return (
    <section data-card className={`panel @container p-4 sm:p-5 ${className}`}>
      <h2 className="text-lg font-bold tracking-tight text-ink-900">
        <Caption en={en} ur={ur} />
      </h2>
      {hint ? <Hint en={hint} ur={hintUr} className="mt-0.5" /> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function DaySheetForm({
  date,
  dateLabel,
  nozzles = [],
  tanks = [],
  deliveries = [],
  dips = {},
  customers = [],
  bankAccounts = [],
  saved = null,
  savedAt = null,
  blocked = null,
  dipButton = null,
  deliveryButton = null,
}) {
  // ---- what is on the sheet --------------------------------------------------
  const savedByNozzle = useMemo(() => new Map((saved?.readings ?? []).map((r) => [r.nozzle_id, r])), [saved]);

  const [closings, setClosings] = useState(() =>
    Object.fromEntries(
      nozzles.map((n) => {
        const was = savedByNozzle.get(n.nozzle_id);
        // A saved nozzle that did not sell opens blank again, as it was typed.
        const closed = was && Number(was.closing) !== Number(was.opening) ? String(was.closing) : '';
        return [n.nozzle_id, closed];
      }),
    ),
  );

  // One rate for each fuel, as the paper's Daily sale box has it.
  const fuels = useMemo(() => [...new Set(nozzles.map((n) => n.fuel_type))], [nozzles]);
  const [rates, setRates] = useState(() =>
    Object.fromEntries(
      fuels.map((fuel) => {
        const first = nozzles.find((n) => n.fuel_type === fuel);
        const was = savedByNozzle.get(first?.nozzle_id);
        return [fuel, String(was?.rate ?? first?.rate ?? '')];
      }),
    ),
  );

  const [fillers, setFillers] = useState(saved?.fillers ?? '');
  const [groups, setGroups] = useState(() => groupCredit(saved?.credit));
  // The flat lines the checks and the JSON below work on: one per slip.
  const credit = useMemo(
    () => groups.flatMap((g) => g.lines.map((l) => ({ key: l.key, who: g.who, amount: l.amount, cash: l.cash, slip: l.slip }))),
    [groups],
  );
  const [receivedGroups, setReceivedGroups] = useState(() => groupCredit(saved?.received));
  const received = useMemo(
    () => receivedGroups.flatMap((g) => g.lines.map((l) => ({ key: l.key, who: g.who, amount: l.amount, slip: l.slip }))),
    [receivedGroups],
  );
  const [local, setLocal] = useState(() => toRows(saved?.local, 'name'));
  const [pump, setPump] = useState(() => toRows(saved?.pump, 'name'));
  const [house, setHouse] = useState(() => toRows(saved?.house, 'name'));
  const [bankAccount, setBankAccount] = useState(saved?.bank?.account_id ?? bankAccounts[0]?.id ?? '');
  const [bankAmount, setBankAmount] = useState(saved?.bank?.amount ? String(saved.bank.amount) : '');
  const [counted, setCounted] = useState(saved?.cash_counted ? String(saved.cash_counted) : '');
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState(null);

  // ---- the nozzles, worked out as the register does ---------------------------
  const meters = useMemo(
    () =>
      nozzles.map((n) => {
        const opening = Number(n.opening);
        const typed = num(closings[n.nozzle_id]);
        const rate = num(rates[n.fuel_type]);
        const closing = typed === null ? opening : typed;
        const litres = Math.round((closing - opening) * 100) / 100;
        const sold = typed !== null && typed !== opening;
        return {
          ...n,
          opening,
          closing,
          rate,
          litres,
          sold,
          sale: sold && rate ? saleAmount(litres, rate) : 0,
          problem:
            typed !== null && typed < opening
              ? {
                  en: 'The current meter is lower than the previous. A meter cannot run backwards.',
                  ur: 'موجودہ میٹر سابقہ سے کم ہے۔ میٹر الٹا نہیں چل سکتا۔',
                }
              : sold && (!rate || rate <= 0)
                ? { en: `Type the ${n.fuel_type} rate in Daily sale.`, ur: 'روزانو فروخت میں ریٹ لکھیں۔' }
                : null,
        };
      }),
    [nozzles, closings, rates],
  );

  const byFuel = useMemo(
    () =>
      fuels.map((fuel) => {
        const rows = meters.filter((m) => m.fuel_type === fuel);
        return {
          fuel,
          rows,
          litres: Math.round(rows.reduce((sum, m) => sum + (m.sold ? m.litres : 0), 0) * 100) / 100,
          amount: sumMoney(rows.map((m) => m.sale)),
          rate: num(rates[fuel]),
        };
      }),
    [fuels, meters, rates],
  );

  const stock = useMemo(
    () =>
      tanks.map((tank) => {
        const sold =
          Math.round(
            meters.filter((m) => m.tank_id === tank.id).reduce((sum, m) => sum + (m.sold ? m.litres : 0), 0) * 100,
          ) / 100;
        const bought = deliveries.filter((d) => d.tank_id === tank.id).reduce((sum, d) => sum + Number(d.litres), 0);
        const opening = tank.opening_stock === null || tank.opening_stock === undefined ? null : Number(tank.opening_stock);
        const total = opening === null ? null : Math.round((opening + bought) * 100) / 100;
        return {
          ...tank,
          sold,
          bought,
          opening,
          total,
          balance: total === null ? null : Math.round((total - sold) * 100) / 100,
        };
      }),
    [tanks, meters, deliveries],
  );

  const amountOf = (rows) => sumMoney(rows.map((r) => num(r.amount) ?? 0));
  const wholeOf = (rows) => sumMoney(rows.map((r) => roundRupees(num(r.amount) ?? 0)));

  const totals = useMemo(() => {
    const sales = sumMoney(meters.map((m) => m.sale));
    const dayLitres = Math.round(byFuel.reduce((sum, f) => sum + f.litres, 0) * 100) / 100;
    const creditTotal = wholeOf(credit);
    const receivedTotal = wholeOf(received);
    const localTotal = amountOf(local);
    const pumpTotal = amountOf(pump);
    const houseTotal = amountOf(house);
    const bankTotal = num(bankAmount) ?? 0;
    const expenses = sumMoney([localTotal, pumpTotal, houseTotal]);
    const cash = sumMoney([sales, receivedTotal, -creditTotal, -expenses, -bankTotal]);
    const countedTotal = num(counted);
    return {
      sales,
      dayLitres,
      creditTotal,
      receivedTotal,
      localTotal,
      pumpTotal,
      houseTotal,
      expenses,
      bankTotal,
      cash,
      countedTotal,
      difference: countedTotal === null ? null : sumMoney([countedTotal, -cash]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meters, byFuel, credit, received, local, pump, house, bankAmount, counted]);

  // ---- what stops a save -------------------------------------------------------
  const problems = [];
  if (blocked) problems.push(blocked);
  for (const m of meters) if (m.problem) problems.push({ en: `${m.label}: ${m.problem.en}`, ur: m.problem.ur });
  const partial = (rows, what, urWhat, needsCustomer) => {
    for (const row of rows) {
      const hasAmount = (num(row.amount) ?? 0) > 0;
      const hasWho = String(row.who).trim() !== '';
      if (hasAmount !== hasWho && (hasAmount || hasWho)) {
        problems.push({
          en: `${what}: a line has ${needsCustomer ? 'a customer' : 'a name'} or an amount but not both.`,
          ur: `${urWhat}: ایک لائن میں ${needsCustomer ? 'گاہک' : 'نام'} یا رقم ہے، دونوں نہیں۔`,
        });
        break;
      }
    }
  };
  partial(credit, 'Udhaar', 'ادھار', true);
  partial(received, 'Wasool', 'وصولی', true);
  partial(local, 'Local udhaar', 'لوکل ادھار', false);
  partial(pump, 'Pump expenses', 'پمپ خرچ', false);
  partial(house, 'House expenses', 'گھر خرچ', false);
  if ((num(bankAmount) ?? 0) > 0 && !bankAccount) problems.push({ en: 'Choose the bank account the cash went to.', ur: 'وہ بینک اکاؤنٹ چنیں جس میں رقم گئی۔' });

  // ---- the JSON the database takes ---------------------------------------------
  const complete = (rows) => rows.filter((r) => String(r.who).trim() !== '' && (num(r.amount) ?? 0) > 0);
  const sheetJson = JSON.stringify({
    readings: meters.map((m) => ({
      nozzle_id: m.nozzle_id,
      opening: m.opening,
      closing: m.closing,
      rate: m.rate ?? 0,
    })),
    fillers: fillers.trim(),
    credit: complete(credit).map((r) => ({ customer_id: r.who, amount: num(r.amount), cash: Boolean(r.cash), slip: String(r.slip ?? '').trim() || null })),
    received: complete(received).map((r) => ({ customer_id: r.who, amount: num(r.amount), slip: String(r.slip ?? '').trim() || null })),
    local: complete(local).map((r) => ({ name: r.who.trim(), amount: num(r.amount) })),
    pump: complete(pump).map((r) => ({ name: r.who.trim(), amount: num(r.amount) })),
    house: complete(house).map((r) => ({ name: r.who.trim(), amount: num(r.amount) })),
    bank: (num(bankAmount) ?? 0) > 0 ? { account_id: bankAccount, amount: num(bankAmount) } : null,
    cash_counted: num(counted) ?? 0,
  });

  // ---- saving ------------------------------------------------------------------
  const [state, formAction] = useActionState(saveDaySheet, null);
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      setConfirming(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  const rupees = (n) => formatPKR(n);
  const savedTime = savedAt
    ? new Date(savedAt).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  const dipOf = (tankId) => dips[tankId] ?? null;

  return (
    <div className="space-y-4">
      {savedTime ? (
        <div className="callout">
          <p>
            This day was saved on {savedTime}. You can change anything below and save it again: only what you changed is
            corrected.
          </p>
          <p lang="ur" dir="rtl" className="mt-1 text-base">
            یہ دن پہلے محفوظ ہو چکا ہے۔ آپ نیچے کچھ بھی بدل کر دوبارہ محفوظ کر سکتے ہیں، صرف بدلی ہوئی چیز درست ہوگی۔
          </p>
        </div>
      ) : null}

      <Hint
        en="This page is your register, box for box. Fill it in the way you write the register, then press Check and save the day at the bottom."
        ur="یہ صفحہ آپ کا رجسٹر ہے، خانہ بہ خانہ۔ جیسے رجسٹر میں لکھتے ہیں ویسے لکھیں، پھر سب سے نیچے &quot;چیک کریں اور دن محفوظ کریں&quot; دبائیں۔"
      />

      {/* ============================ THE FRONT PAGE ================================= */}

      {/* ---- DIP (ڈپ): the paper's top two tables, one per fuel ---------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {fuels.map((fuel) => {
          const name = fuelName(fuel);
          const fuelTanks = tanks.filter((t) => t.fuel_type === fuel);
          let totalLitres = 0;
          return (
            <Box key={fuel} en={`Dip, ${name.en}`} ur={`ڈپ ${name.ur}`} hint="The dip of the tank at the closing." hintUr="بند کرتے وقت ٹینک کی ڈپ۔">
              <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200">
                {fuelTanks.map((tank) => {
                  const dip = dipOf(tank.id);
                  if (dip) totalLitres += Number(dip.litres);
                  return (
                    <li key={tank.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
                      <span className="text-base text-ink-800">{tank.name}</span>
                      <span className="tabular whitespace-nowrap text-base font-semibold text-ink-900">
                        {dip ? `${Number(dip.mm).toLocaleString('en-US')} mm · ${litresText(dip.litres)} L` : <span>Not dipped yet <Ur>ابھی ڈپ نہیں لی</Ur></span>}
                      </span>
                    </li>
                  );
                })}
                <li className="flex flex-wrap items-baseline justify-between gap-x-3 bg-ink-50 px-3 py-2">
                  <span className="text-base font-semibold text-ink-800">
                    <Caption en="Total" ur="ٹوٹل" />
                  </span>
                  <span className="tabular whitespace-nowrap text-base font-bold text-ink-900">{litresText(totalLitres)} L</span>
                </li>
              </ul>
            </Box>
          );
        })}
        {dipButton ? <div className="sm:col-span-2">{dipButton}</div> : null}
      </div>

      {/* ---- METERS (موجودہ / سابقہ / سیل): one box per fuel ------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {byFuel.map((group) => {
          const name = fuelName(group.fuel);
          const color = fuelColor(group.fuel);
          return (
            <Box
              key={group.fuel}
              en={`Meters, ${name.en}`}
              ur={name.ur}
              hint="Type the current meter of each nozzle. Previous is yesterday's current. A blank nozzle did not sell."
              hintUr="ہر نوزل کی موجودہ ریڈنگ لکھیں۔ سابقہ کل کی موجودہ ہے۔ جو نوزل نہیں چلی اسے خالی چھوڑ دیں۔"
            >
              <ul className="space-y-3">
                {group.rows.map((m) => (
                  <li key={m.nozzle_id} className="rounded-2xl border border-ink-200 p-3">
                    <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${color.soft}`}>{m.label}</span>
                    <div className="mt-3 grid grid-cols-1 gap-3 @[20rem]:grid-cols-2">
                      <div>
                        <p className="label">
                          <Caption en="Previous" ur="سابقہ" />
                        </p>
                        <p className="tabular input-number bg-ink-50 text-ink-800">
                          {m.opening.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <label className="label" htmlFor={`closing-${m.nozzle_id}`}>
                          <Caption en="Current" ur="موجودہ" />
                        </label>
                        <NumberInput
                          id={`closing-${m.nozzle_id}`}
                          step="0.01"
                          min="0"
                          value={closings[m.nozzle_id]}
                          onChange={(event) => setClosings({ ...closings, [m.nozzle_id]: event.target.value })}
                          className="input-number"
                          placeholder="Current"
                        />
                      </div>
                    </div>
                    <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-ink-50 px-3 py-2">
                      <span className="text-base text-ink-700">
                        <Caption en="Sale" ur="سیل" />
                      </span>
                      <span className="tabular whitespace-nowrap text-lg font-bold text-ink-900">
                        {m.sold ? `${litresText(m.litres)} L` : <span>No sale <Ur>فروخت نہیں</Ur></span>}
                      </span>
                    </p>
                    {m.problem ? (
                      <div className="callout-warn mt-2">
                        <p>{m.problem.en}</p>
                        <p lang="ur" dir="rtl" className="mt-0.5">{m.problem.ur}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-ink-100 px-3 py-2">
                <span className="text-base font-semibold text-ink-800">
                  <Caption en="Total" ur="ٹوٹل" />
                </span>
                <span className="tabular whitespace-nowrap text-lg font-bold text-ink-900">{litresText(group.litres)} L</span>
              </p>
            </Box>
          );
        })}
      </div>

      {/* ---- STOCK POSITION (اسٹاک پوزیشن): worked out, nothing to type ---------------- */}
      <Box
        en="Stock position"
        ur="اسٹاک پوزیشن"
        hint="Worked out for you: stock, plus purchase, less sale. The balance is what the books say; the dip above is what the rod says."
        hintUr="خود بخود نکلتا ہے: اسٹاک جمع خرید، منفی فروخت۔ بقایا کتاب کے مطابق ہے، اوپر کی ڈپ ناپ کے مطابق۔"
      >
        <ul className="space-y-3 @[40rem]:hidden">
          {stock.map((row) => (
            <li key={row.id} className="rounded-2xl border border-ink-200 p-3">
              <p className="mb-2 text-base font-bold text-ink-900">{row.name}</p>
              <dl className="grid gap-1.5">
                <Figure label={<Caption en="Stock" ur="موجودہ اسٹاک" />} value={row.opening === null ? '-' : `${litresText(row.opening)} L`} />
                <Figure label={<Caption en="Purchase" ur="خرید" />} value={`${litresText(row.bought)} L`} />
                <Figure label={<Caption en="Total" ur="ٹوٹل" />} value={row.total === null ? '-' : `${litresText(row.total)} L`} />
                <Figure label={<Caption en="Sale" ur="فروخت" />} value={`${litresText(row.sold)} L`} />
                <Figure label={<Caption en="Balance" ur="بقایا اسٹاک" />} value={row.balance === null ? '-' : `${litresText(row.balance)} L`} strong />
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden @[40rem]:block">
          <table className="w-full text-start text-base">
            <thead>
              <tr className="border-b border-ink-200 text-sm text-ink-600">
                <th className="py-2 pe-3 text-start font-semibold">Tank</th>
                <th className="py-2 pe-3 text-end font-semibold">
                  <Caption en="Stock" ur="موجودہ اسٹاک" />
                </th>
                <th className="py-2 pe-3 text-end font-semibold">
                  <Caption en="Purchase" ur="خرید" />
                </th>
                <th className="py-2 pe-3 text-end font-semibold">
                  <Caption en="Total" ur="ٹوٹل" />
                </th>
                <th className="py-2 pe-3 text-end font-semibold">
                  <Caption en="Sale" ur="فروخت" />
                </th>
                <th className="py-2 text-end font-semibold">
                  <Caption en="Balance" ur="بقایا اسٹاک" />
                </th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <tr key={row.id} className="border-b border-ink-100 last:border-0">
                  <td className="py-2 pe-3 font-semibold text-ink-900">{row.name}</td>
                  <td className="tabular whitespace-nowrap py-2 pe-3 text-end">{row.opening === null ? '-' : litresText(row.opening)}</td>
                  <td className="tabular whitespace-nowrap py-2 pe-3 text-end">{litresText(row.bought)}</td>
                  <td className="tabular whitespace-nowrap py-2 pe-3 text-end">{row.total === null ? '-' : litresText(row.total)}</td>
                  <td className="tabular whitespace-nowrap py-2 pe-3 text-end">{litresText(row.sold)}</td>
                  <td className="tabular whitespace-nowrap py-2 text-end font-bold text-ink-900">
                    {row.balance === null ? '-' : litresText(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>

      {/* ---- RECOVERY (وصولی) beside DAILY SALE (روزانو فروخت) ------------------------ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SlipGroups
          groups={receivedGroups}
          setGroups={setReceivedGroups}
          customers={customers}
          total={totals.receivedTotal}
          idPrefix="received"
          en="Recovery"
          ur="وصولی"
          hint="Money a customer PAID BACK today. Pick the customer once, then each payment under them: slip number and amount. Not fuel and not cash given out."
          hintUr="جو رقم گاہک نے آج واپس دی۔ گاہک ایک بار چنیں، پھر اس کے نیچے ہر ادائیگی: پرچی نمبر اور رقم۔ تیل نہیں، اور دی ہوئی نقد رقم نہیں۔"
          totalLabel="Wasool total / وصولی کا ٹوٹل"
          slipHint="Slip no."
          cashTick={false}
          addLabel="+ Add a payment · ادائیگی شامل کریں"
          unitOne="payment"
          unitMany="payments"
          unitUr="ادائیگیاں"
        />
        <Box
          en="Daily sale"
          ur="روزانو فروخت"
          hint="Type the day's rate for each fuel. Litres and amount are worked out."
          hintUr="ہر تیل کا آج کا ریٹ لکھیں۔ لیٹر اور رقم خود نکل آتے ہیں۔"
        >
          <ul className="space-y-3">
            {byFuel.map((group) => {
              const name = fuelName(group.fuel);
              return (
                <li key={group.fuel} className="rounded-2xl border border-ink-200 p-3">
                  <p className="mb-2 text-base font-semibold text-ink-900">
                    <Caption en={name.en} ur={name.ur} />
                  </p>
                  <div className="grid grid-cols-2 gap-3 @[28rem]:grid-cols-3">
                    <div>
                      <label className="label" htmlFor={`rate-${group.fuel}`}>
                        <Caption en="Rate" ur="ریٹ" />
                      </label>
                      <NumberInput
                        id={`rate-${group.fuel}`}
                        step="0.01"
                        min="0"
                        value={rates[group.fuel]}
                        onChange={(event) => setRates({ ...rates, [group.fuel]: event.target.value })}
                        className="input-number"
                      />
                    </div>
                    <div>
                      <p className="label">
                        <Caption en="Litres" ur="تعداد" />
                      </p>
                      <p className="tabular input-number bg-ink-50 text-ink-900">{litresText(group.litres)}</p>
                    </div>
                    <div className="col-span-2 @[28rem]:col-span-1">
                      <p className="label">
                        <Caption en="Amount" ur="رقم" />
                      </p>
                      <p className="tabular input-number whitespace-nowrap bg-ink-50 font-semibold text-ink-900">
                        {rupees(group.amount)}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <dl className="mt-3 grid gap-2">
            <Figure label={<Caption en="Total litres" ur="ٹوٹل لیٹر" />} value={`${litresText(totals.dayLitres)} L`} />
            <Figure label={<Caption en="Total amount" ur="ٹوٹل رقم" />} value={rupees(totals.sales)} strong />
          </dl>
          <Hint
            className="mt-2"
            en="A rate that is not today's rate is saved as the new price from this day, as under Settings."
            ur="اگر ریٹ آج کے ریٹ سے الگ ہو تو وہ اسی دن سے نیا ریٹ بن جاتا ہے، جیسے سیٹنگ میں۔"
          />
        </Box>
      </div>

      {/* ============================ THE BACK PAGE ================================== */}

      {/* ---- date, fillers --------------------------------------------------------- */}
      <section data-card className="panel p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="label">
              <Caption en="Date" ur="تاریخ" />
            </p>
            <p className="input bg-ink-50 font-semibold text-ink-900">{dateLabel}</p>
          </div>
          <div>
            <label className="label" htmlFor="sheet-fillers">
              <Caption en="Fillers (who worked)" ur="فلرز" />
            </label>
            <input
              id="sheet-fillers"
              type="text"
              autoComplete="off"
              className="input"
              value={fillers}
              onChange={(event) => setFillers(event.target.value)}
              placeholder="Names / نام"
            />
          </div>
        </div>
      </section>

      {/* ---- INVOICE DETAIL (تفصیل انوائس): the day's tanker deliveries ---------------- */}
      <Box
        en="Invoice detail"
        ur="تفصیل انوائس"
        hint="Fuel that came in today: tank, litres, invoice number. Add a delivery here; it is saved on its own and shows up in Stock position."
        hintUr="آج جو تیل آیا: ٹینک، لیٹر، انوائس نمبر۔ ڈیلیوری یہیں لکھیں، وہ الگ محفوظ ہوتی ہے اور اسٹاک پوزیشن میں آ جاتی ہے۔"
      >
        {deliveries.length === 0 ? (
          <p className="text-base text-ink-600">No delivery entered for this day. <Ur>آج کی کوئی ڈیلیوری درج نہیں۔</Ur></p>
        ) : (
          <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
                <span className="text-base font-semibold text-ink-900">
                  {d.tank_name} · {litresText(d.litres)} L
                </span>
                <span className="text-sm text-ink-600">
                  {d.invoice_number ? `Invoice ${d.invoice_number}` : 'No invoice number'}
                  {d.supplier_name ? ` · ${d.supplier_name}` : ''}
                </span>
                <span className="tabular whitespace-nowrap text-base text-ink-800">{rupees(d.total_cost)}</span>
              </li>
            ))}
          </ul>
        )}
        {deliveryButton ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {deliveryButton}
            <Ur className="text-base text-ink-600">ڈیلیوری درج کریں</Ur>
          </div>
        ) : null}
      </Box>

      {/* ---- UDHAAR and LOCAL UDHAAR | PUMP and HOUSE EXPENSES ------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <SlipGroups groups={groups} setGroups={setGroups} customers={customers} total={totals.creditTotal} />
          <TextList
            en="Local udhaar"
            ur="لوکل ادھار"
            hint="Saved as local expenses, never on a customer."
            hintUr="صرف لوکل خرچ کے طور پر محفوظ ہوتا ہے، گاہک کے نام پر کبھی نہیں۔"
            rows={local}
            setRows={setLocal}
            total={totals.localTotal}
            placeholder="Name / نام, e.g. Ayaz Jamali"
            idPrefix="local"
          />
        </div>
        <div className="space-y-4">
          <TextList
            en="Pump expenses"
            ur="پمپ خرچ"
            hint="One line for each thing: ice, lunch, petrol for recovery. Never a total."
            hintUr="ہر چیز کی الگ لائن: برف، لنچ، ریکوری کا پٹرول۔ ٹوٹل کبھی نہ لکھیں۔"
            rows={pump}
            setRows={setPump}
            total={totals.pumpTotal}
            placeholder="What for / کس لیے, e.g. Baraf"
            idPrefix="pump"
          />
          <TextList
            en="House expenses"
            ur="گھر خرچ"
            hint="One line for each thing, as above."
            hintUr="ہر چیز کی الگ لائن، اوپر کی طرح۔"
            rows={house}
            setRows={setHouse}
            total={totals.houseTotal}
            placeholder="What for / کس لیے, e.g. Sabzi"
            idPrefix="house"
          />
        </div>
      </div>

      {/* ---- BANK AND CASH -------------------------------------------------------------- */}
      <Box
        en="Bank and cash"
        ur="بینک"
        hint="Cash taken to the bank today, and the cash you counted that is left."
        hintUr="آج بینک میں جمع کروائی گئی نقد رقم، اور گنی ہوئی بقایا نقد رقم۔"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="sheet-bank-account">
              <Caption en="Bank account" ur="بینک اکاؤنٹ" />
            </label>
            <select
              id="sheet-bank-account"
              className="input"
              value={bankAccount}
              onChange={(event) => setBankAccount(event.target.value)}
            >
              {bankAccounts.length === 0 ? <option value="">No bank account yet</option> : null}
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bank_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="sheet-bank-amount">
              <Caption en="Cash taken to the bank" ur="بینک میں جمع کی گئی رقم" />
            </label>
            <NumberInput
              id="sheet-bank-amount"
              step="1"
              min="0"
              value={bankAmount}
              onChange={(event) => setBankAmount(event.target.value)}
              className="input-number"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label" htmlFor="sheet-counted">
              <Caption en="Cash counted (what is left)" ur="گنی ہوئی بقایا رقم" />
            </label>
            <NumberInput
              id="sheet-counted"
              step="1"
              min="0"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              className="input-number"
              placeholder="0"
            />
          </div>
        </div>
      </Box>

      {/* ---- THE DAY'S ARITHMETIC (تفصیل خرچ) -------------------------------------------- */}
      <Box
        en="The day"
        ur="کل حساب"
        hint="Your register's own arithmetic. Check it against the bottom of the paper before you save."
        hintUr="آپ کے رجسٹر کا اپنا حساب۔ محفوظ کرنے سے پہلے کاغذ کے نیچے والے حساب سے ملا لیں۔"
      >
        <dl className="grid gap-2 sm:grid-cols-2">
          <Figure label={<Caption en="Sale" ur="سیل" />} value={rupees(totals.sales)} />
          <Figure label={<Caption en="+ Wasool" ur="وصولی" />} value={rupees(totals.receivedTotal)} />
          <Figure label={<Caption en="- Udhaar" ur="کھاتہ (ادھار)" />} value={rupees(totals.creditTotal)} />
          <Figure label={<Caption en="- Expenses (local, pump, house)" ur="خرچ (لوکل، پمپ، گھر)" />} value={rupees(totals.expenses)} />
          <Figure label={<Caption en="- Cash to the bank" ur="بینک" />} value={rupees(totals.bankTotal)} />
          <Figure label={<Caption en="= Cash from today" ur="آج کی نقد رقم" />} value={rupees(totals.cash)} strong />
          <Figure label={<Caption en="Cash counted" ur="گنی ہوئی رقم" />} value={totals.countedTotal === null ? 'Not typed' : rupees(totals.countedTotal)} />
          <Figure
            label={<Caption en="Counted minus cash from today" ur="فرق" />}
            value={totals.difference === null ? '-' : rupees(totals.difference)}
            strong
          />
        </dl>
        <Hint
          className="mt-3"
          en="A difference is the cash of earlier days (if the counted cash is more) or cash that is short (if it is less). It does not stop you saving."
          ur="فرق پچھلے دنوں کی نقد رقم ہے (اگر گنی ہوئی رقم زیادہ ہو) یا کمی ہے (اگر کم ہو)۔ یہ محفوظ کرنے سے نہیں روکتا۔"
        />

        {problems.length > 0 ? (
          <ul className="callout-warn mt-4 list-disc ps-6">
            {problems.map((problem) => (
              <li key={problem.en}>
                {problem.en}
                <br />
                <Ur>{problem.ur}</Ur>
              </li>
            ))}
          </ul>
        ) : null}

        <FormMessage state={state?.ok === false ? state : null} />

        <div className="mt-4 flex gap-2 border-t border-ink-200 pt-4">
          <Button variant="primary" type="button" disabled={problems.length > 0} onClick={() => setConfirming(true)} className="flex-1">
            <span>
              Check and save the day <Ur>چیک کریں اور دن محفوظ کریں</Ur>
            </span>
          </Button>
        </div>
      </Box>

      {/* ---- CONFIRM ------------------------------------------------------------------ */}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={<Caption en={`Save ${dateLabel}?`} ur="دن محفوظ کریں؟" />}
        subtitle={
          <span className="text-sm text-ink-600">
            Look at every nozzle before you say yes. <Ur>ہاں کہنے سے پہلے ہر نوزل دیکھ لیں۔</Ur>
          </span>
        }
      >
        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="sheet_date" value={date} />
          <input type="hidden" name="sheet" value={sheetJson} />

          <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200">
            {meters.map((m) => (
              <li key={m.nozzle_id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="text-base text-ink-800">{m.label}</span>
                <span className={m.sold ? 'tabular whitespace-nowrap font-semibold text-ink-900' : 'text-ink-600'}>
                  {m.sold ? `${litresText(m.litres)} L · ${rupees(m.sale)}` : <span>No sale <Ur>فروخت نہیں</Ur></span>}
                </span>
              </li>
            ))}
          </ul>

          <dl className="grid gap-1 text-base">
            <Figure label={<Caption en="Sale" ur="سیل" />} value={rupees(totals.sales)} />
            <Figure
              label={<Caption en="Udhaar" ur="ادھار" />}
              value={`${credit.filter((r) => (num(r.amount) ?? 0) > 0).length} lines${
                credit.some((r) => r.cash && (num(r.amount) ?? 0) > 0)
                  ? ` (${credit.filter((r) => r.cash && (num(r.amount) ?? 0) > 0).length} cash)`
                  : ''
              }, ${rupees(totals.creditTotal)}`}
            />
            <Figure label={<Caption en="Wasool" ur="وصولی" />} value={`${received.filter((r) => (num(r.amount) ?? 0) > 0).length} lines, ${rupees(totals.receivedTotal)}`} />
            <Figure label={<Caption en="Expenses" ur="خرچ" />} value={rupees(totals.expenses)} />
            <Figure label={<Caption en="Cash to the bank" ur="بینک" />} value={rupees(totals.bankTotal)} />
            <Figure label={<Caption en="Cash counted" ur="گنی ہوئی رقم" />} value={totals.countedTotal === null ? 'Not typed' : rupees(totals.countedTotal)} />
          </dl>

          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving the day…">
              <span>
                Yes, save the day <Ur>جی ہاں، دن محفوظ کریں</Ur>
              </span>
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setConfirming(false)}>
              <span>
                Go back <Ur>واپس</Ur>
              </span>
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

function Figure({ label, value, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-ink-50 px-3 py-2">
      <dt className="text-base text-ink-700">{label}</dt>
      <dd className={`tabular whitespace-nowrap text-base ${strong ? 'font-bold text-ink-900' : 'font-semibold text-ink-900'}`}>{value}</dd>
    </div>
  );
}

const removeButton = (onClick) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Remove this line"
    className="mb-1 inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
  >
    <Icon name="trash" className="h-5 w-5" />
  </button>
);

function SlipGroups({
  groups,
  setGroups,
  customers,
  total,
  idPrefix = 'credit',
  en = 'Udhaar',
  ur = 'تفصیل ادھار',
  hint = 'Pick the customer once, then put each slip under them: slip number and amount. Tick Cash for money handed over, not fuel.',
  hintUr = 'گاہک ایک بار چنیں، پھر اس کے نیچے ہر پرچی لکھیں: پرچی نمبر اور رقم۔ رقم نقد دی ہو تو "نقد رقم، تیل نہیں" پر نشان لگائیں۔',
  totalLabel = 'Udhaar total / ادھار کا ٹوٹل',
  cashTick = true,
  addLabel = '+ Add a slip · پرچی شامل کریں',
  unitOne = 'slip',
  unitMany = 'slips',
  unitUr = 'پرچیاں',
}) {
  const updateGroup = (key, patch) => setGroups(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  const updateLine = (groupKey, lineKey, patch) =>
    setGroups(
      groups.map((g) =>
        g.key === groupKey ? { ...g, lines: g.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) } : g,
      ),
    );
  const removeLine = (groupKey, lineKey) =>
    setGroups(
      groups
        .map((g) => (g.key === groupKey ? { ...g, lines: g.lines.filter((l) => l.key !== lineKey) } : g))
        .filter((g) => g.lines.length > 0),
    );
  return (
    <Box en={en} ur={ur} hint={hint} hintUr={hintUr}>
      <ul className="space-y-3">
        {groups.map((group) => {
          const amounts = group.lines.map((l) => roundRupees(num(l.amount) ?? 0));
          const filled = group.lines.filter((l) => (num(l.amount) ?? 0) > 0).length;
          return (
            <li key={group.key} className="rounded-xl bg-ink-50 p-3 ring-1 ring-inset ring-ink-200/70">
              <label className="label" htmlFor={`${idPrefix}-who-${group.key}`}>
                <Caption en="Customer" ur="گاہک" />
              </label>
              <select
                id={`${idPrefix}-who-${group.key}`}
                className="input"
                value={group.who}
                onChange={(event) => updateGroup(group.key, { who: event.target.value })}
              >
                <option value="">Choose the customer / گاہک چنیں</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerLabel(customer)}
                  </option>
                ))}
              </select>

              <ul className="mt-3 space-y-2">
                {group.lines.map((line, index) => (
                  <li key={line.key} className="flex flex-wrap items-end gap-2">
                    <div className="w-28 flex-1 sm:w-32 sm:flex-none">
                      <label className="label" htmlFor={`${idPrefix}-slip-${line.key}`}>
                        {index === 0 ? <Caption en="Slip no." ur="پرچی نمبر" /> : <span className="sr-only">Slip number</span>}
                      </label>
                      <input
                        id={`${idPrefix}-slip-${line.key}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={20}
                        className="input"
                        value={line.slip}
                        placeholder="1224"
                        onChange={(event) => updateLine(group.key, line.key, { slip: event.target.value })}
                      />
                    </div>
                    <div className="w-36 flex-1 sm:w-32 sm:flex-none">
                      <label className="label" htmlFor={`${idPrefix}-amount-${line.key}`}>
                        {index === 0 ? <Caption en="Amount" ur="رقم" /> : <span className="sr-only">Amount</span>}
                      </label>
                      <NumberInput
                        id={`${idPrefix}-amount-${line.key}`}
                        step="1"
                        min="1"
                        value={line.amount}
                        onChange={(event) => updateLine(group.key, line.key, { amount: event.target.value })}
                        className="input-number"
                        placeholder="0"
                      />
                    </div>
                    {removeButton(() => removeLine(group.key, line.key))}
                    {cashTick ? (
                    <label
                      className="flex min-h-11 basis-full items-center gap-3 rounded-lg bg-white px-3 text-base text-ink-800"
                      htmlFor={`${idPrefix}-cash-${line.key}`}
                    >
                      <input
                        id={`${idPrefix}-cash-${line.key}`}
                        type="checkbox"
                        className="h-6 w-6 shrink-0"
                        checked={line.cash}
                        onChange={(event) => updateLine(group.key, line.key, { cash: event.target.checked })}
                      />
                      <span>
                        Cash, not fuel <Ur>نقد رقم، تیل نہیں</Ur>
                      </span>
                    </label>
                    ) : null}
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => updateGroup(group.key, { lines: [...group.lines, blankLine()] })}
                >
                  {addLabel}
                </Button>
                <p className="text-base text-ink-700">
                  {filled} {filled === 1 ? unitOne : unitMany} <Ur>{unitUr}</Ur>:{' '}
                  <span className="tabular font-bold text-ink-900">{formatPKR(sumMoney(amounts))}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" type="button" onClick={() => setGroups([...groups, blankGroup()])}>
          + Add a customer · گاہک شامل کریں
        </Button>
        <p className="text-base text-ink-700">
          {totalLabel}: <span className="tabular font-bold text-ink-900">{formatPKR(total)}</span>
        </p>
      </div>
    </Box>
  );
}

function TextList({ en, ur, hint, hintUr, rows, setRows, total, placeholder, idPrefix }) {
  const update = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <Box en={en} ur={ur} hint={hint} hintUr={hintUr}>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <label className="label" htmlFor={`${idPrefix}-who-${row.key}`}>
                {index === 0 ? <Caption en="What for / who" ur="تفصیل" /> : <span className="sr-only">What for or who</span>}
              </label>
              <input
                id={`${idPrefix}-who-${row.key}`}
                type="text"
                autoComplete="off"
                className="input"
                value={row.who}
                placeholder={placeholder}
                onChange={(event) => update(row.key, { who: event.target.value })}
              />
            </div>
            <div className="w-36 flex-1 sm:w-32 sm:flex-none">
              <label className="label" htmlFor={`${idPrefix}-amount-${row.key}`}>
                {index === 0 ? <Caption en="Amount" ur="رقم" /> : <span className="sr-only">Amount</span>}
              </label>
              <NumberInput
                id={`${idPrefix}-amount-${row.key}`}
                step="1"
                min="1"
                value={row.amount}
                onChange={(event) => update(row.key, { amount: event.target.value })}
                className="input-number"
                placeholder="0"
              />
            </div>
            {removeButton(() => setRows(rows.filter((r) => r.key !== row.key)))}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" type="button" onClick={() => setRows([...rows, blank()])}>
          + Add a line · لائن شامل کریں
        </Button>
        <p className="text-base text-ink-700">
          Total <Ur>ٹوٹل</Ur>: <span className="tabular font-bold text-ink-900">{formatPKR(total)}</span>
        </p>
      </div>
    </Box>
  );
}
