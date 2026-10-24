import { createFileRoute, Link } from "@tanstack/react-router";
import { Rackets } from "@/components/RailKit";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { LEVELS, PLAY_TIMES, levelMeta, vibeEmoji, monogramColors, type City, sportMeta } from "@/lib/courtship";
import { useCityNames } from "@/lib/cities";
import { useI18n } from "@/lib/i18n";
import { shareInvite, copyText } from "@/lib/share";
import { fetchBuddyIds, fetchPendingRequestsTo, respondBuddyRequest, type BuddyRequest } from "@/lib/buddies";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { fetchPublicPlayers } from "@/lib/guest";

export const Route = createFileRoute("/_authenticated/players/")({
  head: () => ({ meta: [{ title: "Players — Courtship" }] }),
  component: Players,
});

type P = {
  id: string; name: string; last_name: string | null; photo_url: string | null;
  level: number; formats: string[]; play_times: string[]; vibe: string; buddy_optin: string;
  home_courts: string | null; home_city: string | null; home_cities: string[] | null;
  rescues_count: number | null; games_played: number | null; bio: string | null;
  member_tier?: string | null;
  sports?: string[] | null;
};

function Players() {
  const { t } = useI18n();
  const [rows, setRows] = useState<P[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<number | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [buddiesOnly, setBuddiesOnly] = useState(false);
  const [city, setCity] = useState<City | null>(null);
  const [buddyIds, setBuddyIds] = useState<Set<string>>(new Set());
  const [meId, setMeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selfRow, setSelfRow] = useState<P | null>(null);
  const [mySports, setMySports] = useState<string[]>(["tennis"]);
  const [sportLens, setSportLens] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // buddy requests (moved here from the old People page)
  const [reqs, setReqs] = useState<BuddyRequest[]>([]);
  const [reqNames, setReqNames] = useState<Record<string, string>>({});

  async function loadReqs(uid: string) {
    const r = await fetchPendingRequestsTo(uid).catch(() => [] as BuddyRequest[]);
    setReqs(r);
    if (r.length) {
      const { data } = await (supabase as any).rpc("players_directory", { _ids: r.map((x) => x.from_id) });
      const m: Record<string, string> = {};
      (data as any[] | null)?.forEach((n) => { m[n.id] = n.name; });
      setReqNames(m);
    }
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      const uid = u.user?.id ?? null;
      setMeId(uid);
      const [buddies, meRes, dirRes] = await Promise.all([
        uid ? fetchBuddyIds(uid).catch(() => new Set<string>()) : Promise.resolve(new Set<string>()),
        uid ? (supabase as any).rpc("get_my_full_profile").maybeSingle().then((r: any) => r, () => null) : Promise.resolve(null),
        uid ? (supabase as any).rpc("players_directory").then((r: any) => r, () => ({ data: [] })) : fetchPublicPlayers().then((rows) => ({ data: rows })),
      ]);
      setBuddyIds(buddies as Set<string>);
      const meRow = (meRes as any)?.data;
      setIsAdmin(!!meRow?.is_admin);
      {
        const sp = ((meRow?.sports as string[] | null) ?? ["tennis"]);
        setMySports(sp.length ? sp : ["tennis"]);
      }
      if (meRow) setSelfRow(meRow as P);
      setRows(((dirRes as any)?.data as any) ?? []);
      setLoading(false);
      if (uid) loadReqs(uid);
    })();
  }, []);

  async function respond(req: BuddyRequest, accept: boolean) {
    try {
      await respondBuddyRequest(req.id, accept);
      setReqs((p) => p.filter((x) => x.id !== req.id));
      toast.success(accept ? t("buddy.accepted") : t("buddy.declined"));
      if (accept) {
        const { data: u } = await getUserLocal();
        if (u.user) setBuddyIds(await fetchBuddyIds(u.user.id).catch(() => buddyIds));
      }
    } catch (e: any) { oops(e); }
  }

  const filtered = useMemo(
    () => rows.filter((p) =>
      (level == null || p.level === level) &&
      (!format || p.formats?.includes(format)) &&
      (!time || p.play_times?.includes(time)) &&
      (!city || (Array.isArray(p.home_cities) && p.home_cities.length ? p.home_cities.includes(city) : p.home_city === city)) &&
      (!buddiesOnly || p.buddy_optin === "yes") &&
      // sport lens: by default show people who share ANY of my sports;
      // a specific lens narrows to that sport. Rows without sports = tennis.
      ((sportLens === "all"
        ? ((p.sports && p.sports.length ? p.sports : ["tennis"]).some((x) => mySports.includes(x)))
        : (p.sports && p.sports.length ? p.sports : ["tennis"]).includes(sportLens)))),
    [rows, level, format, time, city, buddiesOnly, sportLens, mySports],
  );
  const activeCount = (level != null ? 1 : 0) + (format ? 1 : 0) + (time ? 1 : 0) + (city ? 1 : 0) + (buddiesOnly ? 1 : 0);
  const hasFilters = activeCount > 0;
  function clearFilters() { setLevel(null); setFormat(null); setTime(null); setCity(null); setBuddiesOnly(false); }

  // Split the filtered directory into friends (buddies) and everyone else.
  const others = filtered.filter((p) => p.id !== meId);
  const friends = others.filter((p) => buddyIds.has(p.id));
  const rest = others.filter((p) => !buddyIds.has(p.id));
  const restOrdered = selfRow && !hasFilters ? [selfRow, ...rest] : (selfRow ? [selfRow, ...rest.filter((p) => p.id !== selfRow.id)] : rest);
  // One-line summary of the active filters for the quiet bar; falls back to a
  // neutral "all" label when nothing is set.
  const filterSummary = (() => {
    const parts: string[] = [];
    if (level != null) parts.push(`L${level}`);
    if (format) parts.push(format);
    if (time) parts.push(time);
    if (city) parts.push(city);
    if (buddiesOnly) parts.push("⚡");
    return parts.length ? parts.join(" · ") : t("players.filter_bar_all");
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl leading-none">{t("players.title")}</h1>
          <p className="text-[var(--ink)] font-semibold mt-1">{t("players.sub")}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          {/* Leaders now lives behind this badge — its bottom-nav slot went to Court Crush. */}
          <Link to="/leaders" className="inline-flex items-center gap-1.5 font-extrabold rounded-full"
            style={{ fontSize: 13, border: "1.5px solid rgba(43,33,24,0.28)", background: "rgba(253,249,238,0.6)", color: "var(--ink)", padding: "7px 12px" }}>
            🏆 {t("tabs.leaders")}
          </Link>
          {/* Find a coach — the hypothesis under test needs a door people pass
              by: it hid on Me → More after the 2026-10-03 crystallization and
              requests stopped. Same quiet pill as Leaders (no accent). */}
          <Link to="/coach" className="inline-flex items-center gap-1.5 font-extrabold rounded-full"
            style={{ fontSize: 13, border: "1.5px solid rgba(43,33,24,0.28)", background: "rgba(253,249,238,0.6)", color: "var(--ink)", padding: "7px 12px" }}>
            🎓 {t("plus.coach")}
          </Link>
        </div>
      </div>

      {mySports.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          <button type="button" className={`cchip ${sportLens === "all" ? "cchip-on" : ""}`} onClick={() => setSportLens("all")}>{t("board.sport_all")}</button>
          {mySports.map((sp) => (
            <button key={sp} type="button" className={`cchip ${sportLens === sp ? "cchip-on" : ""}`} onClick={() => setSportLens(sp)}>
              {sportMeta(sp).emoji} {t(sportMeta(sp).key)}
            </button>
          ))}
        </div>
      )}

      {/* buddy requests — act on them right here */}
      {reqs.length > 0 && (
        <div className="ccard p-4 space-y-3">
          <div className="font-display text-xl">{t("buddy.requests_title")}</div>
          {reqs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-t border-[var(--ink)]/15 pt-2 first:border-t-0 first:pt-0">
              <div className="font-extrabold truncate">{reqNames[r.from_id] ?? "Player"}</div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => respond(r, true)} className="cbtn cbtn-green">{t("buddy.accept")}</button>
                <button onClick={() => respond(r, false)} className="cbtn cbtn-ghost">{t("buddy.decline")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quiet filter bar — a one-row summary that opens the full filter sheet;
          the sheet still carries every prod filter (city / level / format / time / buddies). */}
      <div>
        <button type="button" onClick={() => setFiltersOpen(true)}
          className="w-full flex items-center gap-2"
          style={{ padding: "10px 13px", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 10, background: "rgba(253,249,238,0.6)" }}>
          <span style={{ fontSize: 15 }}>⚙︎</span>
          <span className="flex-1 text-left font-extrabold" style={{ fontSize: 13, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{filterSummary}</span>
          {activeCount > 0 && <span className="rounded-full px-2 text-xs font-extrabold shrink-0" style={{ background: "var(--coral)", color: "var(--ink)" }}>{activeCount}</span>}
          <span className="font-extrabold shrink-0" style={{ fontSize: 12, color: "rgba(43,33,24,0.6)" }}>{t("players.filters")} ▾</span>
        </button>
        <div className="flex items-center gap-3 mt-1.5 px-1">
          {hasFilters && <button type="button" onClick={clearFilters} className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }}>{t("players.filters_clear")}</button>}
          <span className="ml-auto text-sm font-semibold" style={{ color: "rgba(43,33,24,0.7)" }}>{t("players.count", { n: filtered.length })}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-[var(--ink)]">{t("players.warming")}</div>
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🎾</div>
            <div className="font-display text-2xl leading-tight">{t("empty.directory")}</div>
            <button className="cbtn cbtn-coral inline-flex" onClick={clearFilters}>{t("empty.directory_cta")}</button>
          </div>
        ) : (
          <div className="ccard p-6 text-center space-y-3">
            <div className="text-4xl">🌱</div>
            <div className="font-display text-2xl leading-tight">{t("empty.dir_new")}</div>
            {/* CTA is "Invite a friend" → it must actually invite, not open /me
                (which has no invite action). 2026-07-20 audit dead-end fix. */}
            <button type="button" className="cbtn cbtn-coral inline-flex" onClick={() => void shareInvite(t("invite.message"), t("invite.copied"))}>{t("empty.dir_new_cta")}</button>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {friends.length > 0 && (
            <div>
              <div className="csection-label mb-1">🤝 {t("players.friends")}</div>
              <div>
                {friends.map((p) => <PlayerRow key={p.id} p={p} isBuddy badge={undefined} />)}
              </div>
            </div>
          )}
          <div>
            {friends.length > 0 && <div className="csection-label mb-1">{t("players.everyone")}</div>}
            <div>
              {restOrdered.map((p) => (
                <PlayerRow key={p.id} p={p} isBuddy={buddyIds.has(p.id)} badge={p.id === meId ? (isAdmin ? t("players.founder") : t("players.you")) : undefined} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Invite — kept as a quiet card (personal code + referrals + share). The
          loud coral hero was dropped per the redesign; the function stays. */}
      {meId && <InviteAccent />}

      {filtersOpen && (
        <FilterSheet
          level={level} setLevel={setLevel} format={format} setFormat={setFormat}
          time={time} setTime={setTime} city={city} setCity={setCity}
          buddiesOnly={buddiesOnly} setBuddiesOnly={setBuddiesOnly}
          count={filtered.length} onClear={clearFilters} onClose={() => setFiltersOpen(false)}
        />
      )}
    </div>
  );
}

// Invite accent — your code, copy/edit, referrals and share, all in one place.
function InviteAccent() {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      const uid = u.user?.id;
      const [codeRes, profRes] = await Promise.all([
        (supabase as any).rpc("ensure_my_invite_code").then((r: any) => r, () => null),
        uid ? (supabase as any).from("profiles").select("referrals_count").eq("id", uid).maybeSingle().then((r: any) => r, () => null) : Promise.resolve(null),
      ]);
      if ((codeRes as any)?.data) setCode((codeRes as any).data as string);
      setReferrals((profRes as any)?.data?.referrals_count ?? 0);
    })();
  }, []);

  async function share() {
    if (!code) return;
    // Canonical share path (AbortError = silent, anything else falls to the
    // clipboard) — same code as shown on the card, no duplicated share logic.
    await shareInvite(t("invite.message"), t("invite.copied"));
  }
  function copyCode() {
    if (!code) return;
    void copyText(code, t("invite.copied"));
  }
  async function saveCode() {
    const c = draft.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (c.length < 3) { toast.error(t("invite.too_short")); return; }
    const { data, error } = await (supabase as any).rpc("set_my_invite_code", { _new: c });
    if (error) {
      const m = String(error.message || "");
      toast.error(m.includes("taken") ? t("invite.taken") : m.includes("too_short") ? t("invite.too_short") : t("invite.edit_fail"));
      return;
    }
    if (data) { setCode(data as string); setEditing(false); toast.success(t("invite.saved")); }
  }

  return (
    // Quiet card: the coral hero below is THE loud invite on this screen — this
    // one just carries the personal code + referral count (accent-budget rule).
    <div className="ccard p-4 space-y-2">
      <div className="font-display text-xl leading-tight">{t("players.invite_first_title")}</div>
      <div className="text-sm font-semibold text-[var(--ink)]">{t("players.invite_first_sub")}</div>
      {referrals > 0 && <div className="text-sm font-extrabold" style={{ color: "var(--coral)" }}>🎁 {t("invite.referrals", { n: referrals })}</div>}
      {code && (editing ? (
        <div className="flex items-center gap-2">
          <input className="cinput flex-1 font-extrabold tracking-widest uppercase" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="YOURCODE" />
          <button className="cbtn cbtn-green shrink-0 px-3" aria-label={t("invite.saved")} onClick={saveCode}>✓</button>
          <button className="cbtn cbtn-ghost shrink-0 px-3" aria-label={t("court.cancel")} onClick={() => setEditing(false)}>✕</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <code className="flex-1 font-extrabold tracking-widest text-center py-2 rounded-xl" style={{ background: "var(--cream2)" }}>{code}</code>
          <button className="cbtn cbtn-ghost shrink-0 px-3" onClick={copyCode} aria-label={t("invite.copy")} title={t("invite.copy")}>📋</button>
          <button className="cbtn cbtn-ghost shrink-0 px-3" onClick={() => { setDraft(code); setEditing(true); }} aria-label={t("invite.edit")} title={t("invite.edit")}>✏️</button>
        </div>
      ))}
      <button onClick={share} className="cbtn cbtn-ghost w-full">🔗 {t("invite.cta")}</button>
    </div>
  );
}

type SheetProps = {
  level: number | null; setLevel: (v: number | null) => void;
  format: string | null; setFormat: (v: string | null) => void;
  time: string | null; setTime: (v: string | null) => void;
  city: City | null; setCity: (v: City | null) => void;
  buddiesOnly: boolean; setBuddiesOnly: (v: boolean) => void;
  count: number; onClear: () => void; onClose: () => void;
};

function FilterSheet({ level, setLevel, format, setFormat, time, setTime, city, setCity, buddiesOnly, setBuddiesOnly, count, onClear, onClose }: SheetProps) {
  const { t } = useI18n();
  const cityNames = useCityNames();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(22,18,13,0.45)" }} role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full sm:max-w-md p-5 pb-7 space-y-3" style={{ background: "var(--cream2)", border: "2.5px solid var(--ink)", borderRadius: "22px 22px 0 0", maxHeight: "82%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto rounded-full" style={{ width: 44, height: 5, background: "var(--ink)", opacity: 0.3 }} />
        <div className="flex items-center justify-between">
          <span className="font-display text-2xl">{t("players.filters")}</span>
          <button onClick={onClear} className="text-sm font-extrabold underline" style={{ color: "var(--coral)" }}>{t("players.filters_clear")}</button>
        </div>
        <Group label={t("city.label")}>
          <Chip on={city == null} onClick={() => setCity(null)}>{t("city.any")}</Chip>
          {cityNames.map((cy) => <Chip key={cy} on={city === cy} onClick={() => setCity(city === cy ? null : cy)}>📍 {cy}</Chip>)}
        </Group>
        <Group label={t("players.filter_level")}>
          <Chip on={level == null} onClick={() => setLevel(null)}>{t("common.all")}</Chip>
          {LEVELS.map((l) => (
            <Chip key={l.n} on={level === l.n} onClick={() => setLevel(level === l.n ? null : l.n)}>
              <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />{t(`lvl.${l.n}`)}
            </Chip>
          ))}
        </Group>
        <Group label={t("players.filter_format")}>
          <Chip on={!format} onClick={() => setFormat(null)}>{t("common.all")}</Chip>
          {["singles", "doubles"].map((f) => <Chip key={f} on={format === f} onClick={() => setFormat(format === f ? null : f)}>{t(`fmt.${f}`)}</Chip>)}
        </Group>
        <Group label={t("players.filter_time")}>
          <Chip on={!time} onClick={() => setTime(null)}>{t("common.any")}</Chip>
          {PLAY_TIMES.map((pt, i) => <Chip key={pt} on={time === pt} onClick={() => setTime(time === pt ? null : pt)}>{t(`ptime.${i}`)}</Chip>)}
        </Group>
        <Group label={t("players.filter_buddies")}>
          <Chip on={buddiesOnly} onClick={() => setBuddiesOnly(!buddiesOnly)}>{t("players.will_rescue")}</Chip>
        </Group>
        <button onClick={onClose} className="cbtn cbtn-green w-full">{t("players.filters_show", { n: count })}</button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="csection-label mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`cchip ${on ? "cchip-on" : ""}`}>{children}</button>;
}

// Directory row — Board-style list line (no boxes-in-boxes). Carries the same
// signals the old card did: photo/monogram, name, member 🏆, last-minute ⚡,
// home city, level, format (rackets), vibe, rescuer 🚑, buddy 🤝 and the self
// badge. Bio + play times live on the player-detail page (/players/$id).
function PlayerRow({ p, isBuddy, badge }: { p: P; isBuddy: boolean; badge?: string }) {
  const { t } = useI18n();
  const lm = levelMeta(p.level);
  const [bg, fg] = monogramColors(p.id);
  const hasPhoto = !!p.photo_url;
  const isDoubles = (p.formats ?? []).includes("doubles");
  const lastMinute = p.buddy_optin === "yes";
  const rescues = p.rescues_count ?? 0;
  return (
    <Link
      to="/players/$id"
      params={{ id: p.id }}
      className="flex items-center gap-3"
      style={{ padding: "11px 0", borderBottom: "1px solid rgba(43,33,24,0.12)" }}
    >
      <div className="shrink-0" style={{ width: 54, height: 54, borderRadius: 27, overflow: "hidden", border: "1.5px solid rgba(43,33,24,0.28)", background: bg }}>
        {hasPhoto ? (
          <img src={p.photo_url!} alt={p.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div className="flex items-center justify-center font-display" style={{ width: "100%", height: "100%", fontSize: 26, color: fg }}>{(p.name || "?").charAt(0)}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display" style={{ fontSize: 17, lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}{p.last_name ? " " + p.last_name : ""}</span>
          {p.member_tier && <span title="Member" style={{ fontSize: 12, flexShrink: 0 }}>🏆</span>}
          {lastMinute && <span title={t("players.will_rescue")} style={{ fontSize: 12, flexShrink: 0 }}>⚡</span>}
        </div>
        {p.home_city && (
          <div className="font-extrabold" style={{ fontSize: 12.5, color: "#8C5A33", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {p.home_city}</div>
        )}
        <div className="flex items-center gap-2.5" style={{ marginTop: 5, flexWrap: "wrap" }}>
          <span className="inline-flex items-center gap-1">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: lm.color }} />
            <span style={{ fontWeight: 700, fontSize: 12, color: "rgba(43,33,24,0.6)" }}>L{p.level}</span>
          </span>
          <Rackets n={isDoubles ? 4 : 2} size={15} />
          {p.vibe && <span style={{ fontSize: 13 }}>{vibeEmoji(p.vibe)}</span>}
          {rescues >= 5 && <span style={{ fontWeight: 800, fontSize: 12, color: "#8C5A33" }}>🚑 {rescues}</span>}
          {isBuddy && <span title={t("buddy.badge")} style={{ fontSize: 12 }}>🤝</span>}
          {badge && <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", color: "rgba(43,33,24,0.45)" }}>{badge}</span>}
        </div>
      </div>
      <span style={{ fontSize: 20, color: "rgba(43,33,24,0.3)", flexShrink: 0 }}>›</span>
    </Link>
  );
}
