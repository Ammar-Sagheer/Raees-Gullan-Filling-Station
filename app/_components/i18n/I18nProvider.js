'use client';

/**
 * The signed-in login's language, for client components under /admin (079).
 *
 *   const { lang, dir, t, fmt } = useI18n();
 *
 * TRANSLATION IS OPT-IN, PART BY PART. useI18n() gives ENGLISH unless the
 * component sits inside <Translated>, which switches it to the login's own
 * language. The shared pieces (the date box, a dialog's close button, a pager)
 * are used by pages that have been translated and by pages that have not; on
 * an English page they must stay English for an Urdu reader too, or one page
 * would read in two languages at once. So the page decides, once, at its top.
 * Server components take the same decision as an explicit `lang` prop.
 *
 * The admin layout reads the language on the server and passes it in, so the
 * first paint is already right. Both dictionaries are in the bundle; they are
 * text, and a switch then needs no second download.
 */
import { createContext, useContext, useMemo } from 'react';

import { i18nFor } from '@/app/_lib/i18n/core';

const ENGLISH = i18nFor('en');
const UserLanguage = createContext('en');
const I18nContext = createContext(ENGLISH);

export function I18nProvider({ language, children }) {
  return <UserLanguage.Provider value={language === 'ur' ? 'ur' : 'en'}>{children}</UserLanguage.Provider>;
}

/** The words for this part of the screen: the login's language inside <Translated>, else English. */
export function useI18n() {
  return useContext(I18nContext);
}

/** The login's own choice, wherever it is asked (the language switch). */
export function useUserLanguage() {
  return useContext(UserLanguage);
}

/**
 * A page, or a part of one, that has been translated: it reads in the login's
 * language and direction. `contents` keeps the wrapper out of the layout when
 * it only has to carry the language (the sidebar).
 */
export function Translated({ as: Tag = 'div', className, children }) {
  const language = useContext(UserLanguage);
  const value = useMemo(() => i18nFor(language), [language]);
  return (
    <I18nContext.Provider value={value}>
      <Tag lang={value.lang} dir={value.dir} className={className}>
        {children}
      </Tag>
    </I18nContext.Provider>
  );
}

/**
 * The opposite of <Translated>: a part of a translated page that has not been
 * translated yet (a form shared with a page still in English) reads in English,
 * left to right, rather than as English words laid out backwards.
 */
export function InEnglish({ as: Tag = 'div', className, children }) {
  return (
    <I18nContext.Provider value={ENGLISH}>
      <Tag lang="en" dir="ltr" className={className}>
        {children}
      </Tag>
    </I18nContext.Provider>
  );
}
