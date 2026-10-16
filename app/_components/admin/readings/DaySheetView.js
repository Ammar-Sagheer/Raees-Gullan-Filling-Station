import Link from 'next/link';

import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import DailyDipButton from '@/app/_components/admin/DailyDipButton';
import DaySheetForm from '@/app/_components/admin/DaySheetForm';
import Notice from '@/app/_components/admin/dashboard/Notice';
import { shiftISODate, formatDate } from '@/app/_lib/date-helpers';

/**
 * The Readings page as the DAY SHEET (091): the owner's register page as one
 * form. See DaySheetForm.js for what it is and why. This file is the frame: the
 * day header, the dip button (the dip stays its own dialog; it is not on his
 * register's money page), the sheet, and a way back to the old page.
 *
 * A day that already has readings the sheet did not write (entered the old way)
 * is not offered as a sheet: saving it would have to guess what to keep, and the
 * database refuses it. It says so and points to the old page for that day.
 */
export default function DaySheetView({
  date,
  dateLabel,
  sheetRows,
  customers,
  bankAccounts,
  daySheet,
  dipTanks = [],
  checksByTank = {},
  earliestByTank = {},
  chartRanges = {},
  lang = 'en',
}) {
  const oldWay = !daySheet && sheetRows.some((row) => row.reading_id);

  // A nozzle whose last saved reading is not yesterday's: the day before was not
  // entered for it, so the opening below is an older closing and every figure of
  // this day would be wrong. Said before anything is typed, and it stops the save
  // (the old page only warns, because filling a gap later looks the same).
  const yesterday = shiftISODate(date, -1);
  const gap = !daySheet && sheetRows.some((row) => row.previous_date && row.previous_date !== yesterday);

  const nozzles = sheetRows.map((row) => ({
    nozzle_id: row.nozzle_id,
    label: `Unit ${row.unit_number} \u00b7 Nozzle ${row.nozzle_label}`,
    fuel_type: row.fuel_type,
    opening: row.opening_reading,
    rate: row.rate,
  }));

  return (
    <>
      <DayHeader date={date} basePath="/admin/readings" title="Day sheet" icon="readings" lang={lang}>
        <div className="flex flex-wrap items-center gap-2">
          <DailyDipButton
            tanks={dipTanks}
            date={date}
            checksByTank={checksByTank}
            earliestByTank={earliestByTank}
            chartRanges={chartRanges}
            canManage
          />
        </div>
      </DayHeader>

      <div className="mt-4">
        {oldWay ? (
          <Notice tone="warn" icon="warning" title="This day was entered the old way">
            <p>
              The readings for this day were saved on the old Readings page, so the day sheet cannot change them.
              Open the old page for this day to look at it or correct it.
            </p>
            <p className="mt-2">
              <Link
                href={`/admin/readings?date=${date}&classic=1`}
                className="font-semibold text-brand-700 underline underline-offset-2"
              >
                Open the old Readings page for this day
              </Link>
            </p>
          </Notice>
        ) : (
          <>
          {gap ? (
            <Notice tone="danger" icon="warning" title={`${formatDate(yesterday)} is not fully entered`} className="mb-4">
              <p>
                At least one nozzle has no reading for {formatDate(yesterday)}, so the openings on this sheet are from
                an earlier day. Enter {formatDate(yesterday)} first on the old Readings page, then come back here.
              </p>
              <p className="mt-2">
                <Link
                  href={`/admin/readings?date=${yesterday}&classic=1`}
                  className="font-semibold text-brand-700 underline underline-offset-2"
                >
                  Open {formatDate(yesterday)} on the old Readings page
                </Link>
              </p>
            </Notice>
          ) : null}
          <DaySheetForm
            // A different day or a fresh save starts the form from what the
            // database holds, not from what was typed on the last day.
            key={`${date}|${daySheet?.saved_at ?? 'new'}`}
            date={date}
            dateLabel={dateLabel}
            nozzles={nozzles}
            customers={customers}
            bankAccounts={bankAccounts}
            saved={daySheet?.payload ?? null}
            savedAt={daySheet?.saved_at ?? null}
            blocked={gap ? `${formatDate(yesterday)} is not fully entered yet, so the openings are wrong. Enter it first.` : null}
          />
          </>
        )}
      </div>

      {!oldWay ? (
        <p className="mt-6 text-sm text-ink-600">
          <Link href={`/admin/readings?date=${date}&classic=1`} className="underline underline-offset-2">
            Open the old Readings page for this day
          </Link>
        </p>
      ) : null}
    </>
  );
}
