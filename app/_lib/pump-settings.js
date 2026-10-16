/**
 * What one pump does differently from the next, where it is a habit of the
 * pump rather than a figure in its books. Plain constants, like brand.js, so a
 * client component can import them. scripts/new-client.mjs sets these for a new
 * pump; docs/NEW_CLIENT.md says what to ask the owner.
 *
 * DIP_DEFAULT - when the rod usually goes in, which the dip form opens on.
 *   'morning'  before the first sale: the dip closes the day before (Mubeen).
 *   'evening'  at the closing, after the last sale: the dip closes that day.
 *              A pump that closes its sheet at 7 am and dips then is this one
 *              (Al Qaim), and so is one that dips at night (Al Hakeem).
 *   Either can still be chosen on the form; this is only where it starts.
 */
export const DIP_DEFAULT = 'evening';

/**
 * OFFER_URDU - whether the English / اردو switch is offered (079). false for a
 * pump whose owner and staff read English only (Al Tufail): the switch goes
 * from the sidebar, the phone bar and Account, and every login reads English
 * whatever it once chose. true everywhere else.
 */
export const OFFER_URDU = false;

/**
 * INTRO_VIDEO - a clip the pump's owner supplied, played over the app once
 * after each sign-in (never on a refresh or between pages), with Skip,
 * starting muted because a browser will not autoplay sound (Al Tufail,
 * October 2026). A path under
 * public/ (or a list, WebM first then MP4, and the browser plays the first it
 * can), or null for none. See IntroVideo.js.
 */
export const INTRO_VIDEO = null;

/**
 * DAY_SHEET_FROM - the first day the owner enters on the DAY SHEET (091): one
 * form shaped like his register page, which saves the whole day in one go. The
 * Readings page opens the sheet for the owner on this day and every day after
 * it; earlier days, and a staff login, keep the readings page as it was. null
 * for a pump that has no sheet (every pump but Raees Gullan, for now).
 */
export const DAY_SHEET_FROM = '2026-10-17';
