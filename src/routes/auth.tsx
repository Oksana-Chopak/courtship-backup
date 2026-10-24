import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { LangToggle, useI18n } from "@/lib/i18n";
import { rememberNext, consumeNext, rememberInvite, rememberedInvite, forgetInvite } from "@/lib/share";
import { parseOAuthReturn, stripOAuthHash, oauthErrorLine } from "@/lib/authReturn";
import { reportClientError } from "@/lib/health";

// The URL exactly as Google / Lovable's broker handed it back — read ONCE at
// module load, before supabase-js (which clears the token hash while consuming
// it) is ever touched. SSR has no window; the server never sees a hash anyway.
const RETURN_URL = typeof window !== "undefined" ? { hash: window.location.hash, search: window.location.search } : null;

/** Newcomers must not read raw Supabase strings ("Invalid login credentials")
 *  on their very first screen (2026-08-12 audit P1-12). Known codes map to
 *  dictionary keys; anything else goes through oops() — calm copy, detail
 *  parked behind the gear. */
/** True inside the iOS/Android Capacitor shells (the native bridge injects
 *  window.Capacitor into the remote page). Google OAuth inside a WKWebView is
 *  blocked by Google itself (disallowed_useragent) — a guaranteed dead end —
 *  and hiding third-party login also keeps App Store guideline 4.8 (Sign in
 *  with Apple) out of scope for the wrapper. Email/password works everywhere. */
function isNativeShell(): boolean {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
}

function authErrToast(t: (k: string) => string, err: any): void {
  const m = String(err?.message ?? "");
  if (/invalid login credentials/i.test(m)) toast.error(t("auth.err_bad_creds"));
  else if (/already registered|already been registered/i.test(m)) toast.error(t("auth.err_registered"));
  else if (/rate limit/i.test(m)) toast.error(t("auth.err_rate_limit"));
  else if (/not confirmed/i.test(m)) toast.error(t("auth.err_not_confirmed"));
  else if (/at least 6|password.*(short|weak)/i.test(m)) toast.error(t("auth.err_weak_pw"));
  else if (/valid email/i.test(m)) toast.error(t("auth.err_bad_email"));
  else oops(err ?? new Error("auth_failed"));
}

// Hand-rolled (2026-10-24): zod was ~80 KB of the entry bundle for three
// tiny search schemas; the router only needs a plain validating function.
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const search = (s: Record<string, unknown>): { mode: "signup" | "login"; code?: string; next?: string } => ({
  mode: s.mode === "login" ? "login" : "signup",
  code: str(s.code),
  next: str(s.next),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Sign in — Courtship" }] }),
  component: AuthPage,
});

async function checkInvite(code: string) {
  const c = code.trim().toUpperCase();
  // Validate via SECURITY DEFINER RPC so anon (signing-up) users can check a code
  // without read access to the (admin-only) invite_codes table. The old direct-table
  // fallback is now blocked by RLS for normal users, so it only masked errors — gone.
  const { data, error } = await (supabase as any).rpc("check_invite_code", { _code: c });
  if (error) { console.error("check_invite_code failed", error); return false; }
  return data === true;
}

/** true / false when the database answered; null on a network or server hiccup —
 *  the caller must NOT send a member to onboarding on a null (2026-10-24: a
 *  flaky connection used to look exactly like "no profile"). */
async function userHasProfile(id: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from("profiles" as any)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) { reportClientError("rpc", error, "auth: profile check"); return null; }
  return !!data;
}

function AuthPage() {
  const { mode, code, next } = Route.useSearch();
  const navigate = useNavigate();
  const landOrBoard = () => {
    const n = consumeNext();
    if (n) {
      window.location.href = n;
      return;
    }
    navigate({ to: "/board" });
  };
  const { t, lang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState((code ?? "").toUpperCase());
  // Invite codes are OPTIONAL (open beta since 2026-08-06): a link with ?code=
  // applies it silently, everyone else sees only a quiet "have a code?" toggle.
  // Nobody types a code to get in — codes exist for attribution (auto-buddy +
  // referral credit for the inviter), not as a gate.
  const [showInvite, setShowInvite] = useState(!!code);
  // The code that came from an invite LINK — this URL's ?code= or, when the
  // guest wandered (a game, "+ Post", another tab) before signing up, the one
  // remembered when they landed. Stale link codes never block; typed ones do.
  const [linkCode, setLinkCode] = useState((code ?? "").toUpperCase());
  useEffect(() => {
    if (code) { rememberInvite(code); return; }
    const saved = rememberedInvite();
    if (!saved) return;
    setLinkCode(saved.code);
    setInvite((v) => v || saved.code);
    setShowInvite(true);
  }, [code]);
  const [busy, setBusy] = useState(false);
  // Legal pack: sign-up requires an 18+ attestation and Terms/Privacy consent
  // (recorded server-side via accept_terms at the end of onboarding).
  const [legalAge, setLegalAge] = useState(false);
  const [legalTerms, setLegalTerms] = useState(false);
  const legalOk = mode !== "signup" || (legalAge && legalTerms);
  // A greyed-out button with no explanation reads as "broken" (2026-10 funnel
  // audit). Buttons stay live; a tap with the boxes empty highlights them and
  // says why — then the person knows exactly what to do.
  const [legalNudge, setLegalNudge] = useState(false);
  function nudgeLegal() {
    setLegalNudge(true);
    document.getElementById("auth-legal-age")?.focus();
  }
  // Password recovery: the email link lands back here with a #type=recovery
  // hash — show a set-new-password form instead of bouncing to /board.
  const [recovery, setRecovery] = useState(false);
  const [newPw, setNewPw] = useState("");

  useEffect(() => {
    rememberNext(next);
    const isRecovery = typeof window !== "undefined" && (RETURN_URL?.hash ?? window.location.hash).includes("type=recovery");
    if (isRecovery) setRecovery(true);
    // Google (Lovable's broker) and Supabase land here with the outcome in the
    // URL. A failure used to be invisible — the page simply showed the login
    // form again. Now it is said out loud and lands in Admin → Health.
    const ret = RETURN_URL ? parseOAuthReturn(RETURN_URL.hash, RETURN_URL.search) : { kind: "none" as const };
    if (ret.kind === "error") {
      const line = oauthErrorLine(ret);
      reportClientError("shown", `oauth_return: ${line}`, `${RETURN_URL?.search ?? ""}${RETURN_URL?.hash ?? ""}`.slice(0, 600));
      toast.error(t("auth.err_oauth", { detail: line }));
      try { history.replaceState(null, "", window.location.pathname + window.location.search + stripOAuthHash(window.location.hash)); } catch { /* fine */ }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (ret.kind === "tokens" && !data.session) {
        // The broker DID hand over tokens and supabase-js still has no session:
        // the one case that must never pass in silence.
        reportClientError("shown", `oauth_return: tokens but no session${error ? ` — ${error.message}` : ""}`);
        toast.error(t("auth.err_oauth", { detail: error?.message || "no session" }));
        return;
      }
      if (data.session && !isRecovery) {
        if (!data.session.user.email_confirmed_at) {
          navigate({ to: "/check-email", search: { email: data.session.user.email ?? "" } });
          return;
        }
        const has = await userHasProfile(data.session.user.id);
        // null = the check itself failed → go to the board; the shell re-checks
        // on the next navigation instead of pushing a member into onboarding.
        if (has === false) navigate({ to: "/onboarding" });
        else landOrBoard();
      }
    });
    return () => { sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Returns the code to attach ("" = join without one), or null when signup
  // must stop — a manually TYPED wrong code gets an error (the person expects
  // it to count), while a stale ?code= from an old invite LINK never blocks:
  // the newcomer just joins without the referral credit.
  async function resolveInviteCode(): Promise<string | null> {
    const codeVal = invite.trim().toUpperCase();
    if (!codeVal) {
      try { localStorage.removeItem("courtship.signup_code"); } catch {}
      return "";
    }
    const ok = await checkInvite(codeVal);
    if (ok) {
      try { localStorage.setItem("courtship.signup_code", codeVal); } catch {}
      return codeVal;
    }
    if (linkCode && codeVal === linkCode) {
      toast.message(t("auth.invite_link_dead"));
      try { localStorage.removeItem("courtship.signup_code"); } catch {}
      return "";
    }
    toast.error(t("auth.invite_bad"));
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!legalOk) { nudgeLegal(); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        const codeToUse = await resolveInviteCode();
        if (codeToUse === null) { setBusy(false); return; }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { lang, ...(codeToUse ? { signup_code: codeToUse } : {}) },
          },
        });
        if (error) throw error;
        forgetInvite(); // attached to this account (user_metadata) — done
        // No email round-trip: new users are auto-confirmed at the DB level
        // (trigger), but signUp may still withhold a session — so grab one by
        // signing in and go straight to onboarding. Falls back to the email
        // screen if anything is off.
        let session = data.session;
        if (!session) {
          const { data: si } = await supabase.auth.signInWithPassword({ email, password });
          session = si.session ?? null;
        }
        if (!session) {
          navigate({ to: "/check-email", search: { email } });
          return;
        }
        navigate({ to: "/onboarding" });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user?.email_confirmed_at) {
          navigate({ to: "/check-email", search: { email } });
          return;
        }
        const has = await userHasProfile(data.user.id);
        if (has === false) navigate({ to: "/onboarding" });
        else landOrBoard();
      }
    } catch (err: any) {
      authErrToast(t, err);
    } finally {
      setBusy(false);
    }
  }

  if (recovery) {
    return (
      <div className="terry-bg min-h-screen flex items-center justify-center px-6 py-10 font-body text-[var(--ink)]">
        <div className="ccard w-full max-w-md p-7 space-y-5">
          <h1 className="font-display text-4xl">{t("auth.new_pw_title")}</h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const { error } = await supabase.auth.updateUser({ password: newPw });
                if (error) throw error;
                toast.success(t("auth.pw_updated"));
                setRecovery(false);
                navigate({ to: "/board" });
              } catch (err: any) {
                authErrToast(t, err);
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-3"
          >
            <div>
              <label className="csection-label block mb-1" htmlFor="auth-newpw">{t("auth.password_label")}</label>
              <input id="auth-newpw" type="password" className="cinput" placeholder="••••••••" minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
            </div>
            <button disabled={busy} className="cbtn cbtn-coral w-full">{busy ? "..." : t("auth.new_pw_cta")}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="terry-bg min-h-screen flex items-center justify-center px-6 py-10 font-body text-[var(--ink)]">
      <div className="ccard w-full max-w-md p-7 space-y-5">
        <div className="flex justify-end -mb-2"><LangToggle /></div>
        <div>
          <div className="mb-2 text-xs font-extrabold tracking-widest uppercase">
            <div>{t("brand.cities")}</div>
            <div className="text-[var(--ink)]/50 font-semibold">{t("brand.beta_tag")}</div>
          </div>
          <h1 className="font-display text-4xl">
            {mode === "signup" ? t("auth.signup_title") : t("auth.login_title")}
          </h1>
          <p className="text-[var(--ink)] font-semibold mt-1">
            {mode === "signup" ? t("auth.signup_sub") : t("auth.login_sub")}
          </p>
        </div>

        {!isNativeShell() && <>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (!legalOk) { nudgeLegal(); return; }
            setBusy(true);
            try {
              // Same optional-invite rules as the email path: a valid code is
              // stored so onboarding stamps signup_code after the OAuth
              // round-trip; a stale link code is dropped with a soft note; only
              // a manually TYPED wrong code stops the flow (to be fixed or
              // cleared). No code at all is perfectly fine.
              if (mode === "signup") {
                const codeToUse = await resolveInviteCode();
                if (codeToUse === null) { setBusy(false); return; }
              }
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: `${window.location.origin}/auth`,
              });
              if (result.error) throw result.error;
            } catch (err: any) {
              authErrToast(t, err);
              setBusy(false);
            }
          }}
          className="cbtn w-full bg-white flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.1 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.5 3-2.2 5.5-4.6 7.2l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/>
            <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.9-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.7l7.8-6z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2 1.4-4.7 2.3-8.5 2.3-6.3 0-11.7-3.6-13.6-9.1l-7.8 6C6.5 42.6 14.6 48 24 48z"/>
          </svg>
          <span className="font-extrabold">{mode === "signup" ? t("auth.google_signup") : t("auth.google_signin")}</span>
        </button>
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--ink)]/15" />
          <span className="text-xs font-extrabold uppercase tracking-widest opacity-60">{t("auth.or_email")}</span>
          <div className="h-px flex-1 bg-[var(--ink)]/15" />
        </div>
        </>}

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            showInvite ? (
              <div>
                <label className="csection-label block mb-1" htmlFor="auth-invite">{t("auth.invite_label")}</label>
                <input
                  id="auth-invite"
                  className="cinput tracking-widest uppercase"
                  placeholder="UPPSALA80"
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                />
                {!!linkCode && invite.trim().toUpperCase() === linkCode && (
                  <p className="text-xs font-bold mt-1" style={{ opacity: 0.65 }}>{t("auth.invite_applied")}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowInvite(true)}
                className="text-sm font-extrabold underline text-left"
                style={{ opacity: 0.7 }}
              >
                {t("auth.invite_toggle")}
              </button>
            )
          )}
          <div>
            <label className="csection-label block mb-1" htmlFor="auth-email">{t("auth.email_label")}</label>
            <input
              id="auth-email"
              type="email"
              className="cinput"
              placeholder="you@uppsala.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="csection-label block mb-1" htmlFor="auth-pw">{t("auth.password_label")}</label>
            <input
              id="auth-pw"
              type="password"
              className="cinput"
              placeholder="••••••••"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {mode === "signup" && (
            <div className="space-y-2 pt-1" style={legalNudge && !legalOk ? { outline: "2px solid var(--coral)", outlineOffset: 6, borderRadius: 8 } : undefined}>
              {legalNudge && !legalOk && (
                <p className="text-sm font-extrabold" style={{ color: "var(--coral)" }}>{t("auth.legal_nudge")}</p>
              )}
              <label className="flex items-start gap-2 font-bold text-sm cursor-pointer">
                <input id="auth-legal-age" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={legalAge} onChange={(e) => setLegalAge(e.target.checked)} />
                <span>{t("auth.legal_age")}</span>
              </label>
              <label className="flex items-start gap-2 font-bold text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={legalTerms} onChange={(e) => setLegalTerms(e.target.checked)} />
                <span>
                  {t("auth.legal_terms_pre")}{" "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="underline">{t("auth.legal_terms_link")}</a>{" "}
                  {t("auth.legal_and")}{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="underline">{t("auth.legal_privacy_link")}</a>
                </span>
              </label>
            </div>
          )}
          <button disabled={busy} className="cbtn cbtn-coral w-full">
            {busy ? "..." : mode === "signup" ? t("auth.create_account") : t("auth.sign_in")}
          </button>
        </form>


        {mode === "login" && (
          <button
            type="button"
            className="w-full text-center text-sm font-extrabold underline"
            style={{ opacity: 0.75 }}
            onClick={async () => {
              if (!email.trim()) { toast.error(t("auth.reset_need_email")); return; }
              setBusy(true);
              try {
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                  redirectTo: `${window.location.origin}/auth?mode=login`,
                });
                if (error) throw error;
                toast.success(t("auth.reset_sent"));
              } catch (err: any) {
                authErrToast(t, err);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("auth.forgot")}
          </button>
        )}

        <div className="text-center text-sm">
          {mode === "signup" ? (
            <>{t("auth.have_account")} <Link to="/auth" search={{ mode: "login" }} className="underline font-extrabold">{t("auth.go_login")}</Link></>
          ) : (
            <>{t("auth.no_account")} <Link to="/auth" search={{ mode: "signup" }} className="underline font-extrabold">{t("auth.go_signup")}</Link></>
          )}
        </div>

        <div className="text-center text-xs font-bold" style={{ opacity: 0.6 }}>
          <Link to="/privacy" className="underline">{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" className="underline">{t("legal.footer_terms")}</Link>
        </div>
      </div>
    </div>
  );
}