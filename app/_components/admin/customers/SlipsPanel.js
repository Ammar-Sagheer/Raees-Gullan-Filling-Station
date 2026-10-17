import { formatDate } from '@/app/_lib/date-helpers';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';
import FigureTile from '@/app/_components/admin/dashboard/FigureTile';

/**
 * A customer's credit slips (093, Raees Gullan): the paper slip number and the
 * amount of every fill on credit, with how many there were today. It stands where
 * the Vehicles panel was: a customer can have several drivers and cars on one
 * account, so what the owner checks against his register is the slip, not the car.
 *
 * `slips` is newest first, built on the server from the ledger rows the page
 * already holds: a debit that is a credit slip or a day-sheet udhaar line, not
 * cancelled, not cash handed out. The figures are sums of those rows.
 */
const SHOWN = 60;

export default function SlipsPanel({ slips, asOf }) {
  const today = slips.filter((slip) => slip.date === asOf);
  const todayTotal = sumMoney(today.map((slip) => slip.amount));
  const shown = slips.slice(0, SHOWN);

  return (
    <div data-card className="panel @container overflow-hidden">
      <dl className="grid grid-cols-1 gap-2 border-b border-ink-200 p-4 @[28rem]:grid-cols-2 @[28rem]:gap-3">
        <FigureTile label="Slips today" value={String(today.length)} />
        <FigureTile label="Taken on slips today" value={formatPKR(todayTotal)} />
      </dl>

      {slips.length === 0 ? (
        <p className="p-5 text-base text-ink-700">
          No slips yet. Each udhaar line on the Readings page takes a slip number and an amount, and
          lands here under this customer.
        </p>
      ) : (
        <div className="table-scroll mx-0 max-h-none px-0">
          <table className="w-full min-w-[16rem]">
            <thead>
              <tr>
                <th className="th pl-5">Date</th>
                <th className="th">Slip no.</th>
                <th className="th pr-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {shown.map((slip) => (
                <tr key={slip.id} className={slip.date === asOf ? 'bg-ink-50' : undefined}>
                  <td className="td whitespace-nowrap pl-5">{formatDate(slip.date)}</td>
                  <td className="td tabular whitespace-nowrap font-semibold">
                    {slip.slipNumber ?? <span className="font-normal italic text-ink-600">no number</span>}
                  </td>
                  <td className="td tabular whitespace-nowrap pr-5 text-right">{formatPKR(slip.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="caption border-t border-ink-200 px-5 py-3">
        {slips.length > SHOWN ? `The latest ${SHOWN} of ${slips.length} slips. ` : ''}
        Every entry, with the balance after it, is under Transaction history.
      </p>
    </div>
  );
}
