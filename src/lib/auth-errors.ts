/** Terjemahan pesan error sistem (Supabase/Postgres) ke Bahasa Indonesia. */

const RULES: Array<{ test: RegExp; msg: string }> = [
  { test: /invalid login credentials/i, msg: "Email/No. HP atau password salah." },
  { test: /email not confirmed/i, msg: "Email belum dikonfirmasi. Silakan cek kotak masuk Anda." },
  {
    test: /user already registered|already been registered|already exists/i,
    msg: "Akun dengan email/No. HP ini sudah terdaftar. Silakan masuk atau gunakan nomor lain.",
  },
  {
    test: /password should be at least|password is too short/i,
    msg: "Password minimal 6 karakter.",
  },
  { test: /weak password|pwned|compromised/i, msg: "Password terlalu mudah ditebak. Gunakan kombinasi lain." },
  { test: /unable to validate email address|invalid email/i, msg: "Format email tidak valid." },
  { test: /signups not allowed|signup is disabled/i, msg: "Pendaftaran akun baru sedang ditutup." },
  {
    test: /email rate limit|over_email_send_rate_limit|too many requests|rate limit/i,
    msg: "Terlalu banyak percobaan. Silakan coba lagi beberapa saat.",
  },
  { test: /token has expired|invalid or has expired/i, msg: "Tautan sudah kedaluwarsa. Silakan minta ulang." },
  {
    test: /forbidden|not authorized|permission denied|row-level security|violates row-level/i,
    msg: "Anda tidak memiliki izin untuk melakukan tindakan ini.",
  },
  { test: /duplicate key value|unique constraint/i, msg: "Data ini sudah ada di sistem." },
  {
    test: /violates foreign key constraint/i,
    msg: "Data terkait tidak ditemukan atau masih dipakai di bagian lain.",
  },
  { test: /null value in column/i, msg: "Ada kolom wajib yang belum diisi." },
  { test: /jwt expired|session.*expired|refresh token/i, msg: "Sesi Anda berakhir. Silakan masuk kembali." },
  { test: /failed to fetch|network ?error|load failed/i, msg: "Koneksi bermasalah. Periksa jaringan Anda." },
  { test: /user not found/i, msg: "Pengguna tidak ditemukan." },
];

export function toIndonesianError(err: unknown): string {
  const raw =
    typeof err === "string"
      ? err
      : ((err as { message?: string } | null)?.message ?? "");
  for (const r of RULES) if (r.test.test(raw)) return r.msg;
  // Pesan yang sudah Bahasa Indonesia (mis. dari validator kita) dibiarkan apa adanya.
  if (/[a-zA-Z]/.test(raw) && /\b(wajib|tidak|sudah|minimal|gagal|belum|harus)\b/i.test(raw)) return raw;
  return raw ? `Terjadi kesalahan: ${raw}` : "Terjadi kesalahan. Silakan coba lagi.";
}

export const errMsg = toIndonesianError;
