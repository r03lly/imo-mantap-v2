import { createServerFn } from "@tanstack/react-start";

/**
 * Ensures the fixed admin & apoteker staff accounts exist.
 * Idempotent and returns no user data — it only reports a status per account.
 * Called once from the sign-in page so a freshly remixed project is usable.
 */
export const ensureStaffAccounts = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureCoreAccounts } = await import("@/lib/bootstrap-accounts.server");
  try {
    const results = await ensureCoreAccounts();
    return { ok: true, results };
  } catch {
    return { ok: false, results: {} as Record<string, string> };
  }
});
