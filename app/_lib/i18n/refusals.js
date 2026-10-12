/**
 * A refusal in the reader's language (079).
 *
 * The database refuses in English, in its own words, and those words are the
 * rule (README.md → "What the database will not let you do"): a trigger that
 * says "This day would overlap the reading already saved for 09 Oct 2026" is
 * the one telling the truth. So nothing is translated in Postgres. On its way
 * to an Urdu screen a refusal is matched here, its figures and dates lifted
 * out, and put into the same sentence in Urdu. A refusal not listed here
 * arrives in English, never as nothing.
 *
 *   inLanguage('ur', error.message)
 *
 * Add a line here, and a `refusal.*` key in both dictionaries, for each new
 * refusal a translated page can meet.
 */

import { translator, formatter, normalizeLanguage } from './core';

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** "09 Oct 2026" (Postgres's 'DD Mon YYYY') -> the reader's own date. */
function day(fmt, text) {
  const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(String(text).trim());
  if (!m || !MONTHS[m[2]]) return text;
  const iso = `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return fmt.date(iso);
}

// [pattern, key, (match, fmt) => vars]. Matched against the WHOLE message, in
// order; the first that fits wins.
const RULES = [
  // The app's own sentences for constraint names (actions.js describe()).
  [/^Cash plus credit does not equal the amount sold\./, 'refusal.splitMismatch'],
  [/^The closing reading is lower than the opening reading\. A meter cannot run backwards\./, 'refusal.closingBelow'],
  [/^This nozzle has already been entered for that date\./, 'refusal.alreadyEntered'],
  [/^You are signed out\./, 'said.signedOut'],
  [/^You do not have permission to do that\./, 'said.noPermission'],

  // Postgres, word for word (migrations 052, 054, 058, 073).
  [
    /^The reading for (.+?) already covers this whole day - it opens at (\S+), where this day starts/,
    'refusal.coversWholeDay',
    (m, fmt) => ({ date: day(fmt, m[1]), at: fmt.isolate(m[2]) }),
  ],
  [
    /^This day would overlap the reading already saved for (.+?)\. That one starts at (\S+), before this day closes at (\S+), so the same (\S+) litres/,
    'refusal.overlapNext',
    (m, fmt) => ({ date: day(fmt, m[1]), at: fmt.isolate(m[2]), closing: fmt.isolate(m[3]), litres: fmt.isolate(m[4]) }),
  ],
  [
    /^This day starts at (\S+) but (.+?) already closed at (\S+), so the same (\S+) litres/,
    'refusal.overlapPrevious',
    (m, fmt) => ({ at: fmt.isolate(m[1]), date: day(fmt, m[2]), closing: fmt.isolate(m[3]), litres: fmt.isolate(m[4]) }),
  ],
  [
    /^Unit (\S+) · Nozzle (.+?) was only fitted on (.+?)\. A reading cannot be dated (.+?) - /,
    'refusal.notFittedYet',
    (m, fmt) => ({ unit: m[1], nozzle: m[2], from: day(fmt, m[3]), date: day(fmt, m[4]) }),
  ],
  [
    /^Unit (\S+) · Nozzle (.+?) was replaced on (.+?)\. A reading cannot be dated (.+?) - /,
    'refusal.replaced',
    (m, fmt) => ({ unit: m[1], nozzle: m[2], on: day(fmt, m[3]), date: day(fmt, m[4]) }),
  ],
  [
    /^The credit slips come to Rs (\S+), which is more than the Rs (\S+) sold on this nozzle/,
    'refusal.slipsTooMuch',
    (m, fmt) => ({ credit: fmt.isolate(m[1]), sale: fmt.isolate(m[2]) }),
  ],
  // Purchases and the supplier account (067).
  [/^This delivery is on a supplier.s account\./, 'refusal.deliveryOnAccount'],
  [/^The supplier ledger is append-only\./, 'refusal.supplierAppendOnly'],
  // Stock (039, 075).
  [/^A stock check for that tank and date has already been recorded\./, 'refusal.stockTwice'],
  [/^A dip cannot be below 0 mm\./, 'refusal.dipNegative'],
  [
    /^A dip of (\S+) mm is deeper than this tank.s chart, which ends at (\S+) mm/,
    'refusal.dipTooDeep',
    (m, fmt) => ({ mm: fmt.isolate(m[1]), max: fmt.isolate(m[2]) }),
  ],
  [/^This tank has no dip chart, so a dip in mm cannot be turned into litres/, 'refusal.dipNoChart'],
  [/^Only the owner may clear a day/, 'refusal.ownerClears'],
  [/^Only the owner may delete a reading/, 'refusal.ownerDeletes'],
  [/^That reading no longer exists/, 'refusal.readingGone'],
  [/^Vehicle (.+?) has been removed from this account\./, 'refusal.vehicleRemoved', (m, fmt) => ({ vehicle: fmt.isolate(m[1]) })],
  [/^Vehicle (.+?) is not on this customer.s account\./, 'refusal.vehicleNotTheirs', (m, fmt) => ({ vehicle: fmt.isolate(m[1]) })],

  // ==== A: Customers (stage 7) ====
  // (keys for these pages go here)
  // ==== end A ====

  // ==== B: Suppliers, Banking, Treasury (stage 8) ====
  // (keys for these pages go here)
  // ==== end B ====

  // ==== C: Lubricants, Salaries, Assets (stage 9) ====
  // (keys for these pages go here)
  // ==== end C ====

  // ==== D: Reports, Activity (stage 10) ====
  // (keys for these pages go here)
  // ==== end D ====

  // ==== E: Settings, Account (stage 11) ====
  // (keys for these pages go here)
  // ==== end E ====
];

/** The message in `lang`, if this file knows it; else the message as it came. */
export function inLanguage(lang, message) {
  if (normalizeLanguage(lang) === 'en' || !message) return message;
  const t = translator(lang);
  const fmt = formatter(lang);
  for (const [pattern, key, vars] of RULES) {
    const m = pattern.exec(String(message));
    if (m) return t(key, vars ? vars(m, fmt) : undefined);
  }
  return message;
}
