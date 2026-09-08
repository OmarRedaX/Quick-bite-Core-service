# Core Service (Quick Bite)

Backend core service for the Quick Bite food-delivery platform. It owns users & auth, restaurants, branches, the product catalog (with per-branch pricing/stock), customer addresses, restaurant-level RBAC (roles/permissions/members), and media uploads (presigned direct-to-S3 URLs for product images and restaurant logos). It publishes domain events through a transactional outbox to RabbitMQ so other services (e.g. an order-service) can react to changes, and exposes a set of internal, API-key-protected endpoints for service-to-service reads.

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
| Object storage | AWS S3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) — presigned direct-to-S3 media uploads |
| Validation | `zod` (env config), `class-validator` / `class-transformer` (request DTOs) |
| Dependency injection | `tsyringe` |
| Scheduling | `croner` (outbox drain cron job in the worker process) |
| Security middleware | `helmet`, `cors`, `cookie-parser` |
| Dev tooling | `tsx` (watch mode), `eslint`, `prettier`, TypeScript compiler (`tsc`) |

Jest + ts-jest, with a two-tier unit/integration split against a real local Postgres/Redis/RabbitMQ stack — see [Testing](#testing).

## Features

- Email/phone user registration & login with JWT access + refresh tokens (httpOnly cookies), password reset via emailed OTP, and invite-based onboarding (`accept-invite`).
- Restaurant management: create/update restaurants, restaurant status lifecycle (`active`/`suspended`/`disabled`/`pending`).
- Branch management per restaurant: geolocation (PostGIS `geography(Point,4326)`, generated column, GIST index), operating hours, delivery radius/fee/commission, currency, "nearby branches" lookup, active/accepting-orders toggles.
- Product catalog: categories per restaurant, products with soft delete, and **per-branch** pricing/stock/availability (`product_branch_details`), auto-provisioned for every existing branch via a Postgres trigger when a product is created.
- Media uploads to S3 via presigned PUT URLs: the API issues a short-lived upload URL and a `media` row (`pending`), the client uploads the bytes straight to S3, and a finalize call confirms the object and size (`ready`) — file data never passes through this service. Restricted to `system_admin` and restaurant users (`core:media:*`). The returned URL is what `imageUrl` on a product and `logoUrl` on a restaurant expect.
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
│   │   ├── media/                    # Presigned S3 uploads for product images / restaurant logos
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
│   │   ├── storage/                  # S3 storage provider init
│   │   ├── types/                    # Express type augmentations (req.user, req.correlationId)
│   │   ├── utils/                    # Cookie helpers
│   │   └── validation/               # DTO validation helper
│   ├── migrations/                   # Knex SQL migrations (raw SQL via knex.raw)
│   ├── pkg/                          # Swappable infra adapters (interfaces + implementations)
│   │   ├── cache/                    # ICacheProvider + Redis implementation
│   │   ├── email/                    # IEmailProvider + Mailjet implementation
│   │   ├── messaging/                # IMessageBroker + RabbitMQ implementation
│   │   ├── storage/                  # IStorageProvider + AWS S3 implementation
│   │   └── utils/                    # Time helpers
│   ├── app.ts                        # Express app assembly (middleware, /api mount)
│   ├── routes.ts                     # Top-level router — mounts every feature router
│   ├── server.ts                     # HTTP server entrypoint (API process)
│   └── worker.ts                     # Outbox-drain worker entrypoint (separate process)
├── tests/
│   ├── unit/                         # Pure/isolated logic, no app or DB — one folder per module
│   ├── integration/                  # Real createApp() + real Postgres via supertest — one folder per module
│   │   └── flows/                    # Multi-module end-to-end business flows (onboarding, etc.)
│   └── helpers/                      # truncateAll(), Redis cache flush, EmailStub/MessageBrokerStub/StorageStub, shared fixtures
├── postman/                          # Manual QA Postman collections + run-book (see TESTING_GUIDE.md)
├── jest.config.js                    # Unit test config (npm test)
├── jest.integration.config.js        # Integration test config (npm run test:integration)
├── tsconfig.test.json                # tsconfig used by ts-jest for the integration run
├── package.json
├── tsconfig.json
├── .env.example                      # Documented template for all environment variables
└── README.md
```

`play/` (ad-hoc local debug/migration scratch scripts) is gitignored and not part of the shipped codebase. Its former manual `api-test*.mjs` smoke-test scripts have been ported into the formal `tests/integration/` suite.

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

    media {
        bigserial id PK
        bigint restaurant_id FK "nullable - admin upload before the restaurant exists"
        bigint uploaded_by FK
        text storage_key UK "object key in the S3 bucket"
        text url "public/CDN URL the object is served from"
        text content_type
        bigint size_bytes "nullable until the upload is finalized"
        text status "pending | ready | failed | deleted"
        timestamp created_at
        timestamp updated_at
    }

    users ||--o{ password_resets : "requests"
    users ||--o{ customer_addresses : "owns"
    users ||--o{ restaurants : "owns (owner_id)"
    users ||--o{ restaurant_members : "is a member via"
    restaurants ||--o{ restaurant_branches : "has"
    restaurants ||--o{ product_categories : "has"
    restaurants ||--o{ products : "has"
    restaurants ||--o{ restaurant_members : "employs"
    restaurants ||--o{ media : "owns uploaded media"
    users ||--o{ media : "uploaded (uploaded_by)"
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
- **Docker** (optional) — [`docker-compose.yml`](./docker-compose.yml) brings up Postgres/PostGIS, Redis, RabbitMQ, the API server and the outbox worker together, so none of the above has to be installed on the host. See [Running with Docker](#running-with-docker).

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

# AWS S3 (media uploads: product images, restaurant logos)
AWS_REGION=us-east-1                               # AWS region the media bucket lives in
AWS_S3_BUCKET=quickbite-media                      # S3 bucket presigned upload URLs are issued for
AWS_ACCESS_KEY_ID=                                 # Blank = use the SDK's default credential chain (IAM role)
AWS_SECRET_ACCESS_KEY=                             # Blank = use the SDK's default credential chain (IAM role)
S3_PUBLIC_BASE_URL=                                # CDN/custom domain objects are served from, e.g. https://dxxxxxxxxxxxxx.cloudfront.net (blank = bucket URL)
S3_ENDPOINT=                                       # S3-compatible endpoint for local dev (MinIO/LocalStack); blank = real AWS
S3_FORCE_PATH_STYLE=false                          # true for MinIO/LocalStack, false for real S3
MEDIA_UPLOAD_URL_TTL=900                           # Seconds a presigned upload URL stays valid
MEDIA_MAX_UPLOAD_BYTES=5242880                     # Max upload size, enforced when the upload is finalized (5 MB)
```

`DB_PASSWORD`, `DB_NAME`, `ACCESS_SECRET`, `REFRESH_SECRET`, `ACCESS_EXPIRES_IN`, `REFRESH_EXPIRES_IN`, `DB_MIGRATION_DIRECTORY`, `DB_MIGRATION_EXTENSION`, `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_FROM_EMAIL`, and `MAILJET_FROM_NAME` have no default in `env.ts` and **must** be set or the process will fail to start (zod schema validation).

Every `AWS_*`/`S3_*`/`MEDIA_*` variable *does* have a default, so the process starts without them — deliberately, so tests and CI (which stub S3 entirely) need no bucket. The consequence is that a missing `AWS_S3_BUCKET` is not a startup error: it defaults to `""` and the media endpoints fail at call time instead. Set it in any environment where uploads are meant to work. Leaving `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` blank is the *intended* production setup — blank credentials make the SDK fall back to its default provider chain (an EC2/ECS IAM role) rather than static keys.

## Running the App

Scripts as defined in `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `npm run dev` | `tsx watch src/server` | Run the API server in watch mode (auto-restart on change) |
| `npm run worker:dev` | `tsx watch src/worker` | Run the outbox-drain worker in watch mode |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm start` | `node dist/server.js` | Run the built API server (requires `npm run build` first) |
| `npm run worker` | `node dist/worker.js` | Run the built outbox worker (requires `npm run build` first) |
| `npm test` | `jest` | Run the unit test suite (see [Testing](#testing)) |
| `npm run test:integration` | `jest --config jest.integration.config.js` | Run the integration test suite against a real local Postgres/Redis/RabbitMQ (see [Testing](#testing)) |

There is no `lint` script in `package.json`, despite `eslint` and `prettier` being present as dev dependencies.

The API server and the outbox worker are **separate processes** — both must be running for domain events to actually reach RabbitMQ, but only the server is needed to serve HTTP traffic. All routes are mounted under the `/api` prefix (see `src/app.ts`).

## Running with Docker

Two compose files, each with a single job.

**[`docker-compose.yml`](./docker-compose.yml) — the full dev stack.** Postgres/PostGIS, Redis and RabbitMQ, plus the API server (`core-service`) and the outbox worker (`core-worker`) built from the [`Dockerfile`](./Dockerfile):

```bash
cp .env.example .env   # env_file: the app containers read .env
docker compose up --build
# API on http://localhost:3000, RabbitMQ management UI on http://localhost:15672
```

The compose file overrides the host-facing values in `.env` (`DB_HOST`, `REDIS_HOST`, `RABBITMQ_URL`) with the compose service names, so the same `.env` works whether you run natively or in containers. `scripts/docker/01-init.sql` creates the `quickbite_core` database on first boot; migrations are *not* run automatically — run them once the stack is up:

```bash
npm run migrate   # from the host — Postgres publishes 5432, and .env's DB_HOST=localhost
```

(The runtime image is built with `npm ci --omit=dev`, so it has no `ts-node`/`typescript` to run the TypeScript knexfile the `migrate` script points at — hence migrating from the host rather than inside the container.)

The Postgres service uses `postgis/postgis:16-3.4` rather than the stock `postgres:16` image, because `20260222221738_create_restaurant_branches_table` runs `CREATE EXTENSION IF NOT EXISTS postgis`.

**[`docker-compose.test.yml`](./docker-compose.test.yml) — the test stack.** See [Continuous Integration](#continuous-integration).

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
- `20260824230156_fix_currency_enum_typo` renames the `currency_enum` value `'EG'` to `'EGP'` in place (`ALTER TYPE ... RENAME VALUE`) — no data loss, just a label fix for a typo made when the type was first created. Both `up`/`down` are now idempotent (guarded by a `pg_enum` existence check), so re-running migrations against a database where the rename was already applied is a no-op instead of an error.
- `20260222221738_create_restaurant_branches_table`'s `down()` now actually drops `restaurant_branches` and `currency_enum` (it was previously a no-op, discovered while resetting the integration test database).
- `20260901000001_add_orders_reject_permission` adds the `orders:reject` permission (missing from the original `orders`/`payments`/`deliveries`/`finance` catalog) and grants it to `owner`/`branch_manager`, not `staff`.
- `20260901000002_add_analytics_read_permission` adds the `analytics:read` permission consumed by the downstream analytics-service's RBAC middleware, and grants it to `owner`/`branch_manager`, not `staff`.
- `20260906000001_create_media_table` creates the `media` table. `restaurant_id` is nullable (`ON DELETE SET NULL`) because a system admin uploads a restaurant logo *before* `POST /restaurants` creates the row it would reference; `storage_key` is `UNIQUE`, and `status` is a `CHECK` constraint (`pending`/`ready`/`failed`/`deleted`) rather than a Postgres enum.
- `20260906000002_add_media_permissions` adds `core:media` `create`/`read`/`delete`. The grants are explicit because `20260327014716_seed_rbac_data`'s "owner gets every permission" insert already ran and only covered the permissions that existed then — so a later permission is granted to nobody unless its own migration says so.

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

### Media

All four routes are authenticated and behind `rbac()`, which admits only `system_admin` (bypass) and restaurant users holding the permission — customers and delivery agents are rejected outright.

| Method | Path | Purpose |
|---|---|---|
| POST | `/media/uploads` | Reserve an object key and return a presigned upload URL *(Auth + `core:media:create`)* |
| POST | `/media/:id/complete` | Confirm the upload landed and mark it `ready` *(Auth + `core:media:create`)* |
| GET | `/media/:id` | Get a media record *(Auth + `core:media:read`)* |
| DELETE | `/media/:id` | Delete the object and mark the row `deleted` *(Auth + `core:media:delete`)* |

Permission grants (from `20260906000002_add_media_permissions.ts`): `owner` gets create/read/delete, `branch_manager` gets create/read (it manages products and so needs to attach images, but destructive actions stay with the owner), `staff` gets none.

**Upload flow** — two calls plus a direct-to-S3 PUT:

```bash
# 1. Ask for an upload URL (restaurant users are pinned to their own restaurant;
#    a system_admin may pass restaurantId, or omit it for a logo uploaded before
#    the restaurant exists).
curl -X POST http://localhost:3000/api/media/uploads   -H 'Content-Type: application/json' -b cookies.txt   -d '{"contentType":"image/png","fileName":"burger.png"}'
# -> {"success":true,"data":{"media":{"id":12,"storageKey":"restaurants/3/2026/09/<uuid>-burger.png",
#     "url":"https://<bucket>.s3.<region>.amazonaws.com/restaurants/3/...","status":"pending",...},
#     "uploadUrl":"https://...X-Amz-Signature=...","expiresIn":900}}

# 2. Upload the bytes straight to S3. Content-Type is signed into the URL, so it
#    must match the contentType from step 1 exactly.
curl -X PUT "<uploadUrl>" -H 'Content-Type: image/png' --data-binary @burger.png

# 3. Finalize — verifies the object exists and is within MEDIA_MAX_UPLOAD_BYTES.
curl -X POST http://localhost:3000/api/media/12/complete -b cookies.txt
# -> {"success":true,"data":{"media":{"id":12,"status":"ready","sizeBytes":83214,...}}}
```

`media.url` from the response is then passed straight through as `imageUrl` when creating/updating a product, or as `logoUrl` on a restaurant. It is built from `S3_PUBLIC_BASE_URL` when that is set (a CloudFront/custom domain) and from the bucket's own URL otherwise — the presigned `uploadUrl` always targets the S3 origin either way, since a CDN distribution does not accept the signed PUT. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` (415 otherwise). Finalizing before the file was uploaded returns 409; an object over the size cap returns 413, is deleted from the bucket, and the row is marked `failed`.

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

`rbac.ts` also exports `resolveOwningRestaurantId`, for handlers whose target restaurant arrives in the **body** rather than the URL — `requireRestaurantMember` reads a route param and so can't scope them. `POST /media/uploads` is the current caller. It resolves the restaurant the created row will *belong to*, never the caller's identity (who acted is recorded separately, as `media.uploaded_by`): a `system_admin` may name any restaurant or none, while a restaurant user may only name their own — naming a different one is a 403 rather than being silently rewritten, and omitting it falls back to theirs.

Services only add a check where the middleware can't fully express the scoping (e.g. `PATCH /products/:id` carries no restaurant id in the URL, and a branchless update skips the branch check entirely) — that check compares the caller's own restaurant membership against the resource's restaurant, never a literal "must be the owner" rule, so `branch_manager`/`staff` get exactly what `role_permissions` grants them instead of being silently restricted to the owner. See `branch.service.ts::update` and `product.service.ts::create/findByRestaurant/update` for the reasoning inline.

## Testing

Jest 30 + ts-jest, split into two tiers with two separate configs, both run from `package.json`:

| Tier | Command | Config | What it exercises |
|---|---|---|---|
| Unit | `npm test` | `jest.config.js` (`roots: tests/unit`) | Pure/isolated logic only — DTO validation, pagination helpers, error classes, response helpers, etc. No app, no DB. |
| Integration | `npm run test:integration` | `jest.integration.config.js` (`roots: tests/integration`, `maxWorkers: 1`, `forceExit: true`) | Real `createApp()` + real local Postgres (migrated fresh in `globalSetup`/torn down in `globalTeardown`) via `supertest`, with real Redis and RabbitMQ where relevant. |

Current suite: **177 unit + 231 integration = 408 tests**, all passing. Merged coverage (unit + integration combined, the true view — either tier alone understates coverage for files exercised mainly by the other): **95.9% statements / 82.8% branches / 95.5% functions / 96.8% lines**.

That is slightly below the previous figure, and the whole difference is one file: `src/pkg/storage/s3.ts` sits at **33% statements / 17% functions**. Every layer above it is fully covered (`src/app/media/**` is at 100% statements), but the AWS SDK adapter itself is stubbed out in tests the same way Mailjet is, so only its constructor runs. Unlike `pkg/email/mailjet.ts` — a thin enough wrapper to reach 100% incidentally — it holds real logic that nothing currently asserts: `statObject`'s `NotFound`→`null` mapping, `getPublicUrl`'s per-segment encoding, and `defaultPublicBaseUrl`'s path-style/CDN branches. Those are pure functions of their inputs and could be unit-tested without touching AWS; it hasn't been done yet.

**Conventions** (see `CLAUDE.md` for the full rules the suite follows):
- **AAA pattern** (Arrange/Act/Assert) in every test.
- **Real internal implementations, not mocks** — integration tests hit the real service → repository → Postgres/Redis/RabbitMQ stack. The only mocks in the suite are for true externals with no safe local equivalent: `tests/helpers/email-stub.ts` (Mailjet), `tests/helpers/storage-stub.ts` (AWS S3), and `tests/helpers/message-broker-stub.ts` (used only where the outbox mechanics test itself isn't exercising the real broker — RabbitMQ is otherwise tested for real via `tests/integration/pkg/rabbitmq-client.integration.test.ts`). Each is a class implementing the provider interface, swapped in with `jest.mock` on the matching `src/lib/*/init` module before `createApp()`. `StorageStub` keeps an in-memory bucket and records what was signed and deleted, so a test can simulate the client-side PUT (`putObject`) that would otherwise happen straight against S3 — the media service, repository and Postgres underneath it are all real.
- **Isolation**: `tests/helpers/db.ts`'s `truncateAll()` runs in `beforeEach` (preserving seeded catalog tables — `roles`/`permissions`/`role_permissions` and PostGIS's `spatial_ref_sys`); `tests/helpers/redis.ts` flushes the idempotency-key and response-cache keyspaces the same way, since Redis isn't reset by truncation.
- Each module gets one `tests/integration/<module>/*.integration.test.ts` (routes → middleware → controller → service → repository → DB) and, where there's pure logic to isolate, a matching `tests/unit/<module>/*.test.ts`. `tests/integration/flows/` covers realistic multi-module business flows (restaurant-owner onboarding, customer onboarding) rather than single endpoints.
- Regression tests stay in the suite permanently; two real application bugs were found and fixed this way — a cursor-pagination session-timezone bug (`src/lib/http/pagination/cursor-pagination.ts`, covered by `tests/unit/lib/cursor-pagination.test.ts`) and a no-op `down()` migration (`src/migrations/20260222221738_create_restaurant_branches_table.ts`).

Setup before running the integration suite:
1. A dedicated test database (`.env.test`'s `DB_NAME`, default `quickbite_test`) — **never** point this at a dev/prod database.
2. Local Postgres (with PostGIS), Redis, and RabbitMQ reachable with the credentials in `.env.test`.
3. `.env.test`'s `INTERNAL_API_KEY` set, or every internal-endpoint test fails with 500.

No AWS account, bucket or credentials are needed: S3 is stubbed. `.env.test` still sets `AWS_*`/`MEDIA_*` (with `MEDIA_MAX_UPLOAD_BYTES=5242880`, which the media tests assert against) because the service reads `env.storage` for the URL TTL and size cap even when the provider itself is a stub.

`play/` (gitignored, local-only) is where ad-hoc debug/migration scratch scripts live during development — it is not part of the repository and is no longer where API behavior gets manually verified; that now lives in the Jest suite above, plus `postman/` for manual/exploratory QA against a running dev server (see `postman/TESTING_GUIDE.md`).

## Continuous Integration

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every push and pull request to `main`/`develop`, and on manual dispatch. The workflow itself is deliberately thin — checkout, then:

```bash
docker compose -f docker-compose.test.yml run --rm test
docker compose -f docker-compose.test.yml down -v   # always, even on failure
```

All of the actual work lives in [`docker-compose.test.yml`](./docker-compose.test.yml), so **CI and a local run are the same command** — there is no CI-only setup that can drift from what you can reproduce on your machine:

| Service | Image | Why |
| --- | --- | --- |
| `postgres` | `postgis/postgis:16-3.4` | A migration runs `CREATE EXTENSION postgis`, which the stock `postgres:16` image can't satisfy. Database: `quickbite_core_test`. |
| `redis` | `redis:7-alpine` | Response cache + idempotency keys — used for real, not stubbed. |
| `rabbitmq` | `rabbitmq:3-alpine` | `tests/integration/pkg/rabbitmq-client.integration.test.ts` opens a real broker connection. Given 20 health-check retries because a cold broker needs ~15s. |
| `test` | `node:22-bookworm-slim` | Runs `npm ci && npm run build && npm test && npm run test:integration` under `sh -e`, so the job fails at the first failing step. |

Test configuration comes from the compose file's `environment:` block rather than `.env.test` — that file is gitignored, so it doesn't exist in a fresh CI checkout and `tests/setup-env.ts`'s `dotenv` call is a no-op there. Anything a test depends on (notably `INTERNAL_API_KEY`, which must match `tests/helpers/fixtures.ts`) has to be declared in the compose file. The `AWS_*` values there are placeholders — the media tests stub S3, so nothing in CI reaches a real bucket; they exist only so `env.ts` parses and `storageProvider` constructs.

To reproduce a CI failure locally, run the exact same command — no GitHub Actions runner needed:

```bash
docker compose -f docker-compose.test.yml run --rm test
docker compose -f docker-compose.test.yml down -v
```

There is no deploy/publish stage: CI builds and tests, and nothing is pushed to a registry.

## License

No `LICENSE` file is present in this repository, so no license is stated here.
