import { createServerFn } from "@tanstack/react-start";
import { requireCloudAuth as requireSupabaseAuth } from "@/lib/cloud-auth-middleware";

const TABLES = [
  "profiles",
  "user_roles",
  "medication_catalog",
  "medications",
  "adherence_logs",
  "measurements",
  "health_screenings",
  "patient_logbook",
  "appointments",
  "consultation_requests",
  "consultation_messages",
  "educational_content",
  "notification_logs",
  "push_subscriptions",
  "system_audit_logs",
] as const;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBackup, pruneBackups } = await import("@/lib/backup.server");
    const res = await runBackup(supabaseAdmin, { source: "manual", createdBy: context.userId });
    const { data: st } = await supabaseAdmin.from("backup_settings").select("keep_last").limit(1);
    await pruneBackups(supabaseAdmin, (st?.[0] as any)?.keep_last ?? 14);
    return {
      rowCount: res.total,
      sizeBytes: res.size,
      fileName: (res.record as any).file_name as string,
      json: res.json,
    };
  });

export const listBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("backup_records" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { items: (data ?? []) as any[] };
  });

export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rec, error } = await supabaseAdmin
      .from("backup_records")
      .select("storage_path, file_name")
      .eq("id", data.id)
      .single();
    if (error || !rec) throw new Error("Backup tidak ditemukan");
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("backups")
      .createSignedUrl((rec as any).storage_path, 300, {
        download: (rec as any).file_name,
      });
    if (sErr || !signed) throw new Error(sErr?.message ?? "Gagal membuat tautan unduh");
    return { url: signed.signedUrl, fileName: (rec as any).file_name as string };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rec } = await supabaseAdmin
      .from("backup_records")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (rec) await supabaseAdmin.storage.from("backups").remove([(rec as any).storage_path]);
    const { error } = await supabaseAdmin.from("backup_records").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("backup_settings" as never)
      .select("*")
      .limit(1);
    if (error) throw new Error(error.message);
    return { settings: ((data ?? [])[0] ?? null) as any };
  });

export const saveBackupSettings = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      is_enabled: boolean;
      frequency: "daily" | "weekly";
      day_of_week: number;
      hour_local: number;
      keep_last: number;
    }) => ({
      is_enabled: Boolean(d.is_enabled),
      frequency: d.frequency === "weekly" ? ("weekly" as const) : ("daily" as const),
      day_of_week: Math.min(6, Math.max(0, Number(d.day_of_week) || 0)),
      hour_local: Math.min(23, Math.max(0, Number(d.hour_local) || 0)),
      keep_last: Math.min(90, Math.max(1, Number(d.keep_last) || 14)),
    }),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("backup_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    const payload = { ...data, updated_by: context.userId };
    const q = existing
      ? supabaseAdmin
          .from("backup_settings")
          .update(payload as never)
          .eq("id", (existing as any).id)
      : supabaseAdmin.from("backup_settings").insert(payload as never);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dry-run: compares an uploaded backup against current data. */
export const previewRestore = createServerFn({ method: "POST" })
  .inputValidator((d: { payload: unknown; mode?: "merge" | "replace" }) => ({
    payload: d.payload,
    mode: d.mode === "replace" ? ("replace" as const) : ("merge" as const),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const payload = data.payload as { created_at?: string; tables?: Record<string, any[]> } | null;
    if (!payload || typeof payload !== "object" || !payload.tables) {
      throw new Error("Format file backup tidak valid");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows: {
      table: string;
      incoming: number;
      current: number;
      overwrite: number;
      added: number;
      removed: number;
    }[] = [];

    for (const t of TABLES) {
      const incomingRows = Array.isArray(payload.tables[t]) ? payload.tables[t]! : [];
      const { data: cur } = await supabaseAdmin.from(t as never).select("id");
      const currentIds = new Set(((cur ?? []) as any[]).map((r) => r.id));
      const incomingIds = new Set(incomingRows.map((r: any) => r?.id));
      let overwrite = 0;
      incomingIds.forEach((id) => {
        if (currentIds.has(id)) overwrite++;
      });
      rows.push({
        table: t,
        incoming: incomingRows.length,
        current: currentIds.size,
        overwrite,
        added: incomingIds.size - overwrite,
        removed:
          data.mode === "replace"
            ? currentIds.size - overwrite
            : 0,
      });
    }

    return { createdAt: payload.created_at ?? null, mode: data.mode, rows };
  });

export const restoreBackup = createServerFn({ method: "POST" })
  .inputValidator((d: { payload: unknown; mode?: "merge" | "replace" }) => ({
    payload: d.payload,
    mode: d.mode === "replace" ? ("replace" as const) : ("merge" as const),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const payload = data.payload as {
      tables?: Record<string, any[]>;
      accounts?: any[];
    } | null;
    if (!payload || typeof payload !== "object" || !payload.tables) {
      throw new Error("Format file backup tidak valid");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyRestore } = await import("@/lib/backup.server");

    const results = await applyRestore(supabaseAdmin, payload, data.mode);

    await context.supabase.from("system_audit_logs").insert({
      user_id: context.userId,
      action: "restore_backup",
      table_name: "multiple",
      new_data: { mode: data.mode, results } as never,
    } as never);

    return { ok: true, results };
  });

/** Restores directly from a backup stored in the backup history. */
export const restoreFromRecord = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; mode?: "merge" | "replace" }) => ({
    id: String(d.id),
    mode: d.mode === "replace" ? ("replace" as const) : ("merge" as const),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyRestore } = await import("@/lib/backup.server");

    const { data: rec, error } = await supabaseAdmin
      .from("backup_records")
      .select("storage_path, file_name")
      .eq("id", data.id)
      .single();
    if (error || !rec) throw new Error("Backup tidak ditemukan");

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("backups")
      .download((rec as any).storage_path);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "Gagal mengunduh berkas backup");

    let payload: any;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      throw new Error("Berkas backup rusak atau bukan JSON yang valid");
    }
    if (!payload?.tables) throw new Error("Format file backup tidak valid");

    const results = await applyRestore(supabaseAdmin, payload, data.mode);

    await context.supabase.from("system_audit_logs").insert({
      user_id: context.userId,
      action: "restore_backup",
      table_name: "multiple",
      record_id: data.id as never,
      new_data: { mode: data.mode, file: (rec as any).file_name, results } as never,
    } as never);

    return { ok: true, fileName: (rec as any).file_name as string, results };
  });

