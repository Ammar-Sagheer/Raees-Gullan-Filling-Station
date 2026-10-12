'use client';

/**
 * English / اردو, for the signed-in login only (079). It names the OTHER
 * language, in that language, because the reader who needs it is the one who
 * cannot read the screen as it is: an Urdu reader finds "اردو" on an English
 * page, and the reverse.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setLanguage } from '@/app/_lib/actions';
import { useUserLanguage } from '@/app/_components/i18n/I18nProvider';
import { i18nFor } from '@/app/_lib/i18n/core';
import Button from '@/app/_components/ui/Button';
import Spinner from '@/app/_components/ui/Spinner';
import { OFFER_URDU } from '@/app/_lib/pump-settings';

export default function LanguageSwitch({ compact = false, className = '' }) {
  // The login's own language, wherever the switch stands: it names the other.
  const lang = useUserLanguage();
  const { t } = i18nFor(lang);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const other = lang === 'ur' ? 'en' : 'ur';

  function change() {
    startTransition(async () => {
      const result = await setLanguage(other);
      if (result?.ok) router.refresh();
    });
  }


  // A pump that reads English only offers no switch (pump-settings.js).
  if (!OFFER_URDU) return null;

  return (
    <Button
      variant="secondary"
      type="button"
      onClick={change}
      disabled={pending}
      aria-label={t('language.switchToAria')}
      lang={other}
      className={className}
      // A language's name is written as it is written: "English", not "ENGLISH".
      sx={
        compact
          ? { minHeight: 40, minWidth: 0, px: 1.25, borderRadius: '10px', textTransform: 'none' }
          : { borderRadius: '12px', minHeight: 44, textTransform: 'none' }
      }
    >
      {pending ? <Spinner className="h-4 w-4" /> : null}
      <span className={other === 'ur' ? 'text-base' : ''}>{t('language.switchTo')}</span>
    </Button>
  );
}
