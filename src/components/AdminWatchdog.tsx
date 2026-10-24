import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/** Admin → "🐕 Watchdog" (2026-10-24): is the 5-minute watchdog alive, is
 *  Telegram paired, what did the last run see — and "Run now". Pairing is a
 *  code Oksana sends her bot ("/start ABC123"), so only her chat is ever paired. */

type Status = {
  error?: string;
  pair_code?: string;
  telegram_connected?: boolean;
  telegram_chat_id?: string | null;
  telegram?: { last_at?: string; last_ok?: boolean; last_error?: string | null };
  last_run?: { at?: string; trigger?: string; ok?: number; bad?: number; down?: Array<{ id: string; detail: string }>; sent?: string[] };
  cron?: boolean;
};

function ago(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return lang === "sv" ? `${m} min sedan` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return lang === "sv" ? `${h} h sedan` : `${h} h ago`;
  return new Date(iso).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { day: "numeric", month: "short" });
}

export function AdminWatchdog() {
  const { t, lang } = useI18n();
  const [st, setSt] = useState<Status | null | "missing">(null);
  const [running, setRunning] = useState(false);

  async function load() {
    const { data, error } = await (supabase as any).rpc("admin_watchdog_status");
    if (error || !data || Array.isArray(data) || typeof data !== "object") { setSt("missing"); return; }
    setSt(data as Status);
  }
  useEffect(() => { void load(); }, []);

  async function runNow() {
    setRunning(true);
    try {
      const { data, error } = await (supabase as any).functions.invoke("watchdog", { body: { event: "run_now" } });
      if (error) { toast.error(String(error.message ?? error)); return; }
      if (!data?.ok) { toast.error(String(data?.error ?? "watchdog")); return; }
      const bad = Array.isArray(data.checks) ? data.checks.filter((c: any) => !c.ok).length : 0;
      if (bad === 0) toast.success(t("health.wd_ran_ok"));
      else toast.warning(t("health.wd_ran_bad", { n: bad }));
      await load();
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    } finally { setRunning(false); }
  }

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(`/start ${code}`); toast.success(t("health.wd_copied")); } catch { /* fine */ }
  };

  return (
    <div className="ccard p-4 space-y-3" data-testid="admin-watchdog">
      <div className="flex items-center justify-between gap-2">
        <div className="csection-label">🐕 {t("health.wd_title")}</div>
        {st && st !== "missing" && st.cron && (
          <button type="button" className="cchip" disabled={running} onClick={() => void runNow()}>{running ? "…" : `▶ ${t("health.wd_run")}`}</button>
        )}
      </div>
      {st === null && <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("health.checking")}</div>}
      {st === "missing" && <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("health.wd_missing")}</div>}
      {st && st !== "missing" && (
        <div className="space-y-2 text-sm">
          {!st.cron && <div className="font-semibold" style={{ opacity: 0.75 }}>❌ {t("health.wd_no_cron")}</div>}
          {st.telegram_connected ? (
            <div>
              <span className="font-extrabold">✅ Telegram</span>
              <span className="font-semibold" style={{ opacity: 0.75 }}>
                {" "}— {st.telegram?.last_at ? `${t("health.wd_last_msg")} ${ago(st.telegram.last_at, lang)}${st.telegram.last_ok === false ? ` · ❌ ${st.telegram.last_error ?? ""}` : ""}` : t("health.wd_no_msg_yet")}
                {st.telegram_chat_id ? <span className="text-xs"> · chat id {st.telegram_chat_id}</span> : null}
              </span>
            </div>
          ) : (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--cream2)", border: "1px solid rgba(43,33,24,0.2)" }}>
              <div className="font-extrabold">📵 {t("health.wd_tg_not_paired")}</div>
              <div className="font-semibold" style={{ opacity: 0.8 }}>{t("health.wd_tg_how")}</div>
              {st.pair_code && (
                <div className="flex items-center gap-2">
                  <code className="font-display text-xl tracking-widest px-3 py-1 rounded-lg" style={{ background: "#fff", border: "2px solid var(--ink)" }}>/start {st.pair_code}</code>
                  <button type="button" className="cchip" onClick={() => void copyCode(st.pair_code!)}>{t("health.wd_copy")}</button>
                </div>
              )}
            </div>
          )}
          <div>
            <span className="font-extrabold">{t("health.wd_last_run")}</span>
            <span className="font-semibold" style={{ opacity: 0.75 }}>
              {" "}— {st.last_run?.at ? `${ago(st.last_run.at, lang)} · ${t("health.wd_counts", { ok: st.last_run.ok ?? 0, bad: st.last_run.bad ?? 0 })}` : t("health.wd_never")}
            </span>
          </div>
          {Array.isArray(st.last_run?.down) && st.last_run!.down!.length > 0 && (
            <div className="space-y-1">
              {st.last_run!.down!.slice(0, 8).map((d) => (
                <div key={d.id} className="text-xs font-semibold break-words" style={{ opacity: 0.8 }}>❌ {d.id} — {d.detail}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
