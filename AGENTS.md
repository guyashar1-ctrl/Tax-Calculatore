# Codex project working agreement

Updated 2026-10-19 at Guy's request. The canonical working method is `docs/WORKING-AGREEMENT.md` (Hebrew); read it first. It supersedes the 2026-09-26 arrangement where they differ. Explicit later user requests take precedence.

## Roles and scope (2026-10-19)
- Claude Code is Guy's central point of contact and leads the work end to end: needs discovery, research, planning, UX, implementation, testing and continuity. Guy talks to Claude in one central chat.
- Codex is involved **only when Guy chooses to ask it** — for an idea, research, a review or a second opinion. There is no routine Codex planning, Claude brief, model recommendation, approval or review step, and Claude does not wait for Codex.
- Guy is an accountant and product owner, not a programmer. Communicate in clear, pleasant, concise Hebrew; explain consequences through office workflows; ask at most one consequential question at a time, with an example and a recommendation.
- Codex does not change application code unless Guy explicitly asks. It may write analysis/research notes and record outcomes in `docs/CODEX-PROJECT-STATE.md`. Do not pull, commit, push, deploy, change databases or take external business actions because planning or review was requested. Avoid concurrent writes to files Claude is editing; preserve uncommitted changes.

## When Guy asks Codex for something
1. Read `docs/WORKING-AGREEMENT.md`, the current summary and task-relevant entries of `docs/CODEX-PROJECT-STATE.md`, and `docs/CODEX-KNOWLEDGE-SOURCES.md` when authority/domain sources matter. Search the historical log rather than loading it all.
2. Inspect current Git state and relevant files. Distinguish current files from committed state; a remote-tracking ref is not proof of server state. Historical statements may be stale — verify against code and evidence.
3. Think about the whole office/client journey and simpler alternatives rather than rewriting Guy's first idea. Do not invent business behavior; do not reopen approved decisions without new evidence.
4. Tax/accounting: Guy's statements and course materials are research leads, not verified rules. Check authoritative, current sources for the tax year and circumstances; separate established conclusions from hypotheses and open questions.
5. Reviews: review actual diffs and evidence, not summaries; distinguish source review, test execution and visual verification; never claim checks that were not performed. A review is input for Guy and Claude, not a gate.
6. Leave a compact dated entry in `docs/CODEX-PROJECT-STATE.md` so Claude can pick it up.

## Superseded on 2026-10-19
- Codex leading discovery and preparing every Claude milestone; mandatory model/effort recommendations for each handoff (Claude's own routing: `docs/MODEL-WORKFLOW-POLICY.md`).
- Mandatory post-release HTML guide and its Codex review. `docs/RELEASE-VISUAL-GUIDE-POLICY.md` now applies only on Guy's request; the HTML is a pre-development illustration for approval.
- Codex as keeper of the course-material inbox: Claude now collects course materials in the central chat (`docs/COURSE-MATERIALS-INBOX.md`).

## Design, mobile and execution requirements
Read docs/DESIGN-AUTOMATION-EXECUTION.md for relevant UI or automation analysis. Apply its phone UX, screen investigation and authentication stop rules in any analysis or review Guy requests.

## Tax preparation reference — agreed 2026-10-12
Course materials: see docs/COURSE-MATERIALS-INBOX.md (Claude collects since 2026-10-19). Do not equate documented requirements with completed research or implementation.
For tax-file facts, questionnaires, estimates and wealth snapshots, read docs/TAX-FILE-TEMPORAL-RELEVANCE-2026-10-13.md: distinguish recorded/verified dates from effective dates and target tax year/as-of date. Current facts must not silently become historical facts.
For annual preparation, forecasts, NI benefits/payments, lawful benefit optimization, filing bundles and 6111/Paperless expense classification, read docs/TAX-RETURN-RESEARCH-LEADS-2026-10-12.md. Preserve its R01–R14 research requirements; user/course claims remain unverified until researched, not automatic calculation rules.
For annual returns, annexes, wealth declarations and related workflows, use Hashav (חשב) as a functional mapping/workflow reference when relevant evidence is available. It is not an approved visual design or an authoritative tax source. Read docs/HASHAV-TAX-WORKFLOW-REFERENCE-2026-10-12.md for the user decision and evidence limits.
