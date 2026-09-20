# Task 13 — Admin E2E QA, Security, Accessibility, and Operations

**Phase:** D — Investigation, accountability, launch  
**Objective:** Prove the complete admin system is secure, usable, observable, and operationally documented before rollout.

## Files

- Create/extend API permission and state-machine e2e suites
- Create Playwright/browser admin journey specs in the repository's established E2E location (introduce the dependency only if the project has formally selected it)
- Create: `doc/tech/admin-panel/ADMIN_RUNBOOK.md`
- Update: relevant README/task checkboxes only after gates pass

## Required journeys

1. Admin login→refresh→deep link→logout.
2. Anonymous and USER denial for every admin route/API.
3. Category create/edit/reorder/deactivate→seller picker propagation.
4. Seller submits lot→admin rejects→seller sees reason→resubmits→admin approves→public listing.
5. User reports lot→admin reviews/removes→resolves→audit trail.
6. Verification grant→public badge→revoke.
7. User suspend/block→sessions revoked→public visibility policy applied.
8. Deal investigation and, if implemented, dispute resolution.

## Steps (TDD/verification)

1. Add missing negative-path tests before fixing any discovered behavior.
2. Run a generated permission matrix over every `/admin/*` operation.
3. Run race/stale-action tests for moderation, report decisions, verification, and user status.
4. Run keyboard-only and screen-reader-name checks for navigation, tables, dialogs, media controls, forms, toasts, and focus return.
5. Test narrow mobile viewport and desktop RTL; ensure table overflow is contained.
6. Verify request IDs connect BFF/API logs and every mutation creates one audit record.
7. Write runbook: admin provisioning/rotation, last-admin recovery, queue triage, reversal paths, incident access review, backups/retention, and how to disable admin access.
8. Run full repository gates and a production build against migrated/seeded PostgreSQL.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run format:check
git diff --check
```

Expected: all gates pass; any unrelated baseline issue is recorded with exact path/command and does not hide an admin regression.

## Completion checklist

- [ ] Permission matrix covers every admin operation.
- [ ] Critical journeys pass in a real browser.
- [ ] RTL/mobile/a11y checks pass.
- [ ] Audit/log correlation is verified.
- [ ] Runbook is complete and recovery tested.
- [ ] ADM/TRS cards are checked only after acceptance evidence exists.
