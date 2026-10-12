'use client';

/**
 * Account → Language (079): this login's language, as a two-way choice with
 * the current one marked. It is the same setting the sidebar's switch flips;
 * here it is spelled out, with what it does and does not change.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setLanguage } from '@/app/_lib/actions';
import { LANGUAGES } from '@/app/_lib/i18n/core';
import { Translated, useI18n } from '@/app/_components/i18n/I18nProvider';
import Spinner from '@/app/_components/ui/Spinner';
import { OFFER_URDU } from '@/app/_lib/pump-settings';

export default function LanguagePanel() {

  // A pump that reads English only offers no switch (pump-settings.js).
  if (!OFFER_URDU) return null;

  return (
    <Translated as="section" className="panel p-5">
      <Choice />
    </Translated>
  );
}

function Choice() {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next) {
    if (next === lang) return;
    startTransition(async () => {
      const result = await setLanguage(next);
      if (result?.ok) router.refresh();
    });
  }

  return (
    <>
      <h3 className="flex items-center gap-2 text-base font-bold text-ink-900">
        {t('language.heading')}
        {pending ? <Spinner className="h-4 w-4" /> : null}
      </h3>
      <p className="mt-1 text-sm text-ink-700">{t('language.description')}</p>
      <div role="group" aria-label={t('language.heading')} className="seg mt-3">
        {Object.entries(LANGUAGES).map(([code, { name }]) => (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={code === lang}
            disabled={pending}
            onClick={() => choose(code)}
            className={code === lang ? 'seg-item-active' : 'seg-item'}
          >
            {name}
          </button>
        ))}
      </div>
      {lang === 'ur' ? <p className="mt-3 text-sm text-ink-700">{t('language.notYet')}</p> : null}
    </>
  );
}
