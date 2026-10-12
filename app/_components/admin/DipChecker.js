'use client';

import { useEffect, useState } from 'react';

import { previewDipLitres } from '@/app/_lib/actions';
import NumberInput from '@/app/_components/ui/NumberInput';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import PendingLink from '@/app/_components/ui/PendingLink';
import { useI18n } from '@/app/_components/i18n/I18nProvider';

/**
 * Dip to litres, at any time, saving nothing - asked for by the fourth pump
 * (Al Tufail, October 2026): "dip teller into litres (check at any time)".
 *
 * The rod goes in mid-shift, before a tanker unloads, when a figure looks
 * wrong; the owner wants the litres there and then, without recording a dip
 * that would close a day. So this is the Stock form's mm box on its own:
 * the litres come from the tank's chart in Postgres (`dip_to_litres`, 075,
 * through previewDipLitres), exactly as a recorded dip's would, and nothing is
 * written. Room left is the tank's capacity less that figure - litres, not
 * money, and both ends come from the database.
 *
 * `tanks` are the active tanks; `charts` is getDipChartRanges(), so only a
 * tank that has a chart can be picked.
 */
export default function DipChecker({ tanks = [], charts = {} }) {
  const { t, fmt } = useI18n();
  const charted = tanks.filter((tank) => charts[tank.id]);
  const [tankId, setTankId] = useState(charted[0]?.id ?? null);
  const [mm, setMm] = useState('');
  const [result, setResult] = useState(null);

  const tank = charted.find((row) => row.id === tankId) ?? null;
  const chart = tank ? charts[tank.id] : null;

  useEffect(() => {
    const value = Number(mm);
    if (!tank || mm === '' || !Number.isFinite(value) || value < 0) {
      setResult(null);
      return undefined;
    }
    let stale = false;
    setResult({ busy: true });
    const timer = setTimeout(async () => {
      const answer = await previewDipLitres(tank.id, value);
      if (!stale) setResult(answer);
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [mm, tank]);

  if (charted.length === 0) {
    return (
      <p className="text-base text-ink-700">
        {t('dipCheck.noCharts')}{' '}
        <PendingLink href="/admin/settings" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
          {t('dipCheck.toSettings')}
        </PendingLink>
      </p>
    );
  }

  const capacity = Number(tank?.capacity_litres ?? 0);
  const litres = result?.ok ? Number(result.litres) : null;
  const percent = litres !== null && capacity > 0 ? Math.round((litres / capacity) * 100) : null;
  const room = litres !== null && capacity > 0 ? Math.max(0, capacity - litres) : null;

  return (
    <div className="space-y-4">
      {charted.length > 1 ? (
        <div role="group" aria-label={t('dipCheck.whichTank')} className="seg flex-wrap">
          {charted.map((row) => (
            <button
              key={row.id}
              type="button"
              aria-pressed={row.id === tankId}
              onClick={() => setTankId(row.id)}
              className={`${row.id === tankId ? 'seg-item-active' : 'seg-item'} whitespace-nowrap`}
            >
              <bdi>{row.name}</bdi>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <div>
          <label className="label" htmlFor="dip-check-mm">
            {t('dipCheck.rod', { tank: tank?.name ?? '' })}
          </label>
          <NumberInput
            id="dip-check-mm"
            step="1"
            min="0"
            max={chart?.max_mm}
            value={mm}
            onChange={(event) => setMm(event.target.value)}
            className="input-number"
            placeholder="0"
            autoComplete="off"
          />
          <p className="mt-1 text-sm text-ink-600">
            {t('dipCheck.range', {
              from: fmt.number(chart?.min_mm ?? 0),
              to: fmt.number(chart?.max_mm ?? 0),
            })}
          </p>
        </div>

        <div aria-live="polite" className="rounded-2xl bg-ink-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-700">{t('dipCheck.litres')}</p>
            {tank ? <FuelBadge fuelType={tank.fuel_type} /> : null}
          </div>
          <p className="tabular mt-1 whitespace-nowrap text-3xl font-bold text-ink-900">
            {litres !== null ? fmt.litres(litres) : result?.busy ? '…' : '-'}
          </p>
          {percent !== null ? (
            <p className="mt-1 text-sm text-ink-700">
              {t('dipCheck.full', { pct: fmt.isolate(`${percent}%`), room: fmt.litres(room) })}
            </p>
          ) : null}
        </div>
      </div>

      {result && result.ok === false ? (
        <p role="status" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          {result.message}
        </p>
      ) : null}

      <p className="caption">{t('dipCheck.nothingSaved')}</p>
    </div>
  );
}
