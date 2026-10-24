import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { AdminHealth } from "@/components/AdminHealth";
import { AdminWatchdog } from "@/components/AdminWatchdog";
import { AnnouncementAdmin } from "@/components/AnnouncementBanner";
import { Collapsible } from "@/components/Collapsible";
import { adminListCustomCourts, adminSetCourtHidden, adminUpdateCourt, shortCourtName, type AdminCourt } from "@/lib/courts";
import { fetchPendingEvents, setEventStatus, fetchEventContact, type EventRow } from "@/lib/events";
import { whenLabel, levelMeta, vibeEmoji, VIBES } from "@/lib/courtship";

function EventContactLine({ eventId }: { eventId: string }) {
  const [contact, setContact] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchEventContact(eventId).then((v) => { if (!cancelled) setContact(v); });
    return () => { cancelled = true; };
  }, [eventId]);
  if (!contact) return null;
  return <div className="text-sm text-[var(--ink)]">✉️ {contact}</div>;
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Courtship" }] }),
  component: AdminPage,
});

type Invite = { code: string; uses_remaining: number; active: boolean; created_at: string; signups?: number };
type PlayerRow = {
  id: string; name: string; last_name: string | null; phone_e164: string | null;
  level: number | null; formats: string[] | null; play_times: string[] | null;
  vibe: string | null; looking_for: string | null; home_courts: string | null;
  home_city: string | null; home_cities: string[] | null;
  buddy_optin: string | null; buddy_radius_km: number | null; buddy_sos_optin: boolean | null;
  bio: string | null; fav_shot: string | null; games_played: number | null;
  rescues_count: number; ghost_badge: boolean | null; is_admin: boolean | null;
  signup_code: string | null; created_at: string;
  // admin_players_list v3 (PACKAGE3 sql) — undefined until it is applied
  member_tier?: string | null; member_since?: string | null;
  installed_at?: string | null; last_seen_at?: string | null;
  push_on?: boolean | null; email_level?: string | null;
};
type CityStats = {
  sos_created_week: number;
  sos_claimed_week: number;
  open_posted_week: number;
  open_filled_pct: number;
  fill_rate_pct: number;
  median_ttc_min: number;
  all_time_games_confirmed: number;
};
type Dashboard = {
  profiles_total: number;
  profiles_new_week: number;
  rescuer_optin_pct: number;
  buddy_pairs: number;
  ghost_count: number;
  fill_rate_pct: number;
  by_city: Record<string, CityStats>;
};

function UsersEmails() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<{ id: string; email: string; name: string | null; created_at: string; last_sign_in_at: string | null }[] | null>(null);
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void (async () => {
      const { data, error } = await (supabase as any).rpc("admin_user_emails");
      if (error) { setMissing(/does not exist|schema cache/i.test(error.message || "")); setRows([]); return; }
      setRows((data as any[]) ?? []);
    })();
  }, []);
  const [subj, setSubj] = useState("");
  const [bodyTxt, setBodyTxt] = useState("");
  const [sending, setSending] = useState(false);
  // The last blast's outcome stays on screen (a toast is gone before you can
  // read "3 failed") — per address, never per batch (Lovable scan 2026-10-05).
  const [result, setResult] = useState<{ sent: number; total: number; skipped: number; failed: Array<{ to: string; detail: string }> } | null>(null);
  const emails = (rows ?? []).map((r) => r.email).filter(Boolean);
  async function sendBroadcast(test: boolean) {
    setSending(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("email-broadcast", {
        body: { subject: subj.trim(), body: bodyTxt.trim(), test },
      });
      if (error) { toast.error(String(error.message ?? error)); return; }
      if (!data?.ok && data?.error) { toast.error(String(data.error)); return; }
      if (test) { toast.success(t("admin.email_test_sent")); return; }
      const r = { sent: Number(data?.sent ?? 0), total: Number(data?.total ?? 0), skipped: Number(data?.skipped ?? 0), failed: Array.isArray(data?.failed) ? data.failed : [] };
      setResult(r);
      if (r.failed.length === 0) { toast.success(t("admin.email_sent_n", { sent: r.sent, total: r.total })); setSubj(""); setBodyTxt(""); }
      else toast.warning(t("admin.broadcast_failed_n", { n: r.failed.length }), { duration: 9000 });
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally { setSending(false); }
  }
  async function copyAll() {
    try { await navigator.clipboard.writeText(emails.join(", ")); toast.success(t("admin.emails_copied", { n: emails.length })); } catch { toast.error(t("admin.copy_failed")); }
  }
  return (
    <div className="ccard p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="csection-label">📧 {t("admin.users_emails")}{rows ? ` · ${rows.length}` : ""}</div>
        <div className="flex items-center gap-2">
          {emails.length > 0 && <button className="cbtn cbtn-ghost text-sm" onClick={copyAll}>{t("admin.copy_all")}</button>}
          {rows && rows.length > 0 && <button className="cbtn cbtn-ghost text-sm" onClick={() => setOpen(!open)}>{open ? t("admin.hide") : t("admin.show")}</button>}
        </div>
      </div>
      {missing && (
        <div className="text-sm font-semibold mt-2" style={{ opacity: 0.7 }}>
          {t("admin.emails_missing_pre")} <code>admin_user_emails.sql</code> {t("admin.emails_missing_post")}
        </div>
      )}
      {!missing && rows && rows.length === 0 && <div className="text-sm font-semibold mt-2" style={{ opacity: 0.7 }}>{t("admin.no_users")}</div>}
      {open && rows && rows.length > 0 && (
        <div className="mt-3 space-y-1 max-h-80 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-baseline justify-between gap-2 border-t border-[var(--ink)]/10 pt-1">
              <div className="min-w-0">
                <span className="font-extrabold text-sm">{r.name ?? "—"}</span>{" "}
                <span className="text-sm break-all">{r.email}</span>
              </div>
              <span className="text-xs shrink-0" style={{ opacity: 0.6 }}>{new Date(r.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}</span>
            </div>
          ))}
        </div>
      )}
      <div className="border-t border-[var(--ink)]/15 mt-3 pt-3 space-y-2">
        <div className="csection-label">📨 {t("admin.broadcast_title")}</div>
        <input className="cinput" placeholder={t("admin.broadcast_subject_ph")} value={subj} onChange={(e) => setSubj(e.target.value)} />
        <textarea className="cinput" rows={5} placeholder={t("admin.broadcast_body_ph")} value={bodyTxt} onChange={(e) => setBodyTxt(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <button className="cbtn cbtn-green text-sm" disabled={sending || !subj.trim() || !bodyTxt.trim()} onClick={() => void sendBroadcast(true)}>
            {sending ? "…" : t("admin.broadcast_test")}
          </button>
          <button className="cbtn cbtn-coral text-sm" disabled={sending || !subj.trim() || !bodyTxt.trim()} onClick={() => {
            if (confirm(t("admin.broadcast_confirm", { n: rows?.length ?? 0 }))) void sendBroadcast(false);
          }}>
            {sending ? "…" : `${t("admin.broadcast_send")}${rows ? ` (${rows.length})` : ""}`}
          </button>
        </div>
        {result && (
          <div className="rounded-xl p-3 text-sm" style={{ background: "var(--cream2)", border: "1px solid rgba(43,33,24,0.2)" }}>
            <div className="font-extrabold">{t("admin.broadcast_result", { sent: result.sent, total: result.total })}{result.skipped > 0 ? ` · ${t("admin.broadcast_skipped", { n: result.skipped })}` : ""}</div>
            {result.failed.length > 0 && (
              <div className="mt-1 space-y-0.5" style={{ opacity: 0.8 }}>
                <div className="font-bold">{t("admin.broadcast_failed_n", { n: result.failed.length })}</div>
                {result.failed.slice(0, 10).map((f) => <div key={f.to} className="break-all">{f.to} — {f.detail}</div>)}
                <div className="font-semibold">{t("admin.broadcast_retry_hint")}</div>
              </div>
            )}
          </div>
        )}
        <div className="text-xs font-semibold" style={{ opacity: 0.6 }}>
          {t("admin.broadcast_hint")}
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  const { t, lang } = useI18n();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [codes, setCodes] = useState<Invite[]>([]);
  const [adminCourts, setAdminCourts] = useState<AdminCourt[]>([]);
  const [editingCourt, setEditingCourt] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editArea, setEditArea] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newUses, setNewUses] = useState("10");
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [pendingEvents, setPendingEvents] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [supportSwish, setSupportSwish] = useState("");
  const [memLinks, setMemLinks] = useState<{ m: string; y: string; p: string }>({ m: "", y: "", p: "" });
  const [coachReqs, setCoachReqs] = useState<any[]>([]);

  async function load() {
    loadMemLinks();
    loadCoachReqs();
    // Hard gate on the caller's OWN is_admin (own-row read). Non-admins see nothing.
    const { data: me } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
    if (!me || !(me as any).is_admin) { setAllowed(false); return; }
    setAllowed(true);
    const cr = await (supabase as any).rpc("admin_invite_codes");
    if (!cr.error && Array.isArray(cr.data)) setCodes(cr.data as Invite[]);
    try { const { data: d } = await (supabase as any).rpc("admin_dashboard"); if (d) setDash(d as Dashboard); } catch { /* dashboard optional */ }
    try { setAdminCourts(await adminListCustomCourts()); } catch { /* ignore */ }
    try { setPendingEvents(await fetchPendingEvents()); } catch { /* ignore */ }
    try { const { data: pl } = await (supabase as any).rpc("admin_players_list"); if (Array.isArray(pl)) setPlayers(pl as PlayerRow[]); } catch { /* ignore */ }
    try { const { data: sw } = await (supabase as any).rpc("get_support_swish"); setSupportSwish(((sw as string | null) ?? "")); } catch { /* ignore */ }
  }

  useEffect(() => { load(); }, []);

  async function toggle(code: string, active: boolean) {
    const { error } = await (supabase as any).rpc("admin_set_invite_active", { _code: code, _active: active });
    if (error) { toast.error(error.message); return; }
    toast.success(active ? t("admin.reactivate") : t("admin.deactivate"));
    load();
  }

  async function createCode() {
    const code = newCode.trim().toUpperCase();
    if (!code) { toast.error(t("admin.code_required")); return; }
    let ownerId: string | null = null;
    if (newOwnerEmail.trim()) {
      const { data: u } = await (supabase as any).rpc("players_directory");
      const q = newOwnerEmail.trim().toLowerCase();
      ownerId = ((u as any[]) ?? []).find((p) => (p.name ?? "").toLowerCase().includes(q))?.id ?? null;
    }
    const { error } = await (supabase as any).rpc("admin_create_invite_code", {
      _code: code, _owner_id: ownerId, _uses: Number(newUses) || 1,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin.created_ok"));
    setNewCode(""); setNewUses("10"); setNewOwnerEmail("");
    load();
  }

  async function removeCode(code: string) {
    if (typeof window !== "undefined" && !window.confirm(t("admin.delete_confirm", { code }))) return;
    const { error } = await (supabase as any).rpc("admin_delete_invite_code", { _code: code });
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin.code_deleted"));
    load();
  }

  async function loadCoachReqs() {
    try {
      const { data } = await (supabase as any).rpc("admin_list_coach_requests");
      setCoachReqs((data as any[]) ?? []);
    } catch { /* pre-SQL */ }
  }

  async function setCoachStatus(id: string, status: string) {
    const { error } = await (supabase as any).rpc("admin_set_coach_request", { _id: id, _status: status });
    if (error) { toast.error(error.message); return; }
    toast.success(t("mem.admin_saved"));
    void loadCoachReqs();
  }

  async function loadMemLinks() {
    try {
      const { data } = await (supabase as any).rpc("get_member_config");
      const next = { m: "", y: "", p: "" };
      for (const r of ((data as any[]) ?? [])) {
        if (r.key === "stripe_member_monthly") next.m = r.value;
        if (r.key === "stripe_member_yearly") next.y = r.value;
        if (r.key === "stripe_pro_monthly") next.p = r.value;
      }
      setMemLinks(next);
    } catch { /* pre-SQL */ }
  }

  async function saveMemLink(key: string, value: string) {
    const { error } = await (supabase as any).rpc("set_member_config", { _key: key, _value: value.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("mem.admin_saved"));
  }

  async function saveSupportSwish() {
    const { error } = await (supabase as any).rpc("set_support_swish", { _number: supportSwish.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success(t("admin.support_saved"));
  }

  if (allowed === null) return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  if (allowed === false) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl">{t("admin.denied_title")}</h1>
        <p className="text-[var(--ink)] font-semibold">{t("admin.denied_body")}</p>
        <Link to="/board" className="cbtn cbtn-green inline-flex">{t("admin.denied_back")}</Link>
      </div>
    );
  }

  const cities = dash ? Object.keys(dash.by_city ?? {}) : [];

  async function approveEvent(id: string) {
    try { await setEventStatus(id, "approved"); setPendingEvents((p) => p.filter((e) => e.id !== id)); toast.success(t("admin.ev_approved")); }
    catch (e: any) { toast.error(e?.message ?? t("admin.error")); }
  }
  async function rejectEvent(id: string) {
    try { await setEventStatus(id, "rejected"); setPendingEvents((p) => p.filter((e) => e.id !== id)); toast.success(t("admin.ev_rejected")); }
    catch (e: any) { toast.error(e?.message ?? t("admin.error")); }
  }

  async function toggleCourtHidden(c: AdminCourt) {
    try {
      await adminSetCourtHidden(c.id, !c.hidden);
      setAdminCourts((p) => p.map((x) => x.id === c.id ? { ...x, hidden: !c.hidden } : x));
    } catch (e: any) { toast.error(e?.message ?? t("admin.error")); }
  }

  function startEdit(c: AdminCourt) {
    setEditingCourt(c.id); setEditName(c.name); setEditArea(c.area ?? "");
  }
  async function saveEdit(c: AdminCourt) {
    try {
      await adminUpdateCourt(c.id, editName, editArea);
      setAdminCourts((p) => p.map((x) => x.id === c.id ? { ...x, name: editName.trim(), area: editArea.trim() || null } : x));
      setEditingCourt(null);
      toast.success(t("admin.court_saved"));
    } catch (e: any) { toast.error(e?.message ?? t("admin.error")); }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="csection-label">{t("admin.tag")}</div>
        <h1 className="font-display text-4xl mt-1">{t("admin.title")}</h1>
      </div>

      {/* What broke / what works — first, always (Oxy 2026-10-06) */}
      <AdminHealth />
      <AdminWatchdog />

      <AnnouncementAdmin />

      <UsersEmails />

      <MembersAndInstalls players={players} onChange={load} />

      <LifecycleEmailsCard />

      {pendingEvents.length > 0 && (
        <div>
          <div className="csection-label mb-2">🎉 {t("admin.pending_events")}</div>
          <div className="space-y-2">
            {pendingEvents.map((e) => (
              <div key={e.id} className="ccard p-4 space-y-2" style={{ borderColor: "var(--coral)" }}>
                <div className="font-display text-xl leading-tight">{e.title}</div>
                <div className="text-sm text-[var(--ink)] font-semibold">
                  {whenLabel(e.starts_at)} · 📍 {e.city ? e.city + " · " : ""}{shortCourtName(e.location)}
                </div>
                {(e.price_sek || e.capacity) && (
                  <div className="text-sm text-[var(--ink)]">🎟 {e.price_sek ? t("ev.price_kr", { n: e.price_sek }) : t("ev.free")}{e.capacity ? ` · ${t("ev.spots_n", { n: e.capacity })}` : ""}</div>
                )}
                {e.format && <div className="text-sm text-[var(--ink)]">{e.format}</div>}
                {e.description && <div className="text-sm italic text-[var(--ink)]">"{e.description}"</div>}
                <EventContactLine eventId={e.id} />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => approveEvent(e.id)} className="cbtn cbtn-green flex-1">{t("admin.ev_approve")}</button>
                  <button onClick={() => rejectEvent(e.id)} className="cbtn cbtn-ghost flex-1">{t("admin.ev_reject")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero fill rate */}
      <div className="ccard p-5 text-center" style={{ background: "var(--coral)", color: "var(--ink)" }}>
        <div className="csection-label" style={{ color: "#FFF6E8" }}>{t("admin.fill_rate")}</div>
        <div className="font-display text-7xl leading-none mt-1">{dash?.fill_rate_pct ?? 0}%</div>
        <div className="text-base font-semibold mt-1 opacity-90">{t("admin.fill_target")}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t("admin.profiles_total")} value={dash?.profiles_total ?? 0} />
        <Stat label={t("admin.profiles_week")} value={`+${dash?.profiles_new_week ?? 0}`} />
        <Stat label={t("admin.rescuer_optin")} value={`${dash?.rescuer_optin_pct ?? 0}%`} />
        <Stat label={t("admin.buddy_pairs")} value={dash?.buddy_pairs ?? 0} />
        <Stat label={t("admin.ghost_count")} value={dash?.ghost_count ?? 0} />
      </div>

      {/* By city */}
      <div>
        <div className="csection-label mb-2">{t("admin.by_city")}</div>
        <div className="space-y-3">
          {cities.map((cy) => {
            const c = dash!.by_city[cy];
            return (
              <div key={cy} className="ccard p-4 space-y-2">
                <div className="font-display text-2xl">📍 {cy}</div>
                <div className="grid grid-cols-2 gap-2 text-base">
                  <CityStat label={t("admin.sos_created")} value={c.sos_created_week} />
                  <CityStat label={t("admin.sos_claimed")} value={c.sos_claimed_week} />
                  <CityStat label={t("admin.open_posted")} value={c.open_posted_week} />
                  <CityStat label={t("admin.open_filled")} value={`${c.open_filled_pct}%`} />
                  <CityStat label={t("admin.median_ttc")} value={t("admin.minutes", { n: c.median_ttc_min })} />
                  <CityStat label={t("admin.all_time_games")} value={c.all_time_games_confirmed} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="csection-label mb-2">{t("admin.invite_codes")}</div>
        <div className="ccard p-3 space-y-2 mb-3">
          <div className="font-extrabold">{t("admin.new_code")}</div>
          <input className="cinput" placeholder={t("admin.code_placeholder")} value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <input className="cinput" placeholder={t("admin.uses_placeholder")} type="number" value={newUses} onChange={(e) => setNewUses(e.target.value)} />
          <input className="cinput" placeholder={t("admin.owner_placeholder")} value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} />
          <button onClick={createCode} className="cbtn cbtn-green w-full">{t("admin.create")}</button>
        </div>
        <div className="space-y-2">
          {codes.length === 0 ? (
            <div className="ccard p-4 text-center text-[var(--ink)]">{t("admin.no_codes")}</div>
          ) : codes.map((c) => (
            <div key={c.code} className="ccard p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display text-base tracking-wide truncate">{c.code}</div>
                <div className="text-sm text-[var(--ink)]">{t("admin.uses_left", { n: c.uses_remaining })} · {t("admin.joined_n", { n: c.signups ?? 0 })}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggle(c.code, !c.active)}
                  className="inline-flex items-center gap-1.5 text-sm font-extrabold px-2.5 py-1 rounded-full"
                  style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
                  title={c.active ? t("admin.code_active_hint") : t("admin.code_off_hint")}
                >
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.active ? "var(--green-pop)" : "#c9c4bb" }} />
                  {c.active ? t("admin.code_active") : t("admin.code_off")}
                </button>
                <button type="button" onClick={() => removeCode(c.code)} className="text-base px-2 py-1 opacity-60" title={t("admin.code_delete")}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {players.length > 0 && (
        <div>
          <div className="csection-label mb-2">👥 {t("admin.all_players")} · {players.length}</div>
          <div className="space-y-2">
            {players.map((p) => {
              const lvl = p.level ? levelMeta(p.level) : null;
              const city = (p.home_cities && p.home_cities.length > 0 ? p.home_cities.join(" · ") : p.home_city) || null;
              const hasPlay = (p.formats && p.formats.length > 0) || (p.play_times && p.play_times.length > 0);
              return (
                <div key={p.id} className="ccard p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold truncate">
                        {[p.name, p.last_name].filter(Boolean).join(" ") || "—"}
                        {p.is_admin ? <span className="ml-1.5 text-xs font-extrabold text-[var(--coral)]">{t("admin.badge_admin")}</span> : null}
                      </div>
                      {(lvl || p.vibe || p.looking_for) ? (
                        <div className="text-sm text-[var(--ink)]/60 truncate">
                          {lvl ? <span className="font-bold" style={{ color: lvl.color }}>{lvl.name}</span> : null}
                          {p.vibe ? <> · {vibeEmoji(p.vibe)} {VIBES.find((v) => v.value === p.vibe)?.label ?? ""}</> : null}
                          {p.looking_for ? <> · {p.looking_for}</> : null}
                        </div>
                      ) : null}
                    </div>
                    {p.signup_code ? (
                      <span className="text-xs font-extrabold shrink-0 px-2 py-0.5 rounded-full" style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}>{p.signup_code}</span>
                    ) : (
                      <span className="text-xs shrink-0 text-[var(--ink)]/40">{t("admin.no_code")}</span>
                    )}
                  </div>
                  {hasPlay ? (
                    <div className="text-sm text-[var(--ink)]/60">
                      {[p.formats && p.formats.length > 0 ? p.formats.join(" · ") : null, p.play_times && p.play_times.length > 0 ? p.play_times.join(" · ") : null].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                  {city ? <div className="text-sm text-[var(--ink)]/60">📍 {city}{p.home_courts ? ` · ${p.home_courts}` : ""}</div> : null}
                  {p.phone_e164 ? <div className="text-sm text-[var(--ink)]/60">📞 {p.phone_e164}</div> : null}
                  {p.bio ? <div className="text-sm italic text-[var(--ink)]/60">"{p.bio}"</div> : null}
                  {p.fav_shot ? <div className="text-sm text-[var(--ink)]/60">🎾 {p.fav_shot}</div> : null}
                  <div className="text-xs text-[var(--ink)]/40">
                    🎮 {p.games_played ?? 0} · 🚑 {p.rescues_count ?? 0}{p.buddy_optin === "yes" ? ` · ${t("admin.player_buddy_km", { n: p.buddy_radius_km ?? 10 })}` : ""}{p.ghost_badge ? " · 🪦" : ""} · {new Date(p.created_at).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}
                  </div>
                  {p.installed_at !== undefined && (
                    <div className="text-xs font-bold" style={{ color: "rgba(43,33,24,0.6)" }}>
                      {p.installed_at ? t("admin.p_installed", { d: shortDate(p.installed_at, lang) }) : t("admin.p_not_installed")}
                      {" · "}{p.push_on ? t("admin.p_push") : t("admin.p_no_push")}
                      {p.last_seen_at ? ` · ${t("admin.p_seen", { d: shortDate(p.last_seen_at, lang) })}` : ""}
                      {p.member_tier ? ` · ${p.member_tier === "pro" ? "💼 PRO" : "🏆 " + p.member_tier}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="csection-label mb-2">{t("admin.courts_title")}</div>
        {adminCourts.length === 0 ? (
          <div className="ccard p-4 text-center text-[var(--ink)]">{t("admin.courts_empty")}</div>
        ) : (
          <div className="space-y-2">
            {adminCourts.map((c) => (
              <div key={c.id} className="ccard p-3 space-y-2" style={c.hidden ? { opacity: 0.6 } : undefined}>
                {editingCourt === c.id ? (
                  <div className="space-y-2">
                    <input className="cinput" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <input className="cinput" value={editArea} onChange={(e) => setEditArea(e.target.value)} placeholder={t("court.area_placeholder")} />
                    <div className="flex gap-2">
                      <button onClick={() => setEditingCourt(null)} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
                      <button onClick={() => saveEdit(c)} className="cbtn cbtn-green flex-1">{t("admin.save")}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="font-display text-xl">📍 {c.city} · {c.name}</div>
                    {c.area && <div className="text-base text-[var(--ink)]">{c.area}</div>}
                    <div className="text-base text-[var(--ink)]">
                      {t("admin.court_by", { name: c.creator_name ?? "—" })} · {t("admin.court_usage", { n: c.usage_count })}
                      {c.hidden && ` · ${t("admin.court_hidden")}`}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => startEdit(c)} className="cbtn cbtn-ghost">{t("admin.edit")}</button>
                      <button onClick={() => toggleCourtHidden(c)} className={`cbtn ${c.hidden ? "cbtn-green" : "cbtn-ghost"}`}>
                        {c.hidden ? t("admin.unhide") : t("admin.hide")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Collapsible title={`🎓 ${t("coach.admin_title")} (${coachReqs.filter((r) => r.status === "new").length})`}>
        <div className="space-y-3">
          {coachReqs.length === 0 && <div className="text-sm text-[var(--ink)]/60">{t("coach.admin_empty")}</div>}
          {coachReqs.map((r) => (
            <div key={r.id} className="rounded-2xl border-2 border-[var(--ink)] p-3 space-y-1.5" style={{ background: "var(--cream)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold truncate">{r.name}{r.last_name ? " " + r.last_name : ""} · L{r.level}</span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: r.status === "new" ? "var(--coral)" : r.status === "matched" ? "var(--green-pop)" : "var(--cream2)", color: "var(--ink)", border: "1.5px solid var(--ink)" }}>
                  {r.status}
                </span>
              </div>
              <div className="text-sm font-semibold">{r.sport} · "{r.goal}"</div>
              {Array.isArray(r.availability) && r.availability.length > 0 && (
                <div className="text-xs font-bold text-[var(--ink)]/60">🕐 {r.availability.join(" · ")}</div>
              )}
              {r.note && <div className="text-xs italic text-[var(--ink)]/70">"{r.note}"</div>}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {r.phone_e164 && (
                  <a className="cchip" href={`https://wa.me/${String(r.phone_e164).replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
                )}
                {r.status === "new" && <button className="cchip" onClick={() => setCoachStatus(r.id, "in_progress")}>▶ {t("coach.st_progress")}</button>}
                {(r.status === "new" || r.status === "in_progress") && <button className="cchip" onClick={() => setCoachStatus(r.id, "matched")}>✅ {t("coach.st_matched")}</button>}
                {r.status !== "closed" && <button className="cchip" onClick={() => setCoachStatus(r.id, "closed")}>🗄 {t("coach.st_closed")}</button>}
              </div>
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title={`💳 ${t("mem.admin_links_title")}`}>
        <div className="space-y-2">
          <div className="text-sm text-[var(--ink)]/60">{t("mem.admin_links_hint")}</div>
          <label className="csection-label">{t("admin.plan_member_monthly")}</label>
          <input className="cinput" value={memLinks.m} onChange={(e) => setMemLinks({ ...memLinks, m: e.target.value })} placeholder="https://buy.stripe.com/..." />
          <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => saveMemLink("stripe_member_monthly", memLinks.m)}>{t("admin.support_save")}</button>
          <label className="csection-label">{t("admin.plan_member_yearly")}</label>
          <input className="cinput" value={memLinks.y} onChange={(e) => setMemLinks({ ...memLinks, y: e.target.value })} placeholder="https://buy.stripe.com/..." />
          <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => saveMemLink("stripe_member_yearly", memLinks.y)}>{t("admin.support_save")}</button>
          <label className="csection-label">{t("admin.plan_pro_monthly")}</label>
          <input className="cinput" value={memLinks.p} onChange={(e) => setMemLinks({ ...memLinks, p: e.target.value })} placeholder="https://buy.stripe.com/..." />
          <button type="button" className="cbtn cbtn-ghost w-full" onClick={() => saveMemLink("stripe_pro_monthly", memLinks.p)}>{t("admin.support_save")}</button>
        </div>
      </Collapsible>

      <Collapsible title={t("admin.support_title")}>
        <div className="space-y-2">
          <div className="text-sm text-[var(--ink)]/60">{t("admin.support_hint")}</div>
          <input className="cinput" value={supportSwish} onChange={(e) => setSupportSwish(e.target.value)} placeholder={t("admin.support_ph")} inputMode="tel" />
          <button type="button" className="cbtn cbtn-green w-full" onClick={saveSupportSwish}>{t("admin.support_save")}</button>
        </div>
      </Collapsible>

      <LegalQueues />
    </div>
  );
}

/** Legal pack (2026-07-20): DSA report queue + consumer withdrawal queue.
 *  Admin-only surface — plain English on purpose (admin i18n is deferred).
 *  DSA art. 17 reminder: when you action a report, tell the affected member
 *  what you did and why (email/WhatsApp) — the note field is your record. */
function LegalQueues() {
  const [reports, setReports] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);

  async function loadLegal() {
    try {
      const [{ data: r }, { data: w }] = await Promise.all([
        (supabase as any).rpc("admin_list_reports"),
        (supabase as any).rpc("admin_list_withdrawals"),
      ]);
      setReports(r ?? []);
      setWithdrawals(w ?? []);
    } catch { /* pre-SQL */ }
  }
  useEffect(() => { void loadLegal(); }, []);

  async function resolveReport(id: string, status: string) {
    const note = status === "actioned" ? window.prompt("What did you do? (kept as the art. 17 record; tell the member too)") : null;
    const { error } = await (supabase as any).rpc("admin_resolve_report", { _id: id, _status: status, _note: note });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); void loadLegal(); }
  }

  async function resolveWithdrawal(id: string, status: string) {
    const { error } = await (supabase as any).rpc("admin_resolve_withdrawal", { _id: id, _status: status });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); void loadLegal(); }
  }

  const newReports = reports.filter((r) => r.status === "new").length;
  const newWithdrawals = withdrawals.filter((w) => w.status === "new").length;

  return (
    <>
      <Collapsible title={`🚩 Reports (${newReports})`}>
        <div className="space-y-3">
          {reports.length === 0 && <div className="text-sm text-[var(--ink)]/60">No reports. Quiet courts, happy community.</div>}
          {reports.map((r) => (
            <div key={r.id} className="rounded-2xl border-2 border-[var(--ink)] p-3 space-y-1.5" style={{ background: "var(--cream)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold truncate">→ {r.target_name || "?"}</span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: r.status === "new" ? "var(--coral)" : "var(--cream2)", color: r.status === "new" ? "#FFF6E8" : "var(--ink)", border: "1.5px solid var(--ink)" }}>
                  {r.status}
                </span>
              </div>
              <div className="text-sm font-semibold">{r.reason} · from {r.reporter_name || "(deleted account)"} · {new Date(r.created_at).toLocaleDateString()}</div>
              {r.details && <div className="text-xs italic text-[var(--ink)]/70">"{r.details}"</div>}
              {r.resolution_note && <div className="text-xs font-bold text-[var(--ink)]/60">Action: {r.resolution_note}</div>}
              {r.status === "new" && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button className="cchip" onClick={() => resolveReport(r.id, "actioned")}>✅ Actioned</button>
                  <button className="cchip" onClick={() => resolveReport(r.id, "reviewed")}>👀 Reviewed</button>
                  <button className="cchip" onClick={() => resolveReport(r.id, "dismissed")}>🗄 Dismiss</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Collapsible>

      <Collapsible title={`↩️ Withdrawals — ångerrätt (${newWithdrawals})`}>
        <div className="space-y-3">
          <div className="text-sm text-[var(--ink)]/60">14-day right: refund via Swish/Stripe within 14 days of the request, then mark it here.</div>
          {withdrawals.length === 0 && <div className="text-sm text-[var(--ink)]/60">No withdrawal requests.</div>}
          {withdrawals.map((w) => (
            <div key={w.id} className="rounded-2xl border-2 border-[var(--ink)] p-3 space-y-1.5" style={{ background: "var(--cream)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold truncate">{w.name} · {w.email}</span>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: w.status === "new" ? "var(--coral)" : "var(--cream2)", color: w.status === "new" ? "#FFF6E8" : "var(--ink)", border: "1.5px solid var(--ink)" }}>
                  {w.status}
                </span>
              </div>
              <div className="text-sm font-semibold">{w.purchase} · ref {String(w.id).slice(0, 8)} · {new Date(w.created_at).toLocaleDateString()}</div>
              {w.note && <div className="text-xs italic text-[var(--ink)]/70">"{w.note}"</div>}
              {w.status === "new" && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button className="cchip" onClick={() => resolveWithdrawal(w.id, "refunded")}>💸 Refunded</button>
                  <button className="cchip" onClick={() => resolveWithdrawal(w.id, "rejected")}>🚫 Rejected</button>
                  <button className="cchip" onClick={() => resolveWithdrawal(w.id, "invalid")}>🗄 Invalid</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Collapsible>
    </>
  );
}

function shortDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short" });
}

type Claim = { id: string; user_id: string; name: string | null; last_name: string | null; tier: string; period: string; amount_sek: number; status: string; created_at: string; resolved_at: string | null };

/** Who paid (Swish claims to confirm), who is a member, who installed the
 *  home-screen shortcut and who has push on — the questions Oxy asked on
 *  2026-10-05. Needs the PACKAGE3 sql (admin_players_list v3 + claims). */
function MembersAndInstalls({ players, onChange }: { players: PlayerRow[]; onChange: () => void }) {
  const { t, lang } = useI18n();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [sqlMissing, setSqlMissing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  async function loadClaims() {
    const { data, error } = await (supabase as any).rpc("admin_membership_claims");
    if (error) { setSqlMissing(/does not exist|schema cache/i.test(error.message || "")); setClaims([]); return; }
    setClaims((data as Claim[]) ?? []);
  }
  useEffect(() => { void loadClaims(); }, []);
  async function resolve(id: string, approve: boolean) {
    const { error } = await (supabase as any).rpc("admin_resolve_claim", { _id: id, _approve: approve });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? t("admin.claim_approved") : t("admin.claim_dismissed"));
    await loadClaims();
    onChange();
  }
  const total = players.length;
  const tracked = players.length > 0 && players[0].installed_at !== undefined;
  const installed = players.filter((p) => !!p.installed_at).length;
  const pushOn = players.filter((p) => !!p.push_on).length;
  const members = players.filter((p) => !!p.member_tier);
  const pending = claims.filter((c) => c.status === "pending");
  const fmtName = (c: Claim) => [c.name, c.last_name].filter(Boolean).join(" ") || "—";
  return (
    <div className="ccard p-4 space-y-3">
      <div className="csection-label">💸 {t("admin.members_title")}</div>
      {(sqlMissing || !tracked) && (
        <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("admin.members_sql_missing")}</div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("admin.installed")} value={tracked ? `${installed}/${total}` : "—"} />
        <Stat label={t("admin.push_on")} value={tracked ? `${pushOn}/${total}` : "—"} />
        <Stat label={t("admin.members")} value={members.length} />
      </div>
      <div>
        <div className="font-extrabold text-sm mb-1">{t("admin.claims_pending")}{pending.length ? ` · ${pending.length}` : ""}</div>
        {pending.length === 0 ? (
          <div className="text-sm font-semibold" style={{ opacity: 0.6 }}>{t("admin.no_claims")}</div>
        ) : (
          <div className="space-y-2">
            {pending.map((c) => (
              <div key={c.id} className="rounded-xl p-3" style={{ border: "1.5px solid var(--coral)", background: "var(--cream2)" }}>
                <div className="font-extrabold">{fmtName(c)}</div>
                <div className="text-sm font-semibold" style={{ opacity: 0.75 }}>
                  {c.tier === "pro" ? "💼 Pro" : "🏆 Founding"} · {c.period} · {c.amount_sek} kr · {shortDate(c.created_at, lang)}
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" className="cbtn cbtn-green flex-1 text-sm" onClick={() => void resolve(c.id, true)}>✓ {t("admin.claim_approve")}</button>
                  <button type="button" className="cbtn cbtn-ghost flex-1 text-sm" onClick={() => void resolve(c.id, false)}>{t("admin.claim_dismiss")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {members.length > 0 && (
        <div>
          <div className="font-extrabold text-sm mb-1">{t("admin.members")} · {members.length}</div>
          <div className="space-y-1">
            {members.map((p) => (
              <div key={p.id} className="flex items-baseline justify-between gap-2 border-t border-[var(--ink)]/10 pt-1 text-sm">
                <span className="font-extrabold truncate">{[p.name, p.last_name].filter(Boolean).join(" ") || "—"}</span>
                <span className="shrink-0" style={{ opacity: 0.7 }}>{p.member_tier === "pro" ? "💼 Pro" : "🏆 " + p.member_tier}{p.member_since ? ` · ${t("admin.member_since", { d: shortDate(p.member_since, lang) })}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tracked && total - installed > 0 && (
        <div>
          <button type="button" className="font-extrabold text-sm underline" onClick={() => setShowAll(!showAll)}>
            {showAll ? t("admin.hide") : t("admin.not_installed_list", { n: total - installed })}
          </button>
          {showAll && (
            <div className="mt-1 text-sm font-semibold" style={{ opacity: 0.75 }}>
              {players.filter((p) => !p.installed_at).map((p) => [p.name, p.last_name].filter(Boolean).join(" ") || "—").join(" · ")}
            </div>
          )}
        </div>
      )}
      {claims.some((c) => c.status !== "pending") && (
        <div className="text-xs font-semibold" style={{ opacity: 0.55 }}>
          {t("admin.claims_history", { n: claims.filter((c) => c.status !== "pending").length })}
        </div>
      )}
    </div>
  );
}

const LIFECYCLE_TEMPLATES = ["welcome_0", "welcome_1", "install_3", "community_7", "invite_14", "push_off", "fading", "sleeping", "unfinished", "digest"] as const;

/** Switch + window into the lifecycle emails (Edge Function `lifecycle-emails`):
 *  a dry run shows who would get what today; a preview sends any template to
 *  the admin's own inbox. Everything stays off until the switch is flipped. */
function LifecycleEmailsCard() {
  const { t, lang } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Array<{ template: string | null; sent_7d: number; sent_30d: number; last_sent: string | null }>>([]);
  const [sqlMissing, setSqlMissing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dry, setDry] = useState<any>(null);
  const [preview, setPreview] = useState<string>("welcome_0");
  async function loadStatus() {
    const { data, error } = await (supabase as any).rpc("admin_lifecycle_status");
    if (error) { setSqlMissing(/does not exist|schema cache/i.test(error.message || "")); return; }
    const rows = (data as any[]) ?? [];
    setEnabled(rows.length ? !!rows[0].enabled : false);
    setStats(rows.filter((r) => r.template));
  }
  useEffect(() => { void loadStatus(); }, []);
  async function flip(on: boolean) {
    const { error } = await (supabase as any).rpc("admin_set_lifecycle", { _on: on });
    if (error) { toast.error(error.message); return; }
    setEnabled(on);
    toast.success(on ? t("admin.lc_on_toast") : t("admin.lc_off_toast"));
  }
  async function call(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const { data, error } = await (supabase as any).functions.invoke("lifecycle-emails", { body });
      if (error) { toast.error(String(error.message ?? error)); return null; }
      if (data && data.ok === false && data.error) { toast.error(String(data.error)); return null; }
      return data;
    } catch (e: any) { toast.error(String(e?.message ?? e)); return null; }
    finally { setBusy(null); }
  }
  async function dryRun() {
    const d = await call({ dry: true }, "dry");
    if (d) setDry(d);
  }
  async function sendPreview() {
    const d = await call({ preview }, "preview");
    if (d?.ok) toast.success(t("admin.lc_preview_sent"));
  }
  return (
    <div className="ccard p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="csection-label">📬 {t("admin.lc_title")}</div>
        {enabled !== null && (
          <button type="button" onClick={() => void flip(!enabled)} className="cchip" style={{ background: enabled ? "var(--green-pop)" : "var(--cream2)" }}>
            {enabled ? t("admin.lc_on") : t("admin.lc_off")}
          </button>
        )}
      </div>
      {sqlMissing && <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("admin.members_sql_missing")}</div>}
      <div className="text-sm font-semibold" style={{ opacity: 0.75 }}>{t("admin.lc_sub")}</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy !== null} className="cbtn cbtn-ghost text-sm" onClick={() => void dryRun()}>{busy === "dry" ? "…" : t("admin.lc_dry")}</button>
        <div className="flex gap-1">
          <select className="cinput" style={{ padding: "6px 8px", fontSize: 13 }} value={preview} onChange={(e) => setPreview(e.target.value)}>
            {LIFECYCLE_TEMPLATES.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button type="button" disabled={busy !== null} className="cbtn cbtn-ghost text-sm shrink-0" onClick={() => void sendPreview()}>{busy === "preview" ? "…" : t("admin.lc_preview")}</button>
        </div>
      </div>
      {dry && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "var(--cream2)", border: "1px solid rgba(43,33,24,0.2)" }}>
          <div className="font-extrabold">{t("admin.lc_dry_result", { n: Object.values(dry.planned ?? {}).reduce((a: number, b: any) => a + Number(b), 0), users: dry.users ?? 0 })}</div>
          <div className="font-semibold mt-1" style={{ opacity: 0.8 }}>
            {Object.entries(dry.planned ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || t("admin.lc_nothing_today")}
          </div>
          {Array.isArray(dry.sample) && dry.sample.length > 0 && (
            <div className="mt-2 space-y-0.5" style={{ opacity: 0.75 }}>
              {dry.sample.slice(0, 15).map((r: any, i: number) => <div key={i}>{r.name} → <b>{r.template}</b> <span style={{ opacity: 0.7 }}>({r.reason})</span></div>)}
            </div>
          )}
        </div>
      )}
      {stats.length > 0 && (
        <div className="text-xs font-semibold space-y-0.5" style={{ opacity: 0.7 }}>
          {stats.map((r) => (
            <div key={r.template ?? "?"}>{r.template}: {t("admin.lc_stat", { a: r.sent_7d, b: r.sent_30d })}{r.last_sent ? ` · ${new Date(r.last_sent).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short" })}` : ""}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ccard p-3 text-center">
      <div className="csection-label">{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}

function CityStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-2 border-[var(--ink)] rounded-xl p-2 text-center bg-[var(--cream2)]">
      <div className="csection-label">{label}</div>
      <div className="font-display text-xl mt-1">{value}</div>
    </div>
  );
}