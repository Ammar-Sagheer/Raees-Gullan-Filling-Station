'use client';

import { formatPKR, formatLitres } from '@/app/_lib/format-helpers';
import { formatDate } from '@/app/_lib/date-helpers';
import FuelBadge from '@/app/_components/ui/FuelBadge';

/**
 * The invoice, on screen, before it is downloaded or sent (Al Tufail, October
 * 2026). The same rows and figures the PDF draws - invoiceFromStatement() over
 * the period's statement - so what the owner checks here is what the customer
 * receives. StatementPreview is its sibling; this one lists only what was taken
 * and settles the account in four lines at the foot.
 */
export default function InvoicePreview({ statement, invoice, number, customerName }) {
  const { settled, inCredit, isCurrent, asAt, from, to } = statement;
  const dueLabel = inCredit ? 'In credit' : isCurrent ? 'Amount due' : `Due as at ${formatDate(asAt)}`;
  const period =
    from && to
      ? `${formatDate(from)} to ${formatDate(to)}`
      : from
        ? `${formatDate(from)} onwards`
        : to
          ? `Everything up to ${formatDate(to)}`
          : 'The whole account';

  return (
    <div className="space-y-4">
      <div
        className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-2xl px-4 py-3 ${
          settled ? 'bg-brand-50' : 'bg-red-50'
        }`}
      >
        <div>
          <p className={`text-sm font-semibold ${settled ? 'text-brand-800' : 'text-red-800'}`}>{dueLabel}</p>
          <p className={`tabular text-3xl font-bold ${settled ? 'text-brand-800' : 'text-red-800'}`}>
            {formatPKR(inCredit ? -invoice.due : invoice.due)}
          </p>
        </div>
        <div className="text-end text-sm text-ink-600">
          <p className="tabular font-semibold text-ink-800">{number}</p>
          <p>{period}</p>
        </div>
      </div>

      {/* A phone gets one small card per fill instead of a five-column table
          that scrolled sideways (see StatementPreview): date and amount on the
          top line, the vehicle and fuel beneath, the litres last. */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 md:hidden">
        {invoice.lines.length === 0 ? (
          <p className="px-4 py-3 text-ink-600">Nothing was taken on credit in this period.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {invoice.lines.map((line) => (
              <li key={line.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink-600">{formatDate(line.date)}</span>
                  <span className="tabular whitespace-nowrap text-base font-bold">{formatPKR(line.debit)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {line.fuelType ? <FuelBadge fuelType={line.fuelType} /> : <span className="font-medium">{line.detail}</span>}
                  {line.vehicle ? (
                    <span className="badge whitespace-nowrap bg-violet-100 font-semibold text-violet-800">
                      {line.vehicle}
                    </span>
                  ) : null}
                  {line.litres ? (
                    <span className="tabular text-sm text-ink-600">{formatLitres(line.litres)}</span>
                  ) : null}
                </div>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 bg-ink-50 px-4 py-3 font-bold">
              <span>
                {invoice.lines.length} {invoice.lines.length === 1 ? 'fill' : 'fills'}
              </span>
              <span className="tabular text-red-700">{formatPKR(invoice.taken)}</span>
            </li>
          </ul>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-ink-200 md:block">
        <div className="table-scroll mx-0 px-0">
          <table className="w-full min-w-[34rem]">
            <thead className="border-b border-ink-200 bg-ink-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Vehicle</th>
                <th className="th">Item</th>
                <th className="th text-end">Litres</th>
                <th className="th text-end">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {invoice.lines.length === 0 ? (
                <tr>
                  <td className="td text-ink-600" colSpan={5}>
                    Nothing was taken on credit in this period.
                  </td>
                </tr>
              ) : (
                invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="td whitespace-nowrap">{formatDate(line.date)}</td>
                    <td className="td whitespace-nowrap">
                      {line.vehicle ? (
                        <span className="badge whitespace-nowrap bg-violet-100 font-semibold text-violet-800">
                          {line.vehicle}
                        </span>
                      ) : null}
                    </td>
                    <td className="td">
                      {line.fuelType ? <FuelBadge fuelType={line.fuelType} /> : line.detail}
                    </td>
                    <td className="td-num">{line.litres ? formatLitres(line.litres) : null}</td>
                    <td className="td-num font-bold">{formatPKR(line.debit)}</td>
                  </tr>
                ))
              )}
              {invoice.lines.length > 0 ? (
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className="td font-bold" colSpan={4}>
                    {invoice.lines.length} {invoice.lines.length === 1 ? 'fill' : 'fills'}
                  </td>
                  <td className="td-num font-bold text-red-700">{formatPKR(invoice.taken)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* A fleet checks its bill lorry by lorry. */}
      {invoice.vehicles.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-ink-200">
          <table className="w-full">
            <thead className="border-b border-ink-200 bg-ink-50">
              <tr>
                <th className="th">By vehicle</th>
                <th className="th text-end">Fills</th>
                <th className="th text-end">Litres</th>
                <th className="th text-end">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {invoice.vehicles.map((entry) => (
                <tr key={entry.vehicle ?? 'none'}>
                  <td className="td whitespace-nowrap font-semibold">{entry.vehicle ?? 'No vehicle named'}</td>
                  <td className="td-num">{entry.count}</td>
                  <td className="td-num">{entry.litres ? formatLitres(entry.litres) : null}</td>
                  <td className="td-num font-bold">{formatPKR(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <dl className="ms-auto max-w-sm space-y-1.5 text-base">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-700">Previous balance</dt>
          <dd className="tabular font-semibold">{formatPKR(invoice.previous)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-700">Fuel and oil this period</dt>
          <dd className="tabular font-semibold">{formatPKR(invoice.taken)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-700">Less payments received</dt>
          <dd className="tabular font-semibold text-brand-700">{formatPKR(invoice.paid)}</dd>
        </div>
        {Math.abs(invoice.adjustments) >= 0.5 ? (
          <div className="flex justify-between gap-4">
            <dt className="text-ink-700">Corrections</dt>
            <dd className="tabular font-semibold">{formatPKR(invoice.adjustments)}</dd>
          </div>
        ) : null}
        <div
          className={`flex justify-between gap-4 rounded-xl px-3 py-2 ${settled ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-800'}`}
        >
          <dt className="font-bold">{dueLabel}</dt>
          <dd className="tabular text-lg font-bold">{formatPKR(inCredit ? -invoice.due : invoice.due)}</dd>
        </div>
      </dl>

      <p className="text-sm text-ink-600">
        {settled
          ? `${customerName} owes nothing as at ${formatDate(asAt)}.`
          : `The bill for this period, with what was owed before it and what has been paid. ${customerName} is asked for ${formatPKR(invoice.due)}.`}
      </p>
    </div>
  );
}
