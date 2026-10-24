import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LangToggle, useI18n } from "@/lib/i18n";
import { FLAGS } from "@/lib/flags";
import { fetchPublicBoard } from "@/lib/guest";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Courtship — a tennis partner, tonight" },
      { name: "description", content: "Post a game or join one. Tennis partners in Uppsala & Stockholm, free." },
      { property: "og:title", content: "Courtship — a tennis partner, tonight" },
      { property: "og:description", content: "Post a game or join one. Uppsala & Stockholm, free." },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useI18n();
  const navigate = useNavigate();
  // The landing is SERVER-RENDERED for everyone (2026-10-24): a newcomer from a
  // shared link sees the headline with the HTML, not after ~870 KB of JS. A
  // visitor who is already signed in (or mid email-confirmation: token in the
  // URL) is bounced into the app the moment the session is known; the page
  // hides itself on the client as soon as that is decided, never on the server.
  const [hidden, setHidden] = useState(false);
  // Live pulse under the headline: how many games are open right now. Never
  // advertises a zero — the line simply stays away on a quiet day.
  const [openGames, setOpenGames] = useState(0);
  useEffect(() => { fetchPublicBoard().then((rows) => setOpenGames(rows.length)).catch(() => {}); }, []);

  useEffect(() => {
    let routed = false;
    const go = async (session: any) => {
      if (routed || !session) return;
      routed = true;
      setHidden(true);
      if (!session.user.email_confirmed_at) {
        navigate({ to: "/check-email", search: { email: session.user.email ?? "" } });
        return;
      }
      const { data: prof } = await supabase
        .from("profiles" as any)
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle();
      navigate({ to: prof ? "/board" : "/onboarding" });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go(session);
    });

    // Mid email-confirmation (token still in the URL): hide the landing while
    // supabase-js turns the token into a session, so nobody sees a "choose
    // again" screen for a second; fall back to the landing if nothing comes.
    const authCallback = typeof window !== "undefined" &&
      (window.location.hash.includes("access_token") || window.location.search.includes("code="));
    let fallback: ReturnType<typeof setTimeout> | undefined;
    if (authCallback) { setHidden(true); fallback = setTimeout(() => { if (!routed) setHidden(false); }, 1500); }
    supabase.auth.getSession().then(({ data }) => { if (data.session) go(data.session); });

    return () => { sub.subscription.unsubscribe(); if (fallback) clearTimeout(fallback); };
  }, [navigate]);

  if (hidden) return <div className="terry-bg min-h-screen" />;

  /* "Warm wash" home (TennisBuddies 10, variant B): real app icon as the logo,
     centered calm column, cities in wood under the subtitle, ONE pulsing coral
     CTA anchored at the bottom (thumb reach) with the language toggle just
     above it, quiet text link + legal footer. One door in — a first-time
     visitor froze in front of three loud CTAs (2026-08-06 report). */
  const ctaStyle: React.CSSProperties = {
    display: "block", width: "100%", textAlign: "center",
    background: "#F0705B", color: "#FFF6E8", borderRadius: 12,
    padding: "16px 20px", fontWeight: 700, fontSize: 15.5,
    boxShadow: "0 10px 22px rgba(240,112,91,0.28)",
  };

  return (
    <div className="terry-bg text-[var(--ink)] font-body" style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* the CTA's soft heartbeat (.cs-pulse) now lives in styles.css —
          shared with the Board hero so the two buttons can never drift */}
      <div style={{ width: "100%", maxWidth: 430, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "64px 32px 60px", boxSizing: "border-box" }}>
        <img src="/icon-512.png" width={92} height={92} alt="Courtship" style={{ display: "block", borderRadius: "22%", marginTop: 4 }} />
        <h1 className="font-display" style={{ fontSize: 40, lineHeight: 1.3, marginTop: 24 }}>
          {t("index.match_a")}<br />
          <span style={{ color: "var(--coral)" }}>{t("index.match_b")}</span>
        </h1>
        <p style={{ fontWeight: 500, fontSize: 15, color: "rgba(43,33,24,0.6)", marginTop: 14, maxWidth: 268, lineHeight: 1.45 }}>
          {t("brand.subtitle")}
        </p>
        {openGames > 0 && (
          <div role="status" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid rgba(43,33,24,0.18)", borderRadius: 999, padding: "6px 12px", background: "rgba(253,249,238,0.7)", fontWeight: 800, fontSize: 13 }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--coral)" }} />
            {openGames === 1 ? t("index.pulse_one") : t("index.pulse", { n: openGames })}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <div className="font-display" style={{ fontSize: 16, color: "#8C5A33", whiteSpace: "nowrap" }}>📍 {t("brand.cities")}</div>
          <div style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(43,33,24,0.38)", marginTop: 4 }}>{t("brand.beta_tag")}</div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginBottom: 20 }}><LangToggle /></div>
        {FLAGS.guestPeek ? (
          <Link to="/board" className="cs-pulse" style={ctaStyle}>
            {t("index.cta_peek")}
          </Link>
        ) : (
          <Link to="/auth" search={{ mode: "signup" }} className="cs-pulse" style={ctaStyle}>
            {t("index.cta_peek")}
          </Link>
        )}
        <Link to="/auth" search={{ mode: "login" }} style={{ marginTop: 13, fontWeight: 700, fontSize: 13, color: "#8C5A33", textDecoration: "underline", textUnderlineOffset: 3 }}>
          {t("index.cta_have_account")}
        </Link>
        <div style={{ marginTop: 16, fontWeight: 600, fontSize: 10.5, color: "rgba(43,33,24,0.32)" }}>
          <Link to="/privacy" style={{ textDecoration: "underline" }}>{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" style={{ textDecoration: "underline" }}>{t("legal.footer_terms")}</Link>
        </div>
      </div>
    </div>
  );
}
