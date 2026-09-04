# Milestone: request lifecycle separated from representation lifecycle

Date 2026-09-04 · Baseline: `docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md` · Migrations: `supabase/155-request-vs-representation-boundary.sql`, `supabase/156-disable-auto-intake-close.sql`

> **Superseded note:** an earlier version of this document described automatic
> intake closing (readiness-driven) as live. Guy reversed that same day —
> see §"Automatic closing — disabled" below. Migration 156 is the current
> behaviour; 155's auto-close block is dead code from the moment 156 applies.

## Product invariants now enforced

| # | Invariant | Enforced where |
|---|---|---|
| 1 | A request never changes the client's representation state | No code path writes representation from a request. `create_onboarding_request` / `advance_onboarding_step` / `update_onboarding_request` touch no representation column. Regression test asserts it across create, edit, complete, reopen. |
| 2 | Once represented, stays represented | Trigger `rep_requests_guard_status` raises `representation_active_is_terminal` on any move off `active`. `apply_client_representation` is monotonic. `handleAttachRepresentation` refuses early with a readable message. |
| 3 | Representation for an extra person/authority is a normal request | Nothing special-cases it. Test creates a spouse-BTL request on a represented client and asserts status, stage and the authority registry are untouched. |
| 4 | "Required for closing intake" only inside a real, open intake | `client_intake_state` (open/pending/none). `create_onboarding_request` coerces the flag to false when `none`; `set_onboarding_step_required` rejects `true` with `no_open_intake`. UI hides the control, the `רשות` chip and the toggle. |
| 5 | Client representation state is authoritative, derived from the representation request only | Trigger `rep_requests_sync_client` → `apply_client_representation`. The browser no longer writes `representationStatus` anywhere. CHECK constraints on both status columns. |

## The three intake states

`public.client_intake_state(client)` returns one of:

- **open** — an engagement with `status='onboarding'` exists. There is something to close.
- **pending** — no such engagement, but the client is `lead`/`quoted`. The intake is still coming, and the server already holds these requests until the quotation is approved (migration 135). Same boundary, deliberately.
- **none** — everything else: represented with no engagement, an active or ended engagement, a legacy client. Nothing to close, so the flag does not exist.

`src/lib/clientState.ts` mirrors this for the UI so no extra request is needed per client. `scripts/staging-test-domain-invariants.mjs` compares the mirror against the server for every client in the database.

## Audit contradictions — disposition

| # | Was | Disposition |
|---|---|---|
| C1 | Request "required to close intake" on a client with no intake | **Fixed.** Server coerces, UI hides. Reproduced and verified end to end. |
| C2 | Two different rules for "intake complete" | **Fixed.** One body, `close_onboarding_if_ready`. Both paths log and notify. |
| C3 | Client says represented, request says waiting | **Fixed forward.** Trigger derives the client from the request. One production row left for manual review (see below). |
| C4 | Active client with an open representation step | **Fixed** by the same trigger; the step is a projection of the request. |
| C5 | `null` representation read as "represented" | **Fixed.** `representationState()` returns `not_represented / in_process / active`; the `?? 'active'` decisions are gone. |
| C6 | Representation silently re-opened on an active client | **Fixed.** DB trigger blocks it; the UI refuses first. |
| C7 | Intake closed but steps reopen and stay "required" | **Fixed.** After close the context is `none`: the flag is inert, hidden, and cannot be re-set. |
| C8 | Ended engagement reads as "active client" | **Not changed.** Product decision U4, still open. |
| C9 | `lifecycle_stage` goes stale | **Fixed.** New trigger on `clients.representation_status`, plus the refresh inside `apply_client_representation`. |
| C10 | Two `activeEngagement` filters | **Fixed.** One `currentEngagement` selector. |
| C11 | Three lists of "steps that don't block" | **Partly fixed.** The server list is authoritative and unchanged; the TS mirror stays for the pre-flight gate dialog, and two staging tests assert UI equals server. |
| C12 | Cancelled request revived with reset flags | **Intentional** (migration 100). Now the revived flag also obeys the intake rule. |
| C13 | Nine ways to compute "represented" | **Partly fixed.** The client-level fact is centralised; the Hebrew-label comparison is gone. Per-authority and per-person resolvers stay — they answer a different question. |
| C14 | Status columns unconstrained | **Fixed.** CHECK constraints on both. |
| C15 | Office and portal read representation differently | **No longer divergent.** Both follow the request, which now has a single write path. |
| C16 | Two entry points, two publication semantics | **Fixed** for the domain rule: one `requestDefaults` helper, both obey the same intake and hold rules. The UX difference (catalog adds, composer drafts) is intentional and kept. |
| C17 | Dependency picker offered completed steps | **Fixed.** Only open steps are offered. |

## Historical data

Two distinct classes, handled differently on purpose.

**Repaired (forward only, idempotent).** A client whose `representation_status` lags behind its latest representation request. The request is the declared source of truth, the direction is forward, and no client loses representation. Migration §11 walks these and calls `apply_client_representation`. Production: **0 rows**. Staging: 1 row from 2026-08-25, repaired and verified.

**Left for manual review.** A client that is `active` while its request is behind. Not inferable: downgrading the client is forbidden by decision 2, and advancing the request would invent a signing history that never happened. Production has exactly one, reported by `domain_consistency_report()`:

```
clientId 66fb2f79-ebb1-4c03-8c5e-b2c3982edca9 · client=active · request=awaiting_accountant
```

**Left untouched.** 29 open steps in production carry `required_for_close=true` with no intake context. They are inert: the only reader runs while an engagement is `onboarding`. If that client ever starts a real intake they are adopted into it as open work, which is the correct outcome. `domain_consistency_report().inertRequiredFlags` counts them.

## Automatic closing — disabled (migration 156)

Migration 155 unified the close rule so the button and the automatic path
asked the same question. It left automatic closing itself in place: an
engagement flipped to `active` the moment its last required item completed,
with no explicit action.

Guy's decision (2026-09-04, same day): readiness and the actual lifecycle
transition stay separate. `onboarding_close_readiness` keeps lighting up
"ready to close" — the button, the blocking-list, the `רשות` semantics are
all unchanged. But nothing moves the engagement except a human clicking
"סגור קליטה". Migration 156 removes the auto-close call from
`advance_onboarding_step`; `close_onboarding` / `close_onboarding_if_ready`
are untouched — they are exactly what the button calls.

Concretely: completing the last required step now leaves the engagement in
`onboarding`, the client in `onboarding` stage, `ready=true`, no
`status_changed` event with `meta->>'auto'`, no `onboarding_closed`
notification. Only an explicit `close_onboarding` call transitions it, logs
it, and notifies. There is still no path back from `active` to `onboarding`
in either version, so the explicit click remains a one-way door — that part
was never in question.

## Verification

- `tsc` clean, `vite build` clean, both after 156.
- `scripts/staging-test-domain-invariants.mjs` — 55 assertions (rewrote the
  "one close rule" section into "readiness vs. actual transition"), all pass.
- `close-rules`, `required-model`, `lifecycle`, `unified-process`, `requests-v2`
  all call `close_onboarding` explicitly already, so none depended on
  auto-close; all pass unchanged after 156.
- Two fixture clients in `staging-test-unified-process.mjs` and
  `staging-test-requests-v2.mjs` were created without `lifecycle_stage`, so
  they defaulted to `lead` and their requests are now held by migration 135.
  Set to `active` explicitly. Those tests were passing on staging only
  because staging lagged production on 135; they would have failed against
  production.
