# OpenCircle — where things stand

Last updated: 2026-10-19

Read this first in a new session. It covers what is shipped, what is in
flight, and the traps that are not obvious from the code.

---

## Releases in flight

| | Version | Build | State |
| --- | --- | --- | --- |
| iOS | 1.0.1 | build 4 (`6de6002`) | **In Apple's review queue** (`WAITING_FOR_REVIEW`) |
| Android | 1.0.1 | versionCode 8 (`6de6002`) | In Play **closed testing** |

**Play production access** was applied for on 2026-10-12. Google quotes 7 days
or less. Until it is granted there is no production track — the app cannot be
published publicly on Android no matter what is built.

Keep the closed test running while that application is open; it is judged partly
on whether the test was genuine.

### iOS submission notes

Version 1.0.1 is the *same App Store version record* that was rejected as 1.0 —
it was renamed rather than recreated, so the screenshots uploaded into it
survived. Five screenshots sit in the 6.9" bucket.

One screenshot (`2026-09-01 11-20-38 Screenshot.png`, 1179x2556) is still in the
6.1" bucket. It is a genuine iOS capture, so it is **not** a Guideline 2.3.10
risk, but because that bucket is non-empty Apple serves only that single image
to 6.1" devices instead of scaling the five down. Clear the bucket in 1.0.2.

The full rejection response, the text pasted into App Review, and the
Guideline 1.2 mapping are in [`app-review-1.0.1.md`](./app-review-1.0.1.md).

---

## Branches

| Branch | Purpose |
| --- | --- |
| `first` | **The shipped line.** iOS build 4 and Android vc8 both came from here. Branch hotfixes from this, not from `v1.0.2`. |
| `v1.0.2` | Current work. Rating scale and share feature. |
| `moderation-v2` | Parked WIP — ban enforcement, behaviour gating, appeal flow. Never applied, never shipped. |
| `main` | Serves `docs/` as GitHub Pages — the published terms and privacy pages. |
| `dev` | Older, superseded. |

If Apple rejects 1.0.1 and a fast fix is needed, cut it from `first`. Putting an
in-progress `v1.0.2` in front of a reviewer who just bounced you is a bad trade.

---

## v1.0.2 — in progress

### Rating scale 1-10 — DONE, not yet released

Ratings run 1-10 with **5 as neutral**: above 5 positive, below 5 negative.

- `src/lib/ratingSystem.ts` — scale constants, `calculateEventRating`,
  `calculateUserRating`, `ratingSentiment`, `ratingLabel`, `formatRating`
- `supabase/migrations/019_rating_scale_10.sql` — **applied to production
  2026-10-19**
- `src/components/EventCard.tsx` — `RateEventRow` is now a slider
- `src/lib/behaviorScore.ts` — `ratingAward` / `hostingAward` and named thresholds

Two things worth knowing about that migration:

1. `event.rating` was `NUMERIC(3,2)` (max 9.99) and `user_ratings.score` was
   `NUMERIC(2,1)` (max 9.9). **Neither could physically store a 10** — Postgres
   rejects the write rather than rounding. Both are widened.
2. Existing values were **doubled**, which maps the old scale onto the new one
   exactly (an aggregate of 4.47 becomes 8.93). Old and new ratings stay
   comparable.

`submitUserRating` previously awarded points on `score === 5 || score === 4`.
On the new scale those are neutral and negative. Thresholds now live in
`behaviorScore.ratingAward` (top = 10, good = 8).

**Open design question:** silent attendees — people who attended but left no
review — count as half-weight top-score reviews. That is a direct carry-over
from the 1-5 scale, but it now means silence scores as a perfect 10, which
pulls averages up hard when 5 is explicitly neutral. Deliberately left as-is so
a scale change did not become a policy change. Changing it is one line in
`calculateEventRating` and one in the migration's trigger.

### Share feature — NOT STARTED

Decided: share events to Instagram and elsewhere with a link that opens the
event in the app, or falls back to the App Store / Play Store.

**Blocked on buying a domain.** This is not optional — Instagram and other
social apps strip custom schemes, so `opencircle://` will not work. Real
sharing needs HTTPS Universal Links (iOS) and App Links (Android), which
require files served from a **domain root**:

- `https://<domain>/.well-known/apple-app-site-association` — must be served as
  `application/json`
- `https://<domain>/.well-known/assetlinks.json`

The existing GitHub Pages site cannot do this: it is a *project* site at
`/OpenCircle3.0/`, so it cannot serve anything at the domain root.

Plan once a domain exists: host a landing page on Netlify or Vercel free tier,
add `associatedDomains` / `intentFilters` to `app.json`, add a
`src/constants/links.ts` with the domain, and build the share sheet.

Point values already exist for this in `behaviorScore.ts` — `share_event` (10),
`join_via_shared_link` (20), `post_shared_externally` (15) — and nothing awards
them yet.

---

## Parked on `moderation-v2`

Written and tested, never applied:

- `017_ban_enforcement.sql` — auto-ban at 5 distinct blocks/reports, hides their
  events, removes them from events they joined, 72-hour appeal window, then
  deletion. Needs pg_cron.
- `018_behavior_gating.sql` — enforces score >= 900 to host, >= 800 to join,
  < 500 banned. Includes a backfill that **bans existing low-score accounts** —
  read it before running it.
- `src/app/(auth)/banned.tsx`, `src/lib/banWindow.ts`

Terms were updated on that branch to disclose auto-suspension. **Those terms
are not published** — the live site still serves the 2026-08-27 version. If the
ban system ships, the terms must go live first.

---

## Traps

**Migration numbering.** `moderation-v2` holds 017 and 018 unapplied. The rating
migration is deliberately **019** to avoid a merge that silently skips one.

**Migration 006 was never applied to production.** `message_reports` and
`user_reports` did not exist, so in-app reporting failed silently on the live
app for months. Migration 015 recreates them itself. Run
`supabase/check_schema_state.sql` before assuming any table exists.

**The dev client needs a local `.env`.** EAS environment variables are baked
into built binaries, but the dev client loads JS from Metro on the laptop, which
reads `.env` / `.env.local` — both gitignored. A fresh checkout crashes with
`supabaseUrl is required`. Fix: `npx eas env:pull --environment production`,
then restart Metro with `--clear` (env vars are inlined at transform time, so a
cached bundle keeps serving `undefined`).

**The dev client points at production Supabase.** Anything created while testing
is real data.

**EAS builds from git.** Uncommitted files are excluded. Commit before building
or the build will not contain your changes.

**`eas submit` reports failures with no detail.** `submission.error` is null and
there are no logs. If it fails, mint a JWT from the stored App Store Connect API
key and call Apple directly — the real error is there. A ~17 second failure with
no upload record means auth or account state, not the binary. This has already
happened once: Apple had frozen API access pending an unsigned agreement, and
Expo reported it as an invalid API key.

**Android package name collides.** The dev build and the Play build share
`com.amirhormazahash.opencircle`, and Play re-signs with its own key, so
installing one over the other fails with "App not installed". Uninstall first,
or split the package name for dev builds via `app.config.js`.

---

## Identifiers

- Expo project: `9f901f57-bb05-48d2-ab19-c0f6cf65b084`, account `ahorm006`,
  slug `opencircle`
- App Store Connect app ID: `6795998138`
- Apple team: `35JJBS2DLS` (Individual — the account holder can sign agreements
  without anyone else)
- Bundle / package: `com.amirhormazahash.opencircle`
- Supabase project: `czhkbqkmtouyfqokvzud` (OP-Backend)
- Published docs: `https://amirhormaza-hash.github.io/OpenCircle3.0/`

---

## Next

1. Clear the 6.1" screenshot bucket (next App Store submission)
2. Buy a domain, then build the share feature
3. Decide the silent-attendee weighting question above
4. Eventually: finish and apply the `moderation-v2` work, publish the terms
   update that goes with it
