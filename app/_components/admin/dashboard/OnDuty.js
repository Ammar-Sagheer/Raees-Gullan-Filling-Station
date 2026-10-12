import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import { TILE } from '@/app/_components/admin/dashboard/tones';
import { i18nFor } from '@/app/_lib/i18n/core';

/**
 * Who is on duty on the day the Dashboard shows, read off the attendance
 * register (074) - asked for by the fourth pump (Al Tufail, October 2026):
 * "duty person show on the dashboard according to attendance".
 *
 * THE REGISTER IS THE SOURCE, not a roster. Present and half day are on duty;
 * absent is said by name, because "who is not here" is what the owner rings
 * about; anyone not marked yet is counted, with the way to the register, since
 * an unmarked name is neither here nor away. A pump with no staff on the list
 * gets nothing at all: the panel would only be a sentence about a feature it
 * does not use.
 */
export default function OnDuty({ date, staff = [], attendance = {}, lang = 'en' }) {
  const { t, fmt } = i18nFor(lang);
  const active = staff.filter((person) => person.is_active);
  if (active.length === 0) return null;

  const onDuty = active.filter((person) => ['present', 'half'].includes(attendance[person.id]));
  const absent = active.filter((person) => attendance[person.id] === 'absent');
  const unmarked = active.filter((person) => !attendance[person.id]);

  return (
    <section aria-labelledby="duty-heading" className="@container mt-12">
      <SectionHeader
        id="duty-heading"
        icon="staff"
        tone="neutral"
        title={t('duty.title')}
        description={t('duty.text', { date: fmt.date(date) })}
      >
        <PendingLink
          href={`/admin/salaries?date=${date}`}
          className="font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          {t('duty.register')}
        </PendingLink>
      </SectionHeader>

      <div data-card className="panel p-5">
        {onDuty.length === 0 ? (
          <p className="text-base text-ink-700">{t('duty.nobody')}</p>
        ) : (
          <ul className="grid gap-3 @[34rem]:grid-cols-2 @[56rem]:grid-cols-3">
            {onDuty.map((person) => (
              <li key={person.id} className="flex items-center gap-3 rounded-2xl bg-ink-50 px-3.5 py-3">
                <span className={`icon-tile h-10 w-10 shrink-0 ${TILE.money}`}>
                  <Icon name="attendance" className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0">
                  <bdi className="block truncate text-base font-semibold text-ink-900">{person.name}</bdi>
                  <span className="block truncate text-sm text-ink-600">
                    {[person.job, attendance[person.id] === 'half' ? t('duty.half') : null]
                      .filter(Boolean)
                      .join(' · ') || t('duty.present')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {absent.length > 0 || unmarked.length > 0 ? (
          <div className="mt-4 space-y-1.5 border-t border-ink-200 pt-3 text-base">
            {absent.length > 0 ? (
              <p className="text-ink-700">
                <span className="badge me-2 whitespace-nowrap bg-red-100 text-red-800">{t('duty.absent')}</span>
                {absent.map((person, index) => (
                  <span key={person.id}>
                    {index > 0 ? t('duty.and') : null}
                    <bdi className="font-semibold text-ink-900">{person.name}</bdi>
                  </span>
                ))}
              </p>
            ) : null}
            {unmarked.length > 0 ? (
              <p className="text-ink-700">
                <span className="badge me-2 whitespace-nowrap bg-amber-100 text-amber-900">{t('duty.notMarked')}</span>
                {t('duty.unmarked', { count: unmarked.length })}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
