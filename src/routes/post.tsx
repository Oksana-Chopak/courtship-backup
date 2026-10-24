import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { BallHeart } from "@/components/RailKit";
import { GameWizard } from "@/components/GameWizard";

export const Route = createFileRoute("/post")({
  // Client-only, like the member wizard (/_authenticated is ssr:false): the
  // wizard's defaults, day chips and time wheel all come from "now" in the
  // player's zone, which the UTC server cannot know — server-rendering it made
  // React throw #418 and re-render the funnel's first screen (2026-10-16).
  ssr: false,
  component: PostGamePage,
});

/** "Post a game, then create your account" — the reverse-registration funnel.
 *  The wizard is the SAME shared component as the member flow (GameWizard in
 *  guest mode): the guest fills the steps, the draft is stashed locally, they
 *  sign up, and the authed shell publishes it automatically. */
function PostGamePage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  // Signed-in users get the full member wizard with their profile defaults.
  useEffect(() => {
    void getUserLocal().then(({ data }: { data: { user: { id: string } | null } }) => {
      if (data.user) navigate({ to: "/sos/new", search: { edit: undefined }, replace: true });
    });
  }, [navigate]);

  return (
    <div className="terry-bg min-h-screen px-5 py-8 font-body text-[var(--ink)]">
      <div className="max-w-md mx-auto space-y-4">
        <Link to="/" className="font-display text-2xl flex items-center gap-2">
          <BallHeart size={26} /> Courtship
        </Link>
        <p className="font-semibold" style={{ opacity: 0.7, fontSize: 13.5 }}>{t("post_pub.sub")}</p>

        <GameWizard guest />

        <p className="text-center text-sm font-semibold" style={{ opacity: 0.7 }}>{t("post_pub.free_line")}</p>
        <p className="text-center text-sm font-extrabold">
          <Link to="/auth" search={{ mode: "login" }} className="underline">{t("post_pub.have_account")}</Link>
        </p>
        <p className="text-center text-xs font-bold" style={{ opacity: 0.55 }}>
          <Link to="/privacy" className="underline">{t("legal.footer_privacy")}</Link>
          {" · "}
          <Link to="/terms" className="underline">{t("legal.footer_terms")}</Link>
        </p>
      </div>
    </div>
  );
}
