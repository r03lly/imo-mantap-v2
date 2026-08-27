/**
 * Server-only bootstrap for the core staff accounts (admin & apoteker).
 *
 * A project remix copies the database schema but NOT the auth users, so these
 * accounts must be re-created on a fresh copy. This helper is idempotent:
 * existing accounts keep their current password and are only re-linked to the
 * correct role/profile if that link is missing.
 */

export type CoreAccount = {
  email: string;
  password: string;
  role: "admin" | "apoteker";
  full_name: string;
};

export const CORE_ACCOUNTS: CoreAccount[] = [
  {
    email: "adminimomantap@gmail.com",
    password: "adminimomantap112233",
    role: "admin",
    full_name: "Administrator IMO MANTAP",
  },
  {
    email: "apotekerimomantap@gmail.com",
    password: "apotekerimo123",
    role: "apoteker",
    full_name: "Apoteker IMO MANTAP",
  },
];

export async function ensureCoreAccounts(): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const results: Record<string, string> = {};

  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw new Error(listErr.message);

  for (const acc of CORE_ACCOUNTS) {
    let userId = list?.users.find((u) => u.email === acc.email)?.id;

    if (!userId) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: acc.email,
        password: acc.password,
        email_confirm: true,
        user_metadata: { full_name: acc.full_name },
      });
      if (error || !data.user) {
        results[acc.email] = `error: ${error?.message ?? "unknown"}`;
        continue;
      }
      userId = data.user.id;
      results[acc.email] = "created";
    } else {
      results[acc.email] = "exists";
    }

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { user_id: userId, full_name: acc.full_name, is_verified: true },
        { onConflict: "user_id" },
      );

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const hasRole = (roles ?? []).some((r) => (r as { role: string }).role === acc.role);
    if (!hasRole) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: acc.role });
      if (roleErr) results[acc.email] += ` (role error: ${roleErr.message})`;
      else results[acc.email] += " (role fixed)";
    }
  }

  return results;
}
