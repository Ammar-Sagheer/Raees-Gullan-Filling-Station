'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createPurchase } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import { todayISO } from '@/app/_lib/date-helpers';
import SupplierSelect from '@/app/_components/admin/suppliers/SupplierSelect';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';
import { useI18n } from '@/app/_components/i18n/I18nProvider';
import { rich } from '@/app/_lib/i18n/core';


/**
 * Recording a delivery, behind a dialog.
 *
 * It used to sit open on the page beside the table, but this form has seven
 * fields and the table beside it has seven columns of its own - giving both
 * the room they need meant a fixed-width column next to the table that was
 * mostly empty whitespace once the table's own columns were laid out. A
 * delivery is also logged once a day at most, not something read continuously
 * the way the table is, so it does not need to stand open on the page either.
 */
export default function PurchaseForm({ tanks, suppliers = [], defaultDate = null }) {
    const formRef = useRef(null);
  const { t, fmt } = useI18n();
  const L = (n) => fmt.litres(n ?? 0);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createPurchase, null);

  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [tankId, setTankId] = useState('');

  // Close once it has gone through, and carry the confirmation out with it -
  // same reasoning as BankAccountForm: the new row is already on the table
  // behind, so the dialog would only be there to be dismissed.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setQuantity('');
      setTotalCost('');
      setTankId('');
    }
  }, [state]);

  // The rate is worked out from what was typed, not typed in - it is a
  // generated column in the database for the same reason (migration 023). The
  // delivery note states litres and an amount; the rate is arithmetic on those.
  const litresTyped = Number(quantity);
  const totalTyped = Number(totalCost);
  const derivedRate = litresTyped > 0 ? totalTyped / litresTyped : null;
  const showRate = Number.isFinite(derivedRate) && derivedRate > 0;

  const today = todayISO();

  /*
   * Warn when a delivery would not physically fit. A tank that already holds
   * 22,000 of a 25,000 litre capacity cannot take 10,000 more - so either the
   * quantity is mistyped or the book stock is already wrong. Catching it here,
   * before saving, is far easier than unpicking it later.
   */
  const selectedTank = tanks.find((tank) => tank.id === tankId);
  const spaceLeft = selectedTank
    ? Number(selectedTank.capacity_litres) - Number(selectedTank.current_stock_litres)
    : null;
  const litres = Number(quantity);
  const wouldOverfill =
    selectedTank && Number.isFinite(litres) && litres > 0 && spaceLeft !== null && litres > spaceLeft;

  return (
    <>
      <Button variant="primary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
                </span>
        {t('delivery.record')}
      </Button>
      <Dialog open={isOpen} onClose={() => setIsOpen(false)} title={t('delivery.record')}>
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <div>
                        <label className="label" htmlFor="tank_id">
              {t('delivery.tank')}
            </label>
            <select
              id="tank_id"
              name="tank_id"
              required
              value={tankId}
              onChange={(event) => setTankId(event.target.value)}
              className="input"
            >
              <option value="">{t('delivery.chooseTank')}</option>
              {tanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  {tank.name}
                </option>
              ))}
            </select>
            {selectedTank ? (
                            <p className="mt-1.5 text-sm text-ink-700">
                {rich(t, 'delivery.tankHolds', {
                  stock: <span className="whitespace-nowrap">{L(selectedTank.current_stock_litres)}</span>,
                  capacity: <span className="whitespace-nowrap">{L(selectedTank.capacity_litres)}</span>,
                  space: (
                    <span
                      className={`whitespace-nowrap font-semibold ${spaceLeft < 0 ? 'text-red-700' : 'text-ink-900'}`}
                    >
                      {L(Math.max(0, spaceLeft))}
                    </span>
                  ),
                })}
              </p>
            ) : null}
          </div>

          <div>
                        <label className="label" htmlFor="purchase_date">
              {t('delivery.date')}
            </label>
            <input
              id="purchase_date"
              name="purchase_date"
              type="date"
              required
              defaultValue={defaultDate ?? today}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
                            <label className="label" htmlFor="quantity_litres">
                {t('delivery.litres')}
              </label>
              <NumberInput
                id="quantity_litres"
                name="quantity_litres"
                step="0.01"
                min="0.01"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="input-number"
                placeholder="0"
              />
            </div>
            <div>
                            <label className="label" htmlFor="total_cost">
                {t('delivery.invoiceTotal')}
              </label>
              <NumberInput
                id="total_cost"
                name="total_cost"
                step="0.01"
                min="0.01"
                required
                value={totalCost}
                onChange={(event) => setTotalCost(event.target.value)}
                className="input-number"
                placeholder="0.00"
              />
            </div>
          </div>

          {wouldOverfill ? (
            <p className="callout-warn">
                            <span className="font-semibold">
                {t('delivery.wontFit', { litres: L(litres), tank: selectedTank.name })}
              </span>{' '}
              {t('delivery.wontFitText', { space: L(Math.max(0, spaceLeft)) })}
            </p>
          ) : null}

          {showRate ? (
            <div className="figure-box">
                            <p className="caption">{t('delivery.worksOut')}</p>
              <p className="tabular mt-0.5 whitespace-nowrap text-xl font-bold text-ink-900">
                {fmt.rate(derivedRate)}{' '}
                <span className="text-base font-semibold text-ink-700">{t('delivery.perLitre')}</span>
              </p>
            </div>
          ) : null}

          <SupplierSelect id="supplier_id" suppliers={suppliers} label={t('delivery.supplierOmc')} />

          <div>
            <label className="label" htmlFor="invoice_number">
                            {t('delivery.invoiceNumber')} <span className="font-normal text-ink-600">{t('delivery.optional')}</span>
            </label>
            <input id="invoice_number" name="invoice_number" type="text" className="input" />
          </div>

          <div>
                        <label className="label" htmlFor="payment_status">
              {t('delivery.payment')}
            </label>
            <select
              id="payment_status"
              name="payment_status"
              defaultValue="pending"
              className="input"
            >
                            <option value="pending">{t('delivery.notPaid')}</option>
              <option value="paid">{t('delivery.paid')}</option>
            </select>
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
                        <SubmitButton className="flex-1">
              {t('delivery.save')}
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
