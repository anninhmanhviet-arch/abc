import { createFileRoute } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { vnd } from "@/lib/format";
import { claimReferral, getMyAffiliate } from "@/lib/server/affiliate";

export const Route = createFileRoute("/affiliate")({ component: AffiliatePage });

function AffiliatePage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getMyAffiliate>> | null>(null);
  const [code, setCode] = useState("");
  useEffect(() => {
    getMyAffiliate().then(setData).catch((e) => toast.error(e instanceof Error ? e.message : "Lỗi"));
  }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = data?.code ? `${origin}/${data.code}` : "";

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã sao chép");
    } catch {
      toast.error("Không sao chép được");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <h1 className="text-xl font-semibold">Affiliate</h1>
        <p className="text-sm text-muted-foreground">
          Chia sẻ <strong>mã 6 ký tự</strong> hoặc <strong>link</strong>. Khi bạn bè đăng ký và nạp thành công, bạn nhận{" "}
          <span className="text-foreground">{data?.rate ?? 10}%</span> hoa hồng vào số dư.
        </p>
        {!data?.enabled && (
          <p className="rounded-md border border-warn/40 bg-warn/10 p-3 text-sm">Chương trình đang tạm tắt.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Bạn bè</div>
              <div className="mt-1 font-mono text-xl tabular">{data?.friends ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Tổng hoa hồng</div>
              <div className="mt-1 font-mono text-xl tabular text-up">{vnd(data?.earned ?? 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Tỷ lệ của bạn</div>
              <div className="mt-1 font-mono text-xl tabular">{data?.rate ?? 10}%</div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-4">
          <Label>Mã affiliate</Label>
          <div className="flex gap-2">
            <Input readOnly value={data?.code ?? ""} className="font-mono tracking-widest" />
            <Button type="button" variant="outline" size="icon" onClick={() => data?.code && void copy(data.code)}>
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">6 ký tự ngẫu nhiên. Bạn bè nhập mã này khi đăng ký.</p>
          <Label>Link giới thiệu</Label>
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => link && void copy(link)}>
              <Share2 className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Dạng: domain/mã — ví dụ vertex.id.vn/{data?.code || "ABC123"}</p>
        </div>
        {!data?.referred && (
          <form
            className="space-y-2 rounded-xl border border-border p-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await claimReferral({ data: { code } });
                toast.success("Đã gắn mã giới thiệu");
                setData(await getMyAffiliate());
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Không gắn được mã");
              }
            }}
          >
            <h2 className="font-medium">Nhập mã người giới thiệu</h2>
            <p className="text-xs text-muted-foreground">Chỉ gắn được một lần.</p>
            <div className="flex gap-2">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Mã 6 ký tự" />
              <Button type="submit">Gắn mã</Button>
            </div>
          </form>
        )}
        <h2 className="text-sm font-medium text-muted-foreground">Bạn bè đã giới thiệu</h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          {(data?.rows ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">Chưa có bạn bè. Chia sẻ link để bắt đầu.</p>}
          {(data?.rows ?? []).map((r, i) => (
            <div key={i} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div>{r.name || r.email}</div>
                <div className="text-xs text-muted-foreground">{r.email} · {new Date(r.createdAt).toLocaleDateString("vi-VN")}</div>
              </div>
              <div className="font-mono text-xs text-muted-foreground">Nạp {vnd(r.deposited)}</div>
            </div>
          ))}
        </div>
        <h2 className="text-sm font-medium text-muted-foreground">Lịch sử hoa hồng</h2>
        <div className="divide-y divide-border rounded-xl border border-border">
          {(data?.commissions ?? []).length === 0 && <p className="p-4 text-sm text-muted-foreground">Chưa có hoa hồng. Hoa hồng cộng khi bạn bè được duyệt nạp.</p>}
          {(data?.commissions ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div>{c.email}</div>
                <div className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleString("vi-VN")} · {c.rate}% trên {vnd(c.baseAmount)}</div>
              </div>
              <div className="font-mono text-up">+{vnd(c.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
