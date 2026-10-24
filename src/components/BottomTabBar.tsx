import { Link, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { BallHeart } from "@/components/RailKit";
import { FLAGS } from "@/lib/flags";

type Tab = {
  to: string;
  icon: ReactNode;
  label: string;
  match: (path: string) => boolean;
  badge?: number;
};

/** Board · Players · Me, plus ONE floating "Post a game" button (2026-10
 *  crystallization). The app has a single primary action, so it is spelled
 *  out and always within thumb reach; everything else (log a game, host an
 *  event, coach, Court Crush, Lucky Serve, Leaders) lives as rows on Me.
 *  Court Crush can come back as a 4th tab with FLAGS.crushTab. */
export function BottomTabBar({ guest = false }: { guest?: boolean } = {}) {
  const navigate = useNavigate();
  const router = useRouter();
  const { t } = useI18n();
  const loc = useLocation();
  const path = loc.pathname;
  // Once the current screen is up and the phone is idle, fetch the other tabs'
  // code (a few KB each) so the first switch is instant (2026-10-24 perf).
  useEffect(() => {
    const go = () => { for (const to of ["/board", "/players", "/me"] as const) { if (!path.startsWith(to)) router.preloadRoute({ to }).catch(() => {}); } };
    const w = window as any;
    const id = typeof w.requestIdleCallback === "function" ? w.requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 2500);
    return () => { if (typeof w.cancelIdleCallback === "function") w.cancelIdleCallback(id); else clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [boardBadge, setBoardBadge] = useState(0);
  const [profileBadge, setProfileBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const { data: u } = await getUserLocal();
      if (!u.user || cancelled) return;
      const [{ data: sos }, { data: reqs }] = await Promise.all([
        (supabase as any).rpc("eligible_sos_for_me"),
        (supabase as any).from("buddy_requests").select("id", { count: "exact", head: false }).eq("to_id", u.user.id).eq("status", "pending"),
      ]);
      if (cancelled) return;
      setBoardBadge(Array.isArray(sos) ? sos.length : 0);
      setProfileBadge(Array.isArray(reqs) ? reqs.length : 0);
    }
    refresh();
    const i = setInterval(refresh, 30000);
    const ch = (supabase as any)
      .channel("tabbar")
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "buddy_requests" }, refresh)
      .subscribe();
    return () => { cancelled = true; clearInterval(i); supabase.removeChannel(ch); };
  }, []);

  const tabs: Tab[] = [
    { to: "/board", icon: "📋", label: t("tabs.board"), match: (p) => p.startsWith("/board") || p.startsWith("/rescue") || p.startsWith("/games") || p.startsWith("/sos"), badge: boardBadge },
    { to: "/players", icon: "👥", label: t("tabs.players"), match: (p) => p.startsWith("/players") || p.startsWith("/leaders") },
    ...(FLAGS.crushTab ? [{ to: "/match", icon: <BallHeart size={24} />, label: t("tabs.crush"), match: (p: string) => p.startsWith("/match") || p.startsWith("/lucky") }] : []),
    { to: "/me", icon: "🙂", label: t("tabs.profile"), match: (p) => p === "/me" || p.startsWith("/admin") || p.startsWith("/progress") || p.startsWith("/matches") || p.startsWith("/people") || p.startsWith("/settings") || p.startsWith("/help") || p.startsWith("/plans") || p.startsWith("/coach") || (!FLAGS.crushTab && (p.startsWith("/match") || p.startsWith("/lucky"))), badge: profileBadge },
  ];

  const TabItem = ({ tab }: { tab: Tab }) => {
    const active = tab.match(path);
    return (
      <li key={tab.to}>
        <Link
          to={tab.to}
          className="relative flex flex-col items-center justify-center gap-1 px-1 py-2"
          style={{ minHeight: 64, color: "var(--ink)" }}
        >
          <span aria-hidden="true" className="text-2xl" style={{ filter: active ? "none" : "grayscale(0.4)", opacity: active ? 1 : 0.85 }}>
            {tab.icon}
          </span>
          <span className="text-sm font-extrabold leading-none">{tab.label}</span>
          {tab.badge ? (
            <span
              className="absolute top-1 rounded-full px-1.5 flex items-center justify-center border-2"
              style={{ right: "calc(50% - 30px)", background: "var(--coral)", color: "var(--ink)", borderColor: "var(--ink)", minWidth: 22, height: 22, fontSize: "0.875rem", fontWeight: 800 }}
            >
              {tab.badge > 99 ? "99+" : tab.badge}
            </span>
          ) : null}
          {active && (
            <span aria-hidden="true" className="absolute left-5 right-5 bottom-0 rounded-t-full" style={{ height: 4, background: "var(--coral)" }} />
          )}
        </Link>
      </li>
    );
  };

  // The wizard itself has no FAB: one door at a time.
  const onPostScreen = path.startsWith("/sos/new") || path === "/post";

  return (
    <>
      {!onPostScreen && (
        <button
          type="button"
          aria-label={t("plus.post")}
          // Guests get the reverse funnel: fill the game form FIRST (/post),
          // sign up after — the draft publishes itself on arrival. Posting is
          // the intent; registration is just the doorstep on the way.
          onClick={() => navigate(guest ? { to: "/post" } : { to: "/sos/new", search: { planned: undefined } as any })}
          className="font-extrabold"
          /* Ink pill, cream text: obvious on every screen without spending
             the coral accent that in-page actions use (audit D-20). */
          style={{
            position: "fixed", right: 16, bottom: "calc(84px + env(safe-area-inset-bottom))", zIndex: 40,
            display: "flex", alignItems: "center", gap: 8,
            background: "var(--ink)", color: "#FFF6E8",
            border: "2px solid var(--ink)", borderRadius: 999, padding: "13px 18px 13px 15px",
            boxShadow: "4px 4px 0 rgba(43,33,24,0.25)", fontSize: 16, lineHeight: 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, marginTop: -2 }}>＋</span>
          {t("plus.post")}
        </button>
      )}
      <nav
        aria-label="Primary"
        className="shrink-0 border-t-2 border-[var(--ink)]"
        style={{ background: "var(--cream2)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className={`grid ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"} max-w-md mx-auto items-end`}>
          {tabs.map((tab) => <TabItem key={tab.to} tab={tab} />)}
        </ul>
      </nav>
    </>
  );
}
