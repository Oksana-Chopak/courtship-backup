# Roadmap

## Blocked / waiting on Oxy

- [ ] **Deploy edge function `watchdog`** — Oxy asked twice to deploy `supabase/functions/watchdog` "exactly as it is in the repo". The directory does not exist: not in the working tree, not in `git ls-files`, not anywhere in git history, not in the project documents. Nothing to deploy until she says whether to build it (and what it should watch), replace it with a scheduled database check, or meant one of the five existing functions (`sos-notify`, `notify-users`, `email-notify`, `email-broadcast`, `lifecycle-emails`).

## Open nits (owed)

- [ ] Native `<input type=time>` on the board card looks janky — replace with slot chips.
- [ ] `admin_dashboard` still hardcodes `ARRAY['Uppsala','Stockholm']` for by-city stats.
- [ ] `log_game` auto-confirms the opponent, so the pending-confirm flow is dead code pending a product decision.

## Roadmap (product)

- [ ] Iteration 2 — geo/radius matching: PostGIS first, DPIA before shipping.
- [ ] Iteration 4 — retention: Ghost Meter v2, honest leaderboards, Wrapped.
- [ ] Freemium monetization — decided, unbuilt.
- [ ] Padel as a data dimension — later.
