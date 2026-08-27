import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Upload, DatabaseBackup, History, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createBackup,
  restoreBackup,
  previewRestore,
  getBackupSettings,
  saveBackupSettings,
} from "@/lib/admin-backup.functions";

export const Route = createFileRoute("/_authenticated/admin/backup")({
  component: BackupAdmin,
  head: () => ({
    meta: [
      { title: "Backup & Restore Data — IMO MANTAP Admin" },
      {
        name: "description",
        content:
          "Cadangkan seluruh data pasien, obat, dan kepatuhan IMO MANTAP, atur backup otomatis, dan pulihkan dengan pratinjau.",
      },
      { property: "og:title", content: "Backup & Restore Data — IMO MANTAP Admin" },
      {
        property: "og:description",
        content: "Cadangkan, jadwalkan, dan pulihkan data aplikasi IMO MANTAP dari panel admin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type PreviewRow = {
  table: string;
  incoming: number;
  current: number;
  overwrite: number;
  added: number;
  removed: number;
};

function BackupAdmin() {
  const doBackup = useServerFn(createBackup);
  const doRestore = useServerFn(restoreBackup);
  const doPreview = useServerFn(previewRestore);
  const loadSettings = useServerFn(getBackupSettings);
  const storeSettings = useServerFn(saveBackupSettings);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"backup" | "restore" | "preview" | null>(null);
  const [replace, setReplace] = useState(false);
  const [results, setResults] = useState<Record<string, string> | null>(null);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; createdAt: string | null } | null>(
    null,
  );
  const [payload, setPayload] = useState<unknown>(null);

  const [enabled, setEnabled] = useState(false);
  const [freq, setFreq] = useState<"daily" | "weekly">("daily");
  const [dow, setDow] = useState(1);
  const [hour, setHour] = useState(2);
  const [keep, setKeep] = useState(14);
  const [lastRun, setLastRun] = useState<string | null>(null);

  useEffect(() => {
    loadSettings({})
      .then((r) => {
        const s = r.settings;
        if (!s) return;
        setEnabled(!!s.is_enabled);
        setFreq(s.frequency === "weekly" ? "weekly" : "daily");
        setDow(s.day_of_week ?? 1);
        setHour(s.hour_local ?? 2);
        setKeep(s.keep_last ?? 14);
        setLastRun(s.last_run_at ?? null);
      })
      .catch(() => {});
  }, [loadSettings]);

  async function onBackup() {
    setBusy("backup");
    try {
      const data = await doBackup({});
      const blob = new Blob([data.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Backup berhasil (${data.rowCount} baris) & tersimpan di riwayat`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup gagal");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("preview");
    setResults(null);
    setPreview(null);
    try {
      const parsed = JSON.parse(await file.text());
      const res = await doPreview({
        data: { payload: parsed, mode: replace ? "replace" : "merge" },
      });
      setPayload(parsed);
      setPreview({ rows: res.rows as PreviewRow[], createdAt: res.createdAt });
      toast.success("Pratinjau siap — periksa sebelum menjalankan restore");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal membaca berkas");
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    if (!payload) return;
    if (
      replace &&
      !confirm("Mode ganti akan MENGHAPUS data lama sebelum memulihkan. Lanjutkan?")
    )
      return;
    setBusy("restore");
    try {
      const res = await doRestore({
        data: { payload, mode: replace ? "replace" : "merge" },
      });
      setResults(res.results);
      setPreview(null);
      setPayload(null);
      toast.success("Restore selesai");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore gagal");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveSchedule() {
    try {
      await storeSettings({
        data: {
          is_enabled: enabled,
          frequency: freq,
          day_of_week: dow,
          hour_local: hour,
          keep_last: keep,
        },
      });
      toast.success("Jadwal backup disimpan");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan jadwal");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Backup &amp; Restore</h1>
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin/backup/riwayat">
            <History className="h-4 w-4" /> Riwayat Backup
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Cadangan mencakup profil, obat, pengukuran, skrining, logbook, konsultasi, dan edukasi.
        Akun login (email &amp; password) tidak termasuk.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <DatabaseBackup className="h-4 w-4 text-primary" /> Buat Backup Manual
          </div>
          <p className="text-sm text-muted-foreground">
            Berkas diunduh ke perangkat Anda sekaligus disimpan di riwayat backup.
          </p>
          <Button onClick={onBackup} disabled={busy !== null}>
            <Download className="h-4 w-4" />
            {busy === "backup" ? "Menyiapkan..." : "Buat & Unduh Backup"}
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 text-primary" /> Backup Otomatis Terjadwal
          </div>
          <div className="flex items-center gap-2">
            <Switch id="auto" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="auto" className="text-sm">
              Aktifkan backup otomatis
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Frekuensi</Label>
              <Select value={freq} onValueChange={(v) => setFreq(v as "daily" | "weekly")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Harian</SelectItem>
                  <SelectItem value="weekly">Mingguan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Jam (WIB)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                className="h-9"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              />
            </div>
            {freq === "weekly" && (
              <div className="space-y-1">
                <Label className="text-xs">Hari</Label>
                <Select value={String(dow)} onValueChange={(v) => setDow(Number(v))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Simpan maks. backup</Label>
              <Input
                type="number"
                min={1}
                max={90}
                className="h-9"
                value={keep}
                onChange={(e) => setKeep(Number(e.target.value))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Terakhir berjalan: {lastRun ? new Date(lastRun).toLocaleString("id-ID") : "belum pernah"}
          </p>
          <Button size="sm" onClick={onSaveSchedule}>
            Simpan Jadwal
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 font-medium">
          <Upload className="h-4 w-4 text-primary" /> Pulihkan Data
        </div>
        <div className="flex items-center gap-2">
          <Switch id="replace" checked={replace} onCheckedChange={setReplace} />
          <Label htmlFor="replace" className="text-sm">
            Ganti data lama (hapus dulu)
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Tanpa opsi ini, data digabung: baris dengan ID sama akan diperbarui.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={onFile}
        />
        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Eye className="h-4 w-4" />
          {busy === "preview" ? "Menganalisis..." : "Pilih Berkas & Pratinjau"}
        </Button>

        {preview && (
          <div className="space-y-3">
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-xs">
                  <tr>
                    <th className="p-2 text-left">Tabel</th>
                    <th className="p-2 text-right">Di berkas</th>
                    <th className="p-2 text-right">Saat ini</th>
                    <th className="p-2 text-right">Ditimpa</th>
                    <th className="p-2 text-right">Baru</th>
                    <th className="p-2 text-right">Dihapus</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.table} className="border-t">
                      <td className="p-2 font-medium">{r.table}</td>
                      <td className="p-2 text-right">{r.incoming}</td>
                      <td className="p-2 text-right">{r.current}</td>
                      <td className="p-2 text-right text-amber-600">{r.overwrite}</td>
                      <td className="p-2 text-right text-emerald-600">{r.added}</td>
                      <td className="p-2 text-right text-destructive">{r.removed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Berkas dibuat:{" "}
              {preview.createdAt ? new Date(preview.createdAt).toLocaleString("id-ID") : "—"} · Mode:{" "}
              {replace ? "ganti data lama" : "gabung"}
            </p>
            <div className="flex gap-2">
              <Button onClick={onRestore} disabled={busy !== null}>
                {busy === "restore" ? "Memulihkan..." : "Jalankan Restore"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setPreview(null);
                  setPayload(null);
                }}
              >
                Batal
              </Button>
            </div>
          </div>
        )}

        {results && (
          <div className="rounded-lg border divide-y">
            {Object.entries(results).map(([t, msg]) => (
              <div key={t} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{t}</span>
                <span className="text-muted-foreground">{msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
