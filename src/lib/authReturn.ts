// The OAuth return leg (2026-10-24). "Sign in with Google" leaves the app
// (Lovable's broker → Google → broker) and comes back to /auth with the result
// in the URL: tokens in the hash on success, or `error` / `error_description`
// in the hash or the query on failure (Supabase and the broker both do this —
// "Database error saving new user", "access_denied", "server_error"…).
// supabase-js consumes the tokens by itself but only console-logs the errors,
// so a failed Google sign-in used to look like "it just brought me back to the
// login page". This reads the URL once so the page can SAY what happened and
// Admin → Health can see it. Pure: no window access, testable without a browser.

export type OAuthReturn =
  | { kind: "none" }
  | { kind: "tokens" }
  | { kind: "error"; code: string; description: string };

function params(s: string): URLSearchParams {
  return new URLSearchParams(s.replace(/^[#?]/, ""));
}

export function parseOAuthReturn(hash: string, search: string): OAuthReturn {
  for (const src of [params(hash), params(search)]) {
    const code = src.get("error_code") || src.get("error");
    const description = src.get("error_description") || "";
    if (code || description) {
      return { kind: "error", code: (code || "oauth_error").slice(0, 60), description: description.replace(/\+/g, " ").slice(0, 300) };
    }
  }
  const h = params(hash);
  if (h.has("access_token") || h.has("refresh_token")) return { kind: "tokens" };
  return { kind: "none" };
}

/** Strip the OAuth leftovers from a URL hash so a refresh never replays them. */
export function stripOAuthHash(hash: string): string {
  const p = params(hash);
  for (const k of ["access_token", "refresh_token", "expires_in", "expires_at", "token_type", "type", "provider_token", "provider_refresh_token", "error", "error_code", "error_description", "state"]) p.delete(k);
  const rest = p.toString();
  return rest ? `#${rest}` : "";
}

/** One human line for the toast / the Health row. */
export function oauthErrorLine(r: Extract<OAuthReturn, { kind: "error" }>): string {
  return r.description ? `${r.description} (${r.code})` : r.code;
}
