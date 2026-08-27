import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errMsg } from "@/lib/auth-errors";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { createScreeningAccounts } from "@/lib/screening-accounts.functions";
import { DEFAULT_SCREENING_PASSWORD } from "@/lib/account-email";

export const Route = createFileRoute("/_authenticated/admin/skrining")({
  component: SkriningAdmin,
});

type Row = {
  id: string;
  respondent_code: string;
  full_name: string;
  gender: string;
  age: number | null;
  sistolik: number | null;
  diastolik: number | null;
  asam_urat: number | null;
  kolesterol: number | null;
  gula_darah: number | null;
  email: string | null;
  phone_number: string | null;
  login_email: string | null;
  login_password: string | null;
  user_id: string | null;
};

const SELECT =
  "id, respondent_code, full_name, gender, age, sistolik, diastolik, asam_urat, kolesterol, gula_darah, email, phone_number, login_email, login_password, user_id";

function SkriningAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [pw, setPw] = useState(DEFAULT_SCREENING_PASSWORD);
  const [busy, setBusy] = useState<string | null>(null);
  const makeAccounts = useServerFn(createScreeningAccounts);

  function load() {
    supabase
      .from("health_screenings")
      .select(SELECT)
      .order("respondent_code")
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }
  useEffect(load, []);

  async function saveField(id: string, field: "email" | "phone_number", value: string) {
    const { error } = await supabase
      .from("health_screenings")
      .update({ [field]: value || null } as never)
      .eq("id", id);
    if (error) toast.error(errMsg(error));
  }

  async function generate(ids: string[] | null, key: string) {
    setBusy(key);
    try {
      const res = await makeAccounts({ data: { ids, password: pw } });
      toast.success(`Akun dibuat: ${res.created}, diperbarui: ${res.updated}`);
      if (res.skipped.length > 0) toast.warning(`Dilewati: ${res.skipped.join("; ")}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Gagal membuat akun");
    } finally {
      setBusy(null);
    }
  }

  const filtered = rows.filter(
    (r) =>
      !q ||
      r.full_name.toLowerCase().includes(q.toLowerCase()) ||
      r.respondent_code.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Data Cek Kesehatan</h1>
        <span className="text-sm text-muted-foreground">{rows.length} responden</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari nama atau kode..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Password seragam</label>
          <Input className="w-48" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button onClick={() => generate(null, "all")} disabled={busy !== null}>
          {busy === "all" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="mr-2 h-4 w-4" />
          )}
          Buatkan akun semua
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-left">
            <tr>
              <th className="p-3 font-medium">Kode</th>
              <th className="p-3 font-medium">Nama</th>
              <th className="p-3 font-medium">JK</th>
              <th className="p-3 font-medium">Umur</th>
              <th className="p-3 font-medium">Tensi</th>
              <th className="p-3 font-medium">Asam Urat</th>
              <th className="p-3 font-medium">Kolesterol</th>
              <th className="p-3 font-medium">Gula Darah</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">No. WA/HP</th>
              <th className="p-3 font-medium">Akun</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="p-3 text-muted-foreground">{r.respondent_code}</td>
                <td className="p-3 font-medium">{r.full_name}</td>
                <td className="p-3">{r.gender === "male" ? "L" : "P"}</td>
                <td className="p-3">{r.age ?? "—"}</td>
                <td className="p-3">
                  {r.sistolik && r.diastolik ? `${r.sistolik}/${r.diastolik}` : "—"}
                </td>
                <td className="p-3">{r.asam_urat ?? "—"}</td>
                <td className="p-3">{r.kolesterol ?? "—"}</td>
                <td className="p-3">{r.gula_darah ?? "—"}</td>
                <td className="p-2">
                  <Input
                    className="h-8 w-44"
                    defaultValue={r.email ?? ""}
                    placeholder="email (opsional)"
                    onBlur={(e) => saveField(r.id, "email", e.target.value.trim())}
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8 w-36"
                    defaultValue={r.phone_number ?? ""}
                    placeholder="08xxxxxxxxxx"
                    onBlur={(e) => saveField(r.id, "phone_number", e.target.value.trim())}
                  />
                </td>
                <td className="p-2">
                  {r.user_id ? (
                    <div className="text-xs">
                      <p className="font-medium">{r.login_email}</p>
                      <p className="text-muted-foreground">Password: {r.login_password}</p>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => generate([r.id], r.id)}
                    >
                      {busy === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Buat akun"
                      )}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-muted-foreground">
                  Tidak ada data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
