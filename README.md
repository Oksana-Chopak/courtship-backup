# Courtship Connect

Build a mobile-first web app "Courtship" — a tennis partner-matching app

for Uppsala, Sweden. Supabase backend (auth, database, storage).

SIGNUP: email + password, gated by an invite code (table invite_codes;

seed with "UPPSALA80"). Beta is invite-only.

DATA MODEL:

- profiles: id (= auth user id), name, photo_url, phone_e164 (for

  WhatsApp deeplinks — NEVER displayed in UI), level (int 1–5),

  formats (text[]: singles/doubles), play_times (text[]),

  vibe (enum: chill/friendly/sweat), looking_for (enum:

  regular/dropin/both), home_courts text, buddy_optin (enum:

  yes/sometimes/no), buddy_radius_km int default 10,

  rescues_count int default 0, ghost_badge bool default false, created_at

- courts: id, name, area — seed: Fyrishov, UTK (Uppsala Tennisklubb),

  Studenternas, + 4 public courts as placeholders

- sos_requests: id, caller_id, play_at timestamptz, court_id,

  format (enum: singles/doubles_need1/doubles_need2), level_min,

  level_max, court_status (enum: booked_paid/booked/will_book/public),

  note, status (enum: active/claimed/expired/cancelled) default active,

  claimed_by nullable, created_at

- games: id, sos_id nullable, player_a, player_b, played_at,

  confirmed_a bool, confirmed_b bool, reported_noshow nullable

FEATURES IN THIS STEP ONLY:

1. Signup/login + profile creation wizard with the exact fields above.

   Level picker shows 5 named levels: Beginner / Improver / Intermediate /

   Advanced / Competition, with colored dots green→red.

2. Player directory: filterable card grid (level, play_times, formats,

   buddy_optin = yes). Card: photo, name, level dot, vibe emoji,

   availability chips.

3. Profile detail page with "Message on WhatsApp 👋" button →

   https://wa.me/{phone_e164}?text={encoded greeting "Hey {name}! Found

   you on Courtship 🎾 Up for a hit?"}. Phone number itself is never

   rendered anywhere.

4. Own-profile edit page. RLS: users edit only their own row; phone_e164

   readable only through the WhatsApp button flow, not exposed in list

   queries.

DESIGN: warm retro tennis-club look — cream background, hot coral CTAs,

electric green accents, rounded-serif headings. Copy tone: flirty about

tennis ("It's a match. Literally."). English UI.

Do NOT build yet: SOS flow, notifications, swiping, payments, chat.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://courtship.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9e9a2736-990f-4d64-b080-d920745c77bf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
