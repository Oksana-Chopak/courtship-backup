// Who is signed in, decided from the LOCAL session (2026-10-24).
//
// The authed shell used to ask the auth server (getUser) on every navigation:
// ~0.3 s per tab switch, and any blip — offline for a second, a Supabase
// hiccup — read as "signed out" and bounced the member to the signup screen
// ("вхід злітає"). getSession() answers from storage; supabase-js refreshes an
// expired access token by itself. Only a refresh token that is truly dead
// (revoked, reused, missing) is a sign-out; a network failure is "unsure", and
// an unsure answer keeps the last member this tab saw signed in.

type SessionClient = { auth: { getSession: () => Promise<{ data: { session: { user: any } | null } | null; error: { message?: string } | null }> } };

const DEAD_SESSION = /refresh[ _]?token|invalid|revoked|not[ _]?found|expired|missing/i;

export class SessionGate {
  private lastUser: any | null = null;

  async currentUser(client: SessionClient): Promise<{ user: any | null; unsure: boolean }> {
    try {
      const { data, error } = await client.auth.getSession();
      const user = data?.session?.user ?? null;
      if (user) { this.lastUser = user; return { user, unsure: false }; }
      if (error && !DEAD_SESSION.test(String(error.message ?? ""))) {
        return { user: this.lastUser, unsure: true }; // couldn't tell — keep the last known member
      }
      this.lastUser = null;
      return { user: null, unsure: false };
    } catch {
      return { user: this.lastUser, unsure: true };
    }
  }
}

export const sessionGate = new SessionGate();
