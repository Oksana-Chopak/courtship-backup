import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { FLAGS } from "@/lib/flags";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { whatsappLink, levelMeta, monogramColors, sportMeta, vibeEmoji, waErrorKey } from "@/lib/courtship";
import { BallHeart, Rackets, RF, clampLines } from "@/components/RailKit";
import { PlayerDossierSheet } from "@/components/PlayerDossierSheet";
import { useI18n } from "@/lib/i18n";
import { shareInvite } from "@/lib/share";
import { oops } from "@/lib/oops";

type Card = {
  id: string; name: string; photo_url: string | null; level: number; home_city: string | null; bio: string | null; fav_shot: string | null;
  photos?: string[] | null; home_cities?: string[] | null; home_courts?: string | null;
  sports?: string[] | null; vibe?: string | null; formats?: string[] | null; play_times?: string[] | null;
  looking_for?: string | null; experience?: string | null; goals?: string[] | null;
  games_played?: number | null; rescues_count?: number | null; member_since?: string | null;
  areas?: string[] | null;
};

export const Route = createFileRoute("/_authenticated/match")({
  beforeLoad: () => { if (!FLAGS.swipeDeck) throw redirect({ to: "/players" }); },
  head: () => ({ meta: [{ title: "Match — Courtship" }] }),
  component: MatchDeck,
});

function MatchDeck() {
  const { t } = useI18n();
  const [deck, setDeck] = useState<Card[]>([]);
  const [i, setI] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<Card | null>(null);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(0);
  const dragMoved = useRef(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [details, setDetails] = useState(false);

  async function loadDeck() {
    setLoading(true);
    const { data } = await (supabase as any).rpc("swipe_deck");
    setDeck((data as Card[]) ?? []);
    setI(0);
    setLoading(false);
  }
  useEffect(() => { void loadDeck(); }, []);

  // Nudge: with no areas/goals the deck can't aim. One quiet card, not a wall.
  // Pre-SQL (areas column missing) the select errors → no nudge, no noise.
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await getUserLocal();
        if (!u.user) return;
        const { data, error } = await (supabase as any).from("profiles").select("areas,goals").eq("id", u.user.id).maybeSingle();
        if (error || !data) return;
        const a = (data.areas as string[] | null) ?? [];
        const g = (data.goals as string[] | null) ?? [];
        setNudge(!a.length || !g.length);
      } catch { /* ignore */ }
    })();
  }, []);

  const card = deck[i];

  // Deck exhausted this session → automatically pull the next 20. The server's
  // recycle tiers (fresh → other cities → second-chance passes) mean the deck
  // should rarely run dry; the empty state is reserved for a truly empty fetch.
  useEffect(() => {
    if (loading || card || deck.length === 0) return;
    void loadDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, card, deck.length]);

  useEffect(() => { setPhotoIdx(0); setDetails(false); }, [i]);

  async function swipe(like: boolean) {
    if (!card || busy) return;
    setBusy(true);
    try {
      // supabase-js returns {error}, it does NOT throw — without this check a
      // failing swipe (RLS/limit/schema) advanced the deck silently and no like
      // was ever recorded (2026-08-12 audit P0-2).
      const { data, error } = await (supabase as any).rpc("do_swipe", { _target: card.id, _like: like });
      if (error) { oops(error); return; }
      const isMatch = Array.isArray(data) ? data[0]?.is_match : (data as any)?.is_match;
      if (like && isMatch) setMatched(card);
      else setI((n) => n + 1);
    } catch (e: any) { oops(e); }
    finally { setBusy(false); }
  }

  async function messageWa(p: Card) {
    const w = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      let phone: string, name: string;
      try {
        ({ phone, name } = await getProfilePhone({ data: { targetId: p.id } }));
      } catch (e: any) { if (w) w.close(); toast.info(t(waErrorKey(e?.message))); return; }
      const url = whatsappLink(phone, name);
      if (w) w.location.href = url;
      else if (typeof window !== "undefined") window.location.href = url;
    } catch (e: any) { if (w) w.close(); oops(e); }
  }

  if (matched) {
    const lm = levelMeta(matched.level);
    return (
      <div className="space-y-5">
        <div className="ccard p-6 text-center space-y-3" style={{ background: "var(--coral)", color: "var(--ink)", borderColor: "var(--ink)" }}>
          <div className="flex justify-center"><BallHeart size={72} /></div>
          <h1 className="font-display text-4xl">{t("match.its_a_match")}</h1>
          <div className="font-extrabold">{t("match.match_sub", { name: matched.name })}</div>
        </div>
        <div className="ccard p-5 text-center space-y-3">
          <Avatar src={matched.photo_url} name={matched.name} seed={matched.id} size={140} />
          <div className="font-display text-3xl">{matched.name}</div>
          <div className="font-extrabold">📍 {matched.home_city ?? "—"} · L<span style={{ color: lm.color }}>{matched.level}</span></div>
          {/* ONE action after a match: say hi. Planning a game comes naturally
              from the chat — a second loud CTA here was too much (Oxy 2026-08-08). */}
          <button onClick={() => messageWa(matched)} className="cbtn cbtn-green w-full">{t("sos.message_wa")}</button>
          <button onClick={() => { setMatched(null); setI((n) => n + 1); }} className="cbtn cbtn-ghost w-full">{t("match.keep_swiping")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Court Crush is a top-level tab now; this shortcut keeps Lucky Serve
          reachable (it used to sit next to Crush on the Players page). */}
      <Link to="/lucky" className="text-sm font-extrabold underline">{t("lucky.title")}</Link>
      <div className="text-center">
        <h1 className="font-display text-4xl inline-flex items-center gap-2 justify-center"><BallHeart size={34} /> {t("match.title")}</h1>
        <p className="text-[var(--ink)] font-semibold" style={{ fontSize: 16.5 }}>{t("match.sub")}</p>
      </div>

      {nudge && (
        <Link to="/settings" className="block"
          style={{ border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, background: "rgba(253,249,238,0.6)", padding: "11px 13px" }}>
          <span className="font-extrabold" style={{ fontSize: 14 }}>🎯 {t("crush.nudge_title")}</span>
          <span className="block text-sm font-semibold" style={{ opacity: 0.65, marginTop: 2 }}>{t("crush.nudge_sub")}</span>
        </Link>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>
      ) : card ? (
        <>
          <div className="relative flex justify-center" style={{ minHeight: 480, touchAction: "pan-y" }}>
            {/* deck peek — two cards behind, slightly rotated (CourtCrush redesign) */}
            {deck[i + 2] && (
              <div className="absolute" style={{ top: 18, width: "min(316px, 88%)", height: "90%", borderRadius: 22, background: "var(--cream2)", border: "2px solid var(--ink)", transform: "rotate(2deg) scale(0.96)" }} />
            )}
            {deck[i + 1] && (
              <div className="absolute" style={{ top: 9, width: "min(326px, 93%)", height: "94%", borderRadius: 22, background: "var(--cream2)", border: "2px solid var(--ink)", transform: "rotate(-1.2deg) scale(0.98)" }} />
            )}
            <div
              // Width lives HERE (the flex item), not on the card: the card's
              // percentage width had nothing to resolve against inside this
              // shrink-to-fit wrapper and collapsed to ~0 (2026-07-25 blank-card bug).
              style={{ width: "min(340px, 100%)", transform: `translateX(${drag}px) rotate(${drag / 14}deg)`, transition: dragging ? "none" : "transform 0.25s ease", position: "relative" }}
              onPointerDown={(e) => { if (busy || details) return; setDragging(true); dragMoved.current = false; dragStart.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
              onPointerMove={(e) => { if (!dragging) return; const dx = e.clientX - dragStart.current; if (Math.abs(dx) > 8) dragMoved.current = true; setDrag(dx); }}
              onPointerUp={(e) => {
                setDragging(false);
                if (!dragMoved.current) {
                  // a TAP: left third = prev photo, right third = next, middle = details
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const x = (e.clientX - rect.left) / rect.width;
                  const ph = photosOf(card);
                  if (x < 0.33 && ph.length > 1) setPhotoIdx((n) => (n - 1 + ph.length) % ph.length);
                  else if (x > 0.67 && ph.length > 1) setPhotoIdx((n) => (n + 1) % ph.length);
                  else setDetails(true);
                  setDrag(0); return;
                }
                if (Math.abs(drag) > 90) {
                  const like = drag > 0;
                  setDrag(like ? 500 : -500);
                  setTimeout(() => { setDrag(0); void swipe(like); }, 180);
                } else setDrag(0);
              }}
              onPointerCancel={() => { setDragging(false); setDrag(0); }}
            >
              <SwipeCard card={card} photoIdx={photoIdx} onOpenDetails={() => setDetails(true)} />
              {/* drag verdict stamps — GAME ON / NET (CourtCrush redesign) */}
              <div style={{ position: "absolute", top: 24, left: 18, transform: "rotate(-14deg)", opacity: Math.min(1, Math.max(0, drag / 70)), pointerEvents: "none" }}>
                <span className="font-display" style={{ fontSize: 26, color: "var(--green-pop)", border: "3px solid var(--green-pop)", borderRadius: 8, padding: "2px 10px", background: "rgba(20,15,10,0.35)" }}>{t("match.stamp_like")}</span>
              </div>
              <div style={{ position: "absolute", top: 24, right: 18, transform: "rotate(12deg)", opacity: Math.min(1, Math.max(0, -drag / 70)), pointerEvents: "none" }}>
                <span className="font-display" style={{ fontSize: 26, color: "#FFF6E8", border: "3px solid #FFF6E8", borderRadius: 8, padding: "2px 10px", background: "rgba(240,112,91,0.75)" }}>{t("match.stamp_pass")}</span>
              </div>
            </div>
            {/* actions live ON the photo (overlay siblings — they don't rotate with the drag) */}
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 16, display: "flex", justifyContent: "center", gap: 44, pointerEvents: "none", zIndex: 5 }}>
              <button onClick={() => swipe(false)} disabled={busy} aria-label={t("match.pass")} className="flex items-center justify-center rounded-full disabled:opacity-50" style={{ pointerEvents: "auto", width: 60, height: 60, background: "#FDF9EE", border: "2px solid var(--ink)", boxShadow: "2px 3px 0 var(--ink)", fontSize: 24 }}>✕</button>
              <button onClick={() => swipe(true)} disabled={busy} aria-label={t("match.like")} className="flex items-center justify-center rounded-full disabled:opacity-50" style={{ pointerEvents: "auto", width: 60, height: 60, background: "var(--green-pop)", border: "2px solid var(--ink)", boxShadow: "2px 3px 0 var(--ink)", fontSize: 24 }}>🎾</button>
            </div>
          </div>
          {details && card && <PlayerDossierSheet card={card} onClose={() => setDetails(false)} onLike={() => { setDetails(false); void swipe(true); }} />}
        </>
      ) : (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-4xl">🎾</div>
          <div className="font-display text-xl">{t("match.empty")}</div>
          {/* "Invite a friend" must invite, not open /me (2026-07-20 audit). */}
          <button type="button" className="cbtn cbtn-coral inline-flex" onClick={() => void shareInvite(t("invite.message"), t("invite.copied"))}>{t("empty.dir_new_cta")}</button>
          <div><Link to="/lucky" className="font-extrabold underline text-sm">🎰 {t("feat.lucky_spin")}</Link></div>
        </div>
      )}
    </div>
  );
}

function photosOf(c: Card | undefined): string[] {
  if (!c) return [];
  const arr = (c.photos ?? []).filter(Boolean);
  if (arr.length) return arr as string[];
  return c.photo_url ? [c.photo_url] : [];
}

function SwipeCard({ card, photoIdx = 0, onOpenDetails }: { card: Card; photoIdx?: number; onOpenDetails?: () => void }) {
  const lm = levelMeta(card.level);
  const [bg, fg] = monogramColors(card.id);
  const ph = photosOf(card);
  const src = ph[Math.min(photoIdx, Math.max(0, ph.length - 1))] ?? null;
  const sports = (card.sports?.length ? card.sports : ["tennis"]) as string[];
  const isDoubles = (card.formats ?? []).includes("doubles");
  return (
    <div className="relative overflow-hidden" style={{ width: "100%", aspectRatio: "300 / 468", borderRadius: 22, border: "2px solid var(--ink)", boxShadow: "4px 4px 0 rgba(43,33,24,0.18)", background: bg }}>
      {src ? (
        <img src={src} alt={card.name} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      ) : (
        <>
          <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 11px)" }} />
          <div className="absolute left-0 right-0 text-center font-display" style={{ top: "8%", fontSize: 150, lineHeight: 1, color: fg, opacity: 0.92 }}>{card.name[0]}</div>
        </>
      )}
      {/* photo dots */}
      {ph.length > 1 && (
        <div className="absolute left-0 right-0 flex justify-center gap-1.5" style={{ top: 10 }}>
          {ph.map((_, n) => (
            <span key={n} style={{ width: 26, height: 4, borderRadius: 2, background: n === photoIdx ? "#FFF6E8" : "rgba(255,246,232,0.35)" }} />
          ))}
        </div>
      )}
      {/* identity block — gradient bottom; padding clears the on-photo actions */}
      <div className="absolute left-0 right-0 bottom-0" style={{ padding: "64px 16px 88px", background: "linear-gradient(180deg, transparent, rgba(20,15,10,0.9))" }}>
        <div className="flex items-center gap-2">
          <span className="font-display" style={{ fontSize: 30, color: "#FFF6E8", ...clampLines(1) }}>{card.name}</span>
          {/* ⌃ tab — the explicit door to the full dossier (middle-tap still works) */}
          <button
            type="button"
            aria-label="More"
            onClick={onOpenDetails}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            className="ml-auto shrink-0 flex items-center justify-center rounded-full"
            style={{ width: 40, height: 40, background: "rgba(43,33,24,0.55)", border: "1.5px solid rgba(255,255,255,0.7)", color: "#FFF6E8", fontSize: 18, backdropFilter: "blur(3px)" }}
          >⌃</button>
        </div>
        <div className="font-extrabold mt-1.5 flex items-center gap-2 flex-wrap" style={{ fontSize: 13.5, color: "rgba(255,246,232,0.94)" }}>
          {sports.some((sp) => sp !== "tennis") && <span>{sports.map((sp) => sportMeta(sp).emoji).join(" ")}</span>}
          {card.areas?.length ? (
            <span>📍 {card.areas.slice(0, 2).join(" · ")}</span>
          ) : card.home_city ? (
            <span>📍 {card.home_city}</span>
          ) : null}
          <span className="inline-flex items-center gap-1"><Rackets n={isDoubles ? 4 : 2} size={15} /></span>
          <span className="inline-flex items-center gap-1">
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: lm.color, display: "inline-block" }} />L{card.level}
          </span>
          {card.vibe && <span>{vibeEmoji(card.vibe)}</span>}
        </div>
        {card.bio ? (
          <div className="font-display mt-2" style={{ fontSize: 16, color: "#FFF6E8", lineHeight: 1.3, ...clampLines(2) }}>“{card.bio}”</div>
        ) : card.fav_shot ? (
          <div className="mt-2" style={{ fontSize: 14, color: "rgba(236,230,216,0.85)" }}>🎾 {card.fav_shot}</div>
        ) : null}
      </div>
    </div>
  );
}
