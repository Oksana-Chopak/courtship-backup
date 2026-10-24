import { BallHeart } from "@/components/RailKit";

/** What a player sees in the first second (2026-10-24): the app's own frame —
 *  header, cream page, three card bones, the tab bar's shape — rendered by the
 *  server for every member screen, so the page is never a blank screen while
 *  the JS downloads. No text that could be wrong for a guest, no language. */
export function AppSkeleton() {
  return (
    <div className="terry-bg app-shell font-body text-[var(--ink)] flex flex-col" aria-busy="true" aria-live="polite">
      <header className="border-b-2 border-[var(--ink)] bg-[var(--cream2)] shrink-0">
        <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
          <span className="font-display text-2xl flex items-center gap-2"><BallHeart size={26} />Courtship</span>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="max-w-md mx-auto px-5 pt-6 pb-24 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ccard p-4 skeleton-shimmer" style={{ animationDelay: `${i * 120}ms` }}>
              <div className="h-4 w-2/5 rounded-full" style={{ background: "rgba(43,33,24,.12)" }} />
              <div className="h-3 w-4/5 rounded-full mt-3" style={{ background: "rgba(43,33,24,.08)" }} />
              <div className="h-3 w-3/5 rounded-full mt-2" style={{ background: "rgba(43,33,24,.08)" }} />
            </div>
          ))}
        </div>
      </main>
      <nav aria-hidden="true" className="shrink-0 border-t-2 border-[var(--ink)] bg-[var(--cream2)]" style={{ height: 64 }} />
    </div>
  );
}
