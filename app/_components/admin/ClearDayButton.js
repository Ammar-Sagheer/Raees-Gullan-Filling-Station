'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { clearDay } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import { useI18n } from '@/app/_components/i18n/I18nProvider';

/**
 * Wipes the day on screen so it can be entered again. Owner only.
 *
 * Sits behind a dialog rather than a plain confirm, because the thing worth
 * reading is not "are you sure" - it is what happens to the credit slips, and
 * that fuel deliveries and expenses are not touched.
 */
export default function ClearDayButton({ date, dateLabel, entryCount }) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useI18n();
  const [state, formAction] = useActionState(clearDay, null);

  // What the last clear did, kept on the page once the dialog has gone.
  const [notice, setNotice] = useState(null);
  // A result belongs to the submission that produced it. Opening the dialog
  // again starts clean rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const nothingToClear = entryCount === 0;
  const result = showResult ? state : null;

  // Close as soon as the clear comes back. The dialog exists to ask the
  // question; once it is answered, leaving it up makes the owner dismiss a box
  // that is only telling them it worked - and the page behind has already
  // refreshed to show the day empty.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  function openDialog() {
    setShowResult(false);
    setNotice(null);
    setIsOpen(true);
  }

  return (
    <>
      {/* Sized like the buttons it sits beside rather than as quiet small text:
          clearing a day is a real thing an owner comes to this screen to do, and
          it was easy to miss.

          This used to write its styles out by hand rather than use .btn-danger,
          so that with nothing to clear it went properly grey instead of a faded
          red - unavailable at a glance, not a warning. MUI's own disabled state
          is that grey, so the variant can now be used directly. */}
      <Button
        variant="danger"
        type="button"
        onClick={openDialog}
        disabled={nothingToClear}
        title={
          nothingToClear
            ? t('clearDay.nothing')
            : t('clearDay.clearAll', { date: dateLabel })
        }
        className="whitespace-nowrap"
        /* The new look's shape, to match the date controls it sits beside in
           the day header: 12px radius, 42px tall. */
        sx={{ borderRadius: '12px', height: 42, px: 2, bgcolor: '#ffffff' }}
      >
        {t('clearDay.button')}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('clearDay.title', { date: dateLabel })}
        subtitle={
          <span className="text-sm text-ink-600">
            {t('clearDay.willRemove', { count: entryCount })}
          </span>
        }
      >
        <form
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="date" value={date} />

          <p className="text-base text-ink-700">
            {t('clearDay.body')}
          </p>

          <ul className="space-y-2">
            <li className="callout">
              <span className="font-semibold text-ink-900">{t('clearDay.slipsBold')}</span>{' '}
              {t('clearDay.slipsText')}
            </li>
            <li className="callout">
              <span className="font-semibold text-ink-900">{t('clearDay.othersBold')}</span>{' '}
              {t('clearDay.othersText')}
            </li>
          </ul>

          {/* A day cannot be un-cleared, so the owner's own password goes first.
              Plain English for now, like the other new owner-only text. */}
          <div>
            <label className="label" htmlFor="clear_day_password">
              Your own password (a cleared day cannot be brought back)
            </label>
            <input
              id="clear_day_password"
              name="owner_password"
              type="password"
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          {/* Only a failure lands here now - a success has already closed this. */}
          <FormMessage state={result} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton variant="danger" className="flex-1" pendingLabel={t('clearDay.clearing')}>
              {t('clearDay.button')}
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Carries the result out of the dialog that reported it. How many slips
          were reversed is the part worth seeing, and it would be lost if the
          message closed along with the box. */}
      <Toast notice={notice} onDismiss={() => setNotice(null)} duration={8000} />
    </>
  );
}
