# Admin Panel Planning Artifact

> **For Hermes:** Use subagent-driven-development to execute one task file at a time, with spec-compliance and code-quality review after each task.

**Goal:** Deliver a complete, Swagger-grounded implementation roadmap for Rakdsho's admin panel.

**Architecture:** The detailed roadmap is intentionally stored with the project's technical documentation as a linked multi-document task set. The admin panel remains in the existing Next.js app and uses explicit `/admin/*` NestJS contracts with audit-first privileged writes.

**Tech Stack:** Next.js, NestJS, Prisma/PostgreSQL, generated OpenAPI contracts, Jest.

---

Canonical project artifacts:

- [`doc/tech/admin-panel/ROADMAP.md`](../../../doc/tech/admin-panel/ROADMAP.md)
- [`doc/tech/admin-panel/ROADMAP_REFERENCE.md`](../../../doc/tech/admin-panel/ROADMAP_REFERENCE.md)
- [`doc/tech/admin-panel/tasks/`](../../../doc/tech/admin-panel/tasks/)

The plan is based on the live `/docs-json` contract captured on 2026-09-20 (47 paths, 60 schemas), repository implementation, and the existing `doc/tech/tasks/trust-admin.md` intent. It separates 13 independently executable work packages and explicitly distinguishes existing admin APIs from missing workflows.
