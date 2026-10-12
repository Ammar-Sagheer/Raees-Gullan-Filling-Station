import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import Pager from '@/app/_components/ui/Pager';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import FigureTile from '@/app/_components/admin/dashboard/FigureTile';
import { TILE } from '@/app/_components/admin/dashboard/tones';
import SupplierForm from '@/app/_components/admin/suppliers/SupplierForm';
import SupplierPaymentForm from '@/app/_components/admin/suppliers/SupplierPaymentForm';
import SupplierEntryForm from '@/app/_components/admin/suppliers/SupplierEntryForm';
import SupplierLedgerTable from '@/app/_components/admin/suppliers/SupplierLedgerTable';
import { SupplierActiveButton } from '@/app/_components/admin/suppliers/SupplierButtons';

import { formatPKR } from '@/app/_lib/format-helpers';

// A month of deliveries and daily payments fits on one page (077).
export const PER_PAGE = 100;

/**
 * One supplier's account: what the pump owes them, and every entry behind it.
 *
 * Laid out as the customer page is, turned round: the balance first, then the
 * ledger at full width. The one primary button is "Record a payment", because
 * paying is why the owner opens this page; the rest is housekeeping.
 */
export default function SupplierView({
  supplier,
  entries,
  entryCount,
  correctedIds,
  page,
  showCancelled = false,
  cancelledPairs = 0,
  bankAccounts,
  safeBalance,
}) {
  const balance = Number(supplier.balance ?? 0);

  return (
    <>
      <TitleHeader
        title={supplier.name}
        icon="suppliers"
        tone="held"
        back={{ href: '/admin/suppliers', label: 'Back to suppliers' }}
        description={
          [supplier.phone, supplier.note, supplier.is_active ? null : 'Retired'].filter(Boolean).join(' · ') ||
          null
        }
      >
        <SupplierPaymentForm
          supplierId={supplier.id}
          balance={balance}
          bankAccounts={bankAccounts}
          safeBalance={safeBalance}
        />
        <SupplierEntryForm supplierId={supplier.id} kind="discount" />
        <SupplierEntryForm supplierId={supplier.id} kind="adjustment" />
        <SupplierForm supplier={supplier} />
      </TitleHeader>

      <div className="@container mt-5">
        <section aria-labelledby="owed-heading" data-card className="panel @container flex flex-col p-5">
          <h2 id="owed-heading" className="flex items-center gap-3 text-base font-semibold text-ink-700">
            <span className={`icon-tile h-10 w-10 ${TILE.credit}`}>
              <Icon name="moneyOut" className="h-[22px] w-[22px]" />
            </span>
            {balance > 0 ? 'Payable to supplier' : balance < 0 ? 'Advance with supplier' : 'Balance'}
          </h2>
          <p
            className={`tabular mt-3 whitespace-nowrap text-3xl font-bold tracking-tight @[22rem]:text-4xl ${
              balance > 0 ? 'text-ink-900' : 'text-brand-700'
            }`}
          >
            {formatPKR(Math.abs(balance))}
          </p>
          <p className="mt-2 text-base text-ink-600">
            {balance > 0
              ? 'What the pump still owes: every purchase, less every payment, discount and credit.'
              : balance < 0
                ? 'Paid ahead of the purchases. The next delivery is taken off this first.'
                : 'Settled. Nothing is owed either way.'}
          </p>

          <dl className="mt-auto grid grid-cols-1 gap-2 pt-4 @[40rem]:grid-cols-3 @[40rem]:gap-3">
            <FigureTile label="Purchases" value={formatPKR(supplier.bought)} />
            <FigureTile label="Payments" value={formatPKR(supplier.paid)} />
            <FigureTile label="Discounts" value={formatPKR(supplier.discounts)} />
          </dl>
        </section>
      </div>

      <section aria-labelledby="account-heading" className="@container mt-12">
        <SectionHeader
          id="account-heading"
          icon="list"
          tone="neutral"
          title="The account"
          description="Read down the page, like your khata: the opening balance at the top, each delivery added at its rate, each payment taken off, and what is owed after every line. Deliveries arrive here by themselves from the Purchases page; a mistake is cancelled with a new entry, never edited."
        />

        <SupplierLedgerTable
          entries={entries}
          correctedIds={correctedIds}
          supplierId={supplier.id}
          canCancel
        />

        {/* A cancelled entry and its "Cancelled" line net to nothing, so the
            page leaves both out unless asked; the balance on every line shown
            is summed in Postgres over the lines shown (077). */}
        {cancelledPairs > 0 ? (
          <p className="mt-3 text-sm text-ink-700">
            {showCancelled
              ? `Showing ${cancelledPairs} cancelled ${cancelledPairs === 1 ? 'entry' : 'entries'} and the lines that cancel them. `
              : `${cancelledPairs} cancelled ${cancelledPairs === 1 ? 'entry is' : 'entries are'} hidden, with the lines that cancel them: together they change nothing. `}
            <PendingLink
              href={`/admin/suppliers/${supplier.id}${showCancelled ? '' : '?cancelled=1'}`}
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              {showCancelled ? 'Hide them' : 'Show them'}
            </PendingLink>
          </p>
        ) : null}

        <Pager
          page={page}
          perPage={PER_PAGE}
          total={entryCount}
          hrefFor={(n) =>
            `/admin/suppliers/${supplier.id}?page=${n}${showCancelled ? '&cancelled=1' : ''}`
          }
          label="Account pages"
        />
      </section>

      {/* The rare, reversible housekeeping, at the foot of the page in words
          rather than as a red icon on the list - see SupplierActiveButton. */}
      <section aria-label="Retire or bring back" className="mt-10 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-6">
        <p className="text-base text-ink-700">
          {supplier.is_active
            ? 'No longer buying from this supplier? Retiring takes it off the purchase forms and keeps the account.'
            : 'Retired: off the purchase forms. The account is kept as it was.'}
        </p>
        <SupplierActiveButton supplier={supplier} />
      </section>
    </>
  );
}
