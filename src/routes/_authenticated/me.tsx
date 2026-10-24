import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { Avatar } from "@/components/Avatar";
import { SeasonPanel } from "@/components/SeasonPanel";
import { RF } from "@/components/RailKit";
import { MembershipCard } from "@/components/MembershipCard";
import { MyEvents } from "@/components/MyEvents";
import { CourtsPassport } from "@/components/CourtsPassport";
import { levelMeta, vibeEmoji } from "@/lib/courtship";
import { joinSearch } from "@/lib/guest";
import { FLAGS } from "@/lib/flags";

export const Route = createFileRoute("/_authenticated/me")({
  head: () => ({ meta: [{ title: "Profile — Courtship" }] }),
  component: MePage,
});

function MePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [profile, setProfile] = useState<{ name: string; photo_url: string | null; level: number; vibe: string; member_tier: string | null } | null>(null);
  const [gamesPlayed, setGamesPlayed] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      const uid = u.user?.id;
      if (!uid) { setGuest(true); return; }
      setUid(uid);
      const profRes = await (supabase as any).rpc("get_my_full_profile").maybeSingle().then((r: any) => r, () => null);
      const data = (profRes as any)?.data;
      if (!data) { navigate({ to: "/onboarding" }); return; }
      const d = data as any;
      setProfile({ name: d.name ?? "", photo_url: d.photo_url ?? null, level: d.level ?? 3, vibe: d.vibe ?? "friendly", member_tier: d.member_tier ?? null });
      setGamesPlayed(d.games_played ?? 0);
    })();
  }, [navigate]);

  if (guest) {
    // Guest demo: show what a season looks like + one big join CTA.
    return (
      <div className="space-y-4">
        <div className="ccard p-4 text-center space-y-1">
          <div className="text-4xl">🎾</div>
          <div className="font-display text-2xl leading-tight">{t("guest.me_title")}</div>
          <div className="text-sm font-semibold text-[var(--ink)]/75">{t("guest.me_sub")}</div>
        </div>
        <div className="ccard p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔥</span>
              <span className="font-display text-3xl">3</span>
              <span className="font-extrabold text-xs leading-tight" style={{ color: "var(--wood, #8a6d3b)" }}>{t("prog.week_streak")}</span>
            </div>
            <span className="font-extrabold text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--green-pop)", border: "1px solid var(--ink)" }}>{t("streak.safe")}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {[["🎾", t("prog.track_activity")], ["🚑", t("prog.track_rescuer")], ["🤝", t("prog.track_recruiter")], ["🎪", t("prog.track_matchmaker")]].map(([e, l]) => (
              <div key={l as string} className="flex flex-col items-center gap-1">
                <div className="flex items-center justify-center rounded-full" style={{ width: 52, height: 52, background: "var(--cream2)", border: "2px solid var(--ink)" }}>
                  <span style={{ fontSize: 24 }}>{e}</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: "var(--wood, #8a6d3b)" }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <Link to="/auth" search={joinSearch("/me")} className="cbtn cbtn-coral w-full text-center block">{t("guest.me_cta")}</Link>
      </div>
    );
  }

  if (!profile || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  }

  const lm = levelMeta(profile.level);

  return (
    <div className="space-y-4">
      {/* Identity card — the WHOLE card opens the profile (Oxy, 2026-10-05:
          "not only the gear"); the gear stays as the visual hint of where a tap leads. */}
      <Link
        to="/settings"
        className="ccard p-4 flex items-center gap-3"
        style={{ textDecoration: "none", color: "var(--ink)" }}
        aria-label={t("settings.title")}
        data-testid="me-identity"
      >
        <Avatar src={profile.photo_url} name={profile.name} seed={uid} size={64} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl leading-none truncate">{profile.name || "🎾"}{profile.member_tier ? " 🏆" : ""}</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: lm.color }} />
            <span className="font-extrabold text-sm">{t(`lvl.${profile.level}`)}</span>
            <span className="text-sm">· {vibeEmoji(profile.vibe)}</span>
          </div>
        </div>
        <span
          aria-hidden="true"
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 40, height: 40, background: "var(--cream2)", border: "2px solid var(--ink)" }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </span>
      </Link>

      {/* YOUR SEASON — right under the name, the point of the profile */}
      <SeasonPanel />

      <MembershipCard />

      {/* The organizer's sessions: date first, who's coming, who still owes the Swish */}
      {uid && <MyEvents uid={uid} />}

      {/* Matches — friends now live in the Players tab, not here */}
      <MenuRail to="/matches" emoji="🎾" bar="#C9EE3F" bg="#EEF6D6" title={t("matches.title")} sub={t("menu.matches_sub", { n: gamesPlayed })} />
      <MenuRail to="/matches" search={{ log: true }} emoji="✅" bar="#C9EE3F" bg="#EEF6D6" title={t("plus.log")} sub={t("plus.log_sub")} />

      {/* Everything that used to crowd the tab bar and the "+" sheet (2026-10
          crystallization): still one tap away, just not in the way. */}
      <div className="csection-label pt-1">{t("menu.more")}</div>
      <MenuRail to="/events/new" emoji="🎪" bar="#8C5A33" bg="#F1E7DC" title={t("plus.host")} sub={t("plus.host_sub")} />
      {FLAGS.swipeDeck && <MenuRail to="/match" emoji="💘" bar="#F0705B" bg="#FCE9E4" title={t("match.title")} sub={t("menu.crush_sub")} />}
      {FLAGS.luckyServe && <MenuRail to="/lucky" emoji="🎰" bar="#F0705B" bg="#FCE9E4" title={t("menu.lucky")} sub={t("menu.lucky_sub")} />}
      <MenuRail to="/leaders" emoji="📊" bar="#9B9186" bg="#ECE8E0" title={t("tabs.leaders")} sub={t("menu.leaders_sub")} />
      <MenuRail to="/coach" emoji="🎓" bar="#9B9186" bg="#ECE8E0" title={t("plus.coach")} sub={t("plus.coach_sub")} />
      <MenuRail to="/plans" emoji="🏆" bar="#8C5A33" bg="#F1E7DC" title={t("menu.plans")} sub={t("menu.plans_sub")} />

      {/* Courts Passport — collection lives at the bottom */}
      <CourtsPassport />

      <Link to="/help" className="block text-center text-sm font-extrabold underline py-2" style={{ color: "var(--wood, #8a6d3b)" }}>
        💬 {t("help.title")}
      </Link>
    </div>
  );
}

function MenuRail({ to, search, emoji, bar, bg, title, sub }: { to: string; search?: Record<string, unknown>; emoji: string; bar: string; bg: string; title: string; sub: string }) {
  return (
    <Link to={to as any} search={search as any} style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)", textDecoration: "none", color: "var(--ink)" }}>
      <div style={{ width: 58, flexShrink: 0, background: bg, borderLeft: `4px solid ${bar}`, borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 24 }}>{emoji}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "12px 13px" }}>
        <div className="font-display" style={{ fontSize: RF.name - 3, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontWeight: 700, fontSize: RF.meta - 1, color: "rgba(43,33,24,0.55)", marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", paddingRight: 12, fontSize: 20, color: "rgba(43,33,24,0.35)" }}>›</div>
    </Link>
  );
}
