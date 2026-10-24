#!/usr/bin/env bash
# One command that gates every change.
#   Locally:  npm run verify
#   In CI:    .github/workflows/ci.yml runs it on every push + PR.
#
# It catches the two classes of bug that have actually bitten us:
#   1. Type errors            -> tsc --noEmit
#   2. React Hook order bugs  -> eslint react-hooks/rules-of-hooks
#      (tsc can NOT see these; this is the rule that would have caught the
#       /progress "Your season" crash before it ever shipped.)
set -uo pipefail
fail=0

echo "→ Type-check (tsc)…"
# The "vite/client" line is a known false positive from standalone tsc (Vite
# supplies those types at build time), so it is filtered out — everything else fails the build.
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "vite/client" > /tmp/tsc_errors.txt || true
if [ -s /tmp/tsc_errors.txt ]; then
  echo "❌ Type errors:"; cat /tmp/tsc_errors.txt; fail=1
else
  echo "✅ tsc clean"
fi

echo "→ React Hooks rules (the class tsc can't catch)…"
OUT=$(npx eslint "src/**/*.{ts,tsx}" 2>&1 || true)
if echo "$OUT" | grep -q "rules-of-hooks"; then
  echo "❌ React Hook called conditionally / after an early return:"
  echo "$OUT" | grep -B1 "rules-of-hooks"
  fail=1
else
  echo "✅ no hooks violations"
fi

echo "→ Unit + contract tests with the logic-layer coverage gate…"
if npx vitest run --coverage >/tmp/vitest_out.txt 2>&1; then
  echo "✅ tests pass"
  # Visible from the GitHub API as a check annotation (job logs are not reachable from everywhere).
  [ -n "${CI:-}" ] && echo "::notice title=Unit + contract tests::$(sed 's/\x1b\[[0-9;]*m//g' /tmp/vitest_out.txt | grep -o 'Tests *[0-9]* passed ([0-9]*)' | tail -1)"
  if node scripts/coverage-gate.mjs; then
    :
  else
    fail=1
  fi
else
  echo "❌ tests failed:"; tail -30 /tmp/vitest_out.txt; fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo ""; echo "🚫 Checks failed — do not deploy."; exit 1
fi

# 3b. Edge functions (Deno): every email/push function type-checks, so a broken
#     import or a renamed field can't reach Lovable's deploy. Deno is installed
#     on the spot in CI; locally it runs when `deno` is on PATH (set
#     DENO_IMPORT_MAP to a map file if esm.sh is unreachable where you are).
DENO_BIN="$(command -v deno || true)"
if [ -z "$DENO_BIN" ] && [ -x "$HOME/.deno/bin/deno" ]; then DENO_BIN="$HOME/.deno/bin/deno"; fi
if [ -z "$DENO_BIN" ] && [ -n "${CI:-}" ]; then
  # pinned release zip from GitHub (deno.land is not reachable from every network)
  mkdir -p "$HOME/.deno/bin" && curl -fsSL "https://github.com/denoland/deno/releases/download/v2.9.7/deno-x86_64-unknown-linux-gnu.zip" -o /tmp/deno.zip \
    && unzip -oq /tmp/deno.zip -d "$HOME/.deno/bin" && DENO_BIN="$HOME/.deno/bin/deno" || { echo "❌ deno install failed"; exit 1; }
fi
if [ -n "$DENO_BIN" ]; then
  echo "→ Edge functions type-check (deno)…"
  MAP_ARG=""; [ -n "${DENO_IMPORT_MAP:-}" ] && MAP_ARG="--import-map=${DENO_IMPORT_MAP}"
  # --no-config: the repo's package.json is the web app's, not the functions' (Deno would try to resolve all of it)
  if "$DENO_BIN" check --no-config --no-lock --node-modules-dir=none $MAP_ARG supabase/functions/*/index.ts >/tmp/deno_check.txt 2>&1; then
    echo "✅ $(ls -d supabase/functions/*/ | wc -l | tr -d ' ') edge functions type-check"
    [ -n "${CI:-}" ] && echo "::notice title=Edge functions::$(ls -d supabase/functions/*/ | wc -l | tr -d ' ') functions type-check (deno)"
  else
    echo "❌ edge function type errors:"; grep -v "Download" /tmp/deno_check.txt | tail -30; echo ""; echo "🚫 Checks failed — do not deploy."; exit 1
  fi
  # 3c. The watchdog, end to end against a fake world (pairing, hello, 🔴/🟢,
  #     instant player errors, admin run-now) — scripts/watchdog-local.ts.
  echo "→ Watchdog end-to-end (deno, fake Supabase + Telegram)…"
  if "$DENO_BIN" run -A --no-config --no-lock --node-modules-dir=none $MAP_ARG scripts/watchdog-local.ts >/tmp/watchdog_e2e.txt 2>&1; then
    echo "✅ watchdog e2e: $(grep -c '^✅' /tmp/watchdog_e2e.txt) steps"
    [ -n "${CI:-}" ] && echo "::notice title=Watchdog::$(grep -c '^✅' /tmp/watchdog_e2e.txt) end-to-end steps green"
  else
    echo "❌ watchdog e2e failed:"; grep -v "Download" /tmp/watchdog_e2e.txt | tail -30; echo ""; echo "🚫 Checks failed — do not deploy."; exit 1
  fi
else
  echo "↷ edge functions: deno not found, skipped (install deno or run in CI)"
fi

# 4. The screens themselves (Playwright, production build, Supabase mocked):
#    the guest funnel + "no dictionary key ever shows as text" (2026-10-05, the
#    "ct.sub_in" leak). Runs when a Chromium is at hand — always in CI (where it
#    is installed on the spot), locally when PW_CHROMIUM_PATH points at one, or
#    when you ask for it with VERIFY_E2E=1. Skip explicitly with VERIFY_E2E=0.
SCREENS="skipped"
if [ "${VERIFY_E2E:-}" != "0" ] && { [ -n "${CI:-}" ] || [ -n "${PW_CHROMIUM_PATH:-}" ] || [ "${VERIFY_E2E:-}" = "1" ]; }; then
  echo "→ Screens (Playwright e2e on the production build)…"
  if [ -n "${CI:-}" ] && [ -z "${PW_CHROMIUM_PATH:-}" ]; then
    npx playwright install --with-deps chromium >/tmp/pw_install.txt 2>&1 || { echo "❌ playwright install failed:"; tail -20 /tmp/pw_install.txt; exit 1; }
  fi
  export HOST="${HOST:-127.0.0.1}"
  if npm run -s build:e2e >/tmp/e2e_build.txt 2>&1 && npx playwright test >/tmp/e2e_out.txt 2>&1; then
    echo "✅ screens pass ($(grep -o '[0-9]* passed' /tmp/e2e_out.txt | tail -1))"
    SCREENS="$(grep -o '[0-9]* passed' /tmp/e2e_out.txt | tail -1)"
    [ -n "${CI:-}" ] && echo "::notice title=Screens (Playwright)::${SCREENS} on the production build"
  else
    echo "❌ screens failed:"; tail -40 /tmp/e2e_build.txt /tmp/e2e_out.txt; echo ""; echo "🚫 Checks failed — do not deploy."; exit 1
  fi
fi
echo ""; echo "🎾 All checks passed."
[ -n "${CI:-}" ] && echo "::notice title=Gate::tsc + hooks + unit/contract + coverage 100/100/100 green · screens: ${SCREENS}"
exit 0
