# Core Service (Quick Bite)

Backend core service for the Quick Bite food-delivery platform. It owns users & auth, restaurants, branches, the product catalog (with per-branch pricing/stock), customer addresses, and restaurant-level RBAC (roles/permissions/members). It publishes domain events through a transactional outbox to RabbitMQ so other services (e.g. an order-service) can react to changes, and exposes a set of internal, API-key-protected endpoints for service-to-service reads.

## Tech Stack

Detected from `package.json` and the `src/lib`/`src/pkg` infrastructure code:

| Concern | Choice |
|---|---|
| Language / runtime | Node.js + TypeScript (`ES2022`, `NodeNext` modules) |
| Web framework | Express 5 |
| Database | PostgreSQL (with the `postgis` extension, for branch geolocation) |
| Query builder / migrations | Knex |
| Cache | Redis (`ioredis`) — response caching (`withCache`) and idempotency keys |
| Message broker | RabbitMQ (`amqplib` / `amqp-connection-manager`) — transactional outbox dispatch |
| Auth | JWT access/refresh tokens (`jsonwebtoken`), `bcrypt` password hashing, httpOnly cookies (falls back to an `Authorization: Bearer` header) |
| Email | Mailjet (`node-mailjet`) — password reset OTPs, member invitations |
| Validation | `zod` (env config), `class-validator` / `class-transformer` (request DTOs) |
| Dependency injection | `tsyringe` |
| Scheduling | `croner` (outbox drain cron job in the worker process) |
| Security middleware | `helmet`, `cors`, `cookie-parser` |
| Dev tooling | `tsx` (watch mode), `eslint`, `prettier`, TypeScript compiler (`tsc`) |

No automated test framework (Jest/Vitest/etc.) is wired up — see [Testing](#testing).

## Features

- Email/phone user registration & login with JWT access + refresh tokens (httpOnly cookies), password reset via emailed OTP, and invite-based onboarding (`accept-invite`).
- Restaurant management: create/update restaurants, restaurant status lifecycle (`active`/`suspended`/`disabled`/`pending`).
- Branch management per restaurant: geolocation (PostGIS `geography(Point,4326)`, generated column, GIST index), operating hours, delivery radius/fee/commission, currency, "nearby branches" lookup, active/accepting-orders toggles.
- Product catalog: categories per restaurant, products with soft delete, and **per-branch** pricing/stock/availability (`product_branch_details`), auto-provisioned for every existing branch via a Postgres trigger when a product is created.
- Restaurant-level RBAC: seeded roles (`owner`, `branch_manager`, `staff`) and a resource:action permission catalog (`core:*` for this service, plus `orders`/`payments`/`deliveries`/`finance` and `analytics` catalogs seeded for downstream order-service and analytics-service), enforced via two middleware layers — restaurant/branch scoping and role-permission checks — with a `system_admin` bypass.
- Customer address book (home/office/public place types, default address flag).
- Transactional outbox: domain mutations and their `events_outbox` row are written in the same DB transaction; a separate worker process polls and publishes to RabbitMQ with `FOR UPDATE SKIP LOCKED` so multiple workers can run concurrently without duplicate publishes.
- Cross-cutting infra: request correlation IDs (propagated to logs and the response header), idempotency-key support for unsafe requests, Redis-backed response caching for hot internal/public reads, cursor-based pagination, a consistent `{success, data, meta}` JSON envelope, and centralized error handling that maps operational errors to their status code (including malformed-JSON body-parser errors).
- Internal, `INTERNAL_API_KEY`-protected endpoints for service-to-service reads (agents, branches, products, RBAC permissions) intended to be called by other Quick Bite services.

## Project Structure

```
.
├── src/
│   ├── app/                          # Feature modules, one folder per domain
│   │   ├── auth/                     # Register/login/refresh, password reset, invite acceptance
│   │   │   ├── controller/           # Express route handlers
│   │   │   ├── dto/                  # class-validator request DTOs
│   │   │   ├── entity/               # Domain entity classes
│   │   │   ├── repository/           # Knex data-access layer
│   │   │   ├── service/              # Business logic
│   │   │   ├── templates/            # Email templates (password reset)
│   │   │   ├── errors.ts, utils.ts, routes.ts
│   │   ├── branch/                   # Restaurant branches (location, hours, delivery settings)
│   │   ├── customer-address/         # Customer saved addresses
│   │   ├── health/                   # DB health check endpoint
│   │   ├── product/                  # Products, categories, per-branch price/stock
│   │   ├── rbac/                     # Roles, permissions, restaurant members, member-branch assignment
│   │   ├── restaurant/               # Restaurants (owner, status lifecycle)
│   │   └── user/                     # Authenticated user profile + internal agent lookup
│   ├── lib/                          # Cross-cutting application infrastructure
│   │   ├── auth/                     # JWT guard, RBAC middleware, internal API-key guard
│   │   ├── cache/                    # Redis cache init + withCache response-caching middleware
│   │   ├── config/                   # env.ts — zod-validated environment config
│   │   ├── correlation/              # Correlation-ID middleware
│   │   ├── di/                       # tsyringe container + DI tokens
│   │   ├── email/                    # Email provider init
│   │   ├── error/                    # AppError + centralized error handler
│   │   ├── events/                   # Outbox repository, drain job, event types
│   │   ├── http/                     # Response envelope, cursor pagination, param parsing
│   │   ├── idempotency/              # Idempotency-Key middleware
│   │   ├── knex/                     # Knex instance + knexfile (migrations config)
│   │   ├── logger/                   # Logger
│   │   ├── types/                    # Express type augmentations (req.user, req.correlationId)
│   │   ├── utils/                    # Cookie helpers
│   │   └── validation/               # DTO validation helper
│   ├── migrations/                   # Knex SQL migrations (raw SQL via knex.raw)
│   ├── pkg/                          # Swappable infra adapters (interfaces + implementations)
│   │   ├── cache/                    # ICacheProvider + Redis implementation
│   │   ├── email/                    # IEmailProvider + Mailjet implementation
│   │   ├── messaging/                # IMessageBroker + RabbitMQ implementation
│   │   └── utils/                    # Time helpers
│   ├── app.ts                        # Express app assembly (middleware, /api mount)
│   ├── routes.ts                     # Top-level router — mounts every feature router
│   ├── server.ts                     # HTTP server entrypoint (API process)
│   └── worker.ts                     # Outbox-drain worker entrypoint (separate process)
├── package.json
├── tsconfig.json
├── .env.example                      # Documented template for all environment variables
└── README.md
```

`play/` (ad-hoc local test scripts) is gitignored and not part of the shipped codebase.

## Database Schema / ERD

Schema as defined in `src/migrations/*.ts` (raw SQL via `knex.raw`). Types shown are the actual Postgres column types.

```mermaid
erDiagram
    users {
        serial id PK
        text email UK
        text phone UK
        text name
        text password_hash
        text system_role "customer | delivery_agent | restaurant_user | system_admin"
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at "nullable"
    }

    password_resets {
        serial id PK
        bigint user_id FK
        text otp_hash
        timestamp expires_at
        timestamp consumed_at "nullable"
        timestamp created_at
    }

    customer_addresses {
        serial id PK
        bigint user_id FK
        text label
        text country
        text city
        text street
        text building "nullable"
        text apartment_number "nullable"
        text type "office | home | public_place"
        decimal lat
        decimal lng
        boolean is_default
    }

    restaurants {
        bigserial id PK
        bigint owner_id FK
        text name
        text logo_url
        text status "active | suspended | disabled | pending"
        text primary_country
        timestamp created_at
        timestamp updated_at
        timestamp status_updated_at
    }

    restaurant_branches {
        bigserial id PK
        bigint restaurant_id FK
        text country_code
        text address_text
        text label
        decimal lat
        decimal lng
        boolean is_active
        time opens_at
        time closes_at
        boolean accept_orders
        smallint delivery_radius "km"
        int delivery_fee "minor units"
        varchar currency "EGP | SAR"
        int commission
        geography location "generated: ST_MakePoint(lng, lat)"
        timestamp created_at
        timestamp updated_at
    }

    product_categories {
        bigserial id PK
        bigint restaurant_id FK
        text name "unique per restaurant_id"
        timestamp created_at
        timestamp updated_at
    }

    products {
        bigserial id PK
        text name
        text description "nullable"
        text image_url "nullable"
        bigint restaurant_id FK
        bigint category_id FK "nullable"
        timestamp created_at
        timestamp updated_at
        timestamp deleted_at "nullable, soft delete"
    }

    product_branch_details {
        bigserial id PK
        bigint branch_id FK
        bigint product_id FK
        int price
        int stock
        boolean is_available
    }

    roles {
        smallserial id PK
        text name UK "owner | branch_manager | staff"
        text display_name
        text description "nullable"
        timestamp created_at
        timestamp updated_at
    }

    permissions {
        serial id PK
        text resource "unique with action"
        text action "unique with resource"
        timestamp created_at
    }

    role_permissions {
        smallint role_id PK,FK
        int permission_id PK,FK
        timestamp created_at
    }

    restaurant_members {
        bigserial id PK
        bigint restaurant_id FK
        bigint user_id FK
        smallint role_id FK
        text status "active | inactive | suspended"
        timestamp created_at
        timestamp updated_at
    }

    member_branches {
        bigint member_id PK,FK
        bigint branch_id PK,FK
        timestamp created_at
    }

    events_outbox {
        bigserial id PK
        text aggregate_type
        text aggregate_id
        text event_type
        uuid event_id UK
        jsonb payload
        timestamp created_at
        timestamp dispatched_at "nullable"
        int attempts
        text last_error "nullable"
    }

    users ||--o{ password_resets : "requests"
    users ||--o{ customer_addresses : "owns"
    users ||--o{ restaurants : "owns (owner_id)"
    users ||--o{ restaurant_members : "is a member via"
    restaurants ||--o{ restaurant_branches : "has"
    restaurants ||--o{ product_categories : "has"
    restaurants ||--o{ products : "has"
    restaurants ||--o{ restaurant_members : "employs"
    product_categories ||--o{ products : "categorizes"
    products ||--o{ product_branch_details : "priced/stocked per branch"
    restaurant_branches ||--o{ product_branch_details : "stocks"
    restaurant_branches ||--o{ member_branches : "assigned to"
    restaurant_members ||--o{ member_branches : "assigned to"
    roles ||--o{ restaurant_members : "grants role to"
    roles ||--o{ role_permissions : "has"
    permissions ||--o{ role_permissions : "granted via"
```

`events_outbox` has no foreign keys to other tables by design — it references source aggregates loosely via `aggregate_type`/`aggregate_id` strings, since it's a generic outgoing-event log.

Note: `restaurant_branches.currency` is declared `VARCHAR(255)` at the column level, constrained in practice to the `currency_enum` Postgres type values (`EGP`, `SAR`) used elsewhere in the same migration; a later migration (`20260824230156_fix_currency_enum_typo`) fixed a typo in that enum (`'EG'` → `'EGP'`) in place.

## Prerequisites

- **Node.js** — no version is pinned in `package.json` (no `engines` field); the code targets `ES2022`/`NodeNext` modules, so a current LTS Node version is recommended.
- **PostgreSQL** with the **PostGIS** extension available (`CREATE EXTENSION IF NOT EXISTS postgis` is run by a migration).
- **Redis** — used for response caching and idempotency keys.
- **RabbitMQ** — used by the outbox worker (`src/worker.ts`); the API server itself does not require it to serve HTTP requests.
- **Mailjet account** — required for password-reset and member-invite emails to actually send.
- No `Dockerfile` or `docker-compose.yml` was found in this repository — all of the above must be run/installed directly (or via your own containers).

## Installation & Setup

```bash
# 1. Clone
git clone <repo-url>
cd "Core service ( Quick bite )"

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# then edit .env — see Environment Variables below

# 4. Provision the database (Postgres must be reachable with the credentials in .env,
#    and the postgis extension available to the DB user)

# 5. Run migrations
npm run migrate
```

## Environment Variables

Every variable below is read (via `src/lib/config/env.ts`, validated with `zod`) or referenced directly (`NODE_ENV`) somewhere in `src/`. A ready-to-copy template lives in [`.env.example`](./.env.example):

```dotenv
# Runtime
NODE_ENV=development                              # development | production — gates secure cookie flag, etc.
PORT=3000                                          # HTTP port the API server listens on

# PostgreSQL (via Knex)
DB_HOST=localhost                                  # Postgres host
DB_PORT=5432                                       # Postgres port
DB_USERNAME=postgres                               # Postgres user
DB_PASSWORD=changeme                               # Postgres password
DB_NAME=quickbite_core                             # Postgres database name
DB_POOL_MAX=10                                     # Max connections in the Knex pool
DB_MIGRATION_DIRECTORY=src/migrations              # Path to migration files (resolved relative to project root)
DB_MIGRATION_EXTENSION=ts                          # Extension knex uses when generating/loading migration files

# JWT auth
ACCESS_SECRET=changeme-access-secret               # Secret used to sign access tokens
REFRESH_SECRET=changeme-refresh-secret             # Secret used to sign refresh tokens
ACCESS_EXPIRES_IN=15m                              # Access token TTL (jsonwebtoken expiresIn format)
REFRESH_EXPIRES_IN=7d                              # Refresh token TTL (jsonwebtoken expiresIn format)

# CORS
CORS_ORIGINS=http://localhost:3000                 # Comma-separated list of allowed origins

# Redis (response caching, idempotency keys)
REDIS_HOST=localhost                               # Redis host
REDIS_PORT=6379                                    # Redis port
REDIS_PASSWORD=                                    # Redis password (blank if none)

# Mailjet (transactional email: password reset, member invites)
MAILJET_API_KEY=changeme-mailjet-api-key           # Mailjet API key
MAILJET_SECRET_KEY=changeme-mailjet-secret-key     # Mailjet API secret
MAILJET_FROM_EMAIL=no-reply@example.com            # "From" address used on outgoing emails
MAILJET_FROM_NAME=Quick Bite                       # "From" display name used on outgoing emails

# Internal service-to-service auth
INTERNAL_API_KEY=                                  # Shared secret checked by requireInternalApiKey on every /api/internal/* request

# RabbitMQ (transactional outbox event dispatch)
RABBITMQ_URL=amqp://guest:guest@localhost:5672     # RabbitMQ connection string used by the outbox worker
RABBITMQ_CORE_EVENTS_EXCHANGE=core.events          # Exchange the outbox worker publishes domain events to
OUTBOX_DRAIN_CRON=* * * * * *                      # 6-field cron expression for the outbox drain schedule (every second by default)
OUTBOX_BATCH_SIZE=50                               # Max rows claimed per outbox drain batch
```

`DB_PASSWORD`, `DB_NAME`, `ACCESS_SECRET`, `REFRESH_SECRET`, `ACCESS_EXPIRES_IN`, `REFRESH_EXPIRES_IN`, `DB_MIGRATION_DIRECTORY`, `DB_MIGRATION_EXTENSION`, `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_FROM_EMAIL`, and `MAILJET_FROM_NAME` have no default in `env.ts` and **must** be set or the process will fail to start (zod schema validation).

## Running the App

Scripts as defined in `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `tsx watch src/server` | Run the API server in watch mode (auto-restart on change) |
| `npm run worker:dev` | `tsx watch src/worker` | Run the outbox-drain worker in watch mode |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/server.js` | Run the built API server (requires `npm run build` first) |
| `npm run worker` | `node dist/worker.js` | Run the built outbox worker (requires `npm run build` first) |

There is no `lint` or `test` script in `package.json`, despite `eslint` and `prettier` being present as dev dependencies.

The API server and the outbox worker are **separate processes** — both must be running for domain events to actually reach RabbitMQ, but only the server is needed to serve HTTP traffic. All routes are mounted under the `/api` prefix (see `src/app.ts`).

No `Dockerfile`/`docker-compose.yml` exists in this repo, so there is no containerized run path to document — run the two processes directly with the commands above against your own Postgres/Redis/RabbitMQ instances.

## Running Migrations

Migrations are plain Knex migration files under `src/migrations/`, written with raw SQL (`knex.raw`) rather than the Knex schema builder. There is no seed-specific tooling (e.g. `knex seed`) — seed data (RBAC roles/permissions) is applied via ordinary migrations.

```bash
npm run migrate           # apply all pending migrations
npm run migrate:status    # show which migrations are applied / pending
npm run migrate:rollback  # roll back the last migration batch
npm run migrate:make <name>  # scaffold a new migration file
```

Notable migrations:
- `20260224200000_create_products_tables` also creates a Postgres trigger (`trg_product_after_insert`) that auto-inserts a `product_branch_details` row for every existing branch whenever a product is created.
- `20260824230156_fix_currency_enum_typo` renames the `currency_enum` value `'EG'` to `'EGP'` in place (`ALTER TYPE ... RENAME VALUE`) — no data loss, just a label fix for a typo made when the type was first created.
- `20260901000001_add_orders_reject_permission` adds the `orders:reject` permission (missing from the original `orders`/`payments`/`deliveries`/`finance` catalog) and grants it to `owner`/`branch_manager`, not `staff`.
- `20260901000002_add_analytics_read_permission` adds the `analytics:read` permission consumed by the downstream analytics-service's RBAC middleware, and grants it to `owner`/`branch_manager`, not `staff`.

## API Endpoints

All paths below are relative to the `/api` base path (e.g. `POST /auth/login` → `POST /api/auth/login`). "Auth" means the `authenticate` JWT guard, which reads the access token from the `access_token` cookie first, falling back to an `Authorization: Bearer <token>` header for callers that can't set cookies (service-to-service calls, mobile clients, Postman/curl); "Internal" means the `requireInternalApiKey` guard (for service-to-service calls); RBAC-checked routes additionally require restaurant/branch membership and a role permission.

### Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Pings the database; `200 OK` if reachable, `500` otherwise |

### Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Register a new user, returns access/refresh tokens |
| POST | `/auth/login` | Log in, returns access/refresh tokens |
| POST | `/auth/forget-password` | Request a password-reset OTP by email (idempotency-key required) |
| POST | `/auth/reset-password` | Reset password using the emailed OTP |
| POST | `/auth/refresh` | Exchange a refresh token (cookie) for a new access token |
| POST | `/auth/accept-invite` | Accept a restaurant-member invitation via OTP |

### User

| Method | Path | Purpose |
|---|---|---|
| GET | `/user/me` | Get the authenticated user's profile *(Auth)* |
| PATCH | `/user/me` | Update the authenticated user's profile *(Auth)* |
| GET | `/user/internal/agents/:id` | Look up a delivery agent by id *(Internal)* |

### Customer Addresses

| Method | Path | Purpose |
|---|---|---|
| GET | `/customer/addresses` | List the authenticated user's saved addresses *(Auth)* |
| POST | `/customer/addresses` | Create a saved address *(Auth)* |
| PATCH | `/customer/addresses/:addressId` | Update a saved address *(Auth)* |
| DELETE | `/customer/addresses/:addressId` | Delete a saved address *(Auth)* |
| GET | `/customer/addresses/internal/:id` | Fetch an address by id *(Internal)* |

### Restaurants

| Method | Path | Purpose |
|---|---|---|
| GET | `/restaurants` | List restaurants |
| GET | `/restaurants/:id` | Get a restaurant by id |
| POST | `/restaurants` | Create a restaurant *(Auth; system_admin-only, enforced in service)* |
| PATCH | `/restaurants/:id` | Update a restaurant *(Auth + restaurant-member scoping + `core:restaurant:update`)* |
| PATCH | `/restaurants/:id/status` | Change restaurant status *(Auth; system_admin-only, enforced in service)* |

### Branches

| Method | Path | Purpose |
|---|---|---|
| GET | `/branches/nearby` | Find nearby branches (geo query, response cached) |
| GET | `/restaurants/:restaurantId/branches` | List a restaurant's branches |
| POST | `/restaurants/:restaurantId/branches` | Create a branch *(Auth + restaurant-member scoping + `core:branch:create`)* |
| PATCH | `/branches/:id` | Update a branch *(Auth + branch-access scoping + `core:branch:update`)* |
| PATCH | `/branches/:id/status` | Change branch status *(Auth; system_admin-only, enforced in service)* |
| GET | `/internal/branches` | Batch-fetch branches (with restaurant data) by ids *(Internal, cached 60s)* |
| GET | `/internal/branches/:id` | Fetch a branch (with restaurant data) by id *(Internal, cached 60s)* |

### Products

| Method | Path | Purpose |
|---|---|---|
| GET | `/restaurants/:restaurantId/categories` | List a restaurant's product categories |
| GET | `/branches/:branchId/products` | List products available at a branch |
| GET | `/products/:id` | Get a product by id |
| GET | `/restaurants/:restaurantId/products` | List a restaurant's products *(Auth + restaurant-member scoping + `core:product:read`)* |
| POST | `/restaurants/:restaurantId/products` | Create a product *(Auth + restaurant-member scoping + `core:product:create`)* |
| PATCH | `/products/:id` | Update a product *(Auth + branch-access scoping + `core:product:update`)* |
| GET | `/internal/branches/:id/products` | Batch-fetch products for a branch by ids *(Internal)* |
| POST | `/internal/branches/:id/reserve-stock` | Reserve stock for an order *(Internal)* |
| POST | `/internal/branches/:id/release-stock` | Release previously reserved stock *(Internal)* |

### RBAC (Roles / Permissions / Members)

| Method | Path | Purpose |
|---|---|---|
| GET | `/roles/:role/permissions` | List permissions for a role (public) |
| GET | `/internal/rbac/permissions` | Fetch the full role→permissions map *(Internal, cached 5min)* |
| POST | `/restaurants/:restaurantId/members` | Create/invite a restaurant member *(Auth + restaurant-member scoping + `core:member:create`)* |
| GET | `/restaurants/:restaurantId/members` | List a restaurant's members *(Auth + restaurant-member scoping + `core:member:read`)* |
| PATCH | `/restaurants/:restaurantId/members/:memberId` | Update a member *(Auth + restaurant-member scoping + `core:member:update`)* |
| DELETE | `/restaurants/:restaurantId/members/:memberId` | Remove a member *(Auth + restaurant-member scoping + `core:member:delete`)* |
| PUT | `/restaurants/:restaurantId/members/:memberId/branches` | Replace a member's branch assignments *(Auth + restaurant-member scoping + `core:member:update`)* |

### Authorization model

Two layers, applied in order on every protected route:

1. **Scoping middleware** (`src/lib/auth/rbac.ts`) — `requireRestaurantMember` confirms the caller belongs to the restaurant in the URL; `requireBranchAccess` confirms a non-owner is explicitly assigned to the target branch (via `member_branches`), with owner/system_admin bypasses.
2. **Permission middleware** — `rbac({resource, action})` checks the caller's restaurant role (`owner` / `branch_manager` / `staff`) against the `roles` / `permissions` / `role_permissions` tables, with a system_admin bypass.

Services only add a check where the middleware can't fully express the scoping (e.g. `PATCH /products/:id` carries no restaurant id in the URL, and a branchless update skips the branch check entirely) — that check compares the caller's own restaurant membership against the resource's restaurant, never a literal "must be the owner" rule, so `branch_manager`/`staff` get exactly what `role_permissions` grants them instead of being silently restricted to the owner. See `branch.service.ts::update` and `product.service.ts::create/findByRestaurant/update` for the reasoning inline.

## Testing

No automated test framework (Jest/Vitest/etc.) is wired up, and there is no `test` script in `package.json`. `play/` (gitignored, local-only) is where ad-hoc DB-backed API test scripts live during development to verify the backend end-to-end against a running dev server — it is not part of the repository.

## License

No `LICENSE` file is present in this repository, so no license is stated here.
