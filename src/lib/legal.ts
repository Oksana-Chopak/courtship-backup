import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";

/** Bump when /privacy or /terms change in substance — users will be asked to
 *  re-accept via the ConsentGate. Keep in sync with the docs' version lines. */
export const TERMS_VERSION = "v1.0";

export async function acceptTerms(): Promise<boolean> {
  const { error } = await (supabase as any).rpc("accept_terms", { _version: TERMS_VERSION });
  return !error;
}

/** null = profile not loaded/absent; otherwise whether the CURRENT version is accepted. */
export async function fetchTermsAccepted(): Promise<boolean | null> {
  const { data: au } = await getUserLocal();
  if (!au.user) return null;
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("accepted_terms_version")
    .eq("id", au.user.id)
    .maybeSingle();
  if (error || !data) return null; // pre-SQL or no profile yet → don't gate
  return data.accepted_terms_version === TERMS_VERSION;
}

export async function downloadMyData(): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("export_my_data");
  if (error || !data) return false;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `courtship-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}
