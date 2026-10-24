import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { useI18n } from "@/lib/i18n";
import { fetchMemberLinks, fetchMyTier, fetchSwishNumber, claimMembership, fetchMyClaims, type MemberLinks, type MemberTier, type MyClaim } from "@/lib/membership";
import { toast } from "@/lib/toast";
import { SwishPayBlock } from "@/components/SwishPayBlock";
import { RF } from "@/components/RailKit";

export const Route = createFileRoute("/_authenticated/plans")({
  head: () => ({ meta: [{ title: "Plans — Courtship" }] }),
  component: PlansPage,
});

function PlanShell({ rail, railBg, emoji, tag, children }: { rail: string; railBg: string; emoji: string; tag: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "rgba(253,249,238,0.6)" }}>
      <div style={{ width: 62, flexShrink: 0, background: railBg, borderLeft: `4px solid ${rail}`, borderRight: "1px solid rgba(43,33,24,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 4px" }}>
        <span style={{ fontSize: 26 }}>{emoji}</span>
        <span style={{ fontWeight: 800, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(43,33,24,0.6)", textAlign: "center", lineHeight: 1.2 }}>{tag}</span>
      </div>
      <div className="space-y-3" style={{ flex: 1, minWidth: 0, padding: "14px 14px" }}>{children}</div>
    </div>
  );
}

function Perk({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0" style={{ color: "var(--coral)" }}>✓</span>
      <span className="text-sm font-semibold text-[var(--ink)]/85">{children}</span>
    </div>
  );
}

function PlansPage() {
  const { t, lang } = useI18n();
  const [links, setLinks] = useState<MemberLinks>({});
  const [tier, setTier] = useState<MemberTier>(null);
  const [swish, setSwish] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [plan, setPlan] = useState<"yearly" | "monthly">("yearly");
  const [loaded, setLoaded] = useState(false);
  // "I've sent the Swish" claims — so Oxy sees who paid without guessing
  const [claims, setClaims] = useState<MyClaim[]>([]);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      const uid = u.user?.id;
      const [l, mt, sw, cl] = await Promise.all([
        fetchMemberLinks(),
        uid ? fetchMyTier(uid) : Promise.resolve({ tier: null as MemberTier, since: null }),
        fetchSwishNumber(),
        fetchMyClaims(),
      ]);
      setLinks(l);
      setTier(mt.tier);
      setSwish(sw);
      setClaims(cl);
      if (uid) {
        try {
          const { data } = await (supabase as any).from("profiles").select("is_admin,name").eq("id", uid).maybeSingle();
          setIsAdmin(!!data?.is_admin);
          setMyName((data?.name as string | null) ?? "");
        } catch { /* pre-SQL */ }
      }
      setLoaded(true);
    })();
  }, []);

  const [proPlan, setProPlan] = useState<"yearly" | "monthly">("yearly");
  const foundingAmount = plan === "yearly" ? 690 : 69;
  const proAmount = proPlan === "yearly" ? 2490 : 249;
  const proTag = `Courtship PRO${proPlan === "yearly" ? " YEAR" : ""} ${myName || ""}`.trim();
  const foundingTag = `Courtship FOUNDING${plan === "yearly" ? " YEAR" : ""} ${myName || ""}`.trim();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const pendingClaim = (tr: "founding" | "pro") => claims.find((c) => c.tier === tr && c.status === "pending");
  async function sendClaim(tr: "founding" | "pro", period: "yearly" | "monthly", amount: number) {
    setClaiming(tr);
    try {
      await claimMembership(tr, period, amount);
      setClaims(await fetchMyClaims());
      toast.success(t("mem.claim_thanks"));
    } catch (e: any) {
      toast.error(e?.message ?? t("mem.claim_err"));
    } finally { setClaiming(null); }
  }
  // One line under the Swish block: the claim button, or the claim's status.
  const ClaimLine = ({ tr, period, amount }: { tr: "founding" | "pro"; period: "yearly" | "monthly"; amount: number }) => {
    const c = pendingClaim(tr);
    if (c) return <div className="text-sm font-extrabold text-center" style={{ color: "#5a7d1a" }}>✓ {t("mem.claim_sent", { date: new Date(c.created_at).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}</div>;
    return (
      <button type="button" disabled={claiming === tr} onClick={() => void sendClaim(tr, period, amount)} className="cbtn cbtn-ghost w-full" style={{ fontSize: 14 }}>
        {claiming === tr ? "…" : t("mem.claim_cta")}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <Link to="/me" className="font-extrabold text-sm underline">← {t("prog.back")}</Link>
      <div>
        <h1 className="font-display text-3xl leading-none">{t("plans.title")}</h1>
        <p className="text-[var(--ink)] font-semibold mt-1">{t("plans.sub")}</p>
      </div>

      {tier && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid rgba(43,33,24,0.18)", borderRadius: 12, overflow: "hidden", background: "#EEF6D6", borderLeft: "4px solid #C9EE3F", padding: "12px 14px" }}>
          <span style={{ fontSize: 22 }}>✓</span>
          <span className="font-extrabold" style={{ fontSize: RF.club }}>{tier === "pro" ? t("plans.have_pro") : t("plans.have_founding")}</span>
        </div>
      )}

      {/* ── Founding Member — for players ── */}
      <PlanShell rail="#F0705B" railBg="#FCE9E4" emoji="🏆" tag={t("plans.f_for")}>
        <div>
          <div className="font-display leading-tight" style={{ fontSize: RF.name + 2 }}>{t("plans.f_title")}</div>
        </div>
        <div className="text-sm font-semibold text-[var(--ink)]/80">{t("mem.pitch")}</div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPlan("yearly")} className={`cchip w-full justify-center ${plan === "yearly" ? "cchip-on" : ""}`}>{t("mem.plan_yearly")}</button>
          <button type="button" onClick={() => setPlan("monthly")} className={`cchip w-full justify-center ${plan === "monthly" ? "cchip-on" : ""}`}>{t("mem.plan_monthly")}</button>
        </div>
        <div className="text-center font-extrabold">{plan === "yearly" ? t("mem.price_yearly") : t("mem.price_monthly")}</div>
        <div className="text-xs font-extrabold" style={{ color: "var(--coral)" }}>{t("mem.founding_note")}</div>

        <div className="space-y-1.5 pt-1">
          <Perk>{t("plans.f_perk_badge")}</Perk>
          <Perk>{t("plans.f_perk_wall")}</Perk>
          <Perk>{t("plans.f_perk_early")}</Perk>
          <Perk>{t("plans.f_perk_lock")}</Perk>
        </div>

        <div className="rounded-xl px-3 py-2 text-sm font-extrabold" style={{ background: "var(--green-pop)", border: "2px solid var(--ink)" }}>
          🎁 {t("plans.f_referral")}
        </div>

        {tier ? null : links.monthly || links.yearly ? (
          <div className="flex gap-2">
            {links.yearly && <a href={links.yearly} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-coral flex-1 text-center">{t("mem.yearly")}</a>}
            {links.monthly && <a href={links.monthly} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost flex-1 text-center">{t("mem.monthly")}</a>}
          </div>
        ) : swish ? (
          <>
            <SwishPayBlock number={swish} amountSek={foundingAmount} message={foundingTag} />
            <ClaimLine tr="founding" period={plan} amount={foundingAmount} />
            <div className="text-[11px] font-semibold text-center text-[var(--ink)]/55">{t("mem.swish_note")}</div>
          </>
        ) : isAdmin ? (
          <div className="text-sm font-semibold text-[var(--ink)]/70" style={{ borderTop: "1px dashed var(--ink)", paddingTop: 8 }}>{t("mem.admin_setup")}</div>
        ) : null}
      </PlanShell>

      {/* ── Courtship Pro — for clubs, coaches, organizers ── */}
      <PlanShell rail="#8C5A33" railBg="#F1E7DC" emoji="💼" tag={t("plans.p_for")}>
        <div>
          <div className="font-display leading-tight" style={{ fontSize: RF.name + 2 }}>{t("plans.p_title")}</div>
        </div>
        <div className="text-sm font-semibold text-[var(--ink)]/80">{t("plans.p_pitch")}</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setProPlan("yearly")} className={`cchip w-full justify-center ${proPlan === "yearly" ? "cchip-on" : ""}`}>{t("mem.plan_yearly")}</button>
          <button type="button" onClick={() => setProPlan("monthly")} className={`cchip w-full justify-center ${proPlan === "monthly" ? "cchip-on" : ""}`}>{t("mem.plan_monthly")}</button>
        </div>
        <div className="text-center font-extrabold" style={{ fontSize: RF.club }}>{proPlan === "yearly" ? t("plans.p_price_yearly") : t("plans.p_price_monthly")}</div>
        <div className="text-xs font-extrabold" style={{ color: "var(--coral)" }}>{t("plans.p_founding")}</div>

        <div className="space-y-1.5 pt-1">
          <Perk>{t("plans.p_perk_badge")}</Perk>
          <Perk>{t("plans.p_perk_events")}</Perk>
          <Perk>{t("plans.p_perk_promo")}</Perk>
          <Perk>{t("plans.p_perk_all")}</Perk>
        </div>

        {tier === "pro" ? null : links.pro ? (
          <a href={links.pro} target="_blank" rel="noopener noreferrer" className="cbtn cbtn-ghost w-full text-center block">{t("plans.p_cta")}</a>
        ) : swish ? (
          <>
            <SwishPayBlock number={swish} amountSek={proAmount} message={proTag} />
            <ClaimLine tr="pro" period={proPlan} amount={proAmount} />
            <div className="text-[11px] font-semibold text-center text-[var(--ink)]/55">{t("plans.p_swish_note")}</div>
          </>
        ) : isAdmin ? (
          <div className="text-sm font-semibold text-[var(--ink)]/70" style={{ borderTop: "1px dashed var(--ink)", paddingTop: 8 }}>{t("mem.admin_setup")}</div>
        ) : null}
      </PlanShell>

      <div className="text-xs font-semibold text-center text-[var(--ink)]/55 pb-2">{t("plans.footer")}</div>
    </div>
  );
}
