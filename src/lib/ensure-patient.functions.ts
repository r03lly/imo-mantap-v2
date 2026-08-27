import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Makes sure a freshly registered user has a `profiles` row and the default
 * `pasien` role, so admin/apoteker patient lists can see them.
 * Idempotent: never overwrites an existing role or profile name.
 */
export const ensurePatientRecord = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().max(120).optional(),
        phone: z.string().max(30).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: user } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!user?.user) return { ok: false };

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("user_id", data.userId)
      .maybeSingle();

    if (!existingProfile) {
      await supabaseAdmin.from("profiles").insert({
        user_id: data.userId,
        full_name: data.fullName || (user.user.user_metadata?.full_name as string) || "",
        phone_number: data.phone || null,
        is_verified: false,
      } as never);
    } else if (!existingProfile.full_name && data.fullName) {
      await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName } as never)
        .eq("user_id", data.userId);
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    if (!roles || roles.length === 0) {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: "pasien" } as never);
    }

    return { ok: true };
  });
