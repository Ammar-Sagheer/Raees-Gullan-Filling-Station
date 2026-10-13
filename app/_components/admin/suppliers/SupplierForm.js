'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { saveSupplier } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import NumberInput from '@/app/_components/ui/NumberInput';
import { todayISO } from '@/app/_lib/date-helpers';

/**
 * Adding a supplier, or changing one's name, phone and note, behind one dialog.
 *
 * With `supplier` it edits; without, it adds. The four seeded names are
 * placeholders the owner is expected to rename (067), so editing is not a rare
 * correction here but the first thing done with each one.
 */
export default function SupplierForm({ supplier = null, variant = 'secondary' }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [state, formAction] = useActionState(saveSupplier, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      if (!supplier) formRef.current?.reset();
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state, supplier]);

  const editing = Boolean(supplier);
  const idFor = (field) => `${field}-${supplier?.id ?? 'new'}`;

  return (
    <>
      <Button
        variant={variant}
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        {editing ? (
          'Edit details'
        ) : (
          <>
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Add a supplier
          </>
        )}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={editing ? `Edit ${supplier.name}` : 'Add a supplier'}
        subtitle={
          <span className="text-sm text-ink-600">
            {editing
              ? 'The name changes everywhere it is shown, including past deliveries on this account.'
              : 'Leave what the pump owed them blank to start at nothing. Deliveries chosen against it are added by themselves.'}
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          {editing ? <input type="hidden" name="supplier_id" value={supplier.id} /> : null}

          <div>
            <label className="label" htmlFor={idFor('name')}>
              Name
            </label>
            <input
              id={idFor('name')}
              name="name"
              type="text"
              required
              defaultValue={supplier?.name ?? ''}
              className="input"
              placeholder="e.g. Gas & Oil"
            />
          </div>

          <div>
            <label className="label" htmlFor={idFor('phone')}>
              Phone <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={idFor('phone')}
              name="phone"
              type="tel"
              defaultValue={supplier?.phone ?? ''}
              className="input"
              placeholder="e.g. 0300-1234567"
            />
          </div>

          <div>
            <label className="label" htmlFor={idFor('note')}>
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={idFor('note')}
              name="note"
              type="text"
              defaultValue={supplier?.note ?? ''}
              className="input"
              placeholder="e.g. diesel and petrol, delivers Tuesdays"
            />
          </div>

          {editing ? null : (
            <div className="rounded-lg border border-ink-200 p-3">
              <label className="label" htmlFor={idFor('opening_amount')}>
                What the pump already owed them{' '}
                <span className="font-normal text-ink-600">(optional)</span>
              </label>
              <NumberInput
                id={idFor('opening_amount')}
                name="opening_amount"
                step="0.01"
                min="0"
                className="input-number"
                placeholder="0"
              />
              <div className="mt-3">
                <label className="label" htmlFor={idFor('opening_date')}>
                  As of
                </label>
                <input
                  id={idFor('opening_date')}
                  name="opening_date"
                  type="date"
                  required
                  max={todayISO()}
                  defaultValue={todayISO()}
                  className="input"
                />
                <p className="mt-1 text-sm text-ink-600">
                  The day this balance stood. Setting the app up on the 1st with days still to type
                  in? Use the close of the day before (30 September for a 1 October start), so the
                  balance sits above those days on the account.
                </p>
              </div>
            </div>
          )}

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              {editing ? 'Save' : 'Add supplier'}
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
