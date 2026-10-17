import { formatDate } from '@/app/_lib/date-helpers';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';
import FigureTile from '@/app/_components/admin/dashboard/FigureTile';

/**
 * A customer's credit slips and payments (093 and 094, Raees Gullan): the paper
 * slip number and the amount of every fill on credit and of every payment, with how
 * many slips there were today. It stands where the Vehicles panel was: a customer
 * can have several drivers and cars on one account, so what the owner checks
 * against his register is the slip, not the car.
 *
 * `slips` and `payments` are newest first, built on the server from the ledger rows
 * the page already holds (not cancelled, not cash handed out). The figures are sums
 * of those rows. A payment says "paid back" under its number, so the two kinds
 * never rest on a colour.
 */
const SHOWN = 60;

export default function SlipsPanel({ slips, payments = [], asOf }) {
  const today = slips.filter((slip) => slip.date === asOf);
  const todayTotal = sumMoney(today.map((slip) => slip.amount));
  const paidToday = sumMoney(payments.filter((payment) => payment.date === asOf).map((payment) => payment.amount));
  const all = [...slips, ...payments].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const shown = all.slice(0, SHOWN);

  return (
    <div data-card className="panel @container overflow-hidden">
      <dl className="grid grid-cols-1 gap-2 border-b border-ink-200 p-4 @[40rem]:grid-cols-3 @[40rem]:gap-3">
        <FigureTile label="Slips today" value={String(today.length)} />
        <FigureTile label="Taken on slips today" value={formatPKR(todayTotal)} />
        <FigureTile label="Paid back today" value={formatPKR(paidToday)} />
      </dl>

      {all.length === 0 ? (
        <p className="p-5 text-base text-ink-700">
          No slips yet. Each udhaar and recovery line on the Readings page takes a slip number and an amount, and lands
          here under this customer.
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
              {shown.map((row) => (
                <tr key={row.id} className={row.date === asOf ? 'bg-ink-50' : undefined}>
                  <td className="td whitespace-nowrap pl-5">{formatDate(row.date)}</td>
                  <td className="td tabular whitespace-nowrap">
                    <span className="font-semibold">
                      {row.slipNumber ?? <span className="font-normal italic text-ink-600">no number</span>}
                    </span>
                    {row.paid ? <span className="caption block">paid back</span> : null}
                  </td>
                  <td className="td tabular whitespace-nowrap pr-5 text-right">{formatPKR(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="caption border-t border-ink-200 px-5 py-3">
        {all.length > SHOWN ? `The latest ${SHOWN} of ${all.length}. ` : ''}
        Every entry, with the balance after it, is under Transaction history.
      </p>
    </div>
  );
}
