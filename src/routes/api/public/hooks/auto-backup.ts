import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.server";

/**
 * Scheduled backup. Meant to be called hourly by pg_cron.
 * Auth: `x-cron-secret` header (or `Authorization: Bearer ...`) = CRON_SECRET.
 *
 * Runs only when backup_settings.is_enabled and the local (Asia/Jakarta) hour
 * matches hour_local, the weekday matches for weekly schedules, and no backup
 * has already run in the current period.
 */
export const Route = createFileRoute("/api/public/hooks/auto-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCronRequest(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runBackup, pruneBackups } = await import("@/lib/backup.server");

        const { data: settings } = await supabaseAdmin
          .from("backup_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        const s = settings as any;
        if (!s?.is_enabled) return Response.json({ skipped: "dinonaktifkan" });

        const jakarta = new Date(Date.now() + 7 * 3600 * 1000);
        const hour = jakarta.getUTCHours();
        const dow = jakarta.getUTCDay();

        if (hour !== s.hour_local) return Response.json({ skipped: "belum waktunya" });
        if (s.frequency === "weekly" && dow !== s.day_of_week) {
          return Response.json({ skipped: "bukan hari jadwal" });
        }
        if (s.last_run_at) {
          const elapsed = Date.now() - new Date(s.last_run_at).getTime();
          const minGap = s.frequency === "weekly" ? 6 * 24 * 3600e3 : 20 * 3600e3;
          if (elapsed < minGap) return Response.json({ skipped: "sudah berjalan" });
        }

        try {
          const res = await runBackup(supabaseAdmin, { source: "otomatis", note: "Terjadwal" });
          await supabaseAdmin
            .from("backup_settings")
            .update({ last_run_at: new Date().toISOString() } as never)
            .eq("id", s.id);
          const pruned = await pruneBackups(supabaseAdmin, s.keep_last ?? 14);
          return Response.json({ ok: true, rows: res.total, size: res.size, pruned });
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "gagal" },
            { status: 500 },
          );
        }
      },
    },
  },
});
