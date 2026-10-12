#!/usr/bin/env node
/**
 * The two dictionaries (app/_lib/i18n/en.js, ur.js), checked against each
 * other before a commit that touches either:
 *
 *   node scripts/check-dictionaries.mjs
 *
 *   - every key in one is in the other (a key missing from Urdu would show its
 *     English; one missing from English is a typo nobody will see);
 *   - each sentence has the same {placeholders} in both, or a figure would
 *     drop out of one language;
 *   - a `one` / `other` pair is a pair in both;
 *   - no em dash in either (the owner's rule).
 *
 * Exits 1 and names each problem; prints the key count when clean.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (lang) => (await import(pathToFileURL(path.join(root, `app/_lib/i18n/${lang}.js`)).href)).default;
const [en, ur] = await Promise.all([load('en'), load('ur')]);

const isPlural = (v) => v && typeof v === 'object' && ('one' in v || 'other' in v);
function flatten(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix + k;
    if (v && typeof v === 'object' && !isPlural(v)) flatten(v, `${key}.`, out);
    else out.set(key, v);
  }
  return out;
}
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const texts = (v) => (isPlural(v) ? Object.values(v) : [v]);

const a = flatten(en);
const b = flatten(ur);
const problems = [];

for (const key of a.keys()) if (!b.has(key)) problems.push(`missing in ur: ${key}`);
for (const key of b.keys()) if (!a.has(key)) problems.push(`missing in en: ${key}`);
for (const [key, value] of a) {
  if (!b.has(key)) continue;
  const other = b.get(key);
  if (isPlural(value) !== isPlural(other)) problems.push(`one/other in one language only: ${key}`);
  const want = placeholders(texts(value)[0]);
  for (const text of texts(other)) {
    if (placeholders(text) !== want) problems.push(`placeholders differ: ${key} (en {${want}}, ur {${placeholders(text)}})`);
  }
}
for (const [lang, map] of [['en', a], ['ur', b]]) {
  for (const [key, value] of map) {
    for (const text of texts(value)) if (String(text).includes('—')) problems.push(`em dash in ${lang}: ${key}`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `  ${p}`).join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`Dictionaries agree: ${a.size} keys, same placeholders, no em dashes.`);
