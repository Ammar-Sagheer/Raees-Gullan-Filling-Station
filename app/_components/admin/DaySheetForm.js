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
const blank = () => ({ key: `a${addedKey++}`, who: '', amount: '' });

const toRows = (list, field) =>
  Array.isArray(list) && list.length
    ? list.map((line, index) => ({ key: `s${index}`, who: line[field] ?? '', amount: String(line.amount ?? '') }))
    : [];

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

function Box({ en, ur, hint, children, className = '' }) {
  return (
    <section data-card className={`panel @container p-4 sm:p-5 ${className}`}>
      <h2 className="text-lg font-bold tracking-tight text-ink-900">
        <Caption en={en} ur={ur} />
      </h2>
      {hint ? <p className="mt-0.5 text-sm text-ink-600">{hint}</p> : null}
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
  const [credit, setCredit] = useState(() => toRows(saved?.credit, 'customer_id'));
  const [received, setReceived] = useState(() => toRows(saved?.received, 'customer_id'));
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
              ? 'The current meter is lower than the previous. A meter cannot run backwards.'
              : sold && (!rate || rate <= 0)
                ? `Type the ${n.fuel_type} rate in Daily sale.`
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
  for (const m of meters) if (m.problem) problems.push(`${m.label}: ${m.problem}`);
  const partial = (rows, what, needsCustomer) => {
    for (const row of rows) {
      const hasAmount = (num(row.amount) ?? 0) > 0;
      const hasWho = String(row.who).trim() !== '';
      if (hasAmount !== hasWho && (hasAmount || hasWho)) {
        problems.push(`${what}: a line has ${needsCustomer ? 'a customer' : 'a name'} or an amount but not both.`);
        break;
      }
    }
  };
  partial(credit, 'Udhaar', true);
  partial(received, 'Wasool', true);
  partial(local, 'Local udhaar', false);
  partial(pump, 'Pump expenses', false);
  partial(house, 'House expenses', false);
  if ((num(bankAmount) ?? 0) > 0 && !bankAccount) problems.push('Choose the bank account the cash went to.');

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
    credit: complete(credit).map((r) => ({ customer_id: r.who, amount: num(r.amount) })),
    received: complete(received).map((r) => ({ customer_id: r.who, amount: num(r.amount) })),
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
        <p className="callout">
          This day was saved on {savedTime}. You can change anything below and save it again: only what you changed is
          corrected.
        </p>
      ) : null}

      <p className="text-sm text-ink-600">
        This page is your register, box for box. Fill it in the way you write the register, then press Check and save the
        day at the bottom.
      </p>

      {/* ============================ THE FRONT PAGE ================================= */}

      {/* ---- DIP (ڈپ): the paper's top two tables, one per fuel ---------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {fuels.map((fuel) => {
          const name = fuelName(fuel);
          const fuelTanks = tanks.filter((t) => t.fuel_type === fuel);
          let totalLitres = 0;
          return (
            <Box key={fuel} en={`Dip, ${name.en}`} ur={`ڈپ ${name.ur}`} hint="The dip of the tank at the closing.">
              <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200">
                {fuelTanks.map((tank) => {
                  const dip = dipOf(tank.id);
                  if (dip) totalLitres += Number(dip.litres);
                  return (
                    <li key={tank.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2">
                      <span className="text-base text-ink-800">{tank.name}</span>
                      <span className="tabular whitespace-nowrap text-base font-semibold text-ink-900">
                        {dip ? `${Number(dip.mm).toLocaleString('en-US')} mm · ${litresText(dip.litres)} L` : 'Not dipped yet'}
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
                        {m.sold ? `${litresText(m.litres)} L` : 'No sale'}
                      </span>
                    </p>
                    {m.problem ? <p className="callout-warn mt-2">{m.problem}</p> : null}
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
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-start text-base">
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
        <CustomerList
          en="Recovery"
          ur="وصولی"
          hint="Money a customer PAID BACK today. Not fuel and not cash given out."
          rows={received}
          setRows={setReceived}
          customers={customers}
          total={totals.receivedTotal}
          totalLabel="Wasool total"
          idPrefix="received"
        />
        <Box en="Daily sale" ur="روزانو فروخت" hint="Type the day's rate for each fuel. Litres and amount are worked out.">
          <ul className="space-y-3">
            {byFuel.map((group) => {
              const name = fuelName(group.fuel);
              return (
                <li key={group.fuel} className="rounded-2xl border border-ink-200 p-3">
                  <p className="mb-2 text-base font-semibold text-ink-900">
                    <Caption en={name.en} ur={name.ur} />
                  </p>
                  <div className="grid grid-cols-1 gap-3 @[24rem]:grid-cols-3">
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
                    <div>
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
          <p className="mt-2 text-sm text-ink-600">
            A rate that is not today's rate is saved as the new price from this day, as under Settings.
          </p>
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
              placeholder="Names, if you write them"
            />
          </div>
        </div>
      </section>

      {/* ---- INVOICE DETAIL (تفصیل انوائس): the day's tanker deliveries ---------------- */}
      <Box
        en="Invoice detail"
        ur="تفصیل انوائس"
        hint="Fuel that came in today: tank, litres, invoice number. Add a delivery here; it is saved on its own and shows up in Stock position."
      >
        {deliveries.length === 0 ? (
          <p className="text-base text-ink-600">No delivery entered for this day.</p>
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
        {deliveryButton ? <div className="mt-3">{deliveryButton}</div> : null}
      </Box>

      {/* ---- UDHAAR and LOCAL UDHAAR | PUMP and HOUSE EXPENSES ------------------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CustomerList
            en="Udhaar"
            ur="تفصیل ادھار"
            hint="Fuel or cash given to a customer, paid later. Customer and amount, as in the register."
            rows={credit}
            setRows={setCredit}
            customers={customers}
            total={totals.creditTotal}
            totalLabel="Udhaar total"
            idPrefix="credit"
          />
          <TextList
            en="Local udhaar"
            ur="لوکل ادھار"
            hint="Saved as local expenses, never on a customer."
            rows={local}
            setRows={setLocal}
            total={totals.localTotal}
            placeholder="Name, e.g. Ayaz Jamali"
            idPrefix="local"
          />
        </div>
        <div className="space-y-4">
          <TextList
            en="Pump expenses"
            ur="پمپ خرچ"
            hint="One line for each thing: ice, lunch, petrol for recovery. Never a total."
            rows={pump}
            setRows={setPump}
            total={totals.pumpTotal}
            placeholder="What for, e.g. Baraf"
            idPrefix="pump"
          />
          <TextList
            en="House expenses"
            ur="گھر خرچ"
            hint="One line for each thing, as above."
            rows={house}
            setRows={setHouse}
            total={totals.houseTotal}
            placeholder="What for, e.g. Sabzi"
            idPrefix="house"
          />
        </div>
      </div>

      {/* ---- BANK AND CASH -------------------------------------------------------------- */}
      <Box en="Bank and cash" ur="بینک" hint="Cash taken to the bank today, and the cash you counted that is left.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="sheet-bank-account">
              Bank account
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
              Cash taken to the bank
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
              <Caption en="Cash counted (what is left)" ur="بقایا" />
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
      <Box en="The day" ur="کل حساب" hint="Your register's own arithmetic. Check it against the bottom of the paper before you save.">
        <dl className="grid gap-2 sm:grid-cols-2">
          <Figure label={<Caption en="Sale" ur="سیل" />} value={rupees(totals.sales)} />
          <Figure label={<Caption en="+ Wasool" ur="وصولی" />} value={rupees(totals.receivedTotal)} />
          <Figure label={<Caption en="- Udhaar" ur="کھاتہ" />} value={rupees(totals.creditTotal)} />
          <Figure label="- Expenses (local, pump, house)" value={rupees(totals.expenses)} />
          <Figure label={<Caption en="- Cash to the bank" ur="بینک" />} value={rupees(totals.bankTotal)} />
          <Figure label="= Cash from today" value={rupees(totals.cash)} strong />
          <Figure label="Cash counted" value={totals.countedTotal === null ? 'Not typed' : rupees(totals.countedTotal)} />
          <Figure
            label="Counted minus cash from today"
            value={totals.difference === null ? '-' : rupees(totals.difference)}
            strong
          />
        </dl>
        <p className="mt-3 text-sm text-ink-600">
          A difference is the cash of earlier days (if the counted cash is more) or cash that is short (if it is less).
          It does not stop you saving.
        </p>

        {problems.length > 0 ? (
          <ul className="callout-warn mt-4 list-disc ps-6">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        <FormMessage state={state?.ok === false ? state : null} />

        <div className="mt-4 flex gap-2 border-t border-ink-200 pt-4">
          <Button variant="primary" type="button" disabled={problems.length > 0} onClick={() => setConfirming(true)} className="flex-1">
            Check and save the day
          </Button>
        </div>
      </Box>

      {/* ---- CONFIRM ------------------------------------------------------------------ */}
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Save ${dateLabel}?`}
        subtitle={<span className="text-sm text-ink-600">Look at every nozzle before you say yes.</span>}
      >
        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="sheet_date" value={date} />
          <input type="hidden" name="sheet" value={sheetJson} />

          <ul className="divide-y divide-ink-200 rounded-xl border border-ink-200">
            {meters.map((m) => (
              <li key={m.nozzle_id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="text-base text-ink-800">{m.label}</span>
                <span className={m.sold ? 'tabular whitespace-nowrap font-semibold text-ink-900' : 'text-ink-600'}>
                  {m.sold ? `${litresText(m.litres)} L · ${rupees(m.sale)}` : 'No sale'}
                </span>
              </li>
            ))}
          </ul>

          <dl className="grid gap-1 text-base">
            <Figure label="Sale" value={rupees(totals.sales)} />
            <Figure label="Udhaar" value={`${credit.filter((r) => (num(r.amount) ?? 0) > 0).length} lines, ${rupees(totals.creditTotal)}`} />
            <Figure label="Wasool" value={`${received.filter((r) => (num(r.amount) ?? 0) > 0).length} lines, ${rupees(totals.receivedTotal)}`} />
            <Figure label="Expenses" value={rupees(totals.expenses)} />
            <Figure label="Cash to the bank" value={rupees(totals.bankTotal)} />
            <Figure label="Cash counted" value={totals.countedTotal === null ? 'Not typed' : rupees(totals.countedTotal)} />
          </dl>

          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving the day…">
              Yes, save the day
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setConfirming(false)}>
              Go back
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
    className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
  >
    <Icon name="trash" className="h-5 w-5" />
  </button>
);

function CustomerList({ en, ur, hint, rows, setRows, customers, total, totalLabel, idPrefix }) {
  const update = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <Box en={en} ur={ur} hint={hint}>
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <label className="label" htmlFor={`${idPrefix}-who-${row.key}`}>
                {index === 0 ? 'Customer' : <span className="sr-only">Customer</span>}
              </label>
              <select
                id={`${idPrefix}-who-${row.key}`}
                className="input"
                value={row.who}
                onChange={(event) => update(row.key, { who: event.target.value })}
              >
                <option value="">Choose the customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerLabel(customer)}
                  </option>
                ))}
              </select>
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
          + Add a customer
        </Button>
        <p className="text-base text-ink-700">
          {totalLabel}: <span className="tabular font-bold text-ink-900">{formatPKR(total)}</span>
        </p>
      </div>
    </Box>
  );
}

function TextList({ en, ur, hint, rows, setRows, total, placeholder, idPrefix }) {
  const update = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <Box en={en} ur={ur} hint={hint}>
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
          + Add a line
        </Button>
        <p className="text-base text-ink-700">
          Total: <span className="tabular font-bold text-ink-900">{formatPKR(total)}</span>
        </p>
      </div>
    </Box>
  );
}
