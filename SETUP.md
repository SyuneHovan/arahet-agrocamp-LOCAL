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
