# Working with Codex (optional)

Updated 2026-10-19. The canonical working method is `docs/WORKING-AGREEMENT.md`: Claude leads end to end and is Guy's single point of contact. This file replaces the 2026-09-26 / 2026-10-09 arrangement in which Codex ran discovery, wrote Claude briefs, recommended models and reviewed every milestone. Those duties are **no longer required**.

## When Codex is involved
- Only when Guy chooses to ask Codex for something (an idea, research, a review, a second opinion). Claude does not route work through Codex, wait for Codex approval, or ask Guy to relay briefs.
- Codex output is professional input, not an approval gate. Claude weighs it against code and evidence, resolves it with Guy in the central chat when it changes the outcome, and records the decision in `docs/CODEX-PROJECT-STATE.md`.
- If Codex and Claude work at the same time, avoid concurrent writes to the same files; preserve each other's uncommitted changes.

## Still-useful analysis checklist for automations
Consider the desired business outcome; trigger and scope; who acts next; prerequisites; authoritative source of status; stale, partial and failed checks; duplicate execution and retry behavior; authentication; visibility and recovery; and effects on related processes. These are analysis prompts for Claude, not questions for Guy. Investigate first and ask only what materially needs his decision.

## Shared continuity
`docs/CODEX-PROJECT-STATE.md` (name kept for history) is the project continuity log for any tool: decisions and reasons, open questions, exact work path, affected files, evidence, next step. New chats share files, not transcripts. Reviewing code does not authorize scripts with external side effects; production submissions, messages and data changes require authorization appropriate to the task.

## Superseded (kept for history)
- Codex as mandatory planner/brief writer/reviewer; explicit model recommendation to Guy in every handoff; Codex review of a release guide — superseded 2026-10-19.
- Mandatory release guide after every user-visible release (2026-10-13) — superseded 2026-10-19: an HTML illustration is prepared **before** development for approval; a post-release HTML only on request.
- Design delegation (2026-10-01) — still valid in spirit: routine design decisions belong to Claude; the approved pre-development illustration is the binding reference.
