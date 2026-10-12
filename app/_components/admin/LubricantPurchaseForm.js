'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createLubricantPurchase } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import SupplierSelect from '@/app/_components/admin/suppliers/SupplierSelect';
import NumberInput from '@/app/_components/ui/NumberInput';
import { todayISO } from '@/app/_lib/date-helpers';
import Button from '@/app/_components/ui/Button';
import { useI18n } from '@/app/_components/i18n/I18nProvider';
import { rich } from '@/app/_lib/i18n/core';


/**
 * Restocking the lubricant shelf.
 *
 * Deliberately the twin of PurchaseForm, down to the wording: it is the same
 * job - a delivery note with litres and an amount on it - so it should not feel
 * like a different task because the tin is smaller than a tanker. As there, the
 * invoice total is what gets typed and the rate per litre is worked out from
 * it, never the other way round.
 *
 * QUANTITY IS IN LITRES, NOT CARTONS. A delivery of twelve 4 L cartons is 48 L,
 * and typing 12 would put the shelf out by a factor of four. The hint under the
 * box does the multiplication in front of whoever is typing, so the mistake is
 * visible before it is saved rather than a month later when the stock figure
 * makes no sense.
 *
 * `kind="loose"` records a DRUM instead. Same delivery note, same two figures,
 * same supplier - which is exactly why it is this component with a flag rather
 * than a second one. What changes is only the wording and the hint: a drum has
 * no brand and no cartons to count, so the pack arithmetic would be noise, and
 * the buying rate a litre is the figure worth showing back because it is what
 * the selling rate has to clear.
 */
export default function LubricantPurchaseForm({ lubricants, suppliers = [], kind = 'pack' }) {
    const isLoose = kind === 'loose';
  const { t, fmt } = useI18n();
  const L = (n) => fmt.litres(n ?? 0);
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createLubricantPurchase, null);

  // One drum is the normal case, and there is nothing to ask about it.
  const [lubricantId, setLubricantId] = useState(
    isLoose && lubricants.length === 1 ? lubricants[0].id : '',
  );
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setLubricantId(isLoose && lubricants.length === 1 ? lubricants[0].id : '');
      setQuantity('');
      setTotalCost('');
    }
  }, [state, isLoose, lubricants]);

  const selected = lubricants.find((row) => row.id === lubricantId) ?? null;
  const litresTyped = Number(quantity);
  const totalTyped = Number(totalCost);
  const hasLitres = Number.isFinite(litresTyped) && litresTyped > 0;
  const derivedRate = hasLitres ? totalTyped / litresTyped : null;
  const showRate = Number.isFinite(derivedRate) && derivedRate > 0;

  // How many cartons that many litres works out at, when it divides evenly.
  // Meaningless for a drum, which is not made of packs.
  const packSize = selected && !isLoose ? Number(selected.pack_size_litres) : null;
  const packs = packSize && hasLitres ? litresTyped / packSize : null;

  /*
   * For a drum, whether this delivery leaves the selling rate above water. The
   * one mistake that matters here is buying at a rate the shelf price no longer
   * clears, and it is invisible unless the two are put next to each other.
   */
  const sellRate = isLoose && selected ? Number(selected.sale_rate_per_litre) : null;
  const marginWarning =
    showRate && Number.isFinite(sellRate) && sellRate > 0 && derivedRate >= sellRate;

  return (
    <>
      <Button variant="secondary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
        disabled={lubricants.length === 0}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
                {isLoose ? t('delivery.recordLoose') : t('delivery.recordLube')}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
                title={isLoose ? t('delivery.recordLoose') : t('delivery.recordLube')}
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          {/* With one drum there is nothing to choose. Keeps the form down to
              the three things actually written on the delivery note. */}
          {isLoose && lubricants.length === 1 ? (
            <input type="hidden" name="lubricant_id" value={lubricants[0].id} />
          ) : (
            <div>
              <label className="label" htmlFor="purchase_lubricant_id">
                                {isLoose ? t('delivery.whichDrum') : t('delivery.lubricant')}
              </label>
              <select
                id="purchase_lubricant_id"
                name="lubricant_id"
                required
                value={lubricantId}
                onChange={(event) => setLubricantId(event.target.value)}
                className="input"
              >
                <option value="">{isLoose ? t('delivery.chooseDrum') : t('delivery.chooseLubricant')}</option>
                {lubricants.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected ? (
            <p className="text-sm text-ink-600">
              {isLoose ? (
                                <>
                  {rich(t, 'delivery.drumHolds', {
                    name: <bdi className="font-semibold">{selected.name}</bdi>,
                    litres: L(selected.current_stock_litres),
                  })}
                  {Number(selected.sale_rate_per_litre) > 0
                    ? t('delivery.sellingAt', { rate: fmt.rate(selected.sale_rate_per_litre) })
                    : ''}
                </>
              ) : (
                                <>
                  {t('delivery.packHolds', {
                    litres: L(selected.current_stock_litres),
                    pack: L(selected.pack_size_litres),
                  })}
                </>
              )}
            </p>
          ) : null}

          <div>
                        <label className="label" htmlFor="lubricant_purchase_date">
              {t('delivery.date')}
            </label>
            <input
              id="lubricant_purchase_date"
              name="purchase_date"
              type="date"
              required
              defaultValue={todayISO()}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lubricant_quantity">
                                {isLoose ? t('delivery.litresInDrum') : t('delivery.litres')}
              </label>
              <NumberInput
                id="lubricant_quantity"
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
                            <label className="label" htmlFor="lubricant_total_cost">
                {t('delivery.invoiceTotal')}
              </label>
              <NumberInput
                id="lubricant_total_cost"
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

          {packs ? (
            <p className="callout">
                            {rich(t, 'delivery.packs', {
                litres: L(litresTyped),
                packs: <span className="font-semibold">{fmt.number(packs)}</span>,
                pack: L(packSize),
              })}
            </p>
          ) : null}

          {isLoose && !packs ? (
            <p className="callout">
                            {t('delivery.drumNote')}
            </p>
          ) : null}

          {showRate ? (
            <div className="figure-box">
                            <p className="caption">{isLoose ? t('delivery.boughtAt') : t('delivery.worksOut')}</p>
              <p className="tabular mt-0.5 whitespace-nowrap text-xl font-bold text-ink-900">
                {fmt.rate(derivedRate)}{' '}
                <span className="text-base font-semibold text-ink-700">{t('delivery.perLitre')}</span>
              </p>
            </div>
          ) : null}

          {marginWarning ? (
            <p className="callout-warn">
                            <span className="font-semibold">
                {t('delivery.margin', { cost: fmt.rate(derivedRate), sell: fmt.rate(sellRate) })}
              </span>{' '}
              {t('delivery.marginText')}
            </p>
          ) : null}

          <SupplierSelect id={`lubricant_supplier_${kind}`} suppliers={suppliers} />

          <div>
            <label className="label" htmlFor="lubricant_invoice">
                            {t('delivery.invoiceNumber')} <span className="font-normal text-ink-600">{t('delivery.optional')}</span>
            </label>
            <input id="lubricant_invoice" name="invoice_number" type="text" className="input" />
          </div>

          <div>
                        <label className="label" htmlFor="lubricant_payment_status">
              {t('delivery.payment')}
            </label>
            <select
              id="lubricant_payment_status"
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
              {t('delivery.savePurchase')}
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
