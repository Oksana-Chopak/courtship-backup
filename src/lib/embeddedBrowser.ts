/** In-app browsers (Instagram, Facebook, Messenger, TikTok, LinkedIn, Snapchat,
 *  LINE, plain Android WebViews) where Google refuses OAuth with
 *  "403 disallowed_useragent". A shared link opened from a Facebook group or an
 *  Instagram story lands HERE, and a "Continue with Google" button inside one is
 *  a guaranteed dead end on the very first screen (2026-11 giveaway funnel
 *  audit). Email/password works everywhere, so the auth page hides Google and
 *  says why.
 *
 *  Kept pure (UA string in, boolean out) so it is unit-testable and safe to call
 *  only after mount — never during SSR render (hydration mismatch, React #418). */
const IN_APP_UA = /\b(FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram|Messenger|LinkedInApp|Snapchat|musical_ly|Bytedance|TikTok|Line\/)|; wv\)/i;

export function isInAppBrowserUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return IN_APP_UA.test(ua);
}

export function isInAppBrowser(): boolean {
  try {
    return typeof navigator !== "undefined" && isInAppBrowserUA(navigator.userAgent);
  } catch {
    return false;
  }
}
