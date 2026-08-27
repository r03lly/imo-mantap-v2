import { createServerFn } from "@tanstack/react-start";
import { requireCloudAuth as requireSupabaseAuth } from "@/lib/cloud-auth-middleware";

export type DirectoryUser = {
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  is_verified: boolean | null;
  age: number | null;
  role: "pasien" | "apoteker" | "admin";
};

export const getPatientDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (roleError) throw new Error(roleError.message);
    const callerRoles = (roleRows ?? []).map((row) => row.role as string);
    const isAdmin = callerRoles.includes("admin");
    const isPharmacist = callerRoles.includes("apoteker");
    if (!isAdmin && !isPharmacist) throw new Error("Akses ditolak");

    let rolesQuery = context.supabase.from("user_roles").select("user_id, role");
    if (!isAdmin) rolesQuery = rolesQuery.eq("role", "pasien");

    const { data: roles, error: rolesError } = await rolesQuery;
    if (rolesError) throw new Error(rolesError.message);

    const userIds = [...new Set((roles ?? []).map((row) => row.user_id))];
    if (userIds.length === 0) return [] as DirectoryUser[];

    const { data: profiles, error: profilesError } = await context.supabase
      .from("profiles")
      .select("user_id, full_name, phone_number, is_verified, age")
      .in("user_id", userIds);
    if (profilesError) throw new Error(profilesError.message);

    const roleByUser = new Map((roles ?? []).map((row) => [row.user_id, row.role]));
    return (profiles ?? []).map((profile) => ({
      ...profile,
      role: roleByUser.get(profile.user_id) ?? "pasien",
    })) as DirectoryUser[];
  });