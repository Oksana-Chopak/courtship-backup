import { describe, expect, it } from "vitest";
import { oauthErrorLine, parseOAuthReturn, stripOAuthHash } from "./authReturn";

describe("parseOAuthReturn", () => {
  it("sees nothing on a plain visit", () => {
    expect(parseOAuthReturn("", "")).toEqual({ kind: "none" });
    expect(parseOAuthReturn("#", "?mode=login")).toEqual({ kind: "none" });
  });
  it("recognizes the broker's token hash (implicit grant)", () => {
    expect(parseOAuthReturn("#access_token=a.b.c&expires_in=3600&refresh_token=r&token_type=bearer", "")).toEqual({ kind: "tokens" });
  });
  it("reads a Supabase error from the hash, with the human description", () => {
    const r = parseOAuthReturn("#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user", "");
    expect(r).toEqual({ kind: "error", code: "unexpected_failure", description: "Database error saving new user" });
    expect(oauthErrorLine(r as any)).toBe("Database error saving new user (unexpected_failure)");
  });
  it("reads an error from the query string too (PKCE-style returns)", () => {
    const r = parseOAuthReturn("", "?error=access_denied&error_description=The%20user%20denied%20access");
    expect(r).toEqual({ kind: "error", code: "access_denied", description: "The user denied access" });
  });
  it("an error wins over tokens, and a bare error still has a line", () => {
    expect(parseOAuthReturn("#access_token=x&error=bad", "").kind).toBe("error");
    expect(oauthErrorLine({ kind: "error", code: "bad", description: "" })).toBe("bad");
    // a description with no code still counts as an error
    expect(parseOAuthReturn("#error_description=Nope", "")).toEqual({ kind: "error", code: "oauth_error", description: "Nope" });
  });
  it("truncates hostile lengths", () => {
    const r = parseOAuthReturn(`#error=${"x".repeat(200)}&error_description=${"y".repeat(1000)}`, "");
    expect(r.kind).toBe("error");
    if (r.kind === "error") { expect(r.code.length).toBe(60); expect(r.description.length).toBe(300); }
  });
});

describe("stripOAuthHash", () => {
  it("removes every OAuth key and keeps anything else", () => {
    expect(stripOAuthHash("#access_token=a&refresh_token=b&expires_in=1&token_type=bearer&type=recovery&state=s")).toBe("");
    expect(stripOAuthHash("#error=x&error_description=y&keep=1")).toBe("#keep=1");
    expect(stripOAuthHash("")).toBe("");
  });
});
