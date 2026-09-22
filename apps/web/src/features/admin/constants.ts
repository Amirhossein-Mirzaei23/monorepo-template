/**
 * Queue links preserving the FILTER INTENT (task card): every card/queue CTA
 * opens its admin page pre-filtered to exactly the rows the overview counted.
 * The lots/reports/verifications/deals pages land in Tasks 08-11 — the hrefs
 * are the contract those pages must honor (?status= query).
 */
export const ADMIN_OVERVIEW_HREFS = {
  pendingLots: '/admin/lots?status=PENDING_REVIEW',
  openReports: '/admin/reports?status=OPEN',
  pendingVerifications: '/admin/verifications?status=PENDING',
  disputedDeals: '/admin/deals?status=DISPUTED',
  activeUsers: '/admin/users?status=ACTIVE',
  suspendedUsers: '/admin/users?status=SUSPENDED',
  blockedUsers: '/admin/users?status=BLOCKED',
  // The new-users count is time-based, not status-based — no status filter can
  // express it, so the card opens the unfiltered users list (Task 05 owns any
  // richer ?createdAfter= filter contract).
  newUsers: '/admin/users',
} as const;
