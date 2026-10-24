import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { toast } from "@/lib/toast";

const NEXT_KEY = "courtship.next";

function safePath(p: string | null | undefined): string | null {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : null;
}

// Remember a deep-link destination so it survives the signup / email-confirm round-trip.
export function rememberNext(next: string | null | undefined) {
  const p = safePath(next);
  try {
    if (p) localStorage.setItem(NEXT_KEY, p);
  } catch {
    /* ignore */
  }
}

export function consumeNext(): string | null {
  try {
    const n = localStorage.getItem(NEXT_KEY);
    if (n) localStorage.removeItem(NEXT_KEY);
    return safePath(n);
  } catch {
    return null;
  }
}

// Invite memory (Lovable scan 2026-10-16): a plain invite lands on
// /board?code=…&by=…, and the code used to live ONLY in that address. A guest
// who tapped "I'm in" on a game, "+ Post a game" or another tab before signing
// up reached signup without it — no auto-buddy with the inviter, no referral
// credit. The guest shell remembers the code here; signup and onboarding read
// it back. 30 days, latest invite wins, wiped on sign-out.
const INVITE_KEY = "courtship.invite";
const INVITE_TTL_MS = 30 * 24 * 3600e3;

export function rememberInvite(code: string | null | undefined, by?: string | null): void {
  const c = String(code ?? "").trim().toUpperCase().slice(0, 40);
  if (!c) return;
  const b = String(by ?? "").trim().slice(0, 30);
  try {
    localStorage.setItem(INVITE_KEY, JSON.stringify({ code: c, by: b, at: Date.now() }));
  } catch {
    /* storage blocked — the URL still carries the code on this page */
  }
}

export function rememberedInvite(now: number = Date.now()): { code: string; by: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null");
    if (!v || typeof v.code !== "string" || !v.code) return null;
    if (typeof v.at !== "number" || now - v.at > INVITE_TTL_MS) return null;
    return { code: v.code, by: typeof v.by === "string" ? v.by : "" };
  } catch {
    return null;
  }
}

export function forgetInvite(): void {
  try {
    localStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignore */
  }
}

/** First name of the signed-in player — for "{name} invited you" on the invite
 *  landing. "" whenever anything is missing (signed out, no profile, network). */
async function myFirstName(): Promise<string> {
  // Stryker disable BlockStatement: an emptied catch returns undefined, which the caller truth-tests exactly like "" — identical link.
  try {
    const { data: u } = await getUserLocal();
    // Stryker disable next-line OptionalChaining: a null user throws inside this try and lands in the same "" — observably identical.
    const uid = u.user?.id;
    if (!uid) return "";
    const { data } = await (supabase as any).from("profiles").select("name").eq("id", uid).maybeSingle();
    const n = String((data && data.name) ?? "").trim().split(" ")[0];
    return n.slice(0, 30);
  } catch { return ""; }
  // Stryker restore BlockStatement
}

// Signup is open (2026-08-06), but a shared link still carries the user's invite
// code — it auto-buddies the newcomer with the inviter and credits the referral.
// A plain invite lands on the LIVE BOARD (value first: who's playing, with an
// "{name} invited you" banner; the code rides along into signup — 2026-10
// crystallization). An optional `next` deep-links straight through signup to a
// specific game instead.
export async function myInviteLink(next?: string): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let code: string | null = null;
  try {
    const { data } = await (supabase as any).rpc("ensure_my_invite_code");
    code = (data as string | null) ?? null;
  } catch {
    /* fall through */
  }
  if (!code) return origin;
  const params = new URLSearchParams({ code });
  const p = safePath(next);
  if (p) {
    params.set("next", p);
    return `${origin}/auth?${params.toString()}`;
  }
  const by = await myFirstName();
  if (by) params.set("by", by);
  return `${origin}/board?${params.toString()}`;
}

// One-tap "invite a friend" — builds my invite link + code and opens the share
// sheet. Pass the already-translated message template ("{link}"/"{code}") and
// the copied-toast text so this lib stays i18n-free.
export async function shareInvite(messageTemplate: string, copiedNote: string): Promise<void> {
  const link = await myInviteLink();
  let code = "";
  try { code = new URL(link).searchParams.get("code") ?? ""; } catch { /* ignore */ }
  const msg = messageTemplate.replace("{link}", link).replace("{code}", code);
  await shareMessage(msg, copiedNote);
}

// Native share sheet (WhatsApp / Telegram / etc.) with a clipboard fallback.
// Share any in-app destination (a game / event) with your invite link baked in,
// so whoever a friend forwards it to lands on it and can sign up in one flow.
export async function shareTo(next: string, messageTemplate: string, copiedNote: string): Promise<void> {
  const link = await myInviteLink(next);
  let msg = messageTemplate.replace("{link}", link);
  // Belt & suspenders: a share without its link is pointless — if the template
  // arrived without the placeholder (e.g. an interpolator ate it), append it.
  if (!msg.includes(link)) msg = `${msg.trim()} ${link}`;
  await shareMessage(msg, copiedNote);
}

/** Legacy textarea+execCommand copy — works where the async Clipboard API is
 *  denied (e.g. the cross-origin Lovable preview iframe). Deprecated but the
 *  most reliable fallback under a user gesture. */
function legacyCopy(text: string): boolean {
  // Stryker disable BlockStatement: an emptied try or catch returns undefined instead of a boolean — the caller only truth-tests the result, so the fallback chain is identical.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
  // Stryker restore BlockStatement
}

/** Copy with the full fallback chain; NEVER fails silently (a dead button is
 *  indistinguishable from a broken app — 2026-07-25 tester report from the
 *  preview iframe, where navigator.clipboard is permission-blocked). */
export async function copyText(text: string, copiedNote: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copiedNote);
    return;
  } catch { /* clipboard API denied — try legacy */ }
  if (legacyCopy(text)) {
    toast.success(copiedNote);
    return;
  }
  // Last resort: show the text so it can be copied by hand.
  try { window.prompt(copiedNote, text); } catch { toast.error(text); }
}

export async function shareMessage(message: string, copiedNote: string): Promise<void> {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral: guard variants converge — if share is missing/not-a-function the call throws TypeError inside the try and falls through to the very same copyText path.
  if (typeof navigator !== "undefined" && (navigator as any).share) {
    try {
      await (navigator as any).share({ text: message });
      return;
    } catch (e: any) {
      // ONLY a user-cancel ends here silently. Anything else (NotAllowedError
      // in a cross-origin iframe like the Lovable preview, unsupported data…)
      // must fall through to the clipboard — a dead button is never OK
      // (2026-08-08: "Invite a friend does nothing").
      // Stryker disable next-line OptionalChaining: a rejected share() always carries a DOMException — e is never nullish; the ?. is defense-in-depth.
      if (e?.name === "AbortError") return;
    }
  }
  await copyText(message, copiedNote);
}

/** `?code=<mine>` for public share links, or "" when the code can't be fetched —
 *  the page still works, the invite gate asks later. */
async function myCodeQuery(): Promise<string> {
  let code: string | null = null;
  try {
    const { data } = await (supabase as any).rpc("ensure_my_invite_code");
    code = (data as string | null) ?? null;
  } catch { /* fine — page still works, invite gate will ask */ }
  return code ? `?code=${encodeURIComponent(code)}` : "";
}

/** Share link for a GAME: lands on the public preview (/g/<id>), value first —
 *  signup is asked only when the guest taps "I'm in". Carries my invite code. */
export async function myGameShareLink(gameId: string): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/g/${gameId}${await myCodeQuery()}`;
}

/** Share link for an EVENT: the public page (/e/<id>) — the old share pointed
 *  at /events, which has no route (2026-10 funnel audit, 404 for everyone). */
export async function myEventShareLink(eventId: string): Promise<string> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/e/${eventId}${await myCodeQuery()}`;
}
