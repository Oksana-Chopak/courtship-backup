import { BallHeart } from "@/components/RailKit";
import { Avatar } from "@/components/Avatar";
import { isStandalone } from "@/components/InstallBanner";
import { createFileRoute, Outlet, redirect, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ConsentGate } from "@/components/ConsentGate";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { ensurePushSubscribed } from "@/lib/push";
import { reportClientError } from "@/lib/health";
import { sessionGate } from "@/lib/session";
import { FLAGS } from "@/lib/flags";
import { useI18n } from "@/lib/i18n";
import { joinSearch } from "@/lib/guest";
import { peekDraftGame, publishDraftGame } from "@/lib/draftGame";
import { rememberInvite, rememberedInvite } from "@/lib/share";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

// Once we've seen this session's user has a profile, don't re-query on every nav.
let profileConfirmed = false;
// Who is signed in: the local session, never a per-navigation auth round-trip;
// a network blip keeps the member in (src/lib/session.ts, 2026-10-24).

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { user, unsure } = await sessionGate.currentUser(supabase as any);
    if (!user) {
      // Guest peek: logged-out visitors may SEE the pulse on a few pages —
      // the live board is a better landing page than any landing page.
      const path = location.pathname.replace(/\/+$/, "") || "/";
      const GUEST_PATHS = new Set(["/board", "/players", "/leaders", "/me"]);
      if (FLAGS.guestPeek && GUEST_PATHS.has(path)) return { user: null };
      // Keep the destination: a push tap on a signed-out device (or any deep
      // link) should land back on that page after auth, not on /board.
      // SIGNUP, not login: most people who hit a gated page are curious guests
      // (tapping a player, a game, Court Crush) — returning users have the
      // "I already have an account" link one tap away, and `next` survives it.
      throw redirect({ to: "/auth", search: { mode: "signup", next: location.href } });
    }
    if (!user.email_confirmed_at) {
      throw redirect({ to: "/check-email", search: { email: user.email ?? "" } });
    }
    // A confirmed user WITHOUT a profile (abandoned onboarding, then a deep-link
    // or push tap) would land on pages with a blank identity and could act with
    // no name. Send them to finish onboarding. Cached so it costs one query per
    // session, not one per navigation (a profile never un-exists). A query that
    // FAILED proves nothing — never read a network error as "no profile".
    if (!profileConfirmed && !unsure) {
      const { data: prof, error } = await supabase.from("profiles" as any).select("id").eq("id", user.id).maybeSingle();
      if (error) reportClientError("rpc", error, "shell: profile check");
      else if (!prof) throw redirect({ to: "/onboarding" });
      else profileConfirmed = true;
    }
    return { user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const loc = useLocation();
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const guest = !user;
  const mainRef = useRef<HTMLElement>(null);
  // Invite landing: /board?code=<invite>&by=<first name> (myInviteLink). The code
  // is remembered on arrival, so it still reaches signup after the guest taps a
  // game, "+ Post a game" or another tab (Lovable scan 2026-10-16).
  const sp = (loc.search ?? {}) as Record<string, unknown>;
  const urlCode = guest && typeof sp.code === "string" && sp.code ? sp.code : undefined;
  const urlBy = guest && typeof sp.by === "string" && sp.by ? sp.by.slice(0, 30) : undefined;
  useEffect(() => { if (urlCode) rememberInvite(urlCode, urlBy); }, [urlCode, urlBy]);
  // App-shell scrolls inside <main>, not the window, so the fixed-position bar
  // can't jump with the mobile toolbar/keyboard. Reset to top on each new page.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [loc.pathname]);
  // Silently (re)create the push subscription for users who already granted
  // permission — without this, a granted user can have no live subscription
  // and never receive SOS pushes.
  useEffect(() => { if (!guest) void ensurePushSubscribed(); }, [guest]);
  // Presence + install tracking (admin "who installed the shortcut", lifecycle
  // emails): one quiet ping per 6h per mode. Standalone = opened from the
  // home-screen icon. The RPC may not exist pre-SQL — errors are swallowed.
  useEffect(() => {
    if (guest) return;
    const standalone = isStandalone();
    const key = `courtship.presence.${standalone ? "app" : "web"}`;
    try {
      const last = Number(localStorage.getItem(key) || "0");
      if (Date.now() - last < 6 * 3600e3) return;
      localStorage.setItem(key, String(Date.now()));
    } catch { /* storage blocked → ping anyway */ }
    void (async () => { try { await (supabase as any).rpc("touch_presence", { _standalone: standalone }); } catch { /* pre-SQL */ } })();
  }, [guest]);
  // Reverse registration: a game drafted on /post (before the account existed)
  // publishes the moment its author lands in the authed shell — then we take
  // them straight to their live game so they can share it.
  const navigate = useNavigate();
  useEffect(() => {
    if (guest || !user || !peekDraftGame()) return;
    void publishDraftGame(user.id).then((r) => {
      if (r.id) {
        toast.success(t("post_pub.live_toast"));
        navigate({ to: "/sos/$id", params: { id: r.id } });
        return;
      }
      // Auto-publish couldn't finish — the draft is KEPT and the wizard picks
      // it up prefilled. Never let a guest's game vanish in silence (audit P0-1).
      if (r.reason === "stale") toast.warning(t("post_pub.stale_toast"));
      else if (r.reason === "failed") toast.warning(t("post_pub.failed_toast"));
      if (r.reason) navigate({ to: "/sos/new", search: { edit: undefined, planned: undefined } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, user?.id]);
  return (
    <div className="terry-bg app-shell font-body text-[var(--ink)] flex flex-col">
      <header className="border-b-2 border-[var(--ink)] bg-[var(--cream2)] shrink-0">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/board" className="font-display text-2xl flex items-center gap-2">
            <BallHeart size={26} />
            Courtship
          </Link>
        </div>
      </header>
      {guest && (() => {
        // The inviter's name makes the banner personal on every guest page, not
        // just the landing one; the code rides into signup from either source.
        const saved = urlCode ? null : rememberedInvite();
        const inviteCode = urlCode ?? saved?.code;
        const inviteBy = urlCode ? urlBy : saved?.by || undefined;
        return (
          <div className="shrink-0 border-b-2 border-[var(--ink)]" style={{ background: "var(--green-pop)" }}>
            <div className="max-w-md mx-auto px-5 py-2 flex items-center gap-2">
              {inviteBy && <Avatar src={null} name={inviteBy} seed={inviteBy} size={30} />}
              <span className="text-sm font-extrabold flex-1 leading-tight">
                {inviteBy ? t("guest.invited_by", { name: inviteBy }) : `👀 ${t("guest.banner")}`}
              </span>
              <Link to="/auth" search={{ ...joinSearch(loc.pathname), code: inviteCode } as any} className="cbtn cbtn-coral shrink-0" style={{ padding: "7px 14px", fontSize: 13 }}>
                {t("guest.join")}
              </Link>
            </div>
          </div>
        );
      })()}
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        {/* extra bottom room so the last card can scroll clear of the floating "Post a game" pill */}
        <div className="max-w-md mx-auto px-5 pt-6 pb-24">
          <RouteErrorBoundary resetKey={loc.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </div>
      </main>
      {/* Legal pack: members who haven't accepted the current Terms/Privacy
          version confirm once here (existing accounts + future version bumps). */}
      {!guest && <ConsentGate />}
      <BottomTabBar guest={guest} />
    </div>
  );
}