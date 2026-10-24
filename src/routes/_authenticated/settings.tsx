import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n, LangToggle } from "@/lib/i18n";
import { ProfileWizard, emptyProfile, rowToProfile, type ProfileFormValues } from "@/components/ProfileWizard";
import { PushControls } from "@/components/PushControls";
import { unsubscribeFromPush } from "@/lib/push";
import { downloadMyData } from "@/lib/legal";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Courtship" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [initial, setInitial] = useState<ProfileFormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      if (!u.user) return;
      setUid(u.user.id);
      const { data } = await (supabase as any).rpc("get_my_full_profile").maybeSingle();
      if (!data) {
        navigate({ to: "/onboarding" });
        return;
      }
      const d = data as any;
      setIsAdmin(!!d.is_admin);
      setInitial(rowToProfile(d));
    })();
  }, [navigate]);

  if (!initial || !uid) {
    return <div className="text-center py-12 text-[var(--ink)]">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl">{t("settings.title")}</h1>
        <LangToggle className="shrink-0" />
      </div>

      <div className="ccard p-5">
        <ProfileWizard
          flat
          initial={initial ?? emptyProfile}
          userId={uid}
          submitLabel={t("me.save")}
          savedState
          savedLabel={t("me.saved")}
          busy={busy}
          onSubmit={async (v: ProfileFormValues) => {
            setBusy(true);
            const { error } = await (supabase as any).rpc("save_my_profile", { _data: v });
            if (!error) {
              try {
                const { data: u2 } = await getUserLocal();
                if (u2.user) {
                  // areas may not be migrated yet — retry without it so
                  // sports/goals never get lost with it.
                  const extra: any = { sports: v.sports, experience: v.experience || null, goals: v.goals, areas: v.areas };
                  const r = await (supabase as any).from("profiles").update(extra).eq("id", u2.user.id);
                  if (r.error && /areas/i.test(r.error.message ?? "")) {
                    delete extra.areas;
                    await (supabase as any).from("profiles").update(extra).eq("id", u2.user.id);
                  }
                }
              } catch { /* pre-SQL */ }
            }
            setBusy(false);
            if (error) {
              oops(error);
              return;
            }
            setInitial(v);
            toast.success(t("me.updated"));
          }}
          onProgress={async (v: ProfileFormValues) => {
            try { await (supabase as any).rpc("save_my_profile", { _data: v }); } catch { /* best-effort auto-save */ }
          }}
        />
      </div>

      {/* No anonymous drawers (2026-08-12 audit D-18): every setting is a
          visible row with its current value — nothing hides behind a bare
          "Details ▾" you must open to know what's inside. */}
      <div className="ccard p-4 space-y-2">
        <div className="csection-label">📧 {t("emailn.title")}</div>
        <EmailNotifsToggle />
      </div>

      <div className="ccard p-4 space-y-2">
        <div className="csection-label">🔔 {t("push.title")}</div>
        <PushControls bare />
      </div>

      <div className="ccard p-4 space-y-2">
        <div className="csection-label">🔐 {t("privacyc.title")}</div>
        <PrivacyDataSection />
      </div>

      {isAdmin && (
        <Link to="/admin" className="ccard p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xl">{t("admin.title")}</div>
            <div className="text-base text-[var(--ink)] font-semibold">{t("admin.tag")}</div>
          </div>
          <div className="text-2xl">🛠️</div>
        </Link>
      )}

      <button
        type="button"
        onClick={() => setConfirmSignout(true)}
        className="cbtn cbtn-ghost w-full"
      >
        {t("auth.signout")}
      </button>

      {confirmSignout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }} onClick={() => setConfirmSignout(false)}>
          <div className="ccard p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div className="font-display text-2xl">{t("auth.signout_confirm_title")}</div>
            <div className="text-base font-semibold text-[var(--ink)]">{t("auth.signout_confirm_body")}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSignout(false)} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
              {/* Destructive/low-frequency = muted, never coral (accent rule) */}
              <button
                onClick={async () => {
                  // Detach this device's push subscription and wipe device-global
                  // state, so the next account on a shared phone doesn't inherit
                  // A's pushes, drafts, onboarding-dismissal or confetti baseline
                  // (2026-07-20 audit — account-leak across sign-in).
                  try { await unsubscribeFromPush(); } catch { /* best-effort */ }
                  try {
                    ["courtship.draftGame", "courtship.progress", "courtship.getstarted.dismissed", "courtship.signup_code", "courtship.next", "courtship.invite"]
                      .forEach((k) => localStorage.removeItem(k));
                  } catch { /* ignore */ }
                  await supabase.auth.signOut();
                  toast.success(t("auth.signed_out"));
                  window.location.href = "/";
                }}
                className="cbtn cbtn-ghost flex-1"
                style={{ color: "var(--ink)", opacity: 0.65 }}
              >
                {t("auth.signout")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Legal pack: public-preview opt-out (GDPR art. 21 objection made usable),
 *  legal-doc links, data export (art. 15/20) and account deletion (art. 17).
 *  Destructive action = muted styling, typed confirmation (accent rule). */
function PrivacyDataSection() {
  const { t } = useI18n();
  const [preview, setPreview] = useState<boolean | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: au } = await getUserLocal();
      if (!au.user) return;
      const { data } = await (supabase as any).from("profiles").select("public_preview").eq("id", au.user.id).maybeSingle();
      setPreview(data?.public_preview !== false);
    })();
  }, []);

  async function togglePreview() {
    const next = !(preview ?? true);
    setPreview(next);
    const { data: au } = await getUserLocal();
    if (!au.user) return;
    const { error } = await (supabase as any).from("profiles").update({ public_preview: next }).eq("id", au.user.id);
    if (error) { setPreview(!next); toast.error(t("privacyc.save_err")); }
    else toast.success(next ? t("privacyc.preview_on") : t("privacyc.preview_off"));
  }

  async function exportData() {
    setExporting(true);
    const ok = await downloadMyData();
    setExporting(false);
    if (!ok) toast.error(t("privacyc.export_err"));
  }

  async function deleteAccount() {
    setDeleting(true);
    const { error } = await (supabase as any).rpc("delete_my_account");
    if (error) {
      setDeleting(false);
      toast.error(t("privacyc.delete_err"));
      return;
    }
    try { await unsubscribeFromPush(); } catch { /* device may already be gone server-side */ }
    try {
      ["courtship.draftGame", "courtship.progress", "courtship.getstarted.dismissed", "courtship.signup_code", "courtship.next", "courtship.invite"]
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    await supabase.auth.signOut();
    toast.success(t("privacyc.deleted"));
    window.location.href = "/";
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("privacyc.preview_sub")}</p>
        <button type="button" onClick={togglePreview} disabled={preview === null}
          className="w-full rounded-xl border-2 px-3 py-2 font-extrabold text-left"
          style={{ borderColor: "var(--ink)", background: preview ? "var(--green-pop)" : "var(--cream2)", opacity: preview === null ? 0.6 : 1 }}>
          {preview ? "✅ " : "⬜ "}{t("privacyc.preview_label")}
        </button>
      </div>

      <div className="text-sm font-extrabold space-x-1">
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline">{t("privacyc.policy")}</a>
        <span>·</span>
        <a href="/terms" target="_blank" rel="noreferrer" className="underline">{t("privacyc.terms")}</a>
        <span>·</span>
        <a href="/withdraw" target="_blank" rel="noreferrer" className="underline">{t("privacyc.withdraw")}</a>
      </div>

      <button type="button" onClick={exportData} disabled={exporting} className="cbtn cbtn-ghost w-full">
        {exporting ? "..." : t("privacyc.export")}
      </button>

      <button type="button" onClick={() => setConfirmDelete(true)} className="w-full text-sm font-extrabold underline text-left" style={{ opacity: 0.65 }}>
        {t("privacyc.delete")}
      </button>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(43,33,24,0.5)" }} onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="ccard p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()} style={{ background: "var(--cream2)" }}>
            <div className="font-display text-2xl">{t("privacyc.delete_title")}</div>
            <div className="text-base font-semibold text-[var(--ink)]">{t("privacyc.delete_body")}</div>
            <input
              className="cinput"
              placeholder={t("privacyc.delete_confirm_ph")}
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              autoCapitalize="characters"
            />
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="cbtn cbtn-ghost flex-1">{t("court.cancel")}</button>
              {/* Destructive = muted ghost, never coral (accent rule) */}
              <button
                onClick={deleteAccount}
                disabled={deleteText.trim().toUpperCase() !== "DELETE" || deleting}
                className="cbtn cbtn-ghost flex-1"
                style={{ color: "var(--ink)", opacity: deleteText.trim().toUpperCase() === "DELETE" ? 0.8 : 0.4 }}
              >
                {deleting ? "..." : t("privacyc.delete_cta")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Email policy (BATCH13): three levels instead of all-or-nothing, plus a
 *  separate weekly-digest toggle. Writes the legacy email_notifs too so the
 *  old edge function keeps behaving until everything is deployed. */
function EmailNotifsToggle() {
  const { t } = useI18n();
  const [level, setLevel] = useState<"all" | "important" | "off" | null>(null);
  const [digest, setDigest] = useState(true);
  const [legacyOnly, setLegacyOnly] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data: au } = await getUserLocal();
      if (!au.user) return;
      const r = await (supabase as any).from("profiles").select("email_notifs,email_level,email_digest").eq("id", au.user.id).maybeSingle();
      if (r.error) {
        // pre-BATCH13 DB — degrade to the old single toggle
        setLegacyOnly(true);
        const r2 = await (supabase as any).from("profiles").select("email_notifs").eq("id", au.user.id).maybeSingle();
        setLevel(r2.data?.email_notifs === false ? "off" : "important");
        return;
      }
      const lv = (r.data?.email_level as "all" | "important" | "off" | null) ?? (r.data?.email_notifs === false ? "off" : "important");
      setLevel(lv);
      setDigest(r.data?.email_digest !== false);
    })();
  }, []);

  async function saveLevel(next: "all" | "important" | "off") {
    const prev = level;
    setLevel(next);
    const { data: au } = await getUserLocal();
    if (!au.user) return;
    const patch: any = legacyOnly
      ? { email_notifs: next !== "off" }
      : { email_level: next, email_notifs: next !== "off" };
    const { error } = await (supabase as any).from("profiles").update(patch).eq("id", au.user.id);
    if (error) { setLevel(prev); toast.error(t("emailn.save_err")); return; }
    toast.success(t(`emailn.level_saved_${next}`));
  }

  async function toggleDigest() {
    const next = !digest;
    setDigest(next);
    const { data: au } = await getUserLocal();
    if (!au.user) return;
    const { error } = await (supabase as any).from("profiles").update({ email_digest: next }).eq("id", au.user.id);
    if (error) { setDigest(!next); toast.error(t("emailn.save_err")); }
  }

  const OPTIONS: { v: "all" | "important" | "off"; label: string; sub: string }[] = [
    { v: "important", label: t("emailn.level_important"), sub: t("emailn.level_important_sub") },
    { v: "all", label: t("emailn.level_all"), sub: t("emailn.level_all_sub") },
    { v: "off", label: t("emailn.level_off"), sub: t("emailn.level_off_sub") },
  ];

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold" style={{ opacity: 0.7 }}>{t("emailn.sub")}</p>
      {OPTIONS.map((o) => (
        <button key={o.v} type="button" onClick={() => saveLevel(o.v)} disabled={level === null}
          className="w-full rounded-xl border-2 px-3 py-2 font-extrabold text-left"
          style={{ borderColor: "var(--ink)", background: level === o.v ? "var(--green-pop)" : "var(--cream2)", opacity: level === null ? 0.6 : 1 }}>
          {level === o.v ? "✅ " : "⬜ "}{o.label}
          <span className="block font-semibold" style={{ fontSize: 12.5, opacity: 0.7 }}>{o.sub}</span>
        </button>
      ))}
      {!legacyOnly && (
        <button type="button" onClick={toggleDigest} disabled={level === null || level === "off"}
          className="w-full rounded-xl border-2 px-3 py-2 font-extrabold text-left"
          style={{ borderColor: "var(--ink)", background: digest && level !== "off" ? "var(--green-pop)" : "var(--cream2)", opacity: level === "off" ? 0.5 : 1 }}>
          {digest && level !== "off" ? "✅ " : "⬜ "}{t("emailn.digest")}
          <span className="block font-semibold" style={{ fontSize: 12.5, opacity: 0.7 }}>{t("emailn.digest_sub")}</span>
        </button>
      )}
    </div>
  );
}
