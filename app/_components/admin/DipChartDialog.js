'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import { readDipChart, replaceDipChart } from '@/app/_lib/actions';
import {
  checkLines,
  linesFromRows,
  linesToText,
  rowsFromText,
  rowsFromXlsx,
} from '@/app/_lib/dip-chart';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';

const figure = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

// How many lines of each kind to name before "and N more".
const SHOWN = 6;

function describeIssue(issue) {
  const at = `${figure.format(issue.mm)} mm`;
  if (issue.kind === 'twice') {
    return `${at} is on two lines (${figure.format(issue.other)} L and ${figure.format(issue.litres)} L). Keep one.`;
  }
  if (issue.kind === 'falls') {
    return `${at}: ${figure.format(issue.litres)} L is not more than ${figure.format(issue.other)} L at ${figure.format(issue.prevMm)} mm. One of the two is wrong.`;
  }
  return `${at}: ${figure.format(issue.litres)} L, where the lines either side put about ${figure.format(issue.expected)} L.`;
}

/**
 * Load or replace a tank's dip chart (078). The file the tank company gave the
 * owner (Excel or CSV) or a paste from it goes into ONE text box, one
 * "mm litres" line each, and that box is what is saved: he sees every line the
 * app read, and a wrong one is put right by typing over it. The checks run as
 * he types; the two the database also makes stop the save, the third (a line
 * out of step with its neighbours) only asks him to look.
 */
export default function DipChartDialog({ tank, hasChart, open, onClose, onSaved }) {
  const [state, formAction] = useActionState(replaceDipChart, null);
  const [body, setBody] = useState('');
  const [skipped, setSkipped] = useState(0);
  const [fileNote, setFileNote] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  // Opening on the chart that is there, so one line can be mended in place.
  useEffect(() => {
    if (!open) return;
    setFileNote(null);
    setSkipped(0);
    if (!hasChart) {
      setBody('');
      return;
    }
    let live = true;
    setLoading(true);
    readDipChart(tank.id).then((result) => {
      if (!live) return;
      setLoading(false);
      if (result?.ok) setBody(linesToText(result.lines));
      else setFileNote({ bad: true, text: result?.message ?? 'Could not read the chart.' });
    });
    return () => {
      live = false;
    };
  }, [open, hasChart, tank.id]);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) onSaved?.(state.message);
  }, [state, onSaved]);

  const { lines, unread } = useMemo(() => {
    const read = linesFromRows(rowsFromText(body));
    return { lines: read.lines, unread: read.skipped };
  }, [body]);
  const issues = useMemo(() => checkLines(lines), [lines]);
  const blocking = issues.filter((i) => i.kind !== 'step');
  const steps = issues.filter((i) => i.kind === 'step');

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileNote(null);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      if (!isXlsx && /\.xls$/i.test(file.name)) {
        setFileNote({
          bad: true,
          text: 'This is an old Excel file (.xls). Open it in Excel, Save As "Excel Workbook (.xlsx)", and choose that, or copy the chart and paste it below.',
        });
        return;
      }
      const rows = isXlsx ? await rowsFromXlsx(await file.arrayBuffer()) : rowsFromText(await file.text());
      const read = linesFromRows(rows);
      if (read.lines.length === 0) {
        setFileNote({ bad: true, text: `No mm and litres pairs were found in ${file.name}.` });
        return;
      }
      setBody(linesToText(read.lines));
      setSkipped(read.skipped);
      setFileNote({ bad: false, text: `Read from ${file.name}.` });
    } catch {
      setFileNote({
        bad: true,
        text: `${file.name} could not be read. Copy the chart from it and paste it below instead.`,
      });
    }
  }

  const minMm = lines[0]?.[0];
  const maxMm = lines[lines.length - 1]?.[0];
  const maxLitres = lines.reduce((m, l) => Math.max(m, l[1]), 0);
  const overCapacity = maxLitres > Number(tank.capacity_litres ?? Infinity);
  const canSave = lines.length >= 2 && blocking.length === 0 && !loading;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`${hasChart ? 'Replace' : 'Load'} the dip chart: ${tank.name}`}
      subtitle={
        <span className="text-sm text-ink-600">
          The chart from the tank company: depth in mm against litres
        </span>
      }
    >
      <form action={formAction} className="space-y-4 p-5">
        <input type="hidden" name="tank_id" value={tank.id} />
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.txt,.xls"
            className="sr-only"
            id={`chart-file-${tank.id}`}
            onChange={chooseFile}
          />
          <Button variant="primary" type="button" onClick={() => fileRef.current?.click()}>
            Choose the Excel or CSV file
          </Button>
          <span className="text-base text-ink-700">or paste the chart into the box below.</span>
        </div>

        {fileNote ? (
          <p className={`text-base ${fileNote.bad ? 'font-semibold text-red-700' : 'text-ink-700'}`}>
            {fileNote.text}
            {!fileNote.bad && skipped > 0
              ? ` ${skipped} ${skipped === 1 ? 'row' : 'rows'} without mm and litres side by side (a heading or a title) left out.`
              : null}
          </p>
        ) : null}

        <div>
          <label className="label" htmlFor={`chart-lines-${tank.id}`}>
            The chart, one line each: mm, then litres
          </label>
          <textarea
            id={`chart-lines-${tank.id}`}
            value={loading ? '' : body}
            onChange={(event) => {
              setBody(event.target.value);
              setSkipped(0);
            }}
            placeholder={loading ? 'Reading the chart…' : '0\t0\n10\t6\n20\t18\n…'}
            rows={10}
            spellCheck={false}
            className="input tabular h-auto font-mono text-base leading-relaxed [tab-size:8]"
          />
          {unread > 0 ? (
            <p className="mt-1.5 text-sm text-ink-700">
              {unread} {unread === 1 ? 'line has' : 'lines have'} an odd number of figures and{' '}
              {unread === 1 ? 'is' : 'are'} not counted.
            </p>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <div className="figure-box tabular flex flex-wrap gap-x-6 gap-y-1 text-base">
            <span>
              <span className="font-bold text-ink-900">{figure.format(lines.length)}</span> lines
            </span>
            <span className="whitespace-nowrap">
              {figure.format(minMm)} to{' '}
              <span className="font-bold text-ink-900">{figure.format(maxMm)} mm</span>
            </span>
            <span className="whitespace-nowrap">
              up to <span className="font-bold text-ink-900">{figure.format(maxLitres)} L</span>
            </span>
          </div>
        ) : null}

        {blocking.length > 0 ? (
          <div className="callout-danger">
            <p className="font-semibold">
              {blocking.length === 1 ? 'One line' : `${blocking.length} lines`} must be put right
              before the chart can be saved. Litres rise with the depth, and each depth is on one
              line:
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 ps-5">
              {blocking.slice(0, SHOWN).map((issue) => (
                <li key={`${issue.kind}-${issue.mm}-${issue.litres}`}>{describeIssue(issue)}</li>
              ))}
              {blocking.length > SHOWN ? <li>and {blocking.length - SHOWN} more.</li> : null}
            </ul>
          </div>
        ) : null}

        {steps.length > 0 ? (
          <div className="callout-warn">
            <p className="font-semibold">
              Check {steps.length === 1 ? 'this line' : `these ${steps.length} lines`} against the
              printed chart. {steps.length === 1 ? 'It rises' : 'They rise'}, but out of step with
              the lines either side, the way a slipped digit does:
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 ps-5">
              {steps.slice(0, SHOWN).map((issue) => (
                <li key={`step-${issue.mm}`}>{describeIssue(issue)}</li>
              ))}
              {steps.length > SHOWN ? <li>and {steps.length - SHOWN} more.</li> : null}
            </ul>
          </div>
        ) : null}

        {overCapacity ? (
          <p className="callout-warn">
            The chart goes up to {figure.format(maxLitres)} L, and this tank is set to hold{' '}
            {figure.format(Number(tank.capacity_litres))} L. If the chart is right, raise the
            capacity under Edit.
          </p>
        ) : null}

        <p className="callout">
          {hasChart
            ? 'The whole chart is replaced. Dips already recorded keep the litres they were saved with; dips from now on read the new chart.'
            : 'Once a chart is saved, a dip on this tank is entered in mm and the app reads the litres off this chart.'}
        </p>

        <FormMessage state={state?.ok === false ? state : null} />

        <div className="flex gap-2 border-t border-ink-200 pt-4">
          <SubmitButton className="flex-1" disabled={!canSave} pendingLabel="Saving…">
            {blocking.length > 0
              ? 'Fix the lines above first'
              : lines.length < 2
                ? 'Load or paste the chart'
                : `Save ${figure.format(lines.length)} lines`}
          </SubmitButton>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
