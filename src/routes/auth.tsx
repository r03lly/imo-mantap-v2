import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserRole } from "@/hooks/use-auth";
import { ensureStaffAccounts } from "@/lib/bootstrap.functions";
import { ensurePatientRecord } from "@/lib/ensure-patient.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Disclaimer } from "@/components/Disclaimer";
import { toLoginEmail, phoneToEmail, normalizePhone } from "@/lib/account-email";
import { errMsg } from "@/lib/auth-errors";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Masuk / Daftar — IMO MANTAP" }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");

  // Pastikan akun admin & apoteker selalu tersedia (mis. setelah project di-remix)
  useEffect(() => {
    const KEY = "imo-staff-bootstrap";
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
    void ensureStaffAccounts().catch(() => {});
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const role = await fetchUserRole(data.session.user.id);
        nav({ to: roleHome(role), replace: true });
      }
    });
  }, [nav]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPw, setLoginPw] = useState("");

  const [regMethod, setRegMethod] = useState<"email" | "phone">("email");
  const [regEmail, setRegEmail] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regError, setRegError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(loginEmail),
      password: loginPw,
    });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    let role = await fetchUserRole(data.user.id);
    if (!role) {
      await ensurePatientRecord({ data: { userId: data.user.id } }).catch(() => {});
      role = await fetchUserRole(data.user.id);
    }
    toast.success("Selamat datang!");
    nav({ to: roleHome(role), replace: true });
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError(null);

    if (regMethod === "phone") {
      const digits = normalizePhone(regPhone);
      if (digits.length < 10 || digits.length > 15) {
        setRegError("Nomor HP tidak valid. Contoh: 081234567890.");
        return;
      }
      setLoading(true);
      const taken = await identifierTaken(phoneToEmail(regPhone));
      if (taken) {
        setLoading(false);
        setRegError("Nomor HP ini sudah terdaftar. Silakan masuk, atau minta admin bila lupa password.");
        return;
      }
    } else {
      setLoading(true);
      const taken = await identifierTaken(regEmail.trim().toLowerCase());
      if (taken) {
        setLoading(false);
        setRegError("Email ini sudah terdaftar. Silakan masuk.");
        return;
      }
    }
    const redirectUrl = `${window.location.origin}/`;
    const commonOptions = {
      emailRedirectTo: redirectUrl,
      data: {
        full_name: regName,
        phone_number: regMethod === "phone" ? regPhone : "",
        role: "pasien",
      },
    };
    const { data, error } = await supabase.auth.signUp({
      email: regMethod === "email" ? regEmail.trim() : phoneToEmail(regPhone),
      password: regPw,
      options: {
        ...commonOptions,
        data: { ...commonOptions.data, phone_number: regPhone },
      },
    });
    setLoading(false);
    if (error) {
      const m = errMsg(error);
      setRegError(m);
      return toast.error(m);
    }
    // Buat profil + role pasien (tidak ada trigger di sisi auth)
    if (data.user) {
      await ensurePatientRecord({
        data: {
          userId: data.user.id,
          fullName: regName,
          phone: regMethod === "phone" ? regPhone : "",
        },
      }).catch(() => {});
    }

    // Jangan langsung masuk — arahkan pengguna ke tab "Masuk"
    if (data.session) await supabase.auth.signOut();
    const identifier = regMethod === "email" ? regEmail.trim() : regPhone.trim();
    setLoginEmail(identifier);
    setLoginPw("");
    setRegPw("");
    setTab("login");
    toast.success("Pendaftaran berhasil, silakan masuk");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">IMO MANTAP</span>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Masuk</TabsTrigger>
              <TabsTrigger value="register">Daftar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="le">Email atau No. HP</Label>
                  <Input
                    id="le"
                    type="text"
                    placeholder="nama@email.com atau 08xxxxxxxxxx"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="lp">Password</Label>
                  <Input
                    id="lp"
                    type="password"
                    required
                    value={loginPw}
                    onChange={(e) => setLoginPw(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Memproses..." : "Masuk"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Lupa password? Hubungi admin/apoteker untuk mengatur ulang password akun Anda.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="rn">Nama Lengkap</Label>
                  <Input
                    id="rn"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Daftar menggunakan</Label>
                  <div className="mt-1 grid grid-cols-2 gap-2 rounded-md bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => setRegMethod("email")}
                      className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                        regMethod === "email" ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegMethod("phone")}
                      className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                        regMethod === "phone" ? "bg-background shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      No. HP
                    </button>
                  </div>
                </div>
                {regMethod === "email" ? (
                  <div>
                    <Label htmlFor="re">Email</Label>
                    <Input
                      id="re"
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="rphone">No. HP (WhatsApp)</Label>
                    <Input
                      id="rphone"
                      type="tel"
                      inputMode="tel"
                      placeholder="08xxxxxxxxxx"
                      required
                      pattern="[0-9+\-\s]{8,20}"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Contoh: 081234567890. Nomor ini juga dipakai untuk masuk.
                    </p>
                  </div>
                )}
                <div>
                  <Label htmlFor="rp">Password (min. 6 karakter)</Label>
                  <Input
                    id="rp"
                    type="password"
                    minLength={6}
                    required
                    value={regPw}
                    onChange={(e) => setRegPw(e.target.value)}
                  />
                </div>
                {regError && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {regError}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Memproses..." : "Daftar"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Akun baru perlu diverifikasi oleh apoteker sebelum dapat digunakan sepenuhnya.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>

        <Disclaimer />
      </div>
    </div>
  );
}

async function identifierTaken(email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("login_identifier_exists", { _email: email });
  if (error) return false;
  return Boolean(data);
}

function roleHome(role: string | null): "/pasien" | "/apoteker" | "/admin" {
  if (role === "apoteker") return "/apoteker";
  if (role === "admin") return "/admin";
  return "/pasien";
}
