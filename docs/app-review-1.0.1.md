# App Review resubmission — OpenCircle 1.0.1

Response to the rejection of submission `ce404b94-5239-4834-bf0a-5eaecc707e17`
(version 1.0 (2), reviewed August 13, 2026) on Guidelines **1.2 Safety —
User-Generated Content** and **2.3.10 Performance — Accurate Metadata**.

---

## 1. Guideline 1.2 — what Apple asked for, and where it now lives

Apple listed five required precautions. Each maps to code in this repo.

| Requirement | Implementation |
| --- | --- |
| Users must agree to terms (EULA) that state there is **no tolerance for objectionable content or abusive users** | `src/components/AuthTermsGate.tsx`, gating `Create Account` in `src/app/(auth)/signup.tsx`. Terms text: `docs/terms.html` → "Zero tolerance for objectionable content and abusive users" |
| A method for **filtering objectionable content** | `src/lib/contentFilter.ts` — applied on every posting path (see §3) |
| A mechanism for users to **flag objectionable content** | `src/components/ReportBlockSheet.tsx` — events, messages, and users |
| A mechanism for users to **block abusive users**, removing their content from the feed instantly and notifying the developer | `block_user` RPC + RESTRICTIVE RLS in `supabase/migrations/015_blocking_moderation.sql`; UI in `ReportBlockSheet`; management in `src/components/BlockedUsersModal.tsx` |
| Developer must **act on reports within 24 hours** | `review_status` / `reviewed_at` moderation queue on all three report tables, plus auto-hide at 3 distinct reports (migration 015) |

### What changed since 1.0 (2)

**The EULA is now presented before registering.** Sign-up has an explicit
checkbox linking to the Terms of Service and Privacy Policy; `Create Account`
stays disabled until it is ticked. Directly beneath it, the screen states that
OpenCircle has zero tolerance for objectionable content or abusive users and
that violations result in account removal. The sign-in screen carries the same
agreement as a notice. Acceptance is recorded with a version stamp
(`profiles.terms_accepted_at` / `terms_accepted_version`).

**Blocking is now a real in-app feature.** In 1.0 (2), Settings → Privacy →
"Report or Block a User" opened a `mailto:` link asking us to block someone on
the user's behalf. That was the substance of the rejection, and it is gone.
Blocking is now available from:

- a user's profile (⋯ button, top right)
- a direct message thread (members sheet)
- an event chat (members sheet → Block user)
- long-pressing any message the user did not send

A block takes effect immediately and is enforced in the database, not just the
UI. The RESTRICTIVE policies in migration 015 mean a blocked pair cannot see
each other's events, exchange direct messages, see each other's chat messages,
or send friend requests — even from a modified client. Blocking also tears down
any existing friendship, and when a reason is given it files a report so the
account reaches our moderation queue.

**Blocks are manageable and reversible** at Settings → Blocked Users, which
lists everyone the user has blocked and offers Unblock on each row.

**Events can now be reported.** Event names and descriptions are
user-generated, so the event details sheet has a "Report this event" action.
Three distinct reports auto-hide the event pending review.

**Content is filtered before it posts,** not after. See §3.

---

## 2. Guideline 2.3.10 — screenshots (action required, not a code change)

> Revise the app's screenshots to remove non-iOS status bar images and non-iOS
> menu bar images.

**This cannot be fixed in code.** The current App Store screenshots were
captured on a non-iOS device — the status bar (battery, signal, clock) is
Android's, not iOS's. To resolve:

1. Run the app on an iPhone or the iOS Simulator.
2. Retake every screenshot there, for each required display size.
3. In App Store Connect → the 1.0.1 version → Previews and Screenshots, choose
   **View All Sizes in Media Manager** and replace the images in *every* size
   bucket. Apple's message specifically notes some sizes are only reachable
   that way, and a leftover Android capture in one unchecked bucket will fail
   review again.
4. Make sure the majority of screenshots show the app's actual features in use.

---

## 3. Where the content filter runs

`screenText()` / `screenFields()` reject objectionable text **before** the
insert, on every path where a user can publish something others will read:

| Screen | Fields |
| --- | --- |
| `(tabs)/create.tsx` | event name, description, address |
| `(tabs)/edit-event.tsx` | event name, description, address |
| `(tabs)/messages/[eventId].tsx` | event chat messages |
| `(tabs)/messages/dm/[userId].tsx` | direct messages |
| `(tabs)/profile-settings.tsx` | name, username, bio, location |
| `(auth)/onboarding.tsx` | name, username |

The filter has two severity tiers. Slurs, threats, and sexual content
involving minors are `severe` and rejected with a warning that repeat attempts
remove the account; general profanity is rejected with a request to reword.
It resists the usual evasions — leetspeak (`sh1t`), padded repeats (`fuuuck`),
and letter spacing (`f a g g o t`, `r.e.t.a.r.d`).

Matching is anchored on word boundaries, which is what keeps it from flagging
innocent text. `src/lib/__tests__/contentFilter.test.ts` covers this explicitly:
"Grape picking", "Raccoon watching", "suspicious", "Torpedo museum",
"Pakistan independence day", "Document review", "Cocktail making",
"Assignment help", "Scunthorpe United" and others all pass untouched. 38 tests,
all passing.

---

## 4. Text to paste into App Store Connect

### Reply to App Review

> Hello,
>
> Thank you for the detailed review. Both issues have been addressed in version
> 1.0.1.
>
> **Guideline 1.2 — User-Generated Content**
>
> All five required precautions are now implemented:
>
> 1. **EULA before registration.** The sign-up screen now requires users to tick
>    an agreement to our Terms of Service before the Create Account button
>    becomes enabled. The terms state explicitly that OpenCircle has zero
>    tolerance for objectionable content or abusive users, and that violations
>    result in account removal. This warning is also shown inline on the sign-up
>    screen itself. The sign-in screen presents the same agreement.
>
> 2. **Filtering objectionable content.** All user-generated text — event names,
>    event descriptions, chat messages, direct messages, display names, usernames
>    and bios — is screened before it is posted. Content containing hate speech,
>    slurs, threats, or sexual content is rejected and never reaches other users.
>
> 3. **Flagging objectionable content.** Users can report any event, any message
>    (by long-pressing it), and any user, from a report sheet reachable
>    throughout the app.
>
> 4. **Blocking abusive users.** Users can block anyone from their profile, from
>    a direct message thread, from an event chat, or by long-pressing one of
>    their messages. Blocking takes effect immediately: the blocked user's events
>    disappear from the blocker's feed, they can no longer send messages or
>    friend requests, and neither party can see the other's content. This is
>    enforced at the database level with row-level security, not only in the UI.
>    Blocking also notifies us so the account can be reviewed. Blocked users can
>    be reviewed and unblocked at any time under Settings → Blocked Users.
>
> 5. **Acting on reports within 24 hours.** Every report enters a moderation
>    queue. We review reports and remove violating content and eject the
>    offending user within 24 hours. Content flagged independently by three or
>    more users is hidden automatically while it awaits review.
>
> A screen recording captured on a physical device is attached, demonstrating
> the EULA presented before registration, the flow for flagging objectionable
> content, and the flow for blocking an abusive user.
>
> **Guideline 2.3.10 — Accurate Metadata**
>
> All screenshots have been retaken on iOS and re-uploaded across every display
> size, so no non-iOS status bars or menu bars remain.
>
> Our published contact address is amirhormaza@gmail.com, listed in the app
> under Settings → Help & Support and in our Terms of Service.
>
> Thank you for your time.

### App Review Information → Notes

> OpenCircle is a local events app with user-generated content. Moderation
> features required by Guideline 1.2:
>
> • EULA WITH ZERO-TOLERANCE TERMS — shown on the Sign Up screen. The Create
>   Account button is disabled until the checkbox is ticked. Full terms:
>   https://amirhormaza-hash.github.io/OpenCircle3.0/terms.html
>
> • REPORT CONTENT — Event: open any event → "Report this event". Message:
>   long-press any message you did not send. User: open a profile → ⋯ (top
>   right) → Report.
>
> • BLOCK A USER — open a profile → ⋯ (top right) → Block. Also available from
>   a DM thread and from an event chat's members list. Takes effect immediately.
>
> • MANAGE BLOCKS — Settings → Blocked Users (also under Settings → Privacy →
>   Blocked Users). Lists all blocked users with an Unblock action.
>
> • CONTENT FILTER — try creating an event or sending a chat message containing
>   profanity or a slur; it is rejected before posting.
>
> • Reports are reviewed and actioned within 24 hours. Contact:
>   amirhormaza@gmail.com
>
> A screen recording of these flows is attached to our reply to App Review.

---

## 5. Before you resubmit — manual checklist

- [ ] **Check what your database actually has.** Run
      `supabase/check_schema_state.sql` in the SQL editor first. Migration 006
      was never applied to production — `message_reports` and `user_reports` did
      not exist, which means in-app reporting has been silently failing on the
      live app. 015 now recreates those tables itself, but run the check to see
      whether anything else is missing too.
- [ ] **Apply the migrations.** Run `015_blocking_moderation.sql` and
      `016_app_config_bump.sql` against the production Supabase project. Nothing
      in this release works without 015.
- [ ] **Publish the updated terms.** `docs/terms.html` must be live at
      `https://amirhormaza-hash.github.io/OpenCircle3.0/terms.html` — App Review
      will open the link from the sign-up screen. The zero-tolerance section has
      to be visible there, not only in this repo.
- [ ] **Retake the screenshots on iOS** and replace them in every size bucket
      via View All Sizes in Media Manager (§2).
- [ ] **Record the demo video on a physical device.** Apple asked for exactly
      three things, in this order:
      1. the EULA presented before registering (show the checkbox gating the
         disabled Create Account button, and open the terms link)
      2. flagging objectionable content (report an event or a message)
      3. blocking an abusive user (block from a profile, then show them listed
         under Settings → Blocked Users)
      Attach it to the reply and paste the notes from §4 into App Review
      Information → Notes.
- [ ] **Build and submit 1.0.1.** `version` in `app.json` is already `1.0.1`;
      EAS auto-increments the build number, so the next build will be 3.
- [ ] **Set `app_config.ios_url`** to the App Store listing URL once live, so
      the in-app update prompt sends iOS users to the App Store rather than
      falling back to the Play Store link.
- [ ] **Have a moderation inbox.** The 24-hour commitment is a real one. Reports
      land in `message_reports`, `user_reports`, and `event_reports` with
      `review_status = 'pending'`; watch them and set `review_status` /
      `reviewed_at` as you action them.

---

## 6. Files changed

**New**

- `supabase/migrations/015_blocking_moderation.sql` — blocking, moderation
  queue, event reports, auto-hide, RLS enforcement, EULA columns
- `supabase/migrations/016_app_config_bump.sql` — version gate bump
- `src/lib/contentFilter.ts` — objectionable content filter
- `src/lib/moderationQueries.ts` — block / unblock / report queries
- `src/lib/__tests__/contentFilter.test.ts` — 38 tests
- `src/components/ReportBlockSheet.tsx` — shared report + block sheet
- `src/components/BlockedUsersModal.tsx` — blocked users management
- `src/components/AuthTermsGate.tsx` — EULA checkbox and notice
- `src/constants/legal.ts` — hosted doc URLs and terms version

**Modified**

- `docs/terms.html` — zero-tolerance and moderation sections
- `src/context/AuthContext.tsx` — records terms acceptance at sign-up
- `src/app/(auth)/signup.tsx`, `login.tsx`, `onboarding.tsx` — EULA gate, filter
- `src/app/(tabs)/user-profile.tsx` — report/block entry point
- `src/app/(tabs)/messages/[eventId].tsx`, `messages/dm/[userId].tsx` — shared
  sheet, blocking, message filtering, blocked members dropped from lists
- `src/app/(tabs)/profile-settings.tsx` — Blocked Users replaces the mailto
  link; profile text filtering
- `src/app/(tabs)/create.tsx`, `edit-event.tsx` — event content filtering
- `src/components/EventDetailsModal.tsx` — report this event
- `app.json` — version 1.0.1
