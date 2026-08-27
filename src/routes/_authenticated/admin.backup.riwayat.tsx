import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download, Trash2, RefreshCw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listBackups,
  getBackupDownloadUrl,
  deleteBackup,
  restoreFromRecord,
} from "@/lib/admin-backup.functions";

export const Route = createFileRoute("/_authenticated/admin/backup/riwayat")({
  component: BackupHistory,
  head: () => ({
    meta: [
      { title: "Riwayat Backup — IMO MANTAP Admin" },
      {
        name: "description",
        content:
          "Daftar seluruh backup data IMO MANTAP lengkap dengan tanggal, ukuran berkas, dan jumlah record.",
      },
      { property: "og:title", content: "Riwayat Backup — IMO MANTAP Admin" },
      {
        property: "og:description",
        content: "Lihat, unduh, dan hapus backup data IMO MANTAP yang pernah dibuat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type BackupItem = {
  id: string;
  file_name: string;
  source: string;
  size_bytes: number;
  total_rows: number;
  table_counts: Record<string, number>;
  note: string | null;
  created_at: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}

function BackupHistory() {
  const fetchList = useServerFn(listBackups);
  const fetchUrl = useServerFn(getBackupDownloadUrl);
  const doDelete = useServerFn(deleteBackup);
  const doRestore = useServerFn(restoreFromRecord);

  const [items, setItems] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchList({ data: undefined } as never);
      setItems((res.items ?? []) as BackupItem[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memuat riwayat backup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetchUrl({ data: { id } });
      window.open(res.url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal mengunduh backup");
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (id: string, fileName: string) => {
    const replace = window.confirm(
      `Pulihkan data dari ${fileName}?\n\nOK = MODE GANTI (data saat ini dihapus lalu diganti isi backup)\nBatal = pilih mode gabung`,
    );
    if (!replace) {
      const merge = window.confirm(
        "Gunakan mode gabung? Data backup ditambahkan/diperbarui tanpa menghapus data baru.",
      );
      if (!merge) return;
    }
    setBusyId(id);
    try {
      const res = await doRestore({ data: { id, mode: replace ? "replace" : "merge" } });
      toast.success(`Restore selesai dari ${res.fileName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore gagal");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Hapus backup ini secara permanen?")) return;
    setBusyId(id);
    try {
      await doDelete({ data: { id } });
      toast.success("Backup dihapus");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus backup");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Riwayat Backup</h1>
          <p className="text-sm text-muted-foreground">
            Daftar backup manual dan otomatis yang tersimpan di penyimpanan aman. Semua data entri admin, apoteker, dan pasien (termasuk akun) dapat dipulihkan langsung dari sini.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/admin/backup">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Memuat…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Belum ada backup tersimpan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Tanggal (WIB)</th>
                  <th className="p-3">Berkas</th>
                  <th className="p-3">Sumber</th>
                  <th className="p-3 text-right">Ukuran</th>
                  <th className="p-3 text-right">Record</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="p-3 whitespace-nowrap">{formatDate(it.created_at)}</td>
                    <td className="p-3 font-mono text-xs break-all">{it.file_name}</td>
                    <td className="p-3">
                      <span className="rounded-full border px-2 py-0.5 text-xs">
                        {it.source === "auto" ? "Otomatis" : "Manual"}
                      </span>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">{formatSize(it.size_bytes)}</td>
                    <td className="p-3 text-right">{it.total_rows.toLocaleString("id-ID")}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === it.id}
                          onClick={() => void handleDownload(it.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busyId === it.id}
                          title="Pulihkan data dari backup ini"
                          onClick={() => void handleRestore(it.id, it.file_name)}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busyId === it.id}
                          onClick={() => void handleDelete(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
