/**
 * Reading a tank's dip chart off the file the tank company gave the owner
 * (078), in the browser, before anything is saved.
 *
 * Every chart seen so far is a printed table of depth in mm against litres,
 * often in several pairs of columns side by side to fit one page (mm | L | mm |
 * L | mm | L). So a row is read as its numbers in order, paired: the first two
 * are one line, the next two the next. A row whose numbers do not pair (a
 * title, "Tank No 2", "Capacity 25,000 L", a page number) is left out and
 * counted, so the owner can see something was skipped.
 *
 * Nothing here is the rule. replace_dip_chart() and 075's trigger refuse a
 * chart whose litres do not rise; these checks only point at the line first,
 * while the dialog is still open, and add one the database cannot make: a line
 * that rises but is out of step with the lines either side of it (a slipped
 * digit, 12,480 for 12,840), which is the mistake the printed charts actually
 * had (Al Qaim's diesel chart, four of them).
 */

// "1,234.5" is one number; "100,500" from a CSV is two. A comma is read as a
// thousands separator only in the 1,234 / 12,345,678 shape.
const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

function toNumber(token) {
  const t = String(token ?? '').trim().replace(/^"|"$/g, '').trim();
  if (t === '') return null;
  const plain = THOUSANDS.test(t) ? t.replace(/,/g, '') : t;
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(plain)) return null;
  const n = Number(plain);
  return Number.isFinite(n) ? n : null;
}

// One line of text into its cells: tabs (pasted from Excel); a CSV line with
// quotes (Excel writes "12,480" quoted); a line with spaces, where a comma is
// a thousands separator in the 12,480 shape and a separator otherwise
// ("Capacity 25,000 L", "200, 1200", "300 1,900"); else a bare CSV line.
function splitLine(line) {
  if (line.includes('\t')) return line.split('\t');
  if (line.includes('"')) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (!quoted && (ch === ',' || ch === ';')) {
        cells.push(cell);
        cell = '';
      } else cell += ch;
    }
    cells.push(cell);
    return cells;
  }
  if (/\S\s+\S/.test(line.trim())) {
    return line
      .trim()
      .split(/[\s;]+/)
      .flatMap((token) => {
        const t = token.replace(/^,+|,+$/g, '');
        return THOUSANDS.test(t) ? [t] : t.split(',');
      });
  }
  return line.trim().split(/[,;]/);
}

/** Text (pasted, typed, or a CSV file) into rows of cells. */
export function rowsFromText(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(splitLine);
}

function columnIndex(ref) {
  const letters = String(ref ?? '').replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * The first sheet of an .xlsx file into rows of cells, read from the file's own
 * XML (jszip is already in the app for the Excel report). No formulas are run:
 * a chart is typed figures, and Excel stores the last value of a formula cell
 * beside it anyway.
 */
export async function rowsFromXlsx(arrayBuffer) {
  // Loaded only when a file is chosen: the Settings page need not carry it.
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
  const read = async (path) => {
    const file = zip.file(path);
    return file ? parse(await file.async('string')) : null;
  };

  const shared = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) {
    for (const si of Array.from(sst.getElementsByTagName('si'))) {
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join(''));
    }
  }

  // The first sheet as the workbook lists it, through its relationship.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const first = workbook?.getElementsByTagName('sheet')[0];
  const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS?.(
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'id',
  );
  if (rid && rels) {
    const rel = Array.from(rels.getElementsByTagName('Relationship')).find(
      (r) => r.getAttribute('Id') === rid,
    );
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }

  const sheet = await read(sheetPath);
  if (!sheet) throw new Error('This file has no sheet that could be read.');

  return Array.from(sheet.getElementsByTagName('row')).map((row) => {
    const cells = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') {
        value = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent).join('');
      } else value = v;
      cells[columnIndex(c.getAttribute('r'))] = value;
    }
    return cells;
  });
}

/**
 * Rows of cells into chart lines. Returns { lines: [[mm, litres], ...] sorted
 * by mm, skipped: rows with numbers that did not pair }.
 */
export function linesFromRows(rows) {
  const lines = [];
  let skipped = 0;
  for (const row of rows) {
    const numbers = (row ?? []).map(toNumber).filter((n) => n !== null);
    if (numbers.length === 0) continue;
    if (numbers.length % 2 !== 0) {
      skipped += 1;
      continue;
    }
    for (let i = 0; i < numbers.length; i += 2) lines.push([numbers[i], numbers[i + 1]]);
  }
  lines.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { lines, skipped };
}

/** Lines as the dialog's text box shows them: one "mm<tab>litres" a line. */
export function linesToText(lines) {
  return lines.map(([mm, l]) => `${mm}\t${l}`).join('\n');
}

/**
 * What is wrong with a chart, line by line, most serious first.
 *   kind 'twice'  - the same depth on two lines: the database refuses it.
 *   kind 'falls'  - litres no higher than the line above: the database refuses it.
 *   kind 'step'   - rises, but far from where the lines either side put it.
 * Only the first two stop the save.
 */
export function checkLines(lines) {
  const issues = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [mm, l] = lines[i];
    const [pmm, pl] = lines[i - 1];
    if (mm === pmm) issues.push({ kind: 'twice', mm, litres: l, other: pl });
    else if (l <= pl) issues.push({ kind: 'falls', mm, litres: l, prevMm: pmm, other: pl });
  }

  // Out of step: where a straight line between the two neighbours puts this
  // depth, against the size of a step here. A tank's curve bends gently, so a
  // true line sits close to that; a slipped digit lands far off. Set against
  // real charts: on Al Qaim's two, once corrected, no line is more than 14% of
  // a step off (bar the bottom 10 mm, where the curve is sharpest, a few litres
  // out), and the four slips printed in his diesel chart were 26% to 1,800%. So
  // 20% of a step, and never under 5 L, so whole-litre rounding is not flagged. One slipped line also pulls its two
  // neighbours' expectations off by half as much, so only the worst line of a
  // run is named.
  const score = lines.map(() => 0);
  const expectedAt = lines.map(() => null);
  for (let i = 1; i < lines.length - 1; i += 1) {
    const [amm, al] = lines[i - 1];
    const [mm, l] = lines[i];
    const [bmm, bl] = lines[i + 1];
    if (!(amm < mm && mm < bmm) || !(al < bl)) continue;
    const expected = al + ((bl - al) * (mm - amm)) / (bmm - amm);
    const off = Math.abs(l - expected);
    if (off > Math.max(0.2 * ((bl - al) / 2), 5)) {
      score[i] = off / ((bl - al) / 2);
      expectedAt[i] = expected;
    }
  }
  for (let i = 1; i < lines.length - 1; i += 1) {
    if (!score[i] || score[i] < score[i - 1] || score[i] < (score[i + 1] ?? 0)) continue;
    const [mm, l] = lines[i];
    if (issues.some((x) => x.mm === mm)) continue;
    issues.push({ kind: 'step', mm, litres: l, expected: Math.round(expectedAt[i]) });
  }

  const rank = { twice: 0, falls: 1, step: 2 };
  return issues.sort((a, b) => rank[a.kind] - rank[b.kind] || a.mm - b.mm);
}
