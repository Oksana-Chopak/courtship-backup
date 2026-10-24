import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { invalidateCourts } from "@/lib/courtsCache";
import type { CourtRow } from "@/lib/sos";

export type CourtFull = CourtRow & {
  is_custom: boolean;
  hidden: boolean;
  created_by: string | null;
};

/** Fetch courts; by default hides soft-hidden ones (for pickers). */
export async function fetchCourtsForPicker(): Promise<CourtFull[]> {
  const { data } = await (supabase as any)
    .from("courts")
    .select("id,name,area,city,is_custom,hidden,created_by")
    .eq("hidden", false)
    .order("is_custom")
    .order("name");
  return (data as CourtFull[]) ?? [];
}

export async function addCustomCourt(input: { name: string; area: string | null; city: string }): Promise<CourtFull> {
  const { data: u } = await getUserLocal();
  if (!u.user) throw new Error("Not signed in");
  const { data, error } = await (supabase as any)
    .from("courts")
    .insert({
      name: input.name.trim(),
      area: input.area?.trim() || null,
      city: input.city,
      is_custom: true,
      created_by: u.user.id,
      hidden: false,
    })
    .select("id,name,area,city,is_custom,hidden,created_by")
    .single();
  if (error) throw new Error(error.message);
  invalidateCourts(); // the board's court-name cache must see the new court at once
  return data as CourtFull;
}

export type AdminCourt = {
  id: string; name: string; area: string | null; city: string;
  hidden: boolean; created_by: string | null; creator_name: string | null;
  usage_count: number; created_at: string;
};

export async function adminListCustomCourts(): Promise<AdminCourt[]> {
  const { data, error } = await (supabase as any).rpc("admin_courts_list");
  if (error) throw new Error(error.message);
  return (data as AdminCourt[]) ?? [];
}

export async function adminSetCourtHidden(id: string, hidden: boolean) {
  const { error } = await (supabase as any).rpc("admin_set_court_hidden", { _court_id: id, _hidden: hidden });
  if (error) throw new Error(error.message);
}

export async function adminUpdateCourt(id: string, name: string, area: string) {
  const { error } = await (supabase as any).rpc("admin_update_court", { _court_id: id, _name: name, _area: area });
  if (error) throw new Error(error.message);
}

export function shortCourtName(name: string): string {
  if (/USIF/i.test(name)) return "USIF";
  if (/UTK/i.test(name)) return "UTK";
  return name;
}
