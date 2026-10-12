/**
 * The translation layer (079): one dictionary per language, looked up by key.
 *
 *   const { t, fmt } = useI18n();          // a client component
 *   const { t, fmt } = await getI18n();    // a server component or an action
 *
 *   t('nav.readings')                       -> "Readings" / "میٹر ریڈنگ"
 *   t('readings.missingDay', { day })       -> fills {day}
 *   t('stock.lines', { count: 3 })          -> the entry's `one` or `other`
 *   rich(t, 'key', { name: <b>...</b> })    -> a sentence with elements in it
 *   fmt.litres(1287.45)                     -> "1,287.45 L" / "1,287.45 لٹر"
 *
 * WHAT IS NOT TRANSLATED, on purpose. Figures stay 0 to 9 in both languages
 * (the owner's choice): they are what is checked against the cash and the
 * meter, and they read the same on the slip, the meter and the screen. "Rs"
 * stays, as on every Pakistani bill. Text Postgres writes (the activity log,
 * a refusal no page has a sentence for) arrives in English and stays so.
 *
 * ENGLISH IS THE FALLBACK. A key missing from Urdu shows its English, never
 * the key itself, so a page part-way through translation is still usable.
 *
 * This file has no server or browser imports, so both sides share it.
 */

import { Fragment, createElement, isValidElement } from 'react';

import en from './en';
import ur from './ur';
import { formatPKR, formatLitres, formatNumber, formatRate, formatLitresFine } from '../format-helpers';
import { formatDate, formatDateLong, formatMonth } from '../date-helpers';

export const LANGUAGES = {
  en: { dir: 'ltr', name: 'English' },
  ur: { dir: 'rtl', name: 'اردو' },
};

export const normalizeLanguage = (value) => (value === 'ur' ? 'ur' : 'en');

const DICTIONARIES = { en, ur };

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

function pick(entry, vars) {
  if (entry && typeof entry === 'object' && ('other' in entry || 'one' in entry)) {
    return Number(vars?.count) === 1 && 'one' in entry ? entry.one : entry.other;
  }
  return entry;
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/** The t() for one language. */
export function translator(language) {
  const dict = DICTIONARIES[normalizeLanguage(language)];
  return function t(key, vars) {
    let entry = pick(lookup(dict, key), vars);
    if (typeof entry !== 'string') entry = pick(lookup(en, key), vars);
    if (typeof entry !== 'string') return key;
    return fill(entry, vars);
  };
}

/**
 * A translated sentence with elements in it: each {name} whose value is an
 * element (a link, a bold figure) is put in place, so the words around it can
 * come in whatever order the language puts them.
 */
export function rich(t, key, vars = {}) {
  const plain = {};
  for (const [k, v] of Object.entries(vars)) if (!isValidElement(v)) plain[k] = v;
  const text = t(key, plain);
  const parts = text.split(/(\{\w+\})/g);
  return parts.map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    const value = m ? vars[m[1]] : undefined;
    return createElement(Fragment, { key: i }, isValidElement(value) ? value : part);
  });
}

// ------------------------------------------------------------------ figures

// U+2066 LEFT-TO-RIGHT ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE. Inside
// right-to-left text, "1,287.45 L" otherwise reads "L 1,287.45" and a minus
// sign wanders to the far end. Isolated, a figure reads left to right as a
// unit, wherever the sentence around it puts it. Urdu only: English keeps its
// strings exactly as they were, since they also go into the Excel and PDF.
const LRI = '⁦';
const PDI = '⁩';
const isolate = (text) => `${LRI}${text}${PDI}`;

const UR_MONTHS = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const UR_WEEKDAYS = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];

function parts(value) {
  const [y, m, d] = String(value ?? '').slice(0, 10).split('-').map(Number);
  return y && m && d ? { y, m, d } : null;
}

/** The figure formatters for one language. Same inputs as format-helpers. */
export function formatter(language) {
  if (normalizeLanguage(language) === 'en') {
    return {
      rupees: formatPKR,
      litres: formatLitres,
      litresFine: formatLitresFine,
      // A gain wears its plus sign: "+12 L".
      litresSigned: (v) => (Number(v) > 0 ? `+${formatLitres(v)}` : formatLitres(v)),
      number: formatNumber,
      rate: formatRate,
      date: formatDate,
      dateLong: formatDateLong,
      month: formatMonth,
      isolate: (text) => text,
    };
  }
  const unitless = (s) => s.replace(/\s*L$/, '');
  return {
    rupees: (v) => isolate(formatPKR(v)),
    litres: (v) => `${isolate(unitless(formatLitres(v)))} لٹر`,
    litresFine: (v) => `${isolate(unitless(formatLitresFine(v)))} لٹر`,
    // The sign inside the fenced figure, or right to left puts it after the number.
    litresSigned: (v) =>
      `${isolate(`${Number(v) > 0 ? '+' : ''}${unitless(formatLitres(v))}`)} لٹر`,
    number: (v) => isolate(formatNumber(v)),
    rate: (v) => isolate(formatRate(v)),
    // Day, month, year, read right to left, need no isolating: the figures
    // are each on their own side of a word.
    date: (value) => {
      const p = parts(value);
      return p ? `${p.d} ${UR_MONTHS[p.m - 1]} ${p.y}` : formatDate(value);
    },
    dateLong: (value) => {
      const p = parts(value);
      if (!p) return formatDateLong(value);
      const weekday = UR_WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
      return `${weekday}، ${p.d} ${UR_MONTHS[p.m - 1]} ${p.y}`;
    },
    month: (year, month) => `${UR_MONTHS[month - 1]} ${year}`,
    isolate,
  };
}

/** Everything a page needs for one language, in one object. */
export function i18nFor(language) {
  const lang = normalizeLanguage(language);
  return { lang, dir: LANGUAGES[lang].dir, t: translator(lang), fmt: formatter(lang) };
}
