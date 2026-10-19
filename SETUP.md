# Shared planning

The public advertising repository is unchanged. `/plan.html` is the internal site's planning page.

38 outreach tasks for October 19–26, 2026. Role assignments and end-of-day deadlines are planning defaults. The baseline is fixed at 2 registered, 23 available places and zero advertising budget.

## Required production setting

Create a GitHub fine-grained personal access token owned by SyuneHovan, restricted to `arahet-agrocamp-LOCAL`, with repository Contents: Read and write. Set a suitable expiration and renew before it expires. Put it ONLY in the Vercel project's Production environment as `ARAHET_GITHUB_TOKEN`, then redeploy. No token belongs in HTML, JSON, source control, or chat. Repository-level Contents permissions cannot be restricted to a single JSON file, so the server fixes the repository, path and branch in code and accepts only known task IDs and booleans.

The persistent source is `tasks.json` on `plan-data`. The JSON on `main` is only the initial read-only fallback. `plan-data` deployments are disabled by vercel.json. Do not merge or reset the data branch as part of website releases.

## Behavior

Anyone can read and toggle tasks without login, intentionally. This is not team-only authorization. No contact details, credentials or children's information are stored. Each successful change creates a Git commit. Different-task conflicts retry using the latest file SHA; stale changes to the same task are rejected. Repeated identical updates are idempotent. Other visible sessions refresh every 60 seconds, on returning to the tab, or on manual refresh. Failed writes never show success; a timeout may still have committed, so refresh before retrying.

Polling pauses in hidden tabs. GitHub outages, token expiration and API limits disable confirmed syncing. No localStorage success fallback is used. This low-volume workflow is intended for 3–4 teammates, not a high-traffic task service.

## Verification

Run `npm test` for the mocked GitHub contract tests. Live persistence must also be checked with two separate browser sessions after configuring the token: mark one task, observe it in the second session, reload both, then unmark it and verify again. Confirm a data commit does not trigger a deployment. Check the layout at mobile and desktop widths.

## Editable team plan (October 2026)

Repository renamed to SyuneHovan/arahet-agrocamp-internal. Existing plan-data is preserved; no reset or database migration is required. Existing schemaVersion 1 records are normalized with optional description, assigneeId and deleted fields, plus shared members and bounded applied operation IDs.

The UI supports task creation, partial field edits, descriptions, named assignment and recoverable soft deletion. Team members can be added with a name and an optional legacy role to claim unassigned role tasks. Choosing a name is only a remembered personal filter, not authentication or authorization. Anyone with the link can change the shared plan.

Edits are optimistic and queued immediately, with a 400ms batch delay and serial requests. They do not disable other controls. Unconfirmed operations are stored locally as a clearly marked outbox, not as a substitute for shared persistence. The common source remains the GitHub JSON. The user can retry or discard unsaved drafts. Successful operation IDs prevent a lost response from replaying an old change. Same-field conflicts require explicit retry/rebase; different fields can merge. Polling is every 30 seconds while visible and idle. GitHub commits still take network time; the UI does not claim durability before confirmation.

Verification: npm test includes 16 cases for legacy compatibility, member assignment, create/edit/delete, concurrent updates, atomic conflict rejection, idempotency, validation and outages. tests/preview-server.cjs is a local-only simulated GitHub store for browser verification and is not a production API.
