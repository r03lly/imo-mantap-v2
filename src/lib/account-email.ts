/** Helper untuk mengubah nomor HP/WA menjadi email login internal. */
export const PHONE_EMAIL_DOMAIN = "imomantap.local";

/** Password seragam untuk akun yang dibuatkan admin dari data skrining. */
export const DEFAULT_SCREENING_PASSWORD = "imomantap123";

export function normalizePhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@${PHONE_EMAIL_DOMAIN}`;
}

/** Terima email atau nomor HP, kembalikan email yang dipakai Supabase Auth. */
export function toLoginEmail(identifier: string): string {
  const v = (identifier ?? "").trim();
  return v.includes("@") ? v.toLowerCase() : phoneToEmail(v);
}
