import { createServerFn } from "@tanstack/react-start";
import { requireCloudAuth as requireSupabaseAuth } from "@/lib/cloud-auth-middleware";

type Input = { ids?: string[] | null; password?: string | null };

export const createScreeningAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => ({
    ids: Array.isArray(d?.ids) ? d.ids.map(String).slice(0, 500) : null,
    password: d?.password ? String(d.password) : null,
  }))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await (context as any).supabase.rpc("has_role", {
      _user_id: (context as any).userId,
      _role: "admin",
    } as never);
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { phoneToEmail, DEFAULT_SCREENING_PASSWORD } = await import("@/lib/account-email");
    const password = data.password?.trim() || DEFAULT_SCREENING_PASSWORD;

    let q = supabaseAdmin
      .from("health_screenings")
      .select("id, full_name, gender, age, email, phone_number, user_id");
    if (data.ids && data.ids.length > 0) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const byEmail = new Map((list?.users ?? []).map((u) => [String(u.email).toLowerCase(), u.id]));

    let created = 0;
    let updated = 0;
    const skipped: string[] = [];

    for (const r of (rows ?? []) as any[]) {
      const loginEmail: string = (r.email?.trim() || (r.phone_number ? phoneToEmail(r.phone_number) : "")).toLowerCase();
      if (!loginEmail || !loginEmail.includes("@")) {
        skipped.push(`${r.full_name}: email/no. HP belum diisi`);
        continue;
      }

      let userId: string | undefined = byEmail.get(loginEmail);
      if (userId) {
        await supabaseAdmin.auth.admin.updateUserById(userId, { password, email_confirm: true });
        updated++;
      } else {
        const { data: cu, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name: r.full_name, phone_number: r.phone_number ?? "" },
        });
        if (cErr || !cu.user) {
          skipped.push(`${r.full_name}: ${cErr?.message ?? "gagal membuat akun"}`);
          continue;
        }
        userId = cu.user.id;
        byEmail.set(loginEmail, userId);
        created++;
      }

      await supabaseAdmin.from("profiles").upsert(
        {
          user_id: userId,
          full_name: r.full_name,
          phone_number: r.phone_number ?? null,
          gender: r.gender ?? null,
          age: r.age ?? null,
          is_verified: true,
        } as any,
        { onConflict: "user_id" },
      );
      const { data: hasRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .limit(1);
      if (!hasRole || hasRole.length === 0) {
        await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "pasien" } as any);
      }

      await supabaseAdmin
        .from("health_screenings")
        .update({
          user_id: userId,
          login_email: loginEmail,
          login_password: password,
          account_created_at: new Date().toISOString(),
        } as any)
        .eq("id", r.id);
    }

    return { created, updated, skipped };
  });
