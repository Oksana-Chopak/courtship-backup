import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { installErrorCapture, reportClientError } from "@/lib/health";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { tStatic } from "@/lib/i18n";
import { Toaster } from "sonner";
import { I18nProvider, useI18n } from "@/lib/i18n";

function NotFoundComponent() {
  const { t } = useI18n();
  return (
    <div className="terry-bg min-h-screen flex items-center justify-center px-5 font-body text-[var(--ink)]">
      <style>{`
        @keyframes cc404bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-30px); } }
        @keyframes cc404squash { 0%, 100% { transform: scaleX(1); opacity: 0.3; } 50% { transform: scaleX(0.55); opacity: 0.12; } }
      `}</style>
      <div className="max-w-sm text-center">
        <div className="relative mx-auto mb-5" style={{ width: 120, height: 120 }}>
          <div style={{ fontSize: 76, lineHeight: 1, animation: "cc404bounce 0.8s ease-in-out infinite" }}>🎾</div>
          <div
            className="mx-auto rounded-[50%]"
            style={{ width: 64, height: 12, marginTop: 10, background: "var(--ink)", animation: "cc404squash 0.8s ease-in-out infinite" }}
          />
        </div>
        <div className="font-display" style={{ fontSize: 60, lineHeight: 1, color: "var(--coral)" }}>404</div>
        <h2 className="font-display text-3xl mt-2 leading-tight">{t("nf.title")}</h2>
        <p className="font-semibold mt-2" style={{ opacity: 0.7 }}>{t("nf.sub")}</p>
        <Link to="/" className="cbtn cbtn-coral inline-flex mt-6">{t("nf.cta")}</Link>
      </div>
    </div>
  );
}

// `error` is `unknown` since @tanstack/react-router 1.170 (anything can be
// thrown); normalize once so the reporter always gets an Error. Typing it as
// Error broke `tsc` (and therefore CI) the moment the minor version drifted.
function ErrorComponent({ error: thrown, reset }: { error: unknown; reset: () => void }) {
  const error = thrown instanceof Error ? thrown : new Error(String(thrown));
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    reportClientError("boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {tStatic("err.root_title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {tStatic("err.root_sub")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tStatic("err.try_again")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {tStatic("err.go_home")}
          </a>
        </div>
      </div>
    </div>
  );
}

// React Query was never used — its provider cost ~28 KB in every page load (2026-10-24).
export const Route = createRootRouteWithContext<Record<string, never>>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Courtship — Tennis partners in Uppsala & Sthm" },
      { name: "description", content: "It's a match. Literally. Find a hitting partner in Uppsala & Sthm." },
      { property: "og:title", content: "Courtship — Tennis partners in Uppsala & Sthm" },
      { property: "og:description", content: "It's a match. Literally. Find a hitting partner in Uppsala & Sthm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "theme-color", content: "#FF5747" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Courtship" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "twitter:title", content: "Courtship — Tennis partners in Uppsala & Sthm" },
      { name: "twitter:description", content: "It's a match. Literally. Find a hitting partner in Uppsala & Sthm." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/FCxxQIQ2NyXzpI78VJfU3LodB3s1/social-images/social-1782684558798-Socials.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/FCxxQIQ2NyXzpI78VJfU3LodB3s1/social-images/social-1782684558798-Socials.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      // Legal pack 2026-07-20: fonts are self-hosted (public/fonts.css + woff2
      // from @fontsource). Loading from fonts.googleapis.com sent every
      // visitor's IP to Google pre-consent (LG München I, 3 O 17493/20).
      { rel: "stylesheet", href: "/fonts.css" },
      // The two faces every screen paints with start downloading with the HTML,
      // not after the CSS is parsed (2026-10-24 perf): brand type ~0.5 s sooner on 4G.
      { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/karla-latin-400-normal.woff2", crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/karla-latin-600-normal.woff2", crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/karla-latin-800-normal.woff2", crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: "/fonts/young-serif-latin-400-normal.woff2", crossOrigin: "anonymous" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    installErrorCapture(); // uncaught errors + rejected promises → Admin Health
    if (!("serviceWorker" in navigator)) return;
    const host = window.location.hostname;
    const isPreview =
      host.startsWith("id-preview--") ||
      host.startsWith("preview--") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovableproject-dev.com") ||
      host.endsWith(".beta.lovable.dev") ||
      window.self !== window.top ||
      new URL(window.location.href).searchParams.get("sw") === "off";
    if (isPreview || !import.meta.env.PROD) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => {
        if (r.active?.scriptURL?.endsWith("/sw.js")) r.unregister().catch(() => {});
      })).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return (
    <>
      <I18nProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster
          position="top-center"
          closeButton
          expand
          duration={Infinity}
          toastOptions={{
            style: {
              fontSize: "1.15rem",
              fontWeight: 600,
              lineHeight: 1.35,
              padding: "18px 20px",
              minHeight: "68px",
              background: "var(--cream2, #FFF9EE)",
              color: "var(--ink, #2B2118)",
              border: "2px solid var(--ink, #2B2118)",
              borderRadius: "18px",
              boxShadow: "5px 5px 0 var(--ink, #2B2118)",
            },
            classNames: {
              title: "font-extrabold",
              description: "font-semibold",
              actionButton: "!bg-[var(--coral)] !text-white !font-extrabold !rounded-full !px-4",
              closeButton: "!bg-[var(--cream2)] !text-[var(--ink)] !border-[var(--ink)]",
            },
          }}
        />
      </I18nProvider>
    </>
  );
}
