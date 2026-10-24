import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { fetchMyTier, type MemberTier } from "@/lib/membership";

/** On /me: a member sees a gold thank-you; everyone else sees a short teaser
 *  that links to /plans, where the full plan details + payment live. */
export function MembershipCard() {
  const { t, lang } = useI18n();
  const [tier, setTier] = useState<MemberTier>(null);
  const [since, setSince] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      const uid = u.user?.id;
      if (!uid) { setLoaded(true); return; }
      const mt = await fetchMyTier(uid);
      setTier(mt.tier);
      setSince(mt.since);
      try {
        const { data } = await (supabase as any).from("profiles").select("member_until").eq("id", uid).maybeSingle();
        setUntil(data?.member_until ?? null);
      } catch { /* pre-SQL */ }
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return null;

  if (tier) {
    const fmt = (d: string) => new Date(d).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
    return (
      <div className="ccard p-4 text-center space-y-1" style={{ background: "var(--green-pop)" }}>
        <div className="text-3xl">🏆</div>
        <div className="font-display text-xl leading-tight">{tier === "pro" ? t("mem.thanks_pro") : t("mem.thanks_title")}</div>
        <div className="text-sm font-semibold">{since ? t("mem.thanks_since", { date: fmt(since) }) : t("mem.thanks_sub")}</div>
        {until && (
          <div className="text-xs font-extrabold" style={{ color: "var(--wood, #8a6d3b)" }}>{t("mem.until", { date: fmt(until) })}</div>
        )}
      </div>
    );
  }

  return (
    <Link to="/plans" className="ccard p-4 flex items-center gap-3 no-underline" style={{ borderColor: "var(--coral)" }}>
      <span className="text-3xl shrink-0">🏆</span>
      <div className="flex-1 min-w-0">
        <div className="font-display text-lg leading-tight">{t("mem.teaser_title")}</div>
        <div className="text-xs font-semibold" style={{ opacity: 0.6 }}>{t("mem.teaser_sub")}</div>
      </div>
      <span className="text-2xl shrink-0" style={{ opacity: 0.4 }}>›</span>
    </Link>
  );
}
