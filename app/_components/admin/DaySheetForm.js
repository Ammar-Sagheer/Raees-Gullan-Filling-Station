'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import { saveDaySheet } from '@/app/_lib/actions';
import { saleAmount, sumMoney, roundRupees, formatPKR } from '@/app/_lib/format-helpers';
import { fuelColor } from '@/app/_lib/fuel-colors';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import { customerLabel } from '@/app/_components/admin/VehiclePicker';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import NumberInput from '@/app/_components/ui/NumberInput';

/**
 * THE DAY SHEET (091): the owner's register page as one form.
 *
 * WHY IT EXISTS. His register has the meters, the udhaar list, the wasool list,
 * the local udhaar, the pump and house expenses, the cash taken to the bank and
 * the cash left, all on one page. The app made him pick a screen and a button for
 * each, and for two days running the day's figures disagreed with his page:
 * credit entered under "Money received", local udhaar entered as customer credit,
 * a total typed beside its own parts. Here every list is named as it is on the
 * page, a customer line can only be udhaar or wasool (there is no other button
 * to pick), and Save writes the whole day in one database transaction.
 *
 * THE ARITHMETIC AT THE BOTTOM is his own, from the register: sales + wasool -
 * udhaar - local - pump - house - bank = the day's cash, against the cash he
 * counted. It is a PREVIEW. The database writes the rows and the Dashboard reads
 * them, so the sheet and the Dashboard cannot disagree; this only lets him see a
 * missing line before he saves, which is the whole point of the page.
 * The sale of each nozzle uses saleAmount() (exact, as Postgres rounds it).
 *
 * A NOZZLE LEFT BLANK IS A NOZZLE THAT DID NOT SELL: its closing is saved equal
 * to its opening. The confirmation lists every nozzle with its litres before
 * anything is written, so a nozzle forgotten shows as "no sale" there.
 *
 * Reads in English (this copy has no language switch). Owner only.
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

export default function DaySheetForm({ date, dateLabel, nozzles = [], customers = [], bankAccounts = [], saved = null, savedAt = null, blocked = null }) {
  // ---- what is on the sheet --------------------------------------------------
  const [closings, setClosings] = useState(() => {
    const byNozzle = new Map((saved?.readings ?? []).map((r) => [r.nozzle_id, r]));
    return Object.fromEntries(
      nozzles.map((n) => {
        const was = byNozzle.get(n.nozzle_id);
        // A saved nozzle that did not sell opens blank again, as it was typed.
        const closed = was && Number(was.closing) !== Number(was.opening) ? String(was.closing) : '';
        return [n.nozzle_id, closed];
      }),
    );
  });
  const [rates, setRates] = useState(() => {
    const byNozzle = new Map((saved?.readings ?? []).map((r) => [r.nozzle_id, r]));
    return Object.fromEntries(
      nozzles.map((n) => [n.nozzle_id, String(byNozzle.get(n.nozzle_id)?.rate ?? n.rate ?? '')]),
    );
  });
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
        const rate = num(rates[n.nozzle_id]);
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
              ? 'The closing is lower than the opening. A meter cannot run backwards.'
              : sold && (!rate || rate <= 0)
                ? 'Type the rate.'
                : null,
        };
      }),
    [nozzles, closings, rates],
  );

  const amountOf = (rows) => sumMoney(rows.map((r) => (num(r.amount) ?? 0)));
  const wholeOf = (rows) => sumMoney(rows.map((r) => roundRupees(num(r.amount) ?? 0)));

  const totals = useMemo(() => {
    const sales = sumMoney(meters.map((m) => m.sale));
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
  }, [meters, credit, received, local, pump, house, bankAmount, counted]);

  // ---- what stops a save -------------------------------------------------------
  const problems = [];
  if (blocked) problems.push(blocked);
  for (const m of meters) if (m.problem) problems.push(`${m.label}: ${m.problem}`);
  const partial = (rows, what, needsCustomer) => {
    for (const row of rows) {
      const hasAmount = (num(row.amount) ?? 0) > 0;
      const hasWho = String(row.who).trim() !== '';
      if (hasAmount !== hasWho && (hasAmount || hasWho)) {
        problems.push(
          `${what}: a line has ${needsCustomer ? 'a customer' : 'a name'} or an amount but not both.`,
        );
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
    credit: complete(credit).map((r) => ({ customer_id: r.who, amount: num(r.amount) })),
    received: complete(received).map((r) => ({ customer_id: r.who, amount: num(r.amount) })),
    local: complete(local).map((r) => ({ name: r.who.trim(), amount: num(r.amount) })),
    pump: complete(pump).map((r) => ({ name: r.who.trim(), amount: num(r.amount) })),
    house: complete(house).map((r) => ({ name: r.who.trim(), amount: num(r.amount) })),
    bank:
      (num(bankAmount) ?? 0) > 0 ? { account_id: bankAccount, amount: num(bankAmount) } : null,
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

  return (
    <div className="space-y-4">
      {savedTime ? (
        <p className="callout">
          This day was saved on {savedTime}. You can change anything below and save it again: only what you changed is
          corrected.
        </p>
      ) : null}

      {/* ---- METERS ---------------------------------------------------------------- */}
      <section data-card className="panel @container p-5">
        <SectionHeader
          icon="readings"
          tone="money"
          title="Meters"
          description="The closing meter of each nozzle. The opening is yesterday's closing. Leave a nozzle blank if it did not sell."
        />
        <ul className="space-y-3">
          {meters.map((m) => {
            const color = fuelColor(m.fuel_type);
            return (
              <li key={m.nozzle_id} className="rounded-2xl border border-ink-200 p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${color.soft}`}>{m.label}</span>
                  <span className="text-sm text-ink-600 capitalize">{m.fuel_type}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 @[20rem]:grid-cols-2 @[40rem]:grid-cols-3">
                  <div>
                    <p className="label">Opening</p>
                    <p className="tabular input-number bg-ink-50 text-ink-800">{m.opening.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <label className="label" htmlFor={`closing-${m.nozzle_id}`}>
                      Closing
                    </label>
                    <NumberInput
                      id={`closing-${m.nozzle_id}`}
                      step="0.01"
                      min="0"
                      value={closings[m.nozzle_id]}
                      onChange={(event) => setClosings({ ...closings, [m.nozzle_id]: event.target.value })}
                      className="input-number"
                      placeholder="Closing"
                    />
                  </div>
                  <div className="@[20rem]:col-span-2 @[40rem]:col-span-1">
                    <label className="label" htmlFor={`rate-${m.nozzle_id}`}>
                      Rate
                    </label>
                    <NumberInput
                      id={`rate-${m.nozzle_id}`}
                      step="0.01"
                      min="0"
                      value={rates[m.nozzle_id]}
                      onChange={(event) => setRates({ ...rates, [m.nozzle_id]: event.target.value })}
                      className="input-number"
                    />
                  </div>
                </div>
                <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-ink-50 px-3 py-2">
                  <span className="text-base text-ink-700">Sale</span>
                  <span className="tabular whitespace-nowrap text-lg font-bold text-ink-900">
                    {m.sold ? `${m.litres.toLocaleString('en-US', { minimumFractionDigits: 2 })} L \u00b7 ${rupees(m.sale)}` : 'No sale'}
                  </span>
                </p>
                {m.problem ? <p className="callout-warn mt-2">{m.problem}</p> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-ink-600">
          A rate different from today's rate is saved as the new price from this day, as under Settings.
        </p>
      </section>

      {/* ---- CUSTOMER LISTS --------------------------------------------------------- */}
      <CustomerList
        icon="credit"
        tone="credit"
        title="Udhaar"
        description="Fuel or cash given to a customer, paid later. Customer and amount, as in the register."
        rows={credit}
        setRows={setCredit}
        customers={customers}
        total={totals.creditTotal}
        totalLabel="Udhaar total"
        addLabel="+ Add a customer"
        idPrefix="credit"
        warnLabel={null}
      />
      <CustomerList
        icon="cash"
        tone="money"
        title="Wasool"
        description="Money a customer PAID BACK today. Not fuel and not cash given out."
        rows={received}
        setRows={setReceived}
        customers={customers}
        total={totals.receivedTotal}
        totalLabel="Wasool total"
        addLabel="+ Add a customer"
        idPrefix="received"
      />

      {/* ---- EXPENSE LISTS ----------------------------------------------------------- */}
      <TextList
        icon="expenses"
        tone="neutral"
        title="Local udhaar"
        description="The register's local udhaar. Saved as local expenses, never on a customer."
        rows={local}
        setRows={setLocal}
        total={totals.localTotal}
        placeholder="Name, e.g. Ayaz Jamali"
        idPrefix="local"
      />
      <TextList
        icon="expenses"
        tone="neutral"
        title="Pump expenses"
        description="One line for each thing: ice, lunch, petrol for recovery. Not a total."
        rows={pump}
        setRows={setPump}
        total={totals.pumpTotal}
        placeholder="What for, e.g. Baraf"
        idPrefix="pump"
      />
      <TextList
        icon="expenses"
        tone="neutral"
        title="House expenses"
        description="One line for each thing, as above."
        rows={house}
        setRows={setHouse}
        total={totals.houseTotal}
        placeholder="What for, e.g. Sabzi"
        idPrefix="house"
      />

      {/* ---- BANK AND CASH ----------------------------------------------------------- */}
      <section data-card className="panel p-5">
        <SectionHeader
          icon="banking"
          tone="held"
          title="Bank and cash"
          description="Cash taken to the bank today, and the cash you counted that is left."
        />
        <div className="grid gap-3 @[40rem]:grid-cols-3 sm:grid-cols-3">
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
              Cash counted (what is left)
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
      </section>

      {/* ---- THE DAY'S ARITHMETIC ---------------------------------------------------- */}
      <section data-card className="panel p-5" aria-label="The day's total">
        <SectionHeader
          icon="reports"
          tone="money"
          title="The day, as in the register"
          description="Check these against the bottom of the register page before you save."
        />
        <dl className="grid gap-2 sm:grid-cols-2">
          <Figure label="Sale" value={rupees(totals.sales)} />
          <Figure label="+ Wasool" value={rupees(totals.receivedTotal)} />
          <Figure label="- Udhaar" value={rupees(totals.creditTotal)} />
          <Figure label="- Expenses (local, pump, house)" value={rupees(totals.expenses)} />
          <Figure label="- Cash to the bank" value={rupees(totals.bankTotal)} />
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
      </section>

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
                <span className={m.sold ? 'tabular font-semibold text-ink-900' : 'text-ink-600'}>
                  {m.sold ? `${m.litres.toLocaleString('en-US', { minimumFractionDigits: 2 })} L · ${rupees(m.sale)}` : 'No sale'}
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
      <dd className={`tabular text-base ${strong ? 'font-bold text-ink-900' : 'font-semibold text-ink-900'}`}>{value}</dd>
    </div>
  );
}

function CustomerList({ icon, tone, title, description, rows, setRows, customers, total, totalLabel, addLabel, idPrefix }) {
  const update = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <section data-card className="panel p-5">
      <SectionHeader icon={icon} tone={tone} title={title} description={description} />
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
                {index === 0 ? 'Amount' : <span className="sr-only">Amount</span>}
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
            <button
              type="button"
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              aria-label="Remove this line"
              className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <Icon name="trash" className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" type="button" onClick={() => setRows([...rows, blank()])}>
          {addLabel}
        </Button>
        <p className="text-base text-ink-700">
          {totalLabel}: <span className="tabular font-bold text-ink-900">{formatPKR(total)}</span>
        </p>
      </div>
    </section>
  );
}

function TextList({ icon, tone, title, description, rows, setRows, total, placeholder, idPrefix }) {
  const update = (key, patch) => setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  return (
    <section data-card className="panel p-5">
      <SectionHeader icon={icon} tone={tone} title={title} description={description} />
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
              <label className="label" htmlFor={`${idPrefix}-who-${row.key}`}>
                {index === 0 ? 'What for / who' : <span className="sr-only">What for or who</span>}
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
                {index === 0 ? 'Amount' : <span className="sr-only">Amount</span>}
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
            <button
              type="button"
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              aria-label="Remove this line"
              className="mb-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
            >
              <Icon name="trash" className="h-5 w-5" />
            </button>
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
    </section>
  );
}
