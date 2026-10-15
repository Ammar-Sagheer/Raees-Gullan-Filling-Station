'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { recordPayment, recordCashGiven } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import NumberInput from '@/app/_components/ui/NumberInput';
import { VehicleFinder, customerLabel } from '@/app/_components/admin/VehiclePicker';

/**
 * Cash that went across the counter with a customer, entered from the Readings
 * page, beside Add expense and the bank entry (Raees Gullan, October 2026, from
 * Al Tufail's "Money received"). It first sat inside each nozzle's form, once per
 * nozzle for cash that has nothing to do with a nozzle; 15 Oct 2026 it moved to
 * the page's bar, once for the day.
 *
 * TWO WAYS, ONE FORM:
 *   Money received - the customer paid. The same entry as "Record a payment" on
 *                    the customer page (`recordPayment`): a credit, counted in the
 *                    Dashboard's cash to collect (084).
 *   Money taken    - the customer, or the owner's family, took cash out of the
 *                    pump's takings and not a litre of fuel. A debit on their
 *                    account (`recordCashGiven`); the Dashboard counts a debit
 *                    written by hand as credit (088), so the staff are not asked
 *                    for cash that is not in the drawer.
 *
 * Both are dated the day the readings are for (the day on screen) and save on
 * their own, so they work before any meter is typed in and after every one is saved.
 * Reads in English: this copy has no language switch.
 */
export default function CashInOutButton({ customers = [], date }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('in');
  const [customerId, setCustomerId] = useState('');
  const [notice, setNotice] = useState(null);
  const [amount, setAmount] = useState('');

  // The dialog is a native <dialog>, which stays in the DOM where it is rendered.
  // Rendered into document.body it is a form of its own wherever the button sits
  // (inside a form it could never submit: a nested <form>; it did when the button
  // lived in the nozzle's form, and this keeps it safe if it is ever put in one).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [state, formAction] = useActionState(
    (previous, formData) =>
      formData.get('direction') === 'out' ? recordCashGiven(previous, formData) : recordPayment(previous, formData),
    null,
  );
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      formRef.current?.reset();
      setCustomerId('');
      setAmount('');
      setIsOpen(false);
      setNotice({ message: `${state.message} It is on the customer's account.` });
    }
  }, [state]);

  // A soft warning for money RECEIVED, never a block: money can be taken ahead of
  // a slip that is not saved yet. It says what the account stands at NOW.
  const picked = customers.find((customer) => customer.id === customerId);
  const typed = Number(amount);
  const owed = picked && Number.isFinite(Number(picked.balance)) ? Number(picked.balance) : null;
  const rupees = (n) => `Rs ${Math.round(n).toLocaleString('en-US')}`;
  let warning = null;
  if (direction === 'in' && picked && owed !== null && Number.isFinite(typed) && typed > 0 && typed > owed) {
    warning =
      owed > 0
        ? `${picked.name} owes ${rupees(owed)} on the account now, and this is ${rupees(typed - owed)} more than that, so the account would be left ${rupees(typed - owed)} in credit. Slips typed on this screen but not saved yet are not counted. Save the reading first if this payment is for them.`
        : `${picked.name} owes nothing on the account now, so this would leave it ${rupees(typed - Math.max(owed, 0))} in credit. Slips typed on this screen but not saved yet are not counted. Save the reading first if this payment is for them.`;
  }

  const out = direction === 'out';

  return (
    <>
      <Button variant="secondary" type="button" onClick={() => setIsOpen(true)}>
        <Icon name="cash" className="h-4 w-4" />
        Money in / out
      </Button>

      {mounted
        ? createPortal(
            <Dialog
              open={isOpen}
              onClose={() => setIsOpen(false)}
              title="Money in or out, with a customer"
              subtitle={<span className="text-sm text-ink-600">Cash only, no fuel. Dated {date}</span>}
            >
              <form ref={formRef} action={formAction} className="space-y-4 p-5">
                <input type="hidden" name="customer_id" value={customerId} />
                <input type="hidden" name="entry_date" value={date} />
                <input type="hidden" name="direction" value={direction} />

                <div role="group" aria-label="Which way the money went" className="grid grid-cols-2 gap-2">
                  {[
                    ['in', 'Money received', 'They paid the pump'],
                    ['out', 'Money taken', 'They took cash from the pump'],
                  ].map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={direction === value}
                      onClick={() => setDirection(value)}
                      className={[
                        'rounded-xl border px-3 py-2 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                        direction === value
                          ? 'border-brand-500 bg-brand-50 text-brand-800'
                          : 'border-ink-200 bg-white text-ink-800 hover:border-ink-300',
                      ].join(' ')}
                    >
                      <span className="block text-base font-semibold">{label}</span>
                      <span className="block text-sm text-ink-600">{hint}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="label" htmlFor={`cash-customer-${date}`}>
                    {out ? 'Who took it' : 'Who paid'}
                  </label>
                  <VehicleFinder customers={customers} onPick={(pickedId) => setCustomerId(pickedId)} />
                  <select
                    id={`cash-customer-${date}`}
                    required
                    value={customerId}
                    onChange={(event) => setCustomerId(event.target.value)}
                    className="input"
                  >
                    <option value="">Choose the customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customerLabel(customer)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor={`cash-amount-${date}`}>
                    {out ? 'Amount taken' : 'Amount received'}
                  </label>
                  <NumberInput
                    id={`cash-amount-${date}`}
                    name="amount"
                    step="1"
                    min="1"
                    required
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="input-number"
                    placeholder="0"
                  />
                  {out ? (
                    <p className="mt-2 text-sm text-ink-600">
                      This is added to what they owe, and counted in the day's cash to collect, because that cash left the
                      pump's takings.
                    </p>
                  ) : null}
                  {warning ? <p className="callout-warn mt-2">{warning}</p> : null}
                </div>

                <div>
                  <label className="label" htmlFor={`cash-note-${date}`}>
                    Note <span className="font-normal text-ink-600">(optional)</span>
                  </label>
                  <input
                    id={`cash-note-${date}`}
                    name="note"
                    type="text"
                    autoComplete="off"
                    className="input"
                    placeholder={out ? 'e.g. pocket money, for the land' : 'e.g. cash, paid at the office'}
                  />
                </div>

                <FormMessage state={state?.ok === false ? state : null} />

                <div className="flex gap-2 border-t border-ink-200 pt-4">
                  <SubmitButton className="flex-1" pendingLabel="Saving…">
                    {out ? 'Record the cash taken' : 'Record the payment'}
                  </SubmitButton>
                  <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Dialog>,
            document.body,
          )
        : null}

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
