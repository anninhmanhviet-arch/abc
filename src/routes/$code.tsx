import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { peekReferral } from "@/lib/server/affiliate";

export const Route = createFileRoute("/$code")({ component: RefLanding });

function RefLanding() {
  const { code } = Route.useParams();
  const nav = useNavigate();

  useEffect(() => {
    let live = true;
    const raw = code.trim();
    peekReferral({ data: { code: raw } })
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          try {
            localStorage.setItem("vertex_ref", r.code);
          } catch {
            /* ignore */
          }
          nav({ to: "/register", search: { ref: r.code } });
        } else {
          nav({ to: "/" });
        }
      })
      .catch(() => {
        if (live) nav({ to: "/" });
      });
    return () => {
      live = false;
    };
  }, [code, nav]);

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <p className="text-sm text-muted-foreground">Đang mở link giới thiệu…</p>
    </main>
  );
}
