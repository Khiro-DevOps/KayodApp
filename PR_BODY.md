Title: feat(pre-employment): Sprint 1.5 — Pre-employment flow, uploads, validations, enum normalization

Summary:
- Implements full Sprint 1.5 pre-employment flow: HR Move → Pre-employment modal, applicant upload page, HR review page, Confirm Hire flow.
- Adds client upload UX with progress and validations; server proxy route with server-side validation and delegation to existing server action.
- Normalizes `employment_type` enum values to underscored labels and includes a safe finalize migration.
- Adds QA checklist and a PowerShell helper to run the finalize migration.

Key files changed:
- components/move-to-preemployment-modal.tsx
- app/apply/applications/[id]/documents/documents-client.tsx
- app/apply/applications/[id]/documents/page.tsx
- app/api/pre-employment/upload/route.ts
- lib/pre-employment-actions.ts (existing — used by actions)
- migration/2026_05_29_fix_employment_type_enum.sql
- migration/2026_05_29_finalize_employment_type_enum.sql
- scripts/run_finalize_employment_type_enum.ps1
- docs/PRE_EMPLOYMENT_QA_CHECKLIST.md

Checklist before merge:
- [ ] CI passes (lint / build / tests)
- [ ] Run QA checklist on staging (see docs/PRE_EMPLOYMENT_QA_CHECKLIST.md)
- [ ] Finalize enum migration on staging and verify app behavior
- [ ] Merge and deploy to production during maintenance window

Commands to push and open PR (run locally):

```bash
# push branch
git push -u origin feat/sprint-1.5-complete

# create a PR using GitHub CLI (optional)
gh pr create --fill --base main
```

Commands to run finalize migration (on a machine with psql and DATABASE_URL set):

```powershell
$env:DATABASE_URL = "postgres://user:pass@host:5432/dbname"
# review migration
cat migration/2026_05_29_finalize_employment_type_enum.sql
# run script
.\scripts\run_finalize_employment_type_enum.ps1
```

If you want me to push the branch and create the PR, grant remote push access or provide a GitHub token / let me know to run the push from here. If you want me to run the finalize migration against staging, provide the `DATABASE_URL` (preferrably for a staging DB) or allow me to run the script on your environment.
