'use client';

import { useState } from 'react';

import Button from '@/app/_components/ui/Button';
import Dialog from '@/app/_components/ui/Dialog';
import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import ExpenseForm from '@/app/_components/admin/ExpenseForm';
import BankTransactionForm from '@/app/_components/admin/BankTransactionForm';
import DepositToBankForm from '@/app/_components/admin/DepositToBankForm';
import DipChecker from '@/app/_components/admin/DipChecker';
import CashInOutButton from '@/app/_components/admin/CashInOutButton';
import { InEnglish, useI18n } from '@/app/_components/i18n/I18nProvider';

/**
 * Quick entry on the Dashboard (Al Hakeem asked): an expense and a bank
 * deposit or withdrawal without leaving the page he opens every day. The very
 * same forms as on Expenses and Banking, in dialogs, so the rules, the
 * wording and what the database refuses are the same in both places. The
 * links beside them are for when he wants the list, not just the entry.
 *
 * ALSO ON THE READINGS PAGE (Al Hakeem asked): while the day is entered, the
 * day's expense and bank entry are added too, so it is the same bar with `date`
 * set to the day on screen (which can be yesterday, after midnight) and a
 * heading of its own, and Raees Gullan's Money in / out beside them (`customers`).
 * Deposit to bank (081) moves cash from the safe into an
 * account as one entry; its dialog is not translated yet and reads in English.
 */
export default function QuickEntry({
  accounts = [],
  usedCategories = [],
  tanks = [],
  dipCharts = {},
  customers = null,
  date,
  heading,
  idPrefix = 'quick',
}) {
  const [bankOpen, setBankOpen] = useState(false);
  const [dipOpen, setDipOpen] = useState(false);
  const hasCharts = tanks.some((tank) => dipCharts[tank.id]);
  const { t } = useI18n();
  const title = heading ?? t('quick.label');

  return (
    <section aria-label={title} data-card className="panel @container mt-4 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="text-base font-semibold text-ink-800">{title}</p>

        {/* Full width, one above the other, on a phone (side by side they wrapped
            "Add expense" onto two lines); half each from 26rem; their own widths beside the
            label from 40rem. `[&>button]` reaches only each wrapper's own
            button, not the ones inside the dialogs. */}
        <div className="grid w-full grid-cols-1 gap-2 @[26rem]:grid-cols-2 @[40rem]:flex @[40rem]:w-auto @[40rem]:flex-wrap @[40rem]:items-center [&>div>button]:w-full @[40rem]:[&>div>button]:w-auto [&>a]:w-full @[40rem]:[&>a]:w-auto">
                    {/* The expense form follows the page (079). The bank form below is
              not translated yet and reads in English, left to right. */}
          <div>
            <ExpenseForm used={usedCategories} defaultDate={date} />
          </div>

          {/* Dip to litres at any time, saving nothing (Al Tufail, October 2026). */}
          {hasCharts ? (
            <div>
              <Button variant="secondary" type="button" onClick={() => setDipOpen(true)}>
                <Icon name="stock" className="h-4 w-4" />
                {t('dipCheck.button')}
              </Button>
            </div>
          ) : null}

          {/* Cash across the counter with a customer, no fuel (Raees Gullan): only where
              the page passes its customers, i.e. the Readings page. */}
          {customers ? (
            <div>
              <CashInOutButton customers={customers} date={date} />
            </div>
          ) : null}

          {accounts.length > 0 ? (
            <div>
            <Button variant="secondary" type="button" onClick={() => setBankOpen(true)}>
              <Icon name="banking" className="h-4 w-4" />
              {t('quick.bank')}
            </Button>
            </div>
          ) : (
            <Button variant="secondary" href="/admin/banking" pending>
              <Icon name="banking" className="h-4 w-4" />
              {t('quick.addBank')}
            </Button>
          )}

          {accounts.length > 0 ? (
            <InEnglish>
              <DepositToBankForm accounts={accounts} defaultDate={date} idPrefix={`${idPrefix}_deposit`} />
            </InEnglish>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold @[40rem]:ms-auto">
          <PendingLink href="/admin/expenses" className="text-brand-700 underline-offset-2 hover:underline">
            {t('quick.allExpenses')}
          </PendingLink>
          <PendingLink href="/admin/banking" className="text-brand-700 underline-offset-2 hover:underline">
            {t('quick.banking')}
          </PendingLink>
        </div>
      </div>

      {hasCharts ? (
        <Dialog
          open={dipOpen}
          onClose={() => setDipOpen(false)}
          title={t('dipCheck.heading')}
          subtitle={<span className="text-sm text-ink-600">{t('dipCheck.subtitle')}</span>}
        >
          <div className="p-5">
            <DipChecker tanks={tanks} charts={dipCharts} />
          </div>
        </Dialog>
      ) : null}

      {accounts.length > 0 ? (
        <Dialog
          open={bankOpen}
          onClose={() => setBankOpen(false)}
          title={t('quick.bank')}
          subtitle={<span className="text-sm text-ink-600">{t('quick.bankSubtitle')}</span>}
        >
          <InEnglish>
            <BankTransactionForm accounts={accounts} bare onSaved={() => setBankOpen(false)} defaultDate={date} />
          </InEnglish>
        </Dialog>
      ) : null}
    </section>
  );
}
