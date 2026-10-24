import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { consumeNext, rememberedInvite, forgetInvite } from "@/lib/share";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { emptyProfile, rowToProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { QuickProfile } from "@/components/QuickProfile";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";
import { acceptTerms } from "@/lib/legal";

const SIGNUP_CODE_KEY = "courtship.signup_code";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up your profile — Courtship" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  // If the invite gate ever rejects the save, we stash the filled-in answers
  // here and let the user drop in a fresh code and finish — instead of a
  // dead-end toast that throws away everything they typed.
  const [pendingProfile, setPendingProfile] = useState<ProfileFormValues | null>(null);
  const [retryCode, setRetryCode] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/auth", search: { mode: "signup" } }); return; }
      setUid(data.session.user.id);
      // Resume anything saved on a previous (possibly unfinished) visit.
      try {
        const { data: prof } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
        setInitial(prof ? rowToProfile(prof) : emptyProfile);
      } catch {
        setInitial(emptyProfile);
      }
    })();
  }, [navigate]);

  async function finishSuccess() {
    forgetInvite(); // the profile now carries the invite (or none) — done
    try { localStorage.removeItem(SIGNUP_CODE_KEY); } catch {}
    // Legal pack: persist the Terms/Privacy acceptance + 18+ attestation the
    // user gave at sign-up, now that the profile row exists. Best-effort —
    // the ConsentGate in the authed shell catches any miss.
    try { await acceptTerms(); } catch { /* gate will catch */ }
    toast.success(t("onboarding.welcome_in"));
    // No blind Notification.requestPermission() here (2026-10 funnel audit):
    // a prompt with no context gets denied, and a denial can never be re-asked,
    // which also hid the later "Want to hear the flares?" card forever. The
    // permission is asked with context instead: the StandaloneNotifPrompt card
    // on the board (one coral "yes", one "skip") and the Settings toggle.
    // No "you're in" interstitial either (2026-10 crystallization): the board —
    // or the game/event they came for — IS the welcome.
    const _n = consumeNext();
    window.location.href = _n || "/board";
  }

  // "ok" | "invite" (recoverable invite-gate failure) | "other"
  async function saveProfile(v: ProfileFormValues, code: string): Promise<"ok" | "invite" | "other"> {
    const { error } = await (supabase as any).rpc("save_my_profile", { _data: { ...v, signup_code: code } });
    if (!error) {
    // New profile dimensions (sports/experience/goals) are written directly to
    // the own row (RLS-guarded) instead of widening the security-critical
    // save_my_profile RPC. Best-effort: an older DB without the columns just skips.
    try {
      const { data: u2 } = await getUserLocal();
      if (u2.user) {
        // areas may not be migrated yet — retry without it so sports/goals
        // never get lost with it (supabase returns errors, it doesn't throw).
        const extra: any = { sports: v.sports, experience: v.experience || null, goals: v.goals, areas: v.areas };
        const r = await (supabase as any).from("profiles").update(extra).eq("id", u2.user.id);
        if (r.error && /areas/i.test(r.error.message ?? "")) {
          delete extra.areas;
          await (supabase as any).from("profiles").update(extra).eq("id", u2.user.id);
        }
      }
    } catch { /* pre-SQL */ }
      return "ok";
    }
    const m = String(error.message || "");
    if (m.includes("invite_required")) { toast.error(t("inv.required")); return "invite"; }
    if (m.includes("invite_invalid")) { toast.error(t("inv.invalid")); return "invite"; }
    oops(error);
    return "other";
  }

  async function handleSubmit(v: ProfileFormValues) {
    setBusy(true);
    let signupCode = "";
    try {
      const { data: u } = await getUserLocal();
      signupCode =
        ((u.user?.user_metadata as any)?.signup_code as string | undefined) ||
        (typeof window !== "undefined" ? localStorage.getItem(SIGNUP_CODE_KEY) || "" : "") ||
        // invite link opened before a Google signup that skipped the code field
        rememberedInvite()?.code ||
        "";
    } catch {}
    const res = await saveProfile(v, signupCode);
    setBusy(false);
    if (res === "ok") { await finishSuccess(); return; }
    if (res === "invite") { setPendingProfile(v); setRetryCode(""); }
  }

  async function handleRetry() {
    const code = retryCode.trim().toUpperCase();
    if (code.length < 3) { toast.error(t("auth.invite_bad")); return; }
    setBusy(true);
    try {
      const { data: ok } = await (supabase as any).rpc("check_invite_code", { _code: code });
      if (ok !== true) { setBusy(false); toast.error(t("auth.invite_bad")); return; }
    } catch { setBusy(false); toast.error(t("auth.invite_bad")); return; }
    const res = await saveProfile(pendingProfile as ProfileFormValues, code);
    setBusy(false);
    if (res === "ok") { setPendingProfile(null); await finishSuccess(); }
  }

  if (!uid || !initial) return <div className="terry-bg min-h-screen" />;

  return (
    <div className="terry-bg min-h-screen px-5 py-6 font-body text-[var(--ink)]">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="font-display text-3xl mt-1">{t("onboarding.title")}</h1>
          <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("onboarding.sub")}</p>
        </div>

        {pendingProfile && (
          <div className="ccard p-5 space-y-3" style={{ borderColor: "var(--coral)" }}>
            <div className="font-display text-xl">{t("inv.retry_title")}</div>
            <div className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("inv.retry_sub")}</div>
            <div>
              <label className="csection-label block mb-1">{t("inv.retry_label")}</label>
              <input
                className="cinput tracking-widest uppercase"
                placeholder="UPPSALA80"
                value={retryCode}
                onChange={(e) => setRetryCode(e.target.value)}
              />
            </div>
            <button onClick={handleRetry} disabled={busy} className="cbtn cbtn-coral w-full">
              {busy ? "..." : t("inv.retry_cta")}
            </button>
          </div>
        )}

        <div className="ccard p-5">
          <QuickProfile initial={initial} userId={uid} submitLabel={t("qp.cta")} busy={busy} onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
