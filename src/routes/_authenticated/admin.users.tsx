import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { KeyRound, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetUserPassword } from "@/lib/admin-users.functions";
import { errMsg } from "@/lib/auth-errors";
import { getPatientDirectory } from "@/lib/patient-directory.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersAdmin,
});

type Row = {
  user_id: string;
  full_name: string | null;
  phone_number: string | null;
  is_verified: boolean | null;
  role: string;
  login_email?: string | null;
  login_password?: string | null;
};

function UsersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [resetTarget, setResetTarget] = useState<Row | null>(null);
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitReset() {
    if (!resetTarget) return;
    if (newPw.trim().length < 6) return toast.error("Password minimal 6 karakter.");
    setSaving(true);
    try {
      await resetUserPassword({ data: { userId: resetTarget.user_id, newPassword: newPw.trim() } });
      toast.success(`Password ${resetTarget.full_name || "pengguna"} berhasil diatur ulang.`);
      setResetTarget(null);
      setNewPw("");
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function load() {
    try {
      const users = await getPatientDirectory();
      setRows(
        users.map((user) => ({
          ...user,
          login_email: null,
          login_password: null,
        })),
      );
    } catch (error) {
      toast.error(`Gagal memuat akun: ${errMsg(error)}`);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function changeRole(user_id: string, newRole: string) {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("user_roles").delete().eq("user_id", user_id);
    const { error } = await supabase.from("user_roles").insert({ user_id, role: newRole as any });
    if (error) return toast.error(errMsg(error));
    await supabase
      .from("system_audit_logs")
      .insert({
        user_id: u.user?.id,
        action: "change_role",
        table_name: "user_roles",
        record_id: user_id,
        new_data: { role: newRole } as any,
      });
    toast.success("Role diperbarui");
    load();
  }

  const filtered = rows.filter(
    (r) => !q || (r.full_name ?? "").toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <h1 className="text-2xl font-bold">Manajemen Users</h1>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Cari nama..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="rounded-xl border bg-card divide-y">
        {filtered.map((r) => (
          <div key={r.user_id} className="p-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{r.full_name || "(tanpa nama)"}</p>
              <p className="text-xs text-muted-foreground">
                {r.phone_number || "—"} · {r.is_verified ? "Verified" : "Belum verifikasi"}
              </p>
              {r.login_email && (
                <p className="mt-1 text-xs">
                  <span className="text-muted-foreground">Login:</span> {r.login_email}
                  <span className="text-muted-foreground"> · Password:</span>{" "}
                  <span className="font-mono">
                    {shown[r.user_id] ? r.login_password : "••••••••"}
                  </span>
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => setShown((s) => ({ ...s, [r.user_id]: !s[r.user_id] }))}
                  >
                    {shown[r.user_id] ? "Sembunyikan" : "Lihat"}
                  </button>
                  <button
                    type="button"
                    className="ml-2 underline"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${r.login_email} / ${r.login_password ?? ""}`,
                      );
                      toast.success("Disalin");
                    }}
                  >
                    Salin
                  </button>
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => {
                  setResetTarget(r);
                  setNewPw("");
                }}
              >
                <KeyRound className="mr-1 h-3.5 w-3.5" /> Reset password
              </Button>
              <Select value={r.role} onValueChange={(v) => changeRole(r.user_id, v)}>
                <SelectTrigger className="w-32 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pasien">Pasien</SelectItem>
                  <SelectItem value="apoteker">Apoteker</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">Tidak ada user.</p>
        )}
      </div>

      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Atur password baru untuk {resetTarget?.full_name || "pengguna ini"}
              {resetTarget?.phone_number ? ` (${resetTarget.phone_number})` : ""}. Sampaikan
              password baru kepada pengguna secara pribadi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              type="text"
              placeholder="Password baru (min. 6 karakter)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button
              type="button"
              className="text-xs underline text-muted-foreground"
              onClick={() => setNewPw(Math.random().toString(36).slice(2, 10))}
            >
              Buat password acak
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={submitReset} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
