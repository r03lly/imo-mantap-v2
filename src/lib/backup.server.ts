export const BACKUP_TABLES = [
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
  "backup_settings",
  "backup_records",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type BackupPayload = {
  version: number;
  created_at: string;
  tables: Record<string, any[]>;
  /** Daftar akun (auth) — hanya untuk arsip, tidak dipulihkan otomatis. */
  accounts: any[];
};

/** Reads every account from the auth system (paginated). */
export async function collectAccounts(admin: any): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`akun: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        banned_until: (u as any).banned_until ?? null,
        user_metadata: u.user_metadata ?? {},
        app_metadata: u.app_metadata ?? {},
      });
    }
    if (users.length < 200) break;
  }
  return out;
}

/** Reads every backed-up table with the admin client and returns the payload. */
export async function collectBackup(admin: any): Promise<BackupPayload> {
  const tables: Record<string, any[]> = {};
  for (const t of BACKUP_TABLES) {
    const { data, error } = await admin.from(t).select("*");
    if (error) throw new Error(`${t}: ${error.message}`);
    tables[t] = data ?? [];
  }
  const accounts = await collectAccounts(admin);
  return { version: 2, created_at: new Date().toISOString(), tables, accounts };
}

/** Creates a backup, stores the file and writes a history record. */
export async function runBackup(
  admin: any,
  opts: { source: "manual" | "otomatis"; createdBy?: string | null; note?: string | null },
) {
  const payload = await collectBackup(admin);
  const json = JSON.stringify(payload, null, 2);
  const size = new TextEncoder().encode(json).length;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [t, rows] of Object.entries(payload.tables)) {
    counts[t] = rows.length;
    total += rows.length;
  }
  counts["accounts"] = payload.accounts.length;
  total += payload.accounts.length;

  const stamp = payload.created_at.replace(/[:.]/g, "-");
  const fileName = `backup-imo-mantap-${stamp}.json`;
  const storagePath = `${opts.source}/${fileName}`;

  const { error: upErr } = await admin.storage
    .from("backups")
    .upload(storagePath, new Blob([json], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr) throw new Error(`Gagal menyimpan berkas backup: ${upErr.message}`);

  const { data: rec, error: recErr } = await admin
    .from("backup_records")
    .insert({
      created_by: opts.createdBy ?? null,
      source: opts.source,
      file_name: fileName,
      storage_path: storagePath,
      size_bytes: size,
      total_rows: total,
      table_counts: counts,
      note: opts.note ?? null,
    })
    .select("*")
    .single();
  if (recErr) throw new Error(recErr.message);

  return { record: rec, json, total, size };
}

/** Keeps only the newest `keep` records, deleting older files. */
export async function pruneBackups(admin: any, keep: number) {
  const { data } = await admin
    .from("backup_records")
    .select("id, storage_path")
    .order("created_at", { ascending: false });
  const old = (data ?? []).slice(Math.max(1, keep));
  if (old.length === 0) return 0;
  await admin.storage.from("backups").remove(old.map((r: any) => r.storage_path));
  await admin
    .from("backup_records")
    .delete()
    .in(
      "id",
      old.map((r: any) => r.id),
    );
  return old.length;
}

/** Restore order — parent tables first so foreign keys stay valid. */
export const RESTORE_TABLES = [
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
  "backup_settings",
] as const;

/** Tables that are never emptied during a "replace" restore. */
const NEVER_DELETE = new Set(["system_audit_logs"]);

/**
 * Recreates auth accounts that no longer exist, preserving their original id so
 * every restored row (profil, obat, pengukuran, ...) keeps pointing to a user.
 */
export async function restoreAccounts(admin: any, accounts: any[]) {
  if (!Array.isArray(accounts) || accounts.length === 0) return { created: 0, failed: 0 };
  const existing = new Set((await collectAccounts(admin)).map((u) => u.id));
  let created = 0;
  let failed = 0;
  for (const a of accounts) {
    if (!a?.id || existing.has(a.id)) continue;
    const { error } = await admin.auth.admin.createUser({
      id: a.id,
      email: a.email ?? undefined,
      phone: a.phone ?? undefined,
      password: `Restore-${crypto.randomUUID().slice(0, 12)}`,
      email_confirm: true,
      user_metadata: a.user_metadata ?? {},
    });
    if (error) failed++;
    else created++;
  }
  return { created, failed };
}

/** Applies a backup payload to the database. */
export async function applyRestore(
  admin: any,
  payload: { tables?: Record<string, any[]>; accounts?: any[] },
  mode: "merge" | "replace",
) {
  const results: Record<string, string> = {};

  const acc = await restoreAccounts(admin, payload.accounts ?? []);
  if (acc.created || acc.failed) {
    results["accounts"] = `${acc.created} akun dipulihkan${acc.failed ? `, ${acc.failed} gagal` : ""}`;
  }

  if (mode === "replace") {
    for (const t of [...RESTORE_TABLES].reverse()) {
      if (NEVER_DELETE.has(t)) continue;
      if (!payload.tables?.[t]) continue;
      const { error } = await admin
        .from(t)
        .delete()
        .not("id", "is", null);
      if (error) results[t] = `hapus gagal: ${error.message}`;
    }
  }

  for (const t of RESTORE_TABLES) {
    const rows = payload.tables?.[t];
    if (!Array.isArray(rows) || rows.length === 0) {
      results[t] = results[t] ?? "0 baris";
      continue;
    }
    let ok = 0;
    const errs: string[] = [];
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await admin.from(t).upsert(chunk, { onConflict: "id" });
      if (error) errs.push(error.message);
      else ok += chunk.length;
    }
    results[t] = errs.length ? `${ok} ok, gagal: ${errs[0]}` : `${ok} baris dipulihkan`;
  }

  return results;
}
