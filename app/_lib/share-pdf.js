/**
 * Sending the amount of a statement or an invoice to the customer (Al Tufail,
 * October 2026): the phone number and message links.
 *
 * SENDING THE PDF ITSELF BY WHATSAPP WAS BUILT AND REMOVED. A web page cannot
 * attach a file to WhatsApp. The phone's share sheet gave the pump's Android
 * phone an unnamed BIN file that would not open, and then download-and-attach
 * and a share-to-an-app button were tried; the owner asked for all of it to come
 * out. What stays is Download PDF and SMS. `whatsappNumber` and `whatsappLink`
 * are kept, unused, for a message-only WhatsApp link if one is wanted again.
 *
 * No server code: this runs in the browser, and every figure in the message
 * was formatted by the caller from Postgres figures.
 */

/**
 * A Pakistani mobile number as WhatsApp wants it: digits only, country code
 * first. "0300-1234567" -> "923001234567". Anything that does not look like a
 * number gives null, and the link then opens WhatsApp to pick the contact.
 */
export function whatsappNumber(phone) {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `92${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function whatsappLink(phone, text) {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

/** `?&body=` is the form both Android and iPhone read. */
export function smsLink(phone, text) {
  const number = String(phone ?? '').replace(/[^\d+]/g, '');
  return `sms:${number}?&body=${encodeURIComponent(text)}`;
}
