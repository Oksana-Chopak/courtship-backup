import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { waErrorKey } from "@/lib/courtship";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { getProfilePhone } from "@/lib/whatsapp.functions";
import { googleCalendarUrl } from "@/lib/calendar";
import { notifyUsers } from "@/lib/push";
import { myInviteLink, myGameShareLink, shareMessage, copyText } from "@/lib/share";
import { countMatchingRescuers, claimSos, whatsappClaimLink, withdrawClaim, applyToGame, withdrawApplication, fetchApplicants, pickApplicant, type SosRow, type ApplicantRow } from "@/lib/sos";
import { whenLabel, hourRange, levelMeta, vibeEmoji } from "@/lib/courtship";
import { courtTypeMeta } from "@/lib/courtship";
import { CourtStatusBadge } from "@/components/CourtStatusBadge";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { reasonToast } from "@/lib/reasons";
import { useI18n } from "@/lib/i18n";
import { TimeRail, RailShell, RF, clampLines, type RailTone } from "@/components/RailKit";
import { FLAGS } from "@/lib/flags";

export const Route = createFileRoute("/_authenticated/sos/$id")({
  head: () => ({ meta: [{ title: "SOS — Courtship" }] }),
  validateSearch: (s: Record<string, unknown>): { claim?: string; join?: string; apply?: string; posted?: string } => ({
    claim: typeof s.claim === "string" && s.claim ? s.claim : undefined,
    join: typeof s.join === "string" && s.join ? s.join : undefined,
    apply: typeof s.apply === "string" && s.apply ? s.apply : undefined,
    // just published from the wizard → show the one-time "share it" step
    posted: typeof s.posted === "string" && s.posted ? s.posted : undefined,
  }),
  component: SosDetail,
});

type Claimer = { id: string; name: string; photo_url: string | null };

function SosDetail() {
  const { t, lang } = useI18n();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [sos, setSos] = useState<SosRow | null>(null);
  const [courtName, setCourtName] = useState<string>("");
  const [courtCity, setCourtCity] = useState<string>("");
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [other, setOther] = useState<any>(null);          // the host, shown to a joiner
  const [claimers, setClaimers] = useState<Claimer[]>([]); // joiners, shown to the host
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]); // pending candidates (host, open games)
  const [myApplied, setMyApplied] = useState(false);
  const [gamePlayerBs, setGamePlayerBs] = useState<string[]>([]);
  const [rescuerCount, setRescuerCount] = useState(0);
  const [busy, setBusy] = useState(false);
  // Windowed / Any-court games: let the applicant say "I can at …" and pick
  // IN/OUT right here too — previously only the board card offered this.
  const [proposing, setProposing] = useState(false);
  const [propTime, setPropTime] = useState("");
  const [prefCt, setPrefCt] = useState<"any" | "indoor" | "outdoor">("any");
  // Booking link (Matchi): host attaches it once the court is actually booked;
  // picked players get a button on their game screen (2026-07-22 request).
  const [bookingDraft, setBookingDraft] = useState("");
  const getPhone = useServerFn(getProfilePhone);

  async function load() {
    // SOS row and its games both key off the route id — fetch together. Court
    // needs the SOS row's court_id, so it follows.
    const [sosRes, gamesRes] = await Promise.all([
      (supabase as any).from("sos_requests").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("games").select("player_a,player_b").eq("sos_id", id),
    ]);
    const data = (sosRes as any)?.data;
    setSos(data ?? null);
    setBookingDraft(((data as any)?.booking_link as string | null) ?? "");
    // RLS: the host sees all (host = player_a); a joiner sees their own.
    setGamePlayerBs((((gamesRes as any)?.data as any[]) ?? []).map((r) => r.player_b));
    if (data?.court_id) {
      const { data: c } = await (supabase as any).from("courts").select("name,city").eq("id", data.court_id).maybeSingle();
      setCourtName(c?.name ?? "");
      setCourtCity(c?.city ?? "");
    }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      if (u.user) {
        const { data: p } = await supabase.from("profiles" as any).select("name").eq("id", u.user.id).maybeSingle();
        setMe({ id: u.user.id, name: (p as any)?.name ?? "" });
      }
      await load();
    })();

    const ch = (supabase as any)
      .channel(`sos:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sos_requests", filter: `id=eq.${id}` }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => {
    // Private (broadcast=false) games reach nobody — "N rescuers" would be a lie.
    if (!sos || sos.status !== "active" || (sos as any).broadcast === false) return;
    let cancelled = false;
    (async () => {
      const n = await countMatchingRescuers(sos.id);
      if (!cancelled) setRescuerCount(n);
    })();
    return () => { cancelled = true; };
  }, [sos?.id, sos?.status]);

  const isCaller = !!(sos && me && sos.caller_id === me.id);

  // 👻 Handover: arriving with ?claim=<token> (from the invite link the admin
  // sent) transfers this ghost game to the freshly signed-up owner — so the
  // first thing they see after onboarding is their own game with candidates.
  const { claim, join, apply, posted } = Route.useSearch();
  const navigate2 = useNavigate();
  useEffect(() => {
    if ((!claim && !join && !apply) || !me || !sos) return;
    if (apply && !claim && !join) {
      // "I'm in" intent carried through signup: apply (open) or claim (SOS) once
      void (async () => {
        if (sos.caller_id !== me.id && sos.status === "active") {
          if (sos.kind === "open") {
            const r = await applyToGame(sos.id);
            if (r.ok) toast.success(t("app.sent"));
            else if (r.reason === "already_applied") toast.info(t("app.already"));
            // The pending-application probe raced this INSERT and won't re-run
            // (same sos.id) — set the state directly so the CTA can't offer a
            // second, doomed "I'm interested" (2026-08-12 audit P1-5).
            if (r.ok || r.reason === "already_applied") setMyApplied(true);
          } else {
            const r = await claimSos(sos.id);
            if (r.ok) toast.success(t("sos.claimed_toast"));
          }
        }
        navigate2({ to: "/sos/$id", params: { id: sos.id }, search: {}, replace: true });
        await load();
      })();
      return;
    }
    void (async () => {
      const fn = claim ? "claim_ghost_game" : "join_game_by_token";
      const { data, error } = await (supabase as any).rpc(fn, { _sos_id: sos.id, _token: claim ?? join });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row?.ok) toast.success(t(claim ? "sos.ghost_claimed" : "sos.joined_via_invite"));
      // A dead/taken/expired token must SAY so — silently landing on the game
      // page as a spectator reads as a bug (2026-08-12 audit P1-7).
      else toast.error(t("sos.join_link_dead"));
      navigate2({ to: "/sos/$id", params: { id: sos.id }, search: {}, replace: true });
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim, join, apply, me?.id, sos?.id]);

  useEffect(() => {
    if (!sos || !me || isCaller || sos.kind !== "open") { setMyApplied(false); return; }
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("sos_applications").select("id").eq("sos_id", sos.id).eq("applicant_id", me.id).eq("status", "pending").maybeSingle();
        setMyApplied(!!data);
      } catch { setMyApplied(false); }
    })();
  }, [sos?.id, sos?.kind, me?.id, isCaller]);
  const iJoined = !!(me && gamePlayerBs.includes(me.id));

  // Host loads joiner profiles; a joiner loads the host profile.
  useEffect(() => {
    if (!sos || !me) return;
    if (isCaller) {
      // 'claimed' included: the group may be formed while people are still
      // raising hands — the host can keep picking or release them (2026-07-22).
      if (sos.kind === "open" && (sos.status === "active" || sos.status === "claimed")) {
        fetchApplicants(sos.id).then(setApplicants).catch(() => setApplicants([]));
      } else setApplicants([]);
      if (!gamePlayerBs.length) { setClaimers([]); return; }
      (async () => {
        const { data } = await (supabase as any).rpc("players_directory", { _ids: gamePlayerBs });
        setClaimers(((data as any[]) ?? []).map((d) => ({ id: d.id, name: d.name, photo_url: d.photo_url })));
      })();
    } else if (iJoined) {
      (async () => {
        const { data } = await (supabase as any).rpc("players_directory", { _ids: [sos.caller_id] });
        setOther((data as any[])?.[0] ?? null);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sos?.id, me?.id, isCaller, iJoined, gamePlayerBs.join(",")]);

  if (!sos || !me) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;

  const winEnd = (sos as any).play_until ? new Date((sos as any).play_until as string) : null;
  const when = whenLabel(sos.play_at) + (winEnd ? "–" + winEnd.toLocaleTimeString(lang === "sv" ? "sv-SE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
  const ctMeta = courtTypeMeta(sos.court_type, lang);
  // Localized game format. No "need N" — multipick lets the host take as many
  // players as they want; the joined_count line carries the live numbers.
  const fmtGame = sos.format === "singles" ? t("fmt.singles") : t("fmt.doubles");
  const spotsNeeded = sos.spots_needed ?? 1;
  const spotsFilled = sos.spots_filled ?? 0;
  const remaining = Math.max(0, spotsNeeded - spotsFilled);
  const multi = spotsNeeded > 1;
  const canPlay = new Date(((sos as any).play_until as string) ?? sos.play_at).getTime() > Date.now();
  const calUrl = googleCalendarUrl({
    title: `\u{1F3BE} Tennis · ${courtName || "court"}`,
    startISO: sos.play_at,
    durationMin: sos.duration_min ?? 60,
    location: [courtName, courtCity].filter(Boolean).join(", "),
    details: sos.note || undefined,
  });

  async function messageWa(targetId: string) {
    // Open the tab synchronously inside the click gesture, THEN redirect after the
    // async phone fetch — opening after await is popup-blocked and breaks in iframes.
    const w = typeof window !== "undefined" ? window.open("about:blank", "_blank") : null;
    try {
      let phone: string;
      try {
        ({ phone } = await getPhone({ data: { targetId } }));
      } catch (e: any) { if (w) w.close(); toast.info(t(waErrorKey(e?.message))); return; }
      const url = whatsappClaimLink(phone, me!.name, when, courtName || "the court");
      if (w) w.location.href = url;
      else if (typeof window !== "undefined") window.location.href = url;
    } catch (e: any) { if (w) w.close(); oops(e); }
  }

  async function doWithdraw() {
    if (typeof window !== "undefined" && !window.confirm(t("home.cant_make_confirm"))) return;
    setBusy(true);
    const r = await withdrawClaim(sos!.id);
    setBusy(false);
    if (!r.ok) { reasonToast(t, r.reason); return; }
    toast.success(r.re_flared ? t("home.withdrawn_reflared") : t("home.withdrawn"));
    navigate({ to: "/board" });
  }

  // Owner one-tap widen: open the SOS to all levels and re-flare, so the
  // existing notify_on_flare trigger re-blasts the now-wider rescuer audience.
  // Direct UPDATE on sos_requests was revoked in the June-19 hardening, so this
  // goes through the widen_my_game RPC (2026-07-20 audit fix); the old direct
  // update stays as a fallback for a DB where the RPC isn't applied yet.
  async function widenLevels() {
    setBusy(true);
    let { data, error } = await (supabase as any).rpc("widen_my_game", { _sos_id: sos!.id });
    if (error && /does not exist|schema cache|PGRST202/i.test(error.message ?? "")) {
      ({ error } = await (supabase as any)
        .from("sos_requests")
        .update({ level_min: 1, level_max: 5, flared_at: new Date().toISOString() })
        .eq("id", sos!.id));
      data = error ? null : [{ ok: true }];
    }
    setBusy(false);
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row?.ok) { oops(error ?? new Error(String(row?.reason ?? "widen_failed"))); return; }
    toast.success(t("sos.widen_done"));
    load();
  }

  async function shareSos() {
    const link = await myGameShareLink(sos!.id);
    const msg = t(sos!.kind === "open" ? "share.game_msg" : "share.sos_msg", {
      when,
      court: courtName || courtCity || "the court",
      link,
    });
    await shareMessage(msg, t("share.copied"));
  }

  // ENDED
  if (sos.status === "expired" || sos.status === "cancelled") {
    return (
      <div className="space-y-5">
        <Link to="/rescue" className="text-sm font-extrabold underline">← {t("rescue.title")}</Link>
        <div className="ccard p-6 text-center">
          <div className="text-3xl">⌛</div>
          <div className="font-display text-xl mt-1">{sos.status === "cancelled" ? t("sos.cancelled") : t("sos.expired_title")}</div>
        </div>
      </div>
    );
  }

  // I JOINED — contact the host (whether or not the group is full yet)
  if (iJoined && !isCaller) {
    return (
      <div className="space-y-5">
        <Link to="/board" className="text-sm font-extrabold underline">← {t("nav.board")}</Link>
        <div className="ccard p-5 text-center space-y-3" style={{ background: "var(--green-pop)" }}>
          <div className="text-5xl">🎾</div>
          <h1 className="font-display text-3xl">{t("sos.youre_in")}</h1>
          <div className="font-extrabold">{when} · 📍 {courtCity} · {courtName} · {ctMeta.emoji} {ctMeta.label}</div>
          <div><CourtStatusBadge status={sos.court_status} /></div>
          {multi && (
            <div className="text-base font-semibold text-[var(--ink)]">
              {remaining > 0 ? t("sos.spots_waiting", { n: remaining }) : t("sos.group_full")}
            </div>
          )}
        </div>
        {other && (
          <div className="ccard p-5 space-y-3 text-center">
            <div className="csection-label">{t("sos.your_host")}</div>
            <Avatar src={(sos as any).ghost_name ? null : other.photo_url} name={((sos as any).ghost_name as string) ?? other.name} seed={other.id} size={120} />
            <div className="font-display text-2xl">{((sos as any).ghost_name as string) ?? other.name}</div>
            {(sos as any).ghost_name && (
              <div className="text-sm font-semibold" style={{ opacity: 0.6 }}>{t("sos.ghost_relay", { name: (sos as any).ghost_name })}</div>
            )}
            <button className="cbtn cbtn-green w-full" onClick={() => messageWa(other.id)}>{t("sos.message_wa")}</button>
          </div>
        )}
        {/* Court already booked? The host attached the Matchi link — one tap. */}
        {(sos as any).booking_link && (
          <a href={(sos as any).booking_link as string} target="_blank" rel="noopener noreferrer"
            className="cbtn cbtn-ghost w-full text-center block">🔗 {t("sos.booking_open")}</a>
        )}
        {canPlay && (
          <a href={calUrl} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost w-full text-center block">{t("cal.add")}</a>
        )}
        {canPlay && (
          <button className="cbtn cbtn-ghost w-full" disabled={busy} onClick={doWithdraw}>{t("home.cant_make_it")}</button>
        )}
      </div>
    );
  }

  // I'M THE HOST
  if (isCaller) {
    const isOpen = sos.kind === "open";
    const full = sos.status === "claimed";
    const canShare = !full && (sos as any).broadcast !== false;
    return (
      <div className="space-y-5">
        <Link to="/board" className="text-sm font-extrabold underline">← {t("nav.board")}</Link>
        {posted && canShare && (() => {
          // one-shot card: gone after a share or "later" (the URL loses ?posted)
          const dismissPosted = () => navigate({ to: "/sos/$id", params: { id: sos.id }, search: { claim: undefined, join: undefined, apply: undefined, posted: undefined } as any, replace: true });
          return (
            <div className="ccard p-4 space-y-3" style={{ background: "var(--green-pop)" }}>
              <div className="font-display text-xl leading-tight">{t("posted.title")}</div>
              <p className="text-sm font-semibold" style={{ opacity: 0.8 }}>{t("posted.sub")}</p>
              <button className="cbtn cbtn-coral w-full" onClick={async () => { await shareSos(); dismissPosted(); }}>{t("share.button")}</button>
              <button type="button" className="w-full text-center text-sm font-extrabold underline" style={{ opacity: 0.7 }} onClick={dismissPosted}>
                {t("posted.later")}
              </button>
            </div>
          );
        })()}
        {(() => {
          const tone: RailTone = full ? "mine" : isOpen ? "plan" : "sos";
          const d = new Date(sos.play_at);
          const now = new Date();
          const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
          const locale = lang === "sv" ? "sv-SE" : "en-GB";
          const day = d.toDateString() === now.toDateString() ? t("rail.today") : d.toDateString() === tmr.toDateString() ? t("rail.tmrw") : d.toLocaleDateString(locale, { weekday: "short" });
          const dateStr = d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");
          const railTime = winEnd ? hourRange(d, winEnd) : d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
          return (
            <RailShell>
              <TimeRail day={day} time={railTime} ct={full ? "🎾" : isOpen ? "🎾" : "🚨"} tone={tone} dateStr={dateStr} ctSub={(sos as any).court_type_any ? t("ct.sub_any") : sos.court_type === "indoor" ? t("ct.sub_in") : t("ct.sub_out")} />
              <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                {!full && !isOpen && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 800, fontSize: RF.tag, letterSpacing: "0.06em", textTransform: "uppercase", color: "#F0705B", marginBottom: 6 }}>
                    <span className="sos-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#F0705B", display: "inline-block" }} />SOS
                  </div>
                )}
                <div className="font-display" style={{ fontSize: RF.name, lineHeight: 1.12 }}>
                  {full ? (isOpen ? t("sos.group_set") : t("sos.rescued_title")) : isOpen ? t("sos.on_board") : (sos as any).broadcast === false ? t("sos.private_waiting") : t("sos.broadcasting", { n: rescuerCount })}
                </div>
                <div style={{ fontWeight: 800, fontSize: RF.club, color: "#8C5A33", marginTop: 4, ...clampLines(1) }}>📍 {courtCity} · {courtName}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "nowrap", overflow: "hidden", whiteSpace: "nowrap" }}>
                  <span style={{ flexShrink: 0 }}><CourtStatusBadge status={sos.court_status} muted /></span>
                  <span style={{ flexShrink: 0, fontWeight: 700, fontSize: RF.meta, color: "rgba(43,33,24,0.6)" }}>{ctMeta.emoji} {ctMeta.label} · {fmtGame}</span>
                </div>
                {full && !isOpen && <div className="font-extrabold" style={{ fontSize: RF.meta, marginTop: 8 }}>{t("sos.rescued_sub")}</div>}
                {multi && <div className="font-extrabold" style={{ fontSize: RF.meta, marginTop: 6 }}>{t("sos.joined_count", { filled: spotsFilled, needed: spotsNeeded })}</div>}
              </div>
            </RailShell>
          );
        })()}

        {claimers.length > 0 && (
          <div className="ccard p-4 space-y-3">
            <div className="csection-label">{t("sos.who_joined")}</div>
            {claimers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-t border-[var(--ink)]/15 pt-3 first:border-t-0 first:pt-0">
                <Avatar src={c.photo_url} name={c.name} seed={c.id} size={56} />
                <div className="flex-1 font-extrabold truncate">{c.name}</div>
                <button className="cbtn cbtn-green" onClick={() => messageWa(c.id)}>{t("sos.message_wa")}</button>
              </div>
            ))}
          </div>
        )}

        {/* Booking link (Matchi) — the host drops it in once the court is booked;
            everyone who's picked sees the button on their game screen. */}
        <div className="ccard p-4 space-y-2">
          <div className="csection-label">🔗 {t("sos.booking_label")}</div>
          <p className="text-sm font-semibold" style={{ opacity: 0.65 }}>{t("sos.booking_hint")}</p>
          <div className="flex gap-2">
            <input className="cinput flex-1" placeholder="https://www.matchi.se/…" value={bookingDraft}
              onChange={(e) => setBookingDraft(e.target.value)} inputMode="url" />
            <button className="cbtn cbtn-green shrink-0" disabled={busy || bookingDraft.trim() === (((sos as any).booking_link as string | null) ?? "")}
              onClick={async () => {
                setBusy(true);
                const { error } = await (supabase as any).rpc("set_booking_link", { _sos_id: sos!.id, _url: bookingDraft.trim() || null });
                setBusy(false);
                if (error) {
                  const m = String(error.message || "");
                  if (/link_not_http/.test(m)) { toast.error(t("sos.booking_bad")); return; }
                  oops(error);
                  return;
                }
                toast.success(t("sos.booking_saved"));
                load();
              }}>✓</button>
          </div>
        </div>

        {/* Token cards live OUTSIDE the open-game block: invited (🎟) games are
            always kind='sos' and ghost handover stays useful even after claim —
            gating these on isOpen made both links unreachable (2026-07-20 audit). */}
        {(((sos as any).invite_join_token && !full) || (sos as any).ghost_claim_token) && (
          <div className="ccard p-4 space-y-3">
            {(sos as any).invite_join_token && !full && (
              <div style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
                <div style={{ width: 58, flexShrink: 0, background: "#EEF6D6", borderLeft: "4px solid #C9EE3F", borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎟</div>
                <div style={{ flex: 1, minWidth: 0, padding: "12px 13px" }}>
                  <div className="font-extrabold" style={{ fontSize: 15 }}>{t("sos.invite_card_title")}</div>
                  <button type="button" className="cbtn cbtn-green w-full mt-2" onClick={async () => {
                    const url = await myInviteLink(`/sos/${sos.id}?join=${(sos as any).invite_join_token}`);
                    await copyText(url, t("sos.handover_copied"));
                  }}>🔗 {t("sos.invite_copy")}</button>
                  <p className="text-sm font-semibold mt-1" style={{ opacity: 0.65 }}>{t("sos.invite_hint2")}</p>
                </div>
              </div>
            )}
            {(sos as any).ghost_claim_token && (
              <div style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
                <div style={{ width: 58, flexShrink: 0, background: "#ECE8E0", borderLeft: "4px solid #9B9186", borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>👻</div>
                <div style={{ flex: 1, minWidth: 0, padding: "12px 13px" }}>
                  <div className="font-extrabold" style={{ fontSize: 15 }}>{t("sos.ghost_for", { name: (sos as any).ghost_name ?? "" })}</div>
                  <button type="button" className="cbtn cbtn-green w-full mt-2" onClick={async () => {
                    const url = await myInviteLink(`/sos/${sos.id}?claim=${(sos as any).ghost_claim_token}`);
                    await copyText(url, t("sos.handover_copied"));
                  }}>🔗 {t("sos.handover_copy")}</button>
                  <p className="text-sm font-semibold mt-1" style={{ opacity: 0.65 }}>{t("sos.handover_hint")}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {/* A PRIVATE game is invisible on the board — nobody can apply, so the
            candidates card (and its Lucky Serve nudge) is a dead end there.
            Joiners arrive via the join link instead (2026-07-25 feedback). */}
        {isOpen && (sos as any).broadcast !== false && (!full || applicants.length > 0) && (
          <div className="ccard p-4 space-y-3">
            <div className="csection-label">🙋 {t("app.candidates")}</div>
            {/* Group already formed but people are still raising hands — the host
                decides: pick more (no cap) or release the rest (2026-07-22). */}
            {full && applicants.length > 0 && (
              <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("app.full_more_hint")}</p>
            )}
            {applicants.length === 0 ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-[var(--ink)]/70">{t("app.none_hint")}</div>
                {FLAGS.luckyServe && (
                  <Link to="/lucky" className="cbtn cbtn-green w-full text-center block">🎰 {t("app.try_lucky")}</Link>
                )}
              </div>
            ) : applicants.map((a) => (
              <div key={a.id} className="flex items-center gap-3 border-t border-[var(--ink)]/15 pt-3 first:border-t-0 first:pt-0">
                <Avatar src={a.photo_url} name={a.name} seed={a.id} size={52} />
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold truncate">{a.name}</div>
                  <div className="text-xs font-bold" style={{ color: "rgba(43,33,24,0.6)" }}>
                    L{a.level} · {vibeEmoji(a.vibe)}{(a.rescues_count ?? 0) >= 1 ? ` · 🚑 ${a.rescues_count}` : ""}
                  </div>
                  {a.ct_pref && (
                    <div className="text-sm font-extrabold mt-0.5" style={{ color: "#8C5A33" }}>
                      {a.ct_pref === "indoor" ? "🏠" : "☀️"} {t("cand.prefers", { ct: a.ct_pref === "indoor" ? t("ct.indoor") : t("ct.outdoor") })}
                    </div>
                  )}
                  {a.proposed_at && (
                    <div className="text-sm font-extrabold mt-0.5" style={{ color: "var(--coral)" }}>
                      🕐 {t("app.suggests", { time: new Date(a.proposed_at).toLocaleTimeString(lang === "sv" ? "sv-SE" : "en-GB", { hour: "2-digit", minute: "2-digit" }) })}
                    </div>
                  )}
                </div>
                <button className="cbtn cbtn-green shrink-0" disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await pickApplicant(sos.id, a.id);
                    setBusy(false);
                    if (!r.ok) { if (r.reason === "no_application") toast.error(t("app.gone")); else reasonToast(t, r.reason); await load(); fetchApplicants(sos.id).then(setApplicants).catch(() => {}); return; }
                    toast.success(t("app.picked_toast", { name: a.name }));
                    await load();
                    fetchApplicants(sos.id).then(setApplicants).catch(() => {});
                  }}>
                  {t("app.pick")}
                </button>
              </div>
            ))}
            {full && applicants.length > 0 && (
              <button className="cbtn cbtn-ghost w-full" disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const { data, error } = await (supabase as any).rpc("release_applicants", { _sos_id: sos!.id });
                  setBusy(false);
                  if (error) { oops(error); return; }
                  toast.success(t("app.released", { n: Number(data ?? 0) }));
                  fetchApplicants(sos!.id).then(setApplicants).catch(() => {});
                }}>
                💔 {t("app.release_rest")}
              </button>
            )}
          </div>
        )}

        {/* Quiet lever, not the shout: Share/Publish below is THE one accent on
            the unfilled-host screen (one-priority-action rule, 2026-08-08). */}
        {!full && !isOpen && (sos.level_min > 1 || sos.level_max < 5) && (
          <button className="cbtn cbtn-ghost w-full" disabled={busy} onClick={widenLevels}>🎯 {t("sos.widen")}</button>
        )}
        {/* Private (invited) game the invitee never took → let the host open it to
            the board instead of the cancel+repost dead end. */}
        {!full && (sos as any).broadcast === false && (
          <button className="cbtn cbtn-green w-full" disabled={busy} onClick={async () => {
            setBusy(true);
            const { data, error } = await (supabase as any).rpc("publish_my_game", { _sos_id: sos!.id });
            setBusy(false);
            const row = Array.isArray(data) ? data[0] : data;
            if (error || !row?.ok) { oops(error ?? new Error(String(row?.reason ?? "publish_failed"))); return; }
            toast.success(t("sos.published"));
            load();
          }}>📢 {t("sos.publish")}</button>
        )}
        {/* Share only makes sense for a public game — a private game's /g/<id>
            preview is intentionally hidden, so sharing it would dead-end. */}
        {canShare && !posted && (
          <button className="cbtn cbtn-green w-full" onClick={shareSos}>{t("share.button")}</button>
        )}
        <button
          className="cbtn cbtn-ghost w-full"
          disabled={busy}
          onClick={async () => {
            if (typeof window !== "undefined" && !window.confirm(t("sos.cancel_confirm"))) return;
            setBusy(true);
            const { data, error } = await (supabase as any).rpc("cancel_game", { _sos_id: sos!.id });
            if (error) { setBusy(false); oops(error); return; }
            const row = (data as any[])?.[0] ?? {};
            const ids: string[] = row.claimer_ids ?? [];
            const appIds: string[] = row.applicant_ids ?? [];
            // BATCH13: cancel_game notifies server-side (push + EMAIL — people
            // must not show up to a cancelled game on a missed push alone) and
            // returns notified=true. Old RPC (no flag) → client pushes as before,
            // so no deploy order leaves cancellations silent.
            const serverNotified = row.notified === true;
            if (!serverNotified && ids.length) {
              await notifyUsers(ids, {
                title: t("cancel.push_title"),
                body: t("cancel.push_body", { name: me!.name, when, court: courtName || "the court" }),
                url: "/board",
                tag: `cancel-${sos!.id}`,
              });
            }
            // Pending candidates were waiting for a pick that will never come —
            // tell them too, so it's not a dangling flow (2026-07-20 audit).
            if (!serverNotified && appIds.length) {
              await notifyUsers(appIds, {
                title: t("cancel.applicant_push_title"),
                body: t("cancel.applicant_push_body", { court: courtName || "the court" }),
                url: "/board",
                tag: `cancel-app-${sos!.id}`,
              });
            }
            setBusy(false);
            toast.success(t("sos.cancelled"));
            navigate({ to: "/board" });
          }}
        >
          {t("sos.cancel")}
        </button>
        {canPlay && (
          <a href={calUrl} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost w-full text-center block">{t("cal.add")}</a>
        )}
        <style>{`
          .sos-dot { animation: dotPulse 1.2s infinite; }
          @keyframes dotPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
        `}</style>
      </div>
    );
  }

  // FULL but I'm a third party
  if (sos.status === "claimed") {
    return (
      <div className="space-y-5">
        <Link to="/rescue" className="text-sm font-extrabold underline">← {t("rescue.title")}</Link>
        <div className="ccard p-6 text-center space-y-2">
          <div className="text-5xl">💔</div>
          <div className="font-display text-2xl">{t("sos.taken_title")}</div>
          <div className="text-[var(--ink)] font-semibold">{t("sos.taken_sub")}</div>
        </div>
      </div>
    );
  }

  // ACTIVE — eligible rescuer/joiner (not host, hasn't joined)
  const lmMin = levelMeta(sos.level_min);
  const lmMax = levelMeta(sos.level_max);
  return (
    <div className="space-y-5">
      <Link to="/rescue" className="text-sm font-extrabold underline">← {t("rescue.title")}</Link>
      <div className="ccard p-5 space-y-3">
        <div className="font-display text-3xl">{when}</div>
        <div className="font-extrabold">📍 {courtCity} · {courtName} · {ctMeta.emoji} {ctMeta.label} · {fmtGame}</div>
        <div><CourtStatusBadge status={sos.court_status} /></div>
        {multi && <div className="font-extrabold text-[var(--coral)]">{t("sos.spots_left", { n: remaining })}</div>}
        <div className="text-sm">
          Level <span className="font-extrabold" style={{ color: lmMin.color }}>{sos.level_min}</span>
          –<span className="font-extrabold" style={{ color: lmMax.color }}>{sos.level_max}</span>
        </div>
        {sos.note && <div className="text-[var(--ink)] italic">"{sos.note}"</div>}
      </div>
      {sos.kind === "open" ? (
        myApplied ? (
          <div className="ccard p-4 text-center space-y-2" style={{ background: "var(--green-pop)" }}>
            <div className="font-display text-xl">🙋 {t("app.you_applied_title")}</div>
            <div className="text-sm font-semibold">{t("app.you_applied_sub")}</div>
            <button className="cbtn cbtn-ghost w-full" disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = await withdrawApplication(sos.id);
                setBusy(false);
                if (ok) { setMyApplied(false); toast.success(t("app.withdrawn")); }
                // Silent failure kept the person in the host's candidate list
                // while they believed they'd left (2026-08-12 audit P1-6).
                else { toast.error(t("app.withdraw_fail")); await load(); }
              }}>
              {t("app.withdraw")}
            </button>
          </div>
        ) : (() => {
          const ctAnyGame = !!(sos as any).court_type_any;
          const needsPanel = !!winEnd || ctAnyGame;
          const sendApply = async (iso?: string | null, pref?: "indoor" | "outdoor" | null) => {
            setBusy(true);
            const r = await applyToGame(sos.id, iso ?? null, pref ?? null);
            setBusy(false);
            if (!r.ok) {
              if (r.reason === "not_applicable") { toast.info(t("app.turned_urgent")); }
              else if (r.reason === "already_applied") toast.error(t("app.already"));
              else if (r.reason === "already_in") toast.error(t("sos.already_in"));
              else if (r.reason === "bad_proposed_time") toast.error(t("app.time_outside"));
              else reasonToast(t, r.reason);
              await load();
              return;
            }
            if (r.fallbackClaimed) { toast.success(t("claim.in")); await load(); return; }
            setMyApplied(true);
            setProposing(false);
            toast.success(t("app.sent"));
          };
          return (
            <div className="space-y-2">
              <button className="cbtn cbtn-coral w-full" disabled={busy}
                onClick={() => {
                  if (needsPanel && !proposing) { setProposing(true); return; }
                  if (needsPanel && proposing) {
                    // Panel is open: the big button submits the CHOSEN values —
                    // it must never fire a bare apply that drops the picked
                    // time/preference (2026-08-12 audit P1-8).
                    if (winEnd && !propTime) return; // Send below is disabled for the same reason
                    let iso: string | undefined;
                    if (winEnd) {
                      const dd = new Date(sos.play_at);
                      const [h, m] = propTime.split(":").map(Number);
                      dd.setHours(h ?? 0, m ?? 0, 0, 0);
                      if (dd.getTime() < new Date(sos.play_at).getTime() || dd.getTime() > winEnd.getTime()) { toast.error(t("app.time_outside")); return; }
                      iso = dd.toISOString();
                    }
                    void sendApply(iso ?? null, ctAnyGame && prefCt !== "any" ? prefCt : null);
                    return;
                  }
                  void sendApply();
                }}>
                🙋 {t("app.im_interested")}
              </button>
              {proposing && needsPanel && (
                <div className="ccard p-3">
                  {winEnd && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "rgba(43,33,24,0.6)", flexShrink: 0 }}>{t("app.i_can_at")}</span>
                      <input type="time" className="cinput" style={{ flex: 1, padding: "7px 10px" }} value={propTime} onChange={(e) => setPropTime(e.target.value)} />
                    </div>
                  )}
                  {ctAnyGame && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: winEnd ? 8 : 0, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "rgba(43,33,24,0.6)" }}>{t("app.pref_label")}</span>
                      {(["indoor", "outdoor", "any"] as const).map((v) => (
                        <button key={v} type="button" onClick={() => setPrefCt(v)} className={`cchip ${prefCt === v ? "cchip-on" : ""}`} style={{ fontSize: 13, padding: "4px 11px" }}>
                          {v === "indoor" ? `🏠 ${t("ct.indoor")}` : v === "outdoor" ? `☀️ ${t("ct.outdoor")}` : t("app.pref_any")}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" disabled={busy || (!!winEnd && !propTime)} className="cbtn cbtn-green w-full text-sm mt-2" style={{ opacity: busy || (!!winEnd && !propTime) ? 0.6 : 1 }}
                    onClick={() => {
                      let iso: string | undefined;
                      if (winEnd) {
                        const dd = new Date(sos.play_at);
                        const [h, m] = propTime.split(":").map(Number);
                        dd.setHours(h ?? 0, m ?? 0, 0, 0);
                        if (dd.getTime() < new Date(sos.play_at).getTime() || dd.getTime() > winEnd.getTime()) { toast.error(t("app.time_outside")); return; }
                        iso = dd.toISOString();
                      }
                      void sendApply(iso ?? null, ctAnyGame && prefCt !== "any" ? prefCt : null);
                    }}>{t("app.send")}</button>
                </div>
              )}
            </div>
          );
        })()
      ) : (
      <button
        className="cbtn cbtn-coral w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await claimSos(sos.id);
          setBusy(false);
          if (!r.ok) {
            if (r.reason === "taken") toast.error(t("sos.taken_toast"));
            else if (r.reason === "expired") toast.error(t("sos.err_expired"));
            else if (r.reason === "own_sos") toast.error(t("sos.err_own"));
            else if (r.reason === "already_in") toast.error(t("sos.already_in"));
            else reasonToast(t, r.reason);
            await load();
            return;
          }
          toast.success(t("claim.in"));
          await load();
        }}
      >
        {multi ? t("sos.join_spots", { n: remaining }) : t("sos.im_in")}
      </button>
      )}
    </div>
  );
}
