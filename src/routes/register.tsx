import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { claimReferral } from "@/lib/server/affiliate";

type Search = { ref?: string };

export const Route = createFileRoute("/register")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
  component: Register,
});

function Register() {
  const nav = useNavigate();
  const { ref: refQ } = Route.useSearch();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [refCode, setRefCode] = useState(refQ ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (refQ) {
      setRefCode(refQ);
      try {
        localStorage.setItem("vertex_ref", refQ);
      } catch {
        /* ignore */
      }
    } else {
      try {
        const saved = localStorage.getItem("vertex_ref");
        if (saved) setRefCode(saved);
      } catch {
        /* ignore */
      }
    }
  }, [refQ]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await authClient.signUp.email({ email, password, name: name || email.split("@")[0] });
      if (error) throw new Error(error.message ?? "Đăng ký thất bại");
      const code = refCode.trim();
      if (code) {
        try {
          await claimReferral({ data: { code } });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Mã giới thiệu không hợp lệ");
        }
      }
      toast.success("Tài khoản đã tạo");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng ký thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 surface-grid">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6">
        <Logo />
        <h1 className="mt-4 text-xl font-semibold">Đăng ký</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tạo tài khoản bằng email</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Tên hiển thị</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Mật khẩu (tối thiểu 8 ký tự)</Label>
            <Input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref">Mã giới thiệu (không bắt buộc)</Label>
            <Input
              id="ref"
              value={refCode}
              onChange={(e) => setRefCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="font-mono tracking-widest"
            />
          </div>
          <Button className="w-full" disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo tài khoản"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link to="/login" className="text-foreground">
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}
