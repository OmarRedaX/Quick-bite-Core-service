# Core Service (Quick Bite)

Backend core service for the Quick Bite platform: users, auth, restaurants, branches, products, and restaurant-level RBAC (roles/permissions/members). Publishes domain events via a transactional outbox to RabbitMQ for other services (e.g. order-service) to consume.

## Stack

- Node.js + TypeScript, Express 5
- PostgreSQL via Knex (query builder + migrations)
- Redis (response caching, idempotency keys)
- RabbitMQ (outbox event dispatch)
- Mailjet (transactional email: password reset, member invites)
- `tsyringe` for dependency injection

## Setup

```bash
npm install
# create .env with DB/Redis/JWT/Mailjet/RabbitMQ config (see src/lib/config/env.ts for the full list)
npm run migrate
npm run dev        # API server, tsx watch
npm run worker:dev  # outbox -> RabbitMQ dispatcher, tsx watch
```

## Migrations

```bash
npm run migrate          # apply pending migrations
npm run migrate:status   # show applied / pending
npm run migrate:rollback
npm run migrate:make <name>
```

Migration files live in `src/migrations/`. The `20260824230156_fix_currency_enum_typo` migration corrects a `currency_enum` typo (`'EG'` was created instead of `'EGP'`) via `ALTER TYPE ... RENAME VALUE`, which relabels existing rows in place — no data loss.

## Authorization model

Two layers, applied in order on every protected route:

1. **Scoping middleware** (`src/lib/auth/rbac.ts`) — `requireRestaurantMember` confirms the caller belongs to the restaurant in the URL; `requireBranchAccess` confirms a non-owner is explicitly assigned to the target branch (via `member_branches`), with owner/system_admin bypasses.
2. **Permission middleware** — `rbac({resource, action})` checks the caller's restaurant role (`owner` / `branch_manager` / `staff`) against the `roles` / `permissions` / `role_permissions` tables, with a system_admin bypass.

Services only add a check where the middleware can't fully express the scoping (e.g. `PATCH /products/:id` carries no restaurant id in the URL, and a branchless update skips the branch check entirely) — that check compares the caller's own restaurant membership against the resource's restaurant, never a literal "must be the owner" rule, so `branch_manager`/`staff` get exactly what `role_permissions` grants them instead of being silently restricted to the owner. See `branch.service.ts::update` and `product.service.ts::create/findByRestaurant/update` for the reasoning inline.

## Testing

No automated test framework (Jest/Vitest/etc.) is wired up yet. `play/` (gitignored, local-only) is where ad-hoc DB-backed API test scripts live during development to verify the backend end-to-end against a running dev server — not part of the repo.
