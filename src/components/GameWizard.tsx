import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { activeSosCount } from "@/lib/sos";
import { notifyUsers } from "@/lib/push";
import { fetchBuddyIds } from "@/lib/buddies";
import { fetchCourtsForPicker, type CourtFull } from "@/lib/courts";
import { useCityNames } from "@/lib/cities";
import { COURT_STATUSES, courtStatusMeta, SOS_FORMATS, LEVELS, isUrgent, generateSlots, defaultPostDate, COURT_TYPES, courtTypeMeta, whenLabel, DURATIONS, durationLabel, type City, type CourtType, sportMeta, type Sport } from "@/lib/courtship";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { CourtCombobox } from "@/components/CourtCombobox";
import { Avatar } from "@/components/Avatar";
import { Rackets } from "@/components/RailKit";
import { rememberDraftGame, peekDraftGame, clearDraftGame } from "@/lib/draftGame";
import { rememberNext } from "@/lib/share";
import { HAIR, CARD, WOOD, LIME, CORAL, LV_COLORS, WizLbl, SegRow, CheckBox, QuietNext, ToggleRow, AccordionRow, DetailCard, LevelTrack, Wheel } from "@/components/wizardKit";

/* ═══ ONE wizard for every place a game is created ═══
   Member create + edit (/sos/new) and the guest reverse-funnel (/post) render
   THIS component — change it once, every entry point follows. Guest mode
   hides account-bound extras (sport, SOS, private, buddies, ghost, auto-flare)
   and ends in "save draft → sign up"; the authed shell publishes the draft. */

function pad(n: number) { return n.toString().padStart(2, "0"); }

export function GameWizard({ guest = false, editId }: { guest?: boolean; editId?: string }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const editing = !guest && !!editId;
  const [step, setStep] = useState(0);
  const [courts, setCourts] = useState<CourtFull[]>([]);
  const [myLevel, setMyLevel] = useState(3);
  const [uid, setUid] = useState<string | null>(null);
  const [city, setCity] = useState<City>("Uppsala");
  const [myHomeCity, setMyHomeCity] = useState<City | null>(null);

  // Default date = Today; NO time preselected (user must pick — the From wheel
  // starts on "—", which prevents an accidental instant send).
  // today — or tomorrow when today has no bookable slot left (late evening)
  const [date, setDate] = useState<Date>(() => defaultPostDate());
  const [time, setTime] = useState<string>("");
  const [courtId, setCourtId] = useState<string>("");
  const [courtType, setCourtType] = useState<CourtType>("outdoor");
  const [sport, setSport] = useState<Sport>("tennis");
  const [mySports, setMySports] = useState<Sport[]>(["tennis"]);
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await getUserLocal();
        if (!u.user) return;
        const { data } = await (supabase as any).from("profiles").select("sports,is_admin").eq("id", u.user.id).maybeSingle();
        const sp = ((data?.sports as Sport[] | null) ?? ["tennis"]).filter((x): x is Sport => x === "tennis" || x === "padel" || x === "badminton");
        if (sp.length) { setMySports(sp); if (!sp.includes("tennis")) setSport(sp[0]); }
      } catch { /* pre-SQL */ }
    })();
  }, []);
  const [format, setFormat] = useState<typeof SOS_FORMATS[number]["value"]>("singles");
  const [anyone, setAnyone] = useState(false);
  const [levelMin, setLevelMin] = useState(2);
  const [levelMax, setLevelMax] = useState(4);
  const [courtStatus, setCourtStatus] = useState<typeof COURT_STATUSES[number]["value"]>("booked");
  const [duration, setDuration] = useState<number>(60);
  const [note, setNote] = useState("");
  const autoFlare = true; // automation-owned (audit D-22b): quiet flare if nobody bites
  const [flexible, setFlexible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ghostName, setGhostName] = useState("");
  const [ctAny, setCtAny] = useState(false);
  const [invitedMode, setInvitedMode] = useState(false);
  const [untilTime, setUntilTime] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [myName, setMyName] = useState("");
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const [buddies, setBuddies] = useState<Array<{ id: string; name: string }>>([]);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const cityNames = useCityNames();

  useEffect(() => {
    (async () => {
      const cs = await fetchCourtsForPicker();
      setCourts(cs);
      const { data: u } = await getUserLocal();
      if (!u.user) {
        // Guest funnel: no profile to read — still default the court to the
        // first one in the default city so step 2 never starts empty.
        const first = cs.find((c) => c.city === "Uppsala") ?? cs[0];
        if (first) setCourtId(first.id);
        return;
      }
      setUid(u.user.id);
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("name,level,home_city,home_courts,photo_url")
        .eq("id", u.user.id)
        .maybeSingle();
      const lv = (p as any)?.level ?? 3;
      const hc = ((p as any)?.home_city ?? "Uppsala") as City;
      setMyLevel(lv);
      setCity(hc);
      setMyHomeCity(hc);
      setMyName((p as any)?.name ?? "");
      setMyPhoto((p as any)?.photo_url ?? null);
      try {
        const bids = await fetchBuddyIds(u.user!.id);
        if (bids.size) {
          const { data: dir } = await (supabase as any).rpc("players_directory", { _ids: [...bids] });
          setBuddies(((dir as any[]) ?? []).map((x) => ({ id: x.id, name: x.name })));
        }
      } catch { /* ignore */ }
      // Default the court to MY home club (from profile home_courts), not the
      // alphabetically-first court. Fall back to first-in-my-city, then first overall.
      // Fuzzy on purpose: profile home_courts is free text ("Fyrishov"), the
      // directory holds full names ("Fyrishov Tenniscenter") — exact equality
      // regressed to first-in-list. Either side may contain the other.
      const norm = (x: string) => x.toLowerCase().replace(/[^a-zà-öø-ÿ0-9]+/gi, " ").trim();
      const homeCourtName = String((p as any)?.home_courts ?? "").split(",").map((x) => x.trim()).filter(Boolean)[0];
      const hcn = homeCourtName ? norm(homeCourtName) : "";
      const homeCourt = hcn ? cs.find((c) => { const n = norm(c.name); return n.includes(hcn) || hcn.includes(n); }) : undefined;
      const first = homeCourt ?? cs.find((c) => c.city === hc) ?? cs[0];
      if (first) { setCourtId(first.id); if (homeCourt) setCity(homeCourt.city as City); }
      setLevelMin(Math.max(1, lv - 1));
      setLevelMax(Math.min(5, lv + 1));
      // Smart defaults from this user's most recent post (2026-10
      // crystallization): same court, surface, format, level range, duration
      // and court status as last time — most posts become "pick a time, post".
      // Editing and the guest-draft rescue below override these.
      const { data: last } = await (supabase as any)
        .from("sos_requests")
        .select("court_type,court_id,format,level_min,level_max,duration_min,court_status")
        .eq("caller_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const L = (last ?? null) as { court_type?: string; court_id?: string; format?: string; level_min?: number; level_max?: number; duration_min?: number; court_status?: string } | null;
      if (L && !editing) {
        if (L.court_type === "indoor" || L.court_type === "outdoor") setCourtType(L.court_type);
        const lastCourt = L.court_id ? cs.find((c) => c.id === L.court_id) : undefined;
        if (lastCourt) { setCourtId(lastCourt.id); setCity(lastCourt.city as City); }
        if (L.format && SOS_FORMATS.some((f) => f.value === L.format)) setFormat(L.format as typeof SOS_FORMATS[number]["value"]);
        if (typeof L.level_min === "number" && typeof L.level_max === "number" && L.level_min >= 1 && L.level_max <= 5 && L.level_min <= L.level_max) {
          if (L.level_min === 1 && L.level_max === 5) setAnyone(true);
          else { setAnyone(false); setLevelMin(L.level_min); setLevelMax(L.level_max); }
        }
        if (typeof L.duration_min === "number" && DURATIONS.includes(L.duration_min as typeof DURATIONS[number])) setDuration(L.duration_min);
        if (L.court_status && COURT_STATUSES.some((c) => c.value === L.court_status)) setCourtStatus(L.court_status as typeof COURT_STATUSES[number]["value"]);
      }

      // Rescue path (2026-08-12 audit P0-1): a guest draft that could NOT
      // auto-publish after signup was kept — prefill everything they typed so
      // nothing is lost, then clear it (one shot, no republish loops).
      if (!editing) {
        const draft = peekDraftGame();
        if (draft) {
          clearDraftGame();
          const pa = new Date(draft.play_at);
          if (!isNaN(pa.getTime()) && pa.getTime() > Date.now()) {
            const day = new Date(pa); day.setHours(0, 0, 0, 0);
            setDate(day);
            setTime(`${pad(pa.getHours())}:${pad(pa.getMinutes())}`);
          } // stale time → keep today + empty slot, the person re-picks
          const court = cs.find((c) => c.id === draft.court_id);
          if (court) { setCity(court.city as City); setCourtId(court.id); }
          if (draft.court_type === "indoor" || draft.court_type === "outdoor") setCourtType(draft.court_type as CourtType);
          if (draft.court_type_any) setCtAny(true);
          if (draft.format) setFormat(draft.format as typeof SOS_FORMATS[number]["value"]);
          if (draft.level_min === 1 && draft.level_max === 5) setAnyone(true);
          else { setAnyone(false); setLevelMin(draft.level_min); setLevelMax(draft.level_max); }
          if (draft.court_status) setCourtStatus(draft.court_status as typeof COURT_STATUSES[number]["value"]);
          if (draft.duration_min) setDuration(draft.duration_min);
          if (draft.play_until) {
            const pu = new Date(draft.play_until);
            if (!isNaN(pu.getTime()) && pu.getTime() > Date.now()) {
              setFlexible(true);
              setUntilTime(`${pad(pu.getHours())}:${pad(pu.getMinutes())}`);
            }
          }
          if (draft.note) setNote(draft.note);
        }
      }

      // Edit mode: load the existing game and prefill (owner-only edit_sos RPC saves it).
      if (editing && editId) {
        const { data: g } = await (supabase as any).from("sos_requests").select("*").eq("id", editId).maybeSingle();
        if (g?.sport) setSport(g.sport as Sport);
        if (g && g.caller_id === u.user.id) {
          const pa = new Date(g.play_at);
          const day = new Date(pa); day.setHours(0, 0, 0, 0);
          setDate(day);
          setTime(`${pad(pa.getHours())}:${pad(pa.getMinutes())}`);
          const court = cs.find((c) => c.id === g.court_id);
          if (court) { setCity(court.city as City); setCourtId(court.id); }
          if (g.court_type === "indoor" || g.court_type === "outdoor") setCourtType(g.court_type);
          // Any-surface must round-trip through edit (2026-08-12 audit P1-9)
          setCtAny(!!g.court_type_any);
          if (g.format) setFormat(g.format);
          if (g.level_min === 1 && g.level_max === 5) { setAnyone(true); }
          else { setAnyone(false); setLevelMin(g.level_min); setLevelMax(g.level_max); }
          if (g.court_status) setCourtStatus(g.court_status);
          if (g.duration_min) setDuration(g.duration_min);
          if (g.play_until) {
            const pu = new Date(g.play_until);
            setFlexible(true);
            setUntilTime(`${pad(pu.getHours())}:${pad(pu.getMinutes())}`);
          }
          setNote(g.note ?? "");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belt & braces (2026-08-08 "default court got lost"): whatever the load
  // order or profile state, an empty pick self-heals to first-in-city.
  useEffect(() => {
    if (courtId || !courts.length) return;
    const first = courts.find((c) => c.city === city) ?? courts[0];
    if (first) setCourtId(first.id);
  }, [courts, courtId, city]);

  // When city changes, pick first matching court if current isn't in city
  useEffect(() => {
    if (!courts.length) return;
    const cur = courts.find((c) => c.id === courtId);
    if (!cur || cur.city !== city) {
      const first = courts.find((c) => c.city === city);
      if (first) setCourtId(first.id);
    }
  }, [city, courts, courtId]);

  // Keep the selected time valid for the chosen city + date; clear it if it falls outside the available slots.
  useEffect(() => {
    if (!time) return;
    if (!generateSlots(city, date).includes(time)) setTime("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, date]);

  const playAt = useMemo(() => {
    if (!time) return null;
    const base = new Date(date);
    const [h, m] = time.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    return base;
  }, [date, time]);

  useEffect(() => {
    void (async () => {
      const { data: au } = await getUserLocal();
      if (!au.user) return;
      const { data } = await (supabase as any).from("profiles").select("is_admin").eq("id", au.user.id).maybeSingle();
      setIsAdmin(!!data?.is_admin);
    })();
  }, []);

  const playUntil = useMemo(() => {
    if (!flexible || !untilTime) return null;
    const base = new Date(date);
    const [h, m] = untilTime.split(":").map(Number);
    base.setHours(h ?? 0, m ?? 0, 0, 0);
    return base;
  }, [flexible, untilTime, date]);

  // Urgency is fully automatic, zero user attention spent (Oxy's rule):
  // start within 6h => the game goes out as an SOS; a flexible-window game is
  // by definition planned. Step 3 shows plainly which mode the post will use,
  // and the coral confirm modal still guards the actual send.
  const urgent = guest ? false : flexible ? false : playAt ? isUrgent(playAt) : false;
  // "Any surface" is a first-class pick now (Oxy 2026-08-07) — no status gate.
  const effCtAny = ctAny;
  const canSubmit = !!(playAt && courtId && courtType && format) && (!flexible || (playUntil != null && playUntil.getTime() > (playAt?.getTime() ?? 0)))
    && (!guest || (playAt != null && playAt.getTime() > Date.now()));

  function guestContinue() {
    if (!playAt || !courtId) return;
    const court = courts.find((c) => c.id === courtId);
    rememberDraftGame({
      court_id: courtId,
      city: (court?.city as City) ?? city,
      play_at: playAt.toISOString(),
      play_until: flexible && playUntil ? playUntil.toISOString() : null,
      court_type_any: effCtAny,
      format,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      court_status: courtStatus,
      court_type: courtType,
      duration_min: duration,
      note: note.trim() || null,
    });
    rememberNext("/board");
    navigate({ to: "/auth", search: { mode: "signup" } });
  }

  async function doSubmit() {
    if (!uid || !playAt) return;
    if (!courtId) { toast.error(t("sos.err_pick_court")); return; }
    if (playAt.getTime() < Date.now()) { toast.error(t("sos.err_time_gone")); return; }
    setBusy(true);
    if (editing && editId) {
      // Direct UPDATE on sos_requests was revoked in the June-19 hardening —
      // edits go through the owner-only edit_sos RPC (spots/status untouchable).
      const editArgs: any = {
        _sos_id: editId,
        _play_at: playAt.toISOString(),
        _court_id: courtId,
        _format: format,
        _level_min: anyone ? 1 : levelMin,
        _level_max: anyone ? 5 : levelMax,
        _court_status: courtStatus,
        _note: note.trim() || null,
        _court_type: courtType,
        _duration_min: duration,
        _sport: sport,
      };
      const wantsWindow = flexible && !!playUntil;
      let windowDropped = false;
      let ctAnyDropped = false;
      // Accumulative retries (audit P1-10 pattern): each fallback strips ONE
      // newer arg from the PREVIOUS attempt, so any mix of deployed signatures
      // converges instead of ping-ponging fields back in.
      let attempt: any = { ...editArgs, _play_until: wantsWindow ? playUntil!.toISOString() : null, _court_type_any: effCtAny };
      let { data: er, error } = await (supabase as any).rpc("edit_sos", attempt);
      if (error && /_court_type_any|does not exist|schema cache/i.test(error.message ?? "")) {
        // pre-BATCH16 edit_sos deployed - Any-surface not saveable; retry without, but SAY so
        ctAnyDropped = true;
        const { _court_type_any: _ca, ...noCt } = attempt; attempt = noCt;
        ({ data: er, error } = await (supabase as any).rpc("edit_sos", attempt));
      }
      if (error && /_play_until|does not exist|schema cache/i.test(error.message ?? "")) {
        // pre-window edit_sos (11-arg) still deployed - save without the window, but SAY so
        windowDropped = wantsWindow;
        const { _play_until: _pu, ...noWin } = attempt; attempt = noWin;
        ({ data: er, error } = await (supabase as any).rpc("edit_sos", attempt));
      }
      if (!error) {
        const row = Array.isArray(er) ? er[0] : er;
        if (!row?.ok) {
          setBusy(false);
          oops(new Error(row?.reason === "time_gone" ? t("sos.err_time_gone") : row?.reason === "bad_window" ? t("sos.err_bad_window") : String(row?.reason ?? "edit failed")));
          return;
        }
      } else if (/does not exist|schema cache/i.test(error.message ?? "")) {
        // pre-SQL fallback: the old direct update (will work once RLS allows, harmless otherwise).
        // Carries the window + Any-surface too, so even this last-resort path never
        // drops what the host just set (Lovable scan 2026-10-05).
        const r2 = await (supabase as any).from("sos_requests").update({
          play_at: playAt.toISOString(), court_id: courtId, format,
          level_min: anyone ? 1 : levelMin, level_max: anyone ? 5 : levelMax,
          court_status: courtStatus, note: note.trim() || null,
          court_type: courtType, duration_min: duration,
          play_until: wantsWindow ? playUntil!.toISOString() : null,
          court_type_any: effCtAny,
        }).eq("id", editId).eq("caller_id", uid);
        error = r2.error;
      }
      setBusy(false);
      if (error) { oops(error); return; }
      // One honest message: a dropped field is a warning, never "saved ✓" next to it.
      if (windowDropped) toast.warning(t("sos.window_not_saved"), { duration: 9000 });
      if (ctAnyDropped) toast.warning(t("sos.batch_not_saved"), { duration: 9000 });
      if (!windowDropped && !ctAnyDropped) toast.success(t("sos.edit_saved"));
      navigate({ to: "/sos/$id", params: { id: editId } });
      return;
    }
    if (urgent) {
      const count = await activeSosCount(uid);
      if (count >= 3) {
        setBusy(false);
        toast.error(t("sos.err_max3"));
        return;
      }
    }
    const insertRow: any = {
      caller_id: uid,
      play_at: playAt.toISOString(),
      play_until: flexible && playUntil ? playUntil.toISOString() : null,
      ...(isAdmin && ghostName.trim() ? { ghost_name: ghostName.trim(), ghost_claim_token: crypto.randomUUID() } : {}),
      court_type_any: effCtAny,
      ...(invitedMode ? { broadcast: false, invite_join_token: crypto.randomUUID() } : {}),
      court_id: courtId,
      format,
      level_min: anyone ? 1 : levelMin,
      level_max: anyone ? 5 : levelMax,
      court_status: courtStatus,
      note: note.trim() || null,
      status: "active",
      kind: urgent ? "sos" : "open",
      // A private game must never self-broadcast: no auto-flare for invited mode.
      auto_flare: urgent || invitedMode ? false : autoFlare,
      flared_at: urgent ? new Date().toISOString() : null,
      court_type: courtType,
      duration_min: duration,
      sport,
    };
    // Fallbacks drop columns ACCUMULATIVELY from one `row` (2026-08-12 audit
    // P1-10): each retry used to rebuild from the ORIGINAL insertRow, silently
    // re-adding a column an earlier step had just dropped — two missing columns
    // meant no attempt could ever succeed.
    let row: any = { ...insertRow };
    let res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
    if (res.error && /sport/i.test(res.error.message || "")) {
      const { sport: _s, ...rest } = row; row = rest;
      res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
    }
    let createWindowDropped = false;
    if (res.error && /court_type_any|broadcast|invite_join_token/i.test(res.error.message || "")) {
      const { court_type_any: _c1, broadcast: _c2, invite_join_token: _c3, ...noNew } = row; row = noNew;
      res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
      if (!res.error && (effCtAny || invitedMode)) toast.warning(t("sos.batch_not_saved"), { duration: 9000 });
    }
    if (res.error && /ghost_/i.test(res.error.message || "")) {
      const { ghost_name: _g1, ghost_claim_token: _g2, ...noGhost } = row; row = noGhost;
      res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
      if (!res.error) toast.warning(t("sos.ghost_not_saved"), { duration: 9000 });
    }
    if (res.error && /play_until/i.test(res.error.message || "")) {
      // window column not migrated yet — post as exact-time so creation never breaks, but SAY so
      createWindowDropped = flexible && !!playUntil;
      const { play_until: _pu, ...noWin } = row; row = noWin;
      res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
    }
    if (res.error && /duration_min/i.test(res.error.message || "")) {
      // duration_min column not migrated yet — post without it so creation never breaks
      const { duration_min: _omit, ...fallback } = row; row = fallback;
      res = await (supabase as any).from("sos_requests").insert(row).select("id").single();
    }
    const { data, error } = res;
    setBusy(false);
    if (error) {
      // A ghost post rejected by RLS means THIS account isn't admin in the DB —
      // say so plainly and loudly instead of the cryptic "row-level security"
      // toast, because the game silently not existing looks like a board bug
      // (2026-07-22 tester report: ghost game "vanished").
      if (/row-level security/i.test(error.message ?? "") && ghostName.trim()) {
        toast.error(t("sos.ghost_rls"), { duration: 12000 });
        return;
      }
      oops(error);
      return;
    }
    if (inviteIds.length) {
      const court = courts.find((c) => c.id === courtId);
      void notifyUsers(inviteIds, {
        title: t("invite.push_title", { name: myName || "A buddy" }),
        body: t("invite.push_body", { when: playAt ? whenLabel(playAt.toISOString()) : "", court: court?.name || "the court" }),
        url: `/sos/${data.id}`,
        tag: `invite-${data.id}`,
      });
    }
    if (urgent) {
      // The SOS fan-out is fired by the DB (trg_notify_sos_on_insert → sos-notify,
      // Package 3.3): it works even if this tab closes now, and a second call
      // from here would double-buzz the same players.
      if (createWindowDropped) toast.warning(t("sos.window_not_saved"), { duration: 9000 });
      else toast.success(t("post.sos_toast"));
      navigate({ to: "/sos/$id", params: { id: data.id } });
    } else {
      if (createWindowDropped) toast.warning(t("sos.window_not_saved"), { duration: 9000 });
      else toast.success(t("post.posted_toast"));
      // Land on the game itself with the one-time "share it" step (2026-10
      // funnel audit): a posted game nobody's WhatsApp group hears about is
      // the main reason the board stays quieter than the chat.
      navigate({ to: "/sos/$id", params: { id: data.id }, search: { posted: "1" } as any });
    }
  }

  function onSubmitClick() {
    if (!canSubmit) return;
    if (guest) { guestContinue(); return; }
    // No confirm modal: the mode line right above the CTA already states the
    // consequence, and asking twice about an automatic decision is exactly the
    // attention-tax the house rules forbid (2026-08-12 audit D-22).
    doSubmit();
  }

  /* ── derived bits for the wizard UI ── */
  const slots = useMemo(() => generateSlots(city, date), [city, date]);
  const fromItems = useMemo(() => ["—", ...slots], [slots]);
  // "To" = optional window end; "—" = exact time (play_until stays null).
  const toItems = useMemo(() => ["—", ...slots.filter((s) => (time ? s > time : false))], [slots, time]);
  useEffect(() => {
    // keep the window end valid as From moves
    if (flexible && untilTime && time && untilTime <= time) { setFlexible(false); setUntilTime(""); }
  }, [time, flexible, untilTime]);

  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const tomorrow0 = new Date(today0.getTime() + 24 * 3600 * 1000);
  const isToday = date.getTime() === today0.getTime();
  const isTomorrow = date.getTime() === tomorrow0.getTime();
  const [pickDateOpen, setPickDateOpen] = useState(false);
  const [windowInfo, setWindowInfo] = useState(false);
  const locale = lang === "sv" ? "sv-SE" : "en-GB";

  const courtName = courts.find((c) => c.id === courtId)?.name ?? "";
  // Localized status label (courtStatusMeta carries EN+SV) — the raw
  // COURT_STATUSES labels are English-only and would contradict the board in SV.
  const statusLabel = courtStatusMeta(courtStatus, lang).label;
  const stepTitles = [t("wiz.when_title"), t("wiz.court_title"), t("wiz.who_title")];

  function next() { setStep((s) => Math.min(2, s + 1)); }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  return (
    /* the "sheet": a hairline card that hugs its content — no dead space below short steps */
    <div className="space-y-4" style={{ maxWidth: 480, border: `1px solid ${HAIR}`, borderRadius: 16, background: CARD, padding: "14px 16px 18px" }}>
      {/* header: ONE back control — the arrow in the title row, nothing else */}
      <div>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={back} aria-label={t("wiz.back")}
              style={{ fontSize: 22, lineHeight: 1, padding: "2px 8px 2px 0", background: "transparent", flexShrink: 0 }}>←</button>
          )}
          <h1 className="font-display flex-1" style={{ fontSize: 26, lineHeight: 1.1 }}>
            {editing ? `${t("sos.edit_title")} · ${stepTitles[step]}` : stepTitles[step]}
          </h1>
          <span className="font-extrabold" style={{ fontSize: 13.5, opacity: 0.6 }}>{step + 1}/3</span>
        </div>
        <div className="flex gap-1.5 mt-2.5">
          {[0, 1, 2].map((k) => (
            <span key={k} style={{ flex: 1, height: 4, borderRadius: 999, background: k <= step ? LIME : HAIR }} />
          ))}
        </div>
      </div>

      {/* ════ STEP 1 · WHEN — duration · time window · day ════ */}
      {step === 0 && (
        <div className="space-y-3">
          {mySports.length > 1 && (
            <div>
              <WizLbl>{t("sport.label")}</WizLbl>
              <SegRow items={mySports.map((sp) => ({ key: sp, label: `${sportMeta(sp).emoji} ${t(sportMeta(sp).key)}` }))}
                sel={sport} onSel={(k) => setSport(k as Sport)} />
            </div>
          )}
          <div>
            <WizLbl>{t("sos.duration")}</WizLbl>
            <SegRow items={DURATIONS.map((d) => ({ key: String(d), label: durationLabel(d) }))}
              sel={String(duration)} onSel={(k) => setDuration(Number(k))} />
          </div>
          <div>
            <WizLbl right={
              <button type="button" aria-label="info" aria-expanded={windowInfo} onClick={() => setWindowInfo(!windowInfo)}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid rgba(43,33,24,0.25)", background: windowInfo ? "rgba(43,33,24,0.08)" : "transparent", fontWeight: 800, fontSize: 12, opacity: 0.7 }}>i</button>
            }>{t("wiz.window_label")}</WizLbl>
            <div style={{ display: "flex", gap: 14, background: "rgba(43,33,24,0.05)", borderRadius: 14, padding: "6px 12px" }}>
              <Wheel label={t("wiz.from")} items={fromItems} value={time || "—"}
                onChange={(v) => setTime(v === "—" ? "" : v)} />
              <Wheel label={t("wiz.to")} items={toItems} value={flexible && untilTime ? untilTime : "—"}
                disabled={!time}
                onChange={(v) => { if (v === "—") { setFlexible(false); setUntilTime(""); } else { setFlexible(true); setUntilTime(v); } }} />
            </div>
            {/* teaching copy lives behind ⓘ; the ONLY always-on line is the 1-line
                state feedback when a window is actually set (one-screen rule) */}
            {windowInfo && <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>{t("wiz.window_hint")}</p>}
            {!windowInfo && flexible && untilTime && <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>{t("sos.flex_help")}</p>}
          </div>
          <div>
            <WizLbl>{t("wiz.day")}</WizLbl>
            <SegRow
              items={[
                { key: "today", label: t("wiz.today") },
                { key: "tomorrow", label: t("wiz.tomorrow") },
                { key: "pick", label: isToday || isTomorrow ? t("wiz.pick_date") : date.toLocaleDateString(locale, { day: "numeric", month: "short" }) },
              ]}
              sel={isToday ? "today" : isTomorrow ? "tomorrow" : "pick"}
              onSel={(k) => {
                if (k === "today") { setDate(new Date(today0)); setPickDateOpen(false); }
                else if (k === "tomorrow") { setDate(new Date(tomorrow0)); setPickDateOpen(false); }
                else setPickDateOpen(true);
              }}
            />
            {pickDateOpen && (
              <input type="date" className="cinput mt-2" aria-label={t("wiz.pick_date")}
                min={new Date().toISOString().slice(0, 10)}
                value={`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}
                onChange={(e) => { const d = new Date(e.target.value + "T00:00:00"); if (!isNaN(d.getTime())) setDate(d); }} />
            )}
          </div>
          <QuietNext label={t("wiz.next_court")} onClick={next} />
        </div>
      )}

      {/* ════ STEP 2 · COURT — city · court picker · surface ════ */}
      {step === 1 && (
        <div className="space-y-3">
          <div>
            <WizLbl>📍 {t("sos.city")}</WizLbl>
            <div className="flex items-center gap-4 flex-wrap" style={{ padding: "2px 0 2px" }}>
            {cityNames.map((cy) => (
              <button key={cy} type="button" onClick={() => setCity(cy)}
                className="font-display" style={{ fontSize: 19, color: WOOD, opacity: city === cy ? 1 : 0.45, background: "transparent", padding: 0 }}>
                📍 {cy}
              </button>
            ))}
            </div>
          </div>
          {/* The board is city-scoped: a game at a Stockholm court is invisible to
              Uppsala players. Posting outside your home city is fine — but say it
              out loud, so the game doesn't feel like it vanished (2026-07-22). */}
          {myHomeCity && city !== myHomeCity && (
            <p className="text-sm font-semibold" style={{ opacity: 0.65 }}>
              ℹ️ {t("sos.city_visibility_hint", { city })}
            </p>
          )}
          <div>
            <WizLbl>{t("sos.court")}</WizLbl>
            {/* CourtCombobox keeps search + "add a court" (the design's add-a-court row) */}
            <CourtCombobox city={city} valueId={courtId} onChange={(id, c) => { setCourtId(id); if (c) setCourts((p) => p.some((x) => x.id === c.id) ? p : [...p, c]); }} />
          </div>
          <div>
            <WizLbl>{t("ct.label")}</WizLbl>
            <SegRow
              items={[
                ...COURT_TYPES.map((ct) => { const m = courtTypeMeta(ct, lang); return { key: ct, label: `${m.emoji} ${m.label}` }; }),
                { key: "any", label: `🏟️ ${t("board.f_any")}` },
              ]}
              sel={ctAny ? "any" : courtType}
              onSel={(k) => { if (k === "any") setCtAny(true); else { setCtAny(false); setCourtType(k as CourtType); } }} />
            {ctAny && (
              <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>{t("ct.any_hint")}</p>
            )}
          </div>
          <QuietNext label={t("wiz.next_players")} onClick={next} />
        </div>
      )}

      {/* ════ STEP 3 · WHO — live preview · format · level track · details · note · CTA ════ */}
      {step === 2 && (
        <div className="space-y-3">
          {/* priority 1 — Format, one prominent decision */}
          <div>
            <WizLbl>{t("sos.format")}</WizLbl>
            {/* No "need 1/2/3" math at creation: since BATCH12 the host picks
                as many candidates as they like (choose_applicant accepts past
                full, spots_needed self-grows), so Doubles just opens up to 3
                spots and the host assembles the court from whoever applies.
                Editing an older need1/need2 game keeps its original count. */}
            <SegRow
              items={[
                { key: "singles", label: t("wiz.singles"), icon: <Rackets n={2} size={18} /> },
                { key: "doubles", label: t("wiz.doubles"), icon: <Rackets n={4} size={18} /> },
              ]}
              sel={format === "singles" ? "singles" : "doubles"}
              onSel={(k) => setFormat(k === "singles" ? "singles" : (format === "singles" ? "doubles_need3" : format))}
            />
            {format !== "singles" && (
              <p className="text-sm font-semibold mt-1.5" style={{ opacity: 0.65 }}>{t("wiz.doubles_hint")}</p>
            )}
          </div>

          {/* priority 2 — level range as a track */}
          <div>
            <WizLbl right={
              <button type="button" onClick={() => setAnyone(!anyone)} className="font-bold underline" style={{ fontSize: 13.5, opacity: 0.7, background: "transparent" }}>
                {anyone ? `${levelMin}–${levelMax}` : t("sos.anyone")}
              </button>
            }>{t("sos.level_range")}</WizLbl>
            {anyone ? (
              <div className="font-extrabold" style={{ fontSize: 16 }}>🤝 {t("sos.anyone")} <span className="font-semibold" style={{ fontSize: 13, opacity: 0.6 }}>(1–5)</span></div>
            ) : (
              <LevelTrack lo={levelMin} hi={levelMax} onChange={(lo, hi) => { setLevelMin(lo); setLevelMax(hi); }}
                endLow={t("wiz.lvl_low")} endHigh={t("wiz.lvl_high")} />
            )}
            <div className="text-sm font-semibold mt-1.5" style={{ opacity: 0.6 }}>{t("wiz.your_level", { n: myLevel, name: LEVELS.find((l) => l.n === myLevel)?.name ?? "" })}</div>
          </div>

          {/* each detail = its own visible row (label + current value), one tap
              to expand, second tap acts. No nested drawers (Oxy's two-click rule). */}
          <div className="space-y-2">
            <DetailCard>
              <AccordionRow label={t("sos.court_status")} value={statusLabel} last>
                <div className="flex flex-wrap gap-1.5 pb-3 px-3">
                  {COURT_STATUSES.map((s) => (
                    <button key={s.value} type="button" onClick={() => setCourtStatus(s.value)} className={`cchip ${courtStatus === s.value ? "cchip-on" : ""}`}>{courtStatusMeta(s.value, lang).label}</button>
                  ))}
                </div>
              </AccordionRow>
            </DetailCard>
            {!guest && !editing && buddies.length > 0 && (
              <DetailCard>
                <AccordionRow label={t("sos.invite_buddies")} last
                  value={inviteIds.length ? buddies.filter((b) => inviteIds.includes(b.id)).map((b) => b.name).slice(0, 2).join(", ") + (inviteIds.length > 2 ? ` +${inviteIds.length - 2}` : "") : "—"}>
                  <div className="pb-2 px-3">
                    {buddies.map((b) => {
                      const on = inviteIds.includes(b.id);
                      return (
                        <button key={b.id} type="button" className="w-full flex items-center gap-3 text-left" style={{ padding: "7px 0", background: "transparent" }}
                          onClick={() => setInviteIds((prev) => (on ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}>
                          <span className="flex-1 font-bold truncate" style={{ fontSize: 15.5 }}>{b.name}</span>
                          <CheckBox on={on} />
                        </button>
                      );
                    })}
                    <p className="font-semibold" style={{ fontSize: 12.5, opacity: 0.6, paddingBottom: 6 }}>{t("sos.invite_hint")}</p>
                  </div>
                </AccordionRow>
              </DetailCard>
            )}
            {/* Private mode for ANY kind: don't publish to the board — get a
                join link to send a friend, even one not in the app yet. */}
            {!guest && !editing && (
              <DetailCard>
                <ToggleRow label={`🎟 ${t("sos.invited_label")}`} info={t("sos.invited_hint")} on={invitedMode} onToggle={() => setInvitedMode(!invitedMode)} last />
              </DetailCard>
            )}
            {!guest && !urgent && !editing && !invitedMode && (
              <DetailCard>
                {/* Auto-flare is automation's call — no toggle to babysit
                    (audit D-22b). One quiet consequence line instead. */}
                <div className="px-3 py-2.5" style={{ fontWeight: 700, fontSize: 13.5, color: "rgba(43,33,24,0.65)" }}>
                  ⚡ {t("post.auto_flare_line")}
                </div>
              </DetailCard>
            )}
            {isAdmin && !editing && (
              <DetailCard>
                <AccordionRow label={`👻 ${t("sos.ghost_label")}`} value={ghostName.trim() || "—"} last>
                  <div className="pb-3 px-3">
                    <input className="cinput" placeholder={t("sos.ghost_ph")} value={ghostName} onChange={(e) => setGhostName(e.target.value)} maxLength={60} />
                    <p className="font-semibold mt-1" style={{ fontSize: 12.5, opacity: 0.65 }}>{t("sos.ghost_hint")}</p>
                  </div>
                </AccordionRow>
              </DetailCard>
            )}
          </div>

          <div>
            <WizLbl>{t("sos.note_label")}</WizLbl>
            <input className="cinput" placeholder={t("sos.note_placeholder")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} />
          </div>

          {/* live preview — how the game will land on the board */}
          <div>
            <div style={{ display: "flex", border: `1px solid ${HAIR}`, borderRadius: 12, overflow: "hidden", background: CARD }}>
              <div style={{ width: 62, flexShrink: 0, background: urgent ? "#FBE3DE" : "#EEF6D6", borderRight: `1px solid ${HAIR}`, borderLeft: `4px solid ${urgent ? CORAL : LIME}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 4px", textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 11.5, textTransform: "uppercase", color: "rgba(43,33,24,0.6)" }}>
                  {isToday ? t("wiz.today") : isTomorrow ? t("wiz.tomorrow") : date.toLocaleDateString(locale, { day: "numeric", month: "short" })}
                </div>
                <div className="font-display" style={{ fontSize: 19, marginTop: 1 }}>{time || "—"}</div>
                {flexible && untilTime && <div style={{ fontWeight: 700, fontSize: 10.5, color: "rgba(43,33,24,0.55)" }}>→{untilTime}</div>}
                <div style={{ fontSize: 15, marginTop: 2 }}>{effCtAny ? "🏟️" : courtType === "indoor" ? "🏠" : "☀️"}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: "9px 11px" }}>
                <div className="flex items-center gap-2.5">
                  <Avatar src={myPhoto} name={ghostName.trim() || myName || "P"} seed={uid ?? "me"} size={36} />
                  <div className="min-w-0">
                    <div className="font-display truncate" style={{ fontSize: 16.5 }}>{ghostName.trim() ? ghostName.trim() : t("wiz.hosting")}</div>
                    <div className="font-display truncate" style={{ fontSize: 14, color: WOOD }}>📍 {courtName || t("board.court")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>💳 {statusLabel}</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>
                    {anyone ? t("sos.anyone") : (<>L <span style={{ color: LV_COLORS[levelMin - 1] }}>{levelMin}</span>–<span style={{ color: LV_COLORS[levelMax - 1] }}>{levelMax}</span></>)}
                  </span>
                  <Rackets n={format === "singles" ? 2 : 4} size={19} />
                  {invitedMode && <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(43,33,24,0.6)" }}>🎟</span>}
                </div>
              </div>
            </div>
            <div className="text-center font-bold" style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>{t("wiz.preview_hint")}</div>
          </div>

          {/* which mode this post goes out as — stated where the decision lands */}
          {time && !editing && !guest && (
            <div className="flex items-start gap-2" aria-live="polite" style={{ fontWeight: 700, fontSize: 14, color: "rgba(43,33,24,0.65)" }}>
              <span className={urgent ? "sos-dot" : ""} style={{ width: 8, height: 8, borderRadius: "50%", background: urgent ? CORAL : invitedMode ? "rgba(43,33,24,0.45)" : LIME, marginTop: 5, flexShrink: 0 }} />
              <span>
                <b style={{ color: urgent ? CORAL : "var(--ink)" }}>{urgent ? "SOS" : invitedMode ? `🎟 ${t("post.mode_private_word")}` : t("post.mode_planned_word")}</b>
                {" · "}
                {urgent ? t("post.info_urgent") : invitedMode ? t("post.info_private") : t("post.info_planned")}
              </span>
            </div>
          )}

          {/* the one bright moment: filled coral CTA, no border */}
          {/* No time picked (step 1 skipped, or the slot expired) → the button
              stays live and takes the person back to the wheel, instead of a
              greyed-out button with no reason (2026-10 funnel audit). */}
          <button
            disabled={busy || (!!time && !canSubmit)}
            onClick={() => { if (!time) { setStep(0); return; } onSubmitClick(); }}
            className="w-full font-extrabold"
            style={{ background: CORAL, color: "#FFF6E8", border: "none", borderRadius: 12, padding: 16, fontSize: 18, opacity: busy || (!!time && !canSubmit) ? 0.55 : 1 }}
          >
            {busy ? "…" : !time ? t("post.pick_a_time") : guest ? `${t("post_pub.continue")} →` : editing ? t("sos.edit_save") : urgent ? t("post.cta_urgent") : t("post.cta_planned")}
          </button>
        </div>
      )}

    </div>
  );
}
