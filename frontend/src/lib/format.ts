/** Ovigo is a Bangladesh-focused marketplace — every price on the platform is
 * BDT (see backend/app/modules/bookings/models.py's module docstring), so this
 * formats with the Taka symbol rather than taking a currency code per call. */
export function formatMoney(amount: string | number): string {
  return `৳${amount}`;
}
