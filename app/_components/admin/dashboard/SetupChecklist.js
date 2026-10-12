import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import { i18nFor } from '@/app/_lib/i18n/core';

/**
 * The Dashboard on a pump that is not set up yet (migration 076).
 * He sets up his own tanks and nozzles, so on the first day there is nothing
 * for the Dashboard to show; this is shown in its place, and the Dashboard
 * proper takes over once there is a tank, a nozzle and a price for every fuel
 * a tank holds.
 *
 * The first three steps are what readings need, in the order they need them.
 * The rest are what the books need before the first day is worth trusting
 * (opening balances, the safe, the bank, staff), offered as links and never
 * blocking: a pump with no credit customers has nothing to do there.
 *
 * `status` is worked out by the page: { tanks, nozzles, missingPrices[] }.
 */
export default function SetupChecklist({ status, lang = 'en' }) {
  const { t } = i18nFor(lang);
  const steps = [
    {
      done: status.tanks > 0,
      title: t('setup.tanksTitle'),
      body: t('setup.tanksBody'),
      href: '/admin/settings#tanks-heading',
      action: t('setup.tanksAction'),
      count: status.tanks > 0 ? t('setup.tanksCount', { count: status.tanks }) : null,
    },
    {
      done: status.nozzles > 0,
      title: t('setup.nozzlesTitle'),
      body: t('setup.nozzlesBody'),
      href: '/admin/settings#units-heading',
      action: t('setup.nozzlesAction'),
      count:
        status.nozzles > 0 ? t('setup.nozzlesCount', { count: status.nozzles }) : null,
    },
    {
      done: status.tanks > 0 && status.missingPrices.length === 0,
      title: t('setup.pricesTitle'),
      body:
        status.missingPrices.length > 0 && status.tanks > 0
          ? t('setup.pricesMissing', {
              fuels: status.missingPrices
                .map((fuel) => (lang === 'en' ? fuel : t(`fuel.${fuel}`)))
                .join(t('setup.and')),
            })
          : t('setup.pricesBody'),
      href: '/admin/settings#prices-heading',
      action: t('setup.pricesAction'),
    },
  ];

  const extras = [
    {
      title: t('setup.customersTitle'),
      body: t('setup.customersBody'),
      href: '/admin/customers',
    },
    {
      title: t('setup.safeTitle'),
      body: t('setup.safeBody'),
      href: '/admin/treasury',
    },
    { title: t('setup.banksTitle'), body: t('setup.banksBody'), href: '/admin/banking' },
    { title: t('setup.suppliersTitle'), body: t('setup.suppliersBody'), href: '/admin/suppliers' },
    { title: t('setup.staffTitle'), body: t('setup.staffBody'), href: '/admin/account' },
  ];

  const doneCount = steps.filter((step) => step.done).length;

  return (
    <section aria-labelledby="setup-heading" className="@container mt-8">
      <SectionHeader
        id="setup-heading"
        icon="settings"
        tone="money"
        title={t('setup.heading')}
        description={t('setup.text', { done: doneCount })}
      />

      <ol className="grid gap-4 @[48rem]:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            data-card
            className={`panel flex flex-col gap-3 p-5 ${step.done ? 'ring-2 ring-brand-200' : ''}`}
          >
            <div className="flex items-center gap-3">
              <span
                className={`icon-tile h-10 w-10 text-base font-bold ${
                  step.done ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-800'
                }`}
                aria-hidden="true"
              >
                {step.done ? <Icon name="check" className="h-5 w-5" /> : index + 1}
              </span>
              <h3 className="text-lg font-semibold text-ink-900">
                {step.title}
                {step.done ? <span className="sr-only"> {t('setup.done')}</span> : null}
              </h3>
            </div>
            <p className="text-base text-ink-700">{step.body}</p>
            {step.count ? <p className="caption">{step.count}</p> : null}
            <div className="mt-auto">
              <PendingLink
                href={step.href}
                className="inline-flex items-center gap-1 text-base font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                {step.done ? t('setup.review') : step.action}
                <Icon name="chevronRight" className="h-4 w-4 rtl:rotate-180" />
              </PendingLink>
            </div>
          </li>
        ))}
      </ol>

      <h3 className="mb-3 mt-8 text-lg font-semibold text-ink-900">{t('setup.then')}</h3>
      <ul className="grid gap-3 @[40rem]:grid-cols-2 @[64rem]:grid-cols-3">
        {extras.map((extra) => (
          <li key={extra.title}>
            <PendingLink
              href={extra.href}
              className="panel flex h-full items-start justify-between gap-3 p-4 hover:bg-ink-50"
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold text-ink-900">{extra.title}</span>
                <span className="mt-0.5 block text-sm text-ink-700">{extra.body}</span>
              </span>
              <Icon name="chevronRight" className="mt-1 h-4 w-4 shrink-0 text-ink-500 rtl:rotate-180" />
            </PendingLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
