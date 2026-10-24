import { useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { getPushStatus, subscribeToPush, unsubscribeFromPush, isPushSupported, type PushStatus } from "@/lib/push";

const MAX_OPTIONS = [3, 7, 15, 30];

// "Save My Set" alert controls. The opt-in must SELL, not just ask — and the user
// stays in control of radius, frequency and quiet hours, or they'll mute us.
export function PushControls({ bare = false }: { bare?: boolean }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [sosOptin, setSosOptin] = useState(true);
  const [radius, setRadius] = useState(10);
  const [maxWeek, setMaxWeek] = useState(10);
  const [wakeMe, setWakeMe] = useState(false);
  const [eventsOptin, setEventsOptin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string>("");

  useEffect(() => {
    (async () => {
      setStatus(await getPushStatus());
      const { data } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
      const d = data as any;
      if (d) {
        setSosOptin(d.buddy_sos_optin ?? true);
        setRadius(d.buddy_radius_km ?? 10);
        setMaxWeek(d.push_max_per_week ?? 10);
        setWakeMe(d.push_wake_me ?? false);
        setEventsOptin(d.events_optin ?? true);
      }
    })();
  }, []);

  async function toggleSubscription() {
    setBusy(true);
    try {
      if (status === "subscribed") {
        await unsubscribeFromPush();
      } else {
        const r = await subscribeToPush();
        if (!r.ok && r.reason && !["default", "denied"].includes(r.reason)) {
          toast.message(t("push.prod_only"));
        }
      }
      setStatus(await getPushStatus());
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("save_push_prefs", {
      _radius: radius,
      _sos_optin: sosOptin,
      _max_per_week: maxWeek,
      _wake_me: wakeMe,
      _events_optin: eventsOptin,
    });
    setBusy(false);
    if (error) { toast.error(error.message ?? t("push.save")); return; }
    toast.success(t("push.saved"));
  }

  async function sendTest() {
    setBusy(true);
    setTestResult("");
    let msg = "";
    try {
      const { data: u } = await getUserLocal();
      if (!u.user) { setBusy(false); return; }
      const { data, error } = await (supabase as any).functions.invoke("notify-users", {
        body: { user_ids: [u.user.id], title: "🎾 Courtship", body: t("push.test_body"), url: "/board", tag: "courtship-test" },
      });
      if (error) {
        // Surface the real reason (e.g. "VAPID keys not configured" / function not deployed).
        let detail = "";
        try { const ctx = (error as any)?.context; if (ctx && typeof ctx.text === "function") detail = await ctx.text(); } catch { /* ignore */ }
        msg = detail ? `${t("push.test_fail")}: ${detail}` : t("push.test_fail");
        toast.error(msg.slice(0, 140));
        return;
      }
      const targets = typeof data?.targets === "number" ? data.targets : 0;
      const sent = typeof data?.sent === "number" ? data.sent : 0;
      if (sent > 0) { msg = t("push.test_sent"); toast.success(msg); }
      else if (targets === 0) { msg = t("push.test_nosub"); toast.message(msg); }
      else { msg = t("push.test_sendfail", { n: targets }); toast.error(msg); }
    } catch (e: any) {
      msg = `${t("push.test_fail")}: ${e?.message ?? String(e)}`;
      toast.error(t("push.test_fail"));
    } finally {
      setBusy(false);
      if (msg) setTestResult(msg);
    }
  }

  const supported = isPushSupported();

  return (
    <div className={bare ? "space-y-4" : "ccard p-4 space-y-4"}>
      {bare ? (
        <div className="text-sm text-[var(--ink)] font-semibold">{t("push.sub")}</div>
      ) : (
        <div>
          <div className="font-display text-2xl leading-tight">{t("push.title")}</div>
          <div className="text-sm text-[var(--ink)] font-semibold mt-1">{t("push.sub")}</div>
        </div>
      )}

      {/* Subscription state */}
      {status === "denied" ? (
        <div className="text-sm font-semibold text-[var(--ink)]">{t("push.denied")}</div>
      ) : (
        <button onClick={toggleSubscription} disabled={busy || !supported}
          className={status === "subscribed" ? "cbtn cbtn-ghost w-full" : "cbtn cbtn-coral w-full"}>
          {status === "subscribed" ? `🔕 ${t("push.disable")}` : `🔔 ${t("push.enable")}`}
        </button>
      )}
      {status === "subscribed" && <div className="text-sm font-extrabold" style={{ color: "var(--coral)" }}>{t("push.enabled")}</div>}
      {supported && status !== "denied" && (
        <button onClick={sendTest} disabled={busy} className="cbtn cbtn-ghost w-full">🧪 {t("push.test")}</button>
      )}
      {testResult && (
        <div className="text-xs text-[var(--ink)] break-words" style={{ userSelect: "text", WebkitUserSelect: "text" }}>
          <span>{testResult}</span>
          <button type="button"
            onClick={() => { try { navigator.clipboard?.writeText(testResult); toast.success(t("push.copied")); } catch { /* ignore */ } }}
            className="underline ml-2 font-extrabold whitespace-nowrap">{t("push.copy")}</button>
        </div>
      )}

      <div className="border-t border-[var(--ink)]/15" />

      {/* SOS opt-in */}
      <Toggle on={sosOptin} onClick={() => setSosOptin((v) => !v)} label={t("push.sos_optin")} />

      {/* Events opt-in */}
      <Toggle on={eventsOptin} onClick={() => setEventsOptin((v) => !v)} label={t("push.events_optin")} />

      {/* Radius */}
      <div>
        <div className="csection-label">{t("push.radius", { km: radius })}</div>
        <input type="range" min={1} max={30} value={radius} onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full mt-2 accent-[var(--coral)]" aria-label={t("push.radius", { km: radius })} />
      </div>

      {/* Max per week */}
      <div>
        <div className="csection-label mb-2">{t("push.max_week")}</div>
        <div className="flex gap-2 flex-wrap">
          {MAX_OPTIONS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={maxWeek === n} onClick={() => setMaxWeek(n)}
              className="rounded-full border-2 border-[var(--ink)] px-4 font-extrabold"
              style={{ minHeight: 44, background: maxWeek === n ? "var(--green-pop)" : "var(--cream2)", color: "var(--ink)" }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Wake me at night */}
      <Toggle on={wakeMe} onClick={() => setWakeMe((v) => !v)} label={t("push.wake")} sub={t("push.wake_sub")} />

      {/* Enable (coral, above) is the one accent here; saving prefs is secondary. */}
      <button onClick={save} disabled={busy} className="cbtn cbtn-green w-full">{t("push.save")}</button>
    </div>
  );
}

function Toggle({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onClick}
      className="w-full flex items-center justify-between gap-3 text-left">
      <span className="min-w-0">
        <span className="font-extrabold block">{label}</span>
        {sub && <span className="text-sm text-[var(--ink)] block">{sub}</span>}
      </span>
      <span className="shrink-0 rounded-full border-2 border-[var(--ink)] transition-colors" style={{
        width: 52, height: 30, padding: 3, background: on ? "var(--green-pop)" : "var(--cream2)",
        display: "inline-flex", justifyContent: on ? "flex-end" : "flex-start",
      }}>
        <span style={{ width: 22, height: 22, borderRadius: "9999px", background: "var(--ink)" }} />
      </span>
    </button>
  );
}
