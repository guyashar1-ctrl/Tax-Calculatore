# SHAAM Citrix launch from PIVO Chrome — 2026-10-09

## Problem and resulting behavior

PIVO attaches to a dedicated Chrome profile that the accountant also uses manually. ICA launch files could be downloaded while native Open / Show in folder did not respond. Opening the saved ICA from Windows Explorer launched Citrix successfully. Background portal classification could also navigate a Citrix tab to the SHAAM portal because Citrix uses a different origin.

The SHAAM connection now uses Playwright 1.62.1 `connectOverCDP` with `noDefaults: true` to retain Chrome's native download behavior. The exact HTTPS origin `https://shaam-mf-emulator.taxes.gov.il` is recognized as manual work: detection and explicit focus preserve its tab, and the background bootstrap work-screen guard protects it. Citrix does not establish portal authentication; its state is classified as unknown and existing session evidence remains subject to the existing monitor rules.

## Validation and limits

- Initial main-checkout worker tests: 70 passed, including three new tests for exact-origin matching, preserving Citrix during detection/focus, and not treating Citrix title as portal authentication.
- The three regression tests also passed against the staged installed-worker version. Installed file syntax and hashes matched the reviewed candidate.
- An isolated real headless Chrome test with a local HTTP attachment confirmed ordinary CDP defaults redirected the file to a UUID temporary path and deleted it at disconnect. With `noDefaults`, native filename/path survived disconnect and reconnect. Transition from old attachment to the new option worked without closing Chrome. This establishes coexistence behavior, not the precise cause of every native Open failure.
- Original user ICA files had native names and worked from Explorer, so temporary-path handling alone was not proven to explain the entire original incident.
- After the installed-worker update, Guy reported successful real launch from PIVO. A later recording showed a loading spinner; he then confirmed it worked. No timeout workaround or forced Citrix restart was introduced.

## Local installation and future releases

The active installation was `C:/Users/guyas/PIVO/worker-production/worker`, separate from the development checkout. Only six bounded edits were applied to its existing `src/browserSession.mjs`; unrelated installed code was preserved. A backup was saved beside the file as `browserSession.mjs.before-citrix-20261009`. The idle worker was restarted while Chrome remained open. Its temporary instance lease conflict cleared and the worker resumed normally.

This report, source change and regression test preserve the fix for future worker releases. A website deployment alone does not update the installed local worker; worker packaging/update must include this version. There are no database, website UI or credential changes. Screen recordings and screenshots containing personal data are kept locally and excluded from this change.

References: [Playwright connectOverCDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp), [Citrix ICA launch troubleshooting](https://support.citrix.com/external/article/CTX695368/citrix-workspace-solutions-for-handling.html).

GitHub candidate validation against master 8f3c13c: all 287 worker tests passed (including local browser fixture tests), zero failed/skipped, using dummy worker settings with a loopback-only endpoint. The separate BTL tracking suite passed 93 checks. No production credentials were used for these tests.
