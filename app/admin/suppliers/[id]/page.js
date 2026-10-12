import { notFound } from 'next/navigation';

import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import {
  getSupplierSummaries,
  getSupplierLedgerPage,
  getBankAccounts,
  getTreasuryOverview,
} from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import SupplierView, { PER_PAGE } from '@/app/_components/admin/suppliers/SupplierView';

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const suppliers = await getSupplierSummaries();
    return { title: suppliers.find((row) => row.id === id)?.name ?? 'Supplier' };
  } catch {
    return { title: 'Supplier' };
  }
}

/**
 * One supplier's account. The role check and the queries; `SupplierView` draws
 * it. The bank accounts and the safe's balance are for the payment dialog,
 * which says what each can pay before the database has to refuse.
 */
export default async function SupplierPage({ params, searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);
  const { id } = await params;
  const query = await searchParams;
  const showCancelled = query?.cancelled === '1';
  const askedPage = query?.page ? pageFrom(query) : null;
  const ledgerFor = (page) =>
    getSupplierLedgerPage(id, { page, perPage: PER_PAGE, showCancelled, oldestFirst: true });

  const [suppliers, firstLedger, bankAccounts, treasury] = await Promise.all([
    getSupplierSummaries(),
    ledgerFor(askedPage ?? 1),
    getBankAccounts(),
    getTreasuryOverview(7).catch(() => null),
  ]);

  // Oldest first, like his khata, so the latest lines are on the LAST page:
  // with no page asked for, open there.
  const lastPage = Math.max(1, Math.ceil(firstLedger.total / PER_PAGE));
  const page = askedPage ?? lastPage;
  const ledger = page === (askedPage ?? 1) ? firstLedger : await ledgerFor(page);
  const { rows: entries, total: entryCount, correctedIds, cancelledPairs } = ledger;

  const supplier = suppliers.find((row) => row.id === id);
  if (!supplier) notFound();

  return (
    <SupplierView
      supplier={supplier}
      entries={entries}
      entryCount={entryCount}
      correctedIds={correctedIds}
      page={page}
      showCancelled={showCancelled}
      cancelledPairs={cancelledPairs}
      bankAccounts={bankAccounts ?? []}
      safeBalance={treasury ? Number(treasury.balance ?? 0) : null}
    />
  );
}
