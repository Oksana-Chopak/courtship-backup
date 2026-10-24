import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUserLocal } from "@/lib/session";
import { fetchMyGameHistory } from "@/lib/games";
import { useI18n } from "@/lib/i18n";

// Collection layer: which courts you've actually played at. Derived purely from
// game history: a game's own court_id (logged games) or its SOS's court.
export function CourtsPassport() {
  const { t } = useI18n();
  const [courts, setCourts] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await getUserLocal();
      if (!u.user) return;
      const hist = await fetchMyGameHistory(u.user.id, 200);
      const directIds = hist.map((g) => g.court_id).filter(Boolean) as string[];
      const sosIds = Array.from(new Set(hist.map((g) => g.sos_id).filter(Boolean) as string[]));
      const { data: sosRows } = sosIds.length
        ? await (supabase as any).from("sos_requests").select("id,court_id").in("id", sosIds)
        : { data: [] as any[] };
      const courtIds = Array.from(new Set([
        ...((sosRows as any[]) ?? []).map((s) => s.court_id).filter(Boolean),
        ...directIds,
      ]));
      if (!courtIds.length) return;
      const { data: cs } = await (supabase as any).from("courts").select("id,name").in("id", courtIds);
      const names = Array.from(
        new Set(((cs as any[]) ?? []).map((c) => c.name).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b));
      setCourts(names);
    })();
  }, []);

  if (courts.length === 0) return null;

  return (
    <div className="ccard p-4 space-y-2">
      <div className="csection-label">🗺️ {t("passport.title", { n: courts.length })}</div>
      <div className="flex flex-wrap gap-1.5">
        {courts.map((name) => (
          <span
            key={name}
            className="inline-flex items-center text-xs font-extrabold px-2 py-1 rounded-full"
            style={{ background: "var(--cream2)", border: "1px solid var(--ink)" }}
          >
            📍 {name}
          </span>
        ))}
      </div>
    </div>
  );
}
