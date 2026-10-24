import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { oops } from "@/lib/oops";
import { useI18n } from "@/lib/i18n";

const search = (s: Record<string, unknown>): { email: string } => ({ email: typeof s.email === "string" ? s.email : "" });

export const Route = createFileRoute("/check-email")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Check your email — Courtship" }] }),
  component: CheckEmail,
});

const COOLDOWN_KEY = "courtship.resend.lastAt";
const COOLDOWN_SECONDS = 30;

function CheckEmail() {
  const { email } = Route.useSearch();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // If user is already confirmed, bounce them forward.
  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (data.user?.email_confirmed_at) {
        navigate({ to: "/onboarding" });
      }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.email_confirmed_at) {
        navigate({ to: "/onboarding" });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  // Cooldown ticker (persists across reloads via localStorage).
  useEffect(() => {
    const tick = () => {
      const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
      const left = Math.max(0, COOLDOWN_SECONDS - Math.floor((Date.now() - last) / 1000));
      setSecondsLeft(left);
    };
    tick();
    timerRef.current = setInterval(tick, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function resend() {
    if (secondsLeft > 0 || sending) return;
    if (!email) {
      toast.error(t("ce.title"));
      return;
    }
    setSending(true);
    try {
      // Persist lang to user metadata so the email template can localize.
      try { await supabase.auth.updateUser({ data: { lang } }); } catch {}
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      setSecondsLeft(COOLDOWN_SECONDS);
      toast.success(t("ce.resent_ok"));
    } catch (err: any) {
      oops(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="terry-bg min-h-screen px-6 py-10 flex items-start justify-center font-body text-[var(--ink)]">
      <div className="ccard w-full max-w-md p-7 space-y-7">
        <div className="text-center">
          <div className="text-7xl leading-none" aria-hidden="true">📩</div>
          <h1 className="font-display text-5xl mt-4 leading-tight">
            {t("ce.title")}
          </h1>
        </div>

        {email && (
          <div className="text-center">
            <div className="csection-label mb-1">{t("ce.sent_to")}</div>
            <div className="text-2xl font-extrabold break-all">{email}</div>
          </div>
        )}

        <ol className="space-y-4 text-xl font-semibold leading-snug">
          <li className="flex gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--green-pop)] border-2 border-[var(--ink)] flex items-center justify-center font-extrabold">1</span>
            <span>{t("ce.step1")}</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--green-pop)] border-2 border-[var(--ink)] flex items-center justify-center font-extrabold">2</span>
            <span>{t("ce.step2")}</span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--green-pop)] border-2 border-[var(--ink)] flex items-center justify-center font-extrabold">3</span>
            <span>{t("ce.step3_a")} <span className="font-extrabold">"{t("ce.step3_button")}"</span> {t("ce.step3_b")}</span>
          </li>
        </ol>

        <div className="space-y-2">
          <button
            onClick={resend}
            disabled={secondsLeft > 0 || sending}
            className="cbtn cbtn-coral w-full text-lg"
          >
            {sending
              ? t("ce.resend_sending")
              : secondsLeft > 0
                ? t("ce.resend_cooldown", { s: secondsLeft })
                : t("ce.resend")}
          </button>
          <p className="text-base text-[var(--ink)] font-semibold text-center">
            {t("ce.spam_hint")}
          </p>
        </div>

        <div className="border-t-2 border-[var(--ink)]/15 pt-4 text-center text-base">
          {t("ce.wrong_address")}{" "}
          <Link to="/auth" search={{ mode: "signup" }} className="underline font-extrabold">
            {t("ce.start_over")}
          </Link>
        </div>
      </div>
    </div>
  );
}