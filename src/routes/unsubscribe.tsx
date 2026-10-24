import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

/** One-click email unsubscribe — works WITHOUT login (ePrivacy/CAN-SPAM).
 *  Linked from every email footer as /unsubscribe?token=… */
export const Route = createFileRoute("/unsubscribe")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === "string" && s.token ? s.token : undefined }),
  head: () => ({ meta: [{ title: "Unsubscribe — Courtship" }] }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { t } = useI18n();
  const { token } = Route.useSearch();
  const [state, setState] = useState<"working" | "done" | "fail">("working");

  useEffect(() => {
    void (async () => {
      if (!token) { setState("fail"); return; }
      const { data, error } = await (supabase as any).rpc("unsubscribe_email", { _token: token });
      setState(!error && data === true ? "done" : "fail");
    })();
  }, [token]);

  return (
    <div className="terry-bg min-h-screen flex items-center justify-center px-6 py-10 font-body text-[var(--ink)]">
      <div className="ccard w-full max-w-md p-7 space-y-4 text-center">
        <div className="text-4xl">{state === "done" ? "📭" : state === "fail" ? "🤔" : "⏳"}</div>
        <h1 className="font-display text-3xl">{t("unsub.title")}</h1>
        <p className="font-semibold">
          {state === "working" ? t("unsub.working") : state === "done" ? t("unsub.done") : t("unsub.fail")}
        </p>
        <Link to="/" className="cbtn cbtn-ghost w-full">{t("unsub.home")}</Link>
      </div>
    </div>
  );
}
