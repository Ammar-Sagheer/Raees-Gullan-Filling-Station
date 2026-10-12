/**
 * The language of whoever is signed in, for a server component or an action:
 *
 *   const { lang, dir, t, fmt } = await getI18n();
 *
 * Read from the login (079) through getSessionProfile, which React's cache()
 * already shares across one request, so asking again costs nothing. Signed
 * out (the login page), it is English.
 */
import { cache } from 'react';

import { getSessionProfile } from '../helpers';
import { i18nFor } from './core';

export const getI18n = cache(async function getI18n() {
  const profile = await getSessionProfile();
  return i18nFor(profile?.language);
});
