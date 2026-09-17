import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { vnd } from "@/lib/format";
import { getSettings, saveSettings } from "@/lib/server/admin";
import { getAdminAffiliate, setUserAffiliateRate } from "@/lib/server/affiliate";

export const Route = createFileRoute("/bode/affiliate")({ component: AffiliateAdmin });

function AffiliateAdmin() {
  const [d, setD] = useState<Awaited<ReturnType<typeof getAdminAffiliate>> | null>(null);
  const [rate, setRate] = useState("10");
  const [on, setOn] = useState(true);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});

  async function load(query?: string) {
    const r = await getAdminAffiliate({ data: { q: query ?? q } });
    setD(r);
    setRate(String(r.rate));
    setOn(r.enabled);
    const next: Record<string, string> = {};
    for (const l of r.leaders) next[l.userId] = l.customRate == null ? "" : String(l.customRate);
    setDraft(next);
  }

  useEffect(() => {
    load("").catch((e) => toast.error(String(e)));
  }, []);

  return (
    <AdminShell>
      <h1 className="mb-4 text-xl font-semibold">Affiliate</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Mã affiliate là <strong>6 ký tự ngẫu nhiên</strong>. Link: <span className="font-mono">domain/MÃ</span>.
        Hoa hồng tính trên nạp được duyệt. Có thể hạ % cho tất cả hoặc từng user (để trống = dùng % chung).
      </p>
      <div className="grid max-w-lg gap-3 rounded-xl border border-border p-4">
        <div className="space-y-1.5">
          <Label>% hoa hồng mặc định (tất cả user)</Label>
          <Input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Bật chương trình</Label>
          <Switch checked={on} onCheckedChange={setOn} />
        </div>
        <Button
          onClick={async () => {
            const cur = await getSettings();
            await saveSettings({
              data: { ...cur, affiliate_rate: rate, affiliate_enabled: on ? "true" : "false" },
            });
            toast.success("Đã lưu % chung");
            await load();
          }}
        >
          Lưu % chung
        </Button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Tổng đã trả HH</div><div className="font-mono text-xl">{vnd(d?.paid ?? 0)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">User</div><div className="font-mono text-xl">{d?.leaders.length ?? 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">% mặc định</div><div className="font-mono text-xl">{d?.rate ?? 0}%</div></CardContent></Card>
      </div>
      <form
        className="mt-6 flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load().catch((err) => toast.error(String(err)));
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm email / mã affiliate" />
        <Button type="submit" variant="outline">Tìm</Button>
      </form>
      <h2 className="mt-6 mb-2 text-sm font-medium">% từng user</h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Mã</th>
              <th className="p-2">Bạn bè</th>
              <th className="p-2">Đã nhận</th>
              <th className="p-2">% riêng</th>
              <th className="p-2">% thực</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {(d?.leaders ?? []).map((l) => (
              <tr key={l.userId} className="border-t border-border">
                <td className="p-2">
                  <Link to="/bode/users/$userId" params={{ userId: l.userId }} className="hover:underline">{l.email}</Link>
                </td>
                <td className="p-2 font-mono">{l.code || "—"}</td>
                <td className="p-2 font-mono">{l.friends}</td>
                <td className="p-2 font-mono text-up">{vnd(l.earned)}</td>
                <td className="p-2">
                  <Input
                    className="h-8 w-20"
                    placeholder={`${d?.rate ?? 10}`}
                    value={draft[l.userId] ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [l.userId]: e.target.value.replace(/[^\d.]/g, "") }))}
                  />
                </td>
                <td className="p-2 font-mono">{l.effectiveRate}%</td>
                <td className="p-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const raw = (draft[l.userId] ?? "").trim();
                      const next = raw === "" ? null : Math.max(0, Math.min(100, Number(raw)));
                      if (raw !== "" && !Number.isFinite(next)) {
                        toast.error("Số không hợp lệ");
                        return;
                      }
                      await setUserAffiliateRate({ data: { userId: l.userId, rate: next } });
                      toast.success(next == null ? "Dùng % chung" : `Đặt ${next}%`);
                      await load();
                    }}
                  >
                    Lưu
                  </Button>
                </td>
              </tr>
            ))}
            {(d?.leaders ?? []).length === 0 && (
              <tr><td className="p-3 text-muted-foreground" colSpan={7}>Không có user.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Ô % riêng để trống rồi Lưu = quay về % mặc định. Đặt 0 = không trả hoa hồng user đó.</p>
      <h2 className="mt-8 mb-2 text-sm font-medium">Hoa hồng gần đây</h2>
      <div className="divide-y divide-border rounded-xl border border-border text-sm">
        {(d?.recent ?? []).map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <div>{r.referrer} ← {r.referee}</div>
              <div className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("vi-VN")} · {r.rate}% × {vnd(r.baseAmount)}</div>
            </div>
            <div className="font-mono text-up">+{vnd(r.amount)}</div>
          </div>
        ))}
        {(d?.recent ?? []).length === 0 && <p className="p-4 text-muted-foreground">Chưa phát sinh hoa hồng.</p>}
      </div>
    </AdminShell>
  );
}
