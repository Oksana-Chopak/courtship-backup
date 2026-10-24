import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { useI18n } from "@/lib/i18n";
import { SkeletonRail } from "@/components/RailKit";
import { oops } from "@/lib/oops";
import { fetchFoundersWall, type FounderRow } from "@/lib/membership";

export const Route = createFileRoute("/_authenticated/leaders")({
  head: () => ({ meta: [{ title: "Leaderboards — Courtship" }] }),
  component: LeadersPage,
});

type Row = { user_id: string; name: string; n: number };

async function safeRpc(fn: string): Promise<Row[]> {
  try {
    const { data, error } = await (supabase as any).rpc(fn);
    if (error) return [];
    return ((data as any[]) ?? []).map((r) => ({ user_id: r.user_id, name: r.name, n: r.n ?? r.rescues ?? 0 }));
  } catch {
    return [];
  }
}

function LeadersPage() {
  const { t } = useI18n();
  const [active, setActive] = useState<Row[]>([]);
  const [rescuers, setRescuers] = useState<Row[]>([]);
  const [hosts, setHosts] = useState<Row[]>([]);
  const [photo, setPhoto] = useState<Record<string, string | null>>({});
  const [kudos, setKudos] = useState<Record<string, { n: number; mine: boolean }>>({});
  const [meId, setMeId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [openKudos, setOpenKudos] = useState<{ id: string; name: string } | null>(null);
  const [kudosBy, setKudosBy] = useState<{ id: string; name: string; photo_url: string | null }[] | null>(null);
  const [kudosBusy, setKudosBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [founders, setFounders] = useState<FounderRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      setMeId(u.user?.id ?? null);
      const [a, r, h] = await Promise.all([
        safeRpc("top_active_month"),
        safeRpc("top_rescuers_month"),
        safeRpc("top_hosts_month"),
      ]);
      setActive(a);
      setRescuers(r);
      setHosts(h);
      const ids = Array.from(new Set([...a, ...r, ...h].map((x) => x.user_id)));
      if (ids.length) {
        try {
          const { data: pubs } = await (supabase as any).rpc("players_directory", { _ids: ids });
          const m: Record<string, string | null> = {};
          ((pubs as any[]) ?? []).forEach((p) => { m[p.id] = p.photo_url ?? null; });
          setPhoto(m);
        } catch { /* ignore */ }
        try {
          const { data: kd } = await (supabase as any).rpc("kudos_for", { _ids: ids });
          const km: Record<string, { n: number; mine: boolean }> = {};
          ((kd as any[]) ?? []).forEach((k) => { km[k.to_id] = { n: k.n ?? 0, mine: !!k.mine }; });
          setKudos(km);
        } catch { /* kudos RPC not deployed yet */ }
      }
      setFounders(await fetchFoundersWall());
      setLoaded(true);
    })();
  }, []);

  async function giveKudos(id: string) {
    if (!meId) { navigate({ to: "/auth", search: { mode: "signup", next: "/leaders" } }); return; }
    const already = kudos[id]?.mine;
    if (already) return;
    setKudos((p) => ({ ...p, [id]: { n: (p[id]?.n ?? 0) + 1, mine: true } })); // optimistic
    try {
      const { data, error } = await (supabase as any).rpc("give_kudos", { _to: id });
      if (error) throw error;
      if (typeof data === "number") setKudos((p) => ({ ...p, [id]: { n: data, mine: true } }));
    } catch (e: any) {
      setKudos((p) => ({ ...p, [id]: { n: Math.max(0, (p[id]?.n ?? 1) - 1), mine: false } })); // revert
      oops(e);
    }
  }

  const boards = [
    { key: "active", title: t("lb.active"), emoji: "👑", unit: "🎾", hint: t("lb.hint_active"), rows: active, hot: true },
    { key: "rescuer", title: t("lb.rescuer"), emoji: "🚑", unit: "🚑", hint: t("lb.hint_rescuer"), rows: rescuers, hot: false },
    { key: "host", title: t("lb.host"), emoji: "🎪", unit: "🎪", hint: t("lb.hint_host"), rows: hosts, hot: false },
  ];
  const anyRows = active.length > 0 || rescuers.length > 0 || hosts.length > 0;

  return (
    <div className="space-y-5">
      <Link to="/players" className="font-extrabold text-sm underline">← {t("players.title")}</Link>
      <div>
        <h1 className="font-display text-4xl leading-none">{t("lb.title")}</h1>
        <p className="font-semibold mt-1" style={{ color: "var(--ink)", opacity: 0.7 }}>{t("lb.sub")}</p>
      </div>

      {!loaded ? (
        <div className="space-y-3">
          <SkeletonRail lines={3} />
          <SkeletonRail lines={3} />
        </div>
      ) : !anyRows ? (
        <div className="ccard p-6 text-center space-y-3">
          <div className="text-4xl">🌱</div>
          <div className="font-display text-2xl leading-tight">{t("lb.empty")}</div>
          {/* empty state = exactly one CTA (house rule) */}
          <Link to="/board" className="cbtn cbtn-coral inline-flex">🎾 {t("lb.empty_cta")}</Link>
        </div>
      ) : (
        boards.map((b) =>
          b.rows.length === 0 ? null : (
            <div key={b.key} className="space-y-2" style={{ border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, background: "rgba(253,249,238,0.6)", padding: "14px 14px", borderLeft: `4px solid ${b.key === "rescuer" ? "#F0705B" : b.key === "host" ? "#8C5A33" : "#C9EE3F"}` }}>
              <div className="csection-label">{b.emoji} {b.title}</div>
              <div className="text-xs font-semibold text-[var(--ink)]/60">{b.hint}</div>
              {b.rows.slice(0, 5).map((r, i) => {
                const k = kudos[r.user_id];
                const isMe = r.user_id === meId;
                return (
                  <div key={r.user_id} className="flex items-center gap-2 border-t border-[var(--ink)]/15 pt-2 first:border-t-0 first:pt-0">
                    <span className="text-lg w-7 text-center shrink-0">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                    <Link to="/players/$id" params={{ id: r.user_id }} className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar src={photo[r.user_id] ?? null} name={r.name} seed={r.user_id} size={36} />
                      <span className="font-extrabold truncate">{r.name}{isMe ? ` · ${t("lb.you")}` : ""}</span>
                    </Link>
                    <span className="font-extrabold shrink-0 text-sm">{b.unit} {r.n}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => giveKudos(r.user_id)}
                        disabled={!!k?.mine}
                        className="rounded-full font-extrabold text-xs px-2 py-1"
                        style={{ border: "2px solid var(--ink)", background: k?.mine ? "var(--green-pop)" : "var(--cream2)" }}
                        title={t("lb.kudos")}
                      >
                        👏
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if ((k?.n ?? 0) === 0) return;
                          setOpenKudos({ id: r.user_id, name: r.name }); setKudosBy(null); setKudosBusy(true);
                          try {
                            const { data } = await (supabase as any).rpc("kudos_by", { _to: r.user_id });
                            setKudosBy(((data as any[]) ?? []).map((x) => ({ id: x.from_id, name: x.name, photo_url: x.photo_url ?? null })));
                          } catch { setKudosBy([]); }
                          setKudosBusy(false);
                        }}
                        className="text-xs font-extrabold px-1 underline decoration-dotted"
                      >
                        {k?.n ?? 0}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ),
        )
      )}

      {founders.length > 0 && (
        <div className="ccard p-4 space-y-2" style={{ background: "var(--green-pop)" }}>
          <div className="csection-label">🏆 {t("mem.wall_title")}</div>
          <div className="text-xs font-semibold text-[var(--ink)]/70">{t("mem.wall_sub")}</div>
          <div className="flex flex-wrap gap-2 pt-1">
            {founders.map((fo) => (
              <Link key={fo.id} to="/players/$id" params={{ id: fo.id }} className="flex items-center gap-1.5 rounded-full pr-3 pl-1 py-1" style={{ background: "var(--cream2)", border: "2px solid var(--ink)" }}>
                <Avatar src={fo.photo_url} name={fo.name} seed={fo.id} size={26} />
                <span className="font-extrabold text-sm">{fo.name}{fo.member_tier === "pro" ? " · PRO" : ""}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {openKudos && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(22,18,13,0.45)" }} role="dialog" aria-modal="true" onClick={() => setOpenKudos(null)}>
          <div className="w-full sm:max-w-md ccard p-4 space-y-2" style={{ background: "var(--cream2)", borderRadius: "22px 22px 0 0" }} onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-xl">👏 {t("lb.who_applauded", { name: openKudos.name })}</div>
            {kudosBusy && <div className="text-sm text-[var(--ink)]/60">{t("common.loading")}</div>}
            {kudosBy && kudosBy.length === 0 && !kudosBusy && <div className="text-sm text-[var(--ink)]/60">{t("lb.no_applause")}</div>}
            {kudosBy && kudosBy.map((k) => (
              <Link key={k.id} to="/players/$id" params={{ id: k.id }} onClick={() => setOpenKudos(null)} className="flex items-center gap-2 border-t border-[var(--ink)]/15 pt-2 first:border-t-0 first:pt-0">
                <Avatar src={k.photo_url} name={k.name} seed={k.id} size={36} />
                <span className="font-extrabold truncate">{k.name}</span>
              </Link>
            ))}
            <button onClick={() => setOpenKudos(null)} className="cbtn cbtn-ghost w-full mt-2">{t("common.close")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
