# AuGetway Rebuild — Project Plan

**Status:** Planning only — no application code in this phase  
**Reference (read-only):** `D:\amarpin`  
**Target path:** `D:\amarpin`  
**Plan date:** 2026-11-02  

**Hard constraints**

- Reference tree is read-only: do not create, edit, delete, rename, or move anything under `D:\amarpin`.
- Do not read or echo `.env` / secret file contents.
- Do not copy customer chat, KYC, avatars, or other private uploads into the rebuild.
- Do not copy reference source into the rebuild; re-implement from behavior and structure.
- NestJS **11.x** and Prisma ORM **7.x** only — do not upgrade to NestJS 12 or Prisma 8.
- No Docker in the target deployment model.
- Payment: **sandbox / mock adapter only** until a third-party provider is chosen. Do **not** plan MFS TrxID verification or provider-specific live gateways in early phases.

---

## 1. Executive summary

The reference product is a Bangladesh-focused **digital-goods marketplace** (game top-ups, gift cards, vouchers, licenses) with:

- Next.js storefront + customer account + large admin panel (same `apps/web` app)
- NestJS REST API + Socket.IO (`/events`, `/chat`)
- MongoDB (Mongoose) + Redis + BullMQ
- aaPanel / Nginx / PM2 deploy (no container requirement for production)

The rebuild keeps the same **product domain and UX surfaces**, but moves persistence to **PostgreSQL + Prisma ORM 7**, upgrades the web app to **Next.js 16 + React 19**, keeps **NestJS 11**, and replaces live MFS/aggregator payment wiring with a **pluggable PaymentPort + MockPaymentAdapter** until a real provider is selected.

---

## 2. Version matrix (verified)

Checked against official docs and npm registry on **2026-11-02**.

| Package / runtime | Target pin | Registry / docs note | Compatible with |
| --- | --- | --- | --- |
| Node.js | **≥ 20.19** (prefer **22.12+** LTS) | Next.js 16 needs ≥ 20.9; Prisma 7 needs `^20.19 \|\| ^22.12 \|\| >=24` | Ubuntu 24.04 + aaPanel Node |
| Next.js | **16.4.x** (latest 16: `16.4.3`) | [Next.js 16 blog](https://nextjs.org/blog/next-16); peer `react` ^18.2 \|\| ^19 | React 19 recommended |
| React / React DOM | **19.2.x / 19.3.x** (pin matching pair) | Next.js 16 docs: React 19 recommended | Next 16 App Router |
| NestJS core stack | **11.2.x** (latest 11: `11.2.8`) | npm `latest` is **12.x** — **do not follow latest**; pin `@nestjs/*@^11.2.8` | Express platform, websockets, bullmq 11 |
| `@nestjs/bullmq` | **11.0.x** (latest 11: `11.0.5`) | Matches Nest 11 peer line | BullMQ 5.x |
| Prisma CLI + Client | **7.10.x** (latest 7: `7.10.1`) | npm `latest` is **8.0.0-rc.*** — **do not upgrade**; use `prisma@7` / `@prisma/client@7` | NestJS 11 ([Prisma NestJS v7 guide](https://www.prisma.io/docs/guides/v7/frameworks/nestjs)) |
| `@prisma/adapter-pg` | **7.10.1** (match client) | Prisma 7 requires driver adapter | `pg` + PostgreSQL |
| PostgreSQL | **16.x** (or 15+) | Host via aaPanel native install | Prisma `postgresql` |
| Redis | **7.x** | Native / aaPanel; **no Docker** in prod plan | BullMQ, Socket.IO adapter, cache, throttle |
| BullMQ | **5.x / 6.x** (verify against `@nestjs/bullmq@11`) | Current npm: `6.5.3` — confirm peer before lock | Nest 11 queues |
| Socket.IO | **4.8.x** | Current: `4.8.4` | `@nestjs/platform-socket.io@11`, redis-adapter `8.3.x` |
| TypeScript | **5.4+** (prefer 5.6–5.9) | Prisma 7 min 5.4; Next 16 min 5.1 | Shared monorepo |
| pnpm | **9.x or 10.x** | Keep Corepack-pinned | Turborepo optional |

**Pinning rules**

1. In root `package.json` / lockfile: `"@nestjs/core": "11.2.8"` (or `~11.2.8`), never `^12`.
2. `"prisma": "7.10.1"`, `"@prisma/client": "7.10.1"` — never install Prisma 8 RC/stable without an explicit future decision.
3. Prisma 7 NestJS integration notes to bake into Phase 0 scaffolding later:
   - Generator `provider = "prisma-client"` with required `output`
   - For Nest CJS builds: `moduleFormat = "cjs"`
   - Runtime: `PrismaPg` adapter + `DATABASE_URL`
   - Prefer `prisma.config.ts` as documented for v7

---

## 3. Reference inventory (`D:\amarpin`)

### 3.1 Monorepo layout

| Path | Role |
| --- | --- |
| `apps/web` | Next.js 15 storefront + customer account + admin UI |
| `apps/api` | NestJS 11 REST + Socket.IO + BullMQ workers (in-process) |
| `packages/types` | Shared contracts (minimal today: e.g. `DEFAULT_CURRENCY = BDT`) |
| `packages/ui` | Shared UI scaffold |
| `packages/config-ts` / `config-eslint` | Shared tooling |
| `deploy/deploy/aapanel/` | PM2 ecosystem, Nginx confs, redeploy scripts, env **examples** |
| `uploads/` | Product/logo/banner/public assets + private areas (avatars, live-chat, KYC — **do not copy private**) |
| `scripts/` | Seeds, packaging, diagnostics |

**Reference runtime shape**

```
Browser → Next.js :3000 ──REST──▶ NestJS :4000/api
                ▲                    │
                └── Socket.IO ───────┤
                                     ├── MongoDB 7
                                     ├── Redis 7 + BullMQ
                                     └── uploads/
```

### 3.2 Storefront (marketing + catalog)

**Route groups / pages (behavioral inventory)**

| Area | Routes (representative) | Behavior |
| --- | --- | --- |
| Home | `/(marketing)/` | Hero + catalog sections; ISR-ish `revalidate`; SEO JSON-LD; admin-driven homepage |
| Catalog | `/products`, `/[slug]`, `/category/*`, `/brand/*`, `/search` | Listing, PDP with variations / customer inputs, search |
| Content | `/blog`, `/blog/[slug]`, `/blog/category/[slug]` | Public blog |
| Marketing | `/about`, `/contact`, `/privacy-policy`, `/terms-conditions`, `/refund-and-returns-policy`, `/disclaimers`, `/website`, `/request-product` | Static/CMS-like pages + contact + product request |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | Email/password + verification flows |
| Checkout entry | `/checkout/pay/[intentId]`, account checkout | Payment intent continuation |
| Reviews | `/reviews` | Public reviews surface |

**Visual / UX behavior (reference)**

- Brand teal (`--brand: 38 191 176`) with light/dark themes via CSS variables in `globals.css`
- Tailwind 3 utility UI; product grids with skeleton loading; homepage hero + category product strips
- Theme + brand stores (Zustand); toasts; admin “publish” invalidation via Socket.IO `/events`
- Security headers + HTTPS redirect middleware (nginx owns HSTS in prod)

### 3.3 Customer dashboard / account

Route group `app/(account)/` — authenticated customer experience:

| Feature | Routes | Notes |
| --- | --- | --- |
| Dashboard | `/dashboard` | Overview |
| Cart / checkout | `/cart`, `/checkout` | Cart → order → pay |
| Orders | `/orders`, `/orders/[id]` | Codes / delivery visibility |
| Wallet | `/wallet` | Balance, withdrawals |
| Wishlist | `/wishlist` | Saved products |
| Profile / settings | `/profile`, `/settings`, `/settings/appearance` | Profile + prefs |
| Support | `/tickets`, `/tickets/[id]`, `/support`, `/email-support`, `/chat` | Tickets + live chat |
| Notifications | `/notifications`, `/notifications/all` | In-app + prefs |
| Rewards / referral | `/rewards`, `/referral` | Loyalty / referral |
| Affiliate / reseller | `/affiliate`, `/reseller` | Partner portals |
| Customer blogs | `/dashboard/blogs/*` | Contributor-style blogging |
| Downloads / categories | `/downloads`, `/categories` | Account utilities |

**Guest checkout:** API supports ephemeral guest sessions (`POST /auth/guest`) for checkout without full registration.

### 3.4 Admin panel

`/admin/*` — large control surface (40+ pages). Groups:

| Group | Examples |
| --- | --- |
| Overview | `/admin` |
| Catalog | products CRUD, categories, brands, stock, reviews |
| Sales | orders, payments, refunds, coupons, vouchers, analytics, email/SMS logs |
| Customers | user list, KYC queue, affiliates, resellers |
| Content | blogs, categories, settings |
| Support | chat, chat settings/status, tickets, saved replies, contact inbox, notifications |
| Settings | website, appearance/theme/logos, menus, homepage, SEO, email + templates, payments, MFS gateways, delivery, customer panel, security, roles, suppliers, telegram, license, notifications |
| Ops | product requests |

**Admin real-time:** order lock/unlock events; catalog/settings cache invalidation via `/events`.

### 3.5 Backend modules (`apps/api/src/modules`)

Auth · Users · Products · Categories · Brands · Reviews · Search · Cart · Orders · Payments · MFS · Wallet · Delivery · Suppliers · Coupons · Vouchers · Notifications · Chat · Tickets · KYC · Affiliate · Reseller · Rewards · Wishlist · SEO · Contact / Contact-inquiries · Customer-panel · Website · Blog / Blog-category · Product-requests · Admin · Role-permissions · License · Health

**Cross-cutting**

- `security/`: throttling (Redis), access blocks, activity/audit, reCAPTCHA, Cloudflare guard hooks
- `shared/`: Redis cache, crypto, uploads processors (sharp), Socket.IO Redis adapter, audit
- `queues/`: `orders`, `payments`, `delivery`, `notifications`, `chat`
- `integrations/`: mail/SMTP, payment gateways (bkash/nagad/rocket/upay/uddoktapay), supplier clients (reloadly, foxreload, turgame, xsolla), Amarpin license

### 3.6 Domain roles & permissions

Reference roles (`Role` enum):

`customer` · `vip` · `reseller` · `affiliate` · `supplier` · `subscriber` · `contributor` · `author` · `blogger` · `editor` · `shop_manager` · `administrator` (+ deprecated aliases `admin`, `support`)

Configurable **role-permissions** document drives admin capability gates. License (Amarpin) gates some admin features (payments, email, customer panel, delivery fields, live chat settings).

### 3.7 Core workflows (behavioral)

1. **Browse → cart → checkout → payment intent → paid → delivery**
   - Product types: license, account, giftcard, topup, subscription
   - Delivery: `auto` (inventory unseal and/or supplier procure via BullMQ) or `manual`
2. **Payment settle:** webhook + verify poll job (idempotent confirm) → order paid → delivery job
3. **Wallet pay / credit / withdraw** (admin process)
4. **Support:** live chat (`/chat` namespace) + tickets + contact inbox
5. **KYC** for elevated flows (reseller/affiliate as configured)
6. **Affiliate / reseller** commission & API-key reseller orders
7. **Admin publish:** settings/catalog changes → Socket.IO invalidate → storefront refresh
8. **Notifications:** queued multi-channel send

### 3.8 Data model inventory (Mongo collections → rebuild entities)

60+ Mongoose schemas, including: User, AuthSession, VerificationToken, Product, Category, Brand, InventoryItem, Order, PaymentIntent, PaymentSettings, Wallet, WalletTransaction, Coupon, Voucher, Review, Wishlist, ChatRoom/Message/Settings, Ticket/Message, KycDocument, Affiliate*, Reseller*, Supplier*, Notification*, Blog*, SEO/Website/Email/Security/Delivery/CustomerPanel/Telegram/License settings, AccessBlock, ActivityLog, AuditLog, SmsLog, SequenceCounter, etc.

### 3.9 Deployment inventory (reference)

- Ubuntu + **aaPanel** + **Nginx** + **PM2**
- Domains: apex web + `api.` subdomain
- PM2 apps: `amarpin-web` (Next start :3000), `amarpin-api` (Nest `dist/main.js` :4000)
- Scripts: `redeploy.sh`, `verify-live.sh`, `post-upload.sh`, nginx full confs, security headers
- Redis required in production; reference uses Docker Compose **only for local Redis** — rebuild will use **native Redis**, no Docker

---

## 4. Gap analysis — reference vs target stack

| Concern | Reference | Rebuild target | Implication |
| --- | --- | --- | --- |
| Web framework | Next.js **15** | Next.js **16** | Turbopack default; `middleware` → consider `proxy.ts`; async params; Node ≥ 20.9 |
| UI runtime | React 19 + TanStack Query + Zustand + Tailwind 3 | Same patterns on Next 16 | Prefer App Router; evaluate Tailwind 4 later (not required for Phase 0) |
| API | NestJS **11** + Mongoose | NestJS **11** + **Prisma 7** | Keep Nest 11; rewrite data layer; no Nest 12 |
| DB | MongoDB documents | **PostgreSQL** relational | Explicit FKs, migrations, JSONB for flexible attrs |
| ORM | Mongoose 8 | **Prisma ORM 7** + `@prisma/adapter-pg` | New schema; generated client path; CJS moduleFormat for Nest |
| Cache / jobs | Redis + BullMQ | Same | Native Redis install on VPS |
| Realtime | Socket.IO `/events` + `/chat` | Same | Redis adapter for multi-instance readiness (still single PM2 fork initially) |
| Payments | Live MFS + aggregator gateways + SMS verify | **Mock/sandbox PaymentPort only** | No TrxID / SMS matching in plan; provider chosen later |
| License | Amarpin feature gates | Decide: keep, replace, or defer | Phase decision — do not block core commerce MVP |
| Deploy | aaPanel / Nginx / PM2 | Same; **no Docker** | Document native Postgres + Redis setup |
| Uploads | Local disk under `UPLOADS_DIR` | Same pattern initially | Separate public vs private paths; never seed private chat/KYC/avatars from reference |

---

## 5. Proposed architecture

### 5.1 High-level

```
Browser
  │
  ▼
Next.js 16 (apps/web) :3000
  │  REST (JSON)          │  Socket.IO client
  ▼                       ▼
NestJS 11 REST API (apps/api) :4000/api
  ├── Auth (JWT access + refresh sessions)
  ├── Domain modules (catalog, cart, orders, …)
  ├── PaymentPort → MockPaymentAdapter (sandbox)
  ├── BullMQ processors (orders, payments, delivery, notifications, chat cleanup)
  ├── Socket.IO gateways (/events, /chat)
  ├── Prisma 7 → PostgreSQL
  └── Redis (cache, throttle, queues, socket adapter)
```

### 5.2 Recommended monorepo (new implementation)

```
D:\amarpin\
  PROJECT_PLAN.md          ← this document
  apps/
    web/                   ← Next.js 16 storefront + account + admin
    api/                   ← NestJS 11 API
  packages/
    types/                 ← shared enums/DTOs
    config-ts/
    config-eslint/
  prisma/                  ← schema + migrations (owned by api or root)
  deploy/aapanel/          ← PM2, Nginx, scripts (no Docker)
  uploads/                 ← empty scaffold dirs only (no private copies)
```

### 5.3 API design principles

- Versioned or stable `/api` prefix; OpenAPI/Swagger in non-prod
- DTO validation (`class-validator`) on all mutating routes
- Idempotent payment confirmation and delivery
- **PaymentPort** interface: `createIntent`, `getCheckoutUrl` / instructions, `handleWebhook`, `verify`, `refund` (stubs)
- **MockPaymentAdapter**: always succeeds in sandbox with signed mock webhook; configurable delay/failure for tests
- Supplier integrations: interface + registry; enable real clients only when needed
- Feature flags for affiliate/reseller/blog/chat so MVP can ship thinner

### 5.4 Frontend principles

- App Router; server components for catalog/SEO; client islands for cart/checkout/admin
- TanStack Query for API state; Zustand for theme/brand/toast
- Replicate **information architecture** and primary flows first; visual polish second (preserve teal brand tokens)
- Admin as route group with role guards (server + client)
- Next 16: plan for `proxy.ts` if adopting the middleware replacement guidance

### 5.5 Realtime

| Namespace | Purpose |
| --- | --- |
| `/events` | Cache invalidation: product/category/brand/banner/settings/publish; order locks |
| `/chat` | Support rooms: open, join, send, typing, read, presence |

### 5.6 Background jobs (BullMQ)

| Queue | Jobs | Purpose |
| --- | --- | --- |
| `orders` | fulfill, expire, refund | Order lifecycle |
| `payments` | verify | Poll mock/real gateway if webhook missed |
| `delivery` | deliver | Auto inventory/supplier handoff |
| `notifications` | send | Email/push/in-app channels |
| `chat` | cleanup-old-images | Retention for chat attachments |

---

## 6. Initial database outline (Prisma / PostgreSQL)

IDs: prefer `cuid` or `uuid`. Money: integer **minor units** (poisha) **or** `Decimal` — pick one convention project-wide (recommend integer minor units + `currency` char). Flexible product fields: `Json` / JSONB.

### 6.1 Core identity & security

- `User` — email, phone, passwordHash, status, emailVerified, isGuest, kycStatus, profile fields, adminNote
- `UserRole` — userId + role enum (multi-role)
- `AuthSession` — refresh token hash, device meta, expiry
- `VerificationToken` — email/OTP/reset
- `RolePermission` — role → permission map (JSON or rows)
- `AccessBlock`, `ActivityLog`, `AuditLog`
- `SecuritySettings` (singleton row)

### 6.2 Catalog

- `Category` (tree: parentId, path/materialized path)
- `Brand`
- `Product` — type, deliveryType, pricing, stock counters, media JSON, attributes JSON, regions, SEO, status, slug
- `ProductVariation` / values (normalize if variations are first-class; else JSON with care)
- `InventoryItem` — codes/serials, status available|reserved|sold|disabled
- `ProductReview`, `WishlistItem`
- `ProductRequest`

### 6.3 Commerce

- `Cart` / `CartItem` (or server cart keyed by user/guest)
- `Order`, `OrderItem` (customerInputs JSON, deliveredCodes JSON, deliverySource)
- `PaymentIntent` — gateway key (`mock`), amounts, status, externalRef
- `PaymentSettings` (singleton / per-provider config without live secrets in repo)
- `Coupon`, `Voucher`
- `Wallet`, `WalletTransaction`

### 6.4 Fulfillment & partners

- `Supplier`, `SupplierProduct`, `SupplierOrder`
- `DeliverySettings`
- `Reseller`, `ResellerApiKey`, `ResellerPrice`, `ResellerOrder`
- `Affiliate`, `AffiliateReferral`, `AffiliateClick`, `AffiliateCommission`

### 6.5 Support & content

- `ChatRoom`, `ChatMessage`, `ChatSettings`
- `Ticket`, `TicketMessage`
- `KycDocument` (metadata + storage path only)
- `Notification`, `NotificationPreference`, `NotificationDelivery`
- `Blog`, `BlogCategory`, `BlogReaction`, `BlogReview`, `BlogSettings`
- `ContactInquiry`, `ContactSettings`

### 6.6 Site config

- `WebsiteSettings`, `SeoSettings`, `EmailSettings`, `EmailTemplate`
- `CustomerPanelSettings`, `TelegramSettings`
- `LicenseSettings` (if retained)
- `SequenceCounter` (human order numbers)

### 6.7 Migration stance

- **No automated dump of production Mongo → Postgres in Phase 0–2.**
- Optional later: one-off ETL for catalog + public CMS content only.
- Never ETL private chat transcripts, KYC images, or avatars from reference `uploads/`.

---

## 7. Payment approach (explicit)

**Now**

- Define `PaymentPort` + `MockPaymentAdapter`.
- Admin can enable “Sandbox / Mock” method.
- Checkout creates `PaymentIntent`; mock checkout page or API confirms; signed mock webhook settles intent.
- BullMQ `payments.verify` still exists for timeout/retry drills against the mock.

**Not in this plan**

- bKash / Nagad / Rocket / Upay / UddoktaPay live SDKs
- MFS SMS inbox / TrxID matching
- Provider-specific production webhooks

**Later (separate decision record)**

- Choose one third-party provider → implement `XxxPaymentAdapter` behind the same port
- Map webhook signatures, settlement, refunds
- Keep mock adapter for CI/local forever

---

## 8. Security concerns

| Area | Risk | Rebuild control |
| --- | --- | --- |
| Secrets | Env leakage | `.env.example` only; never commit secrets; aaPanel file perms |
| Auth | Token theft / fixation | Short-lived access JWT; hashed refresh; rotation; device binding optional |
| Guest sessions | Abuse | Rate limit guest creation; convert-to-user path; expire guests |
| Payments | Double delivery | Idempotent `confirmPayment`; row locks / serializable where needed |
| Inventory codes | Leakage | Encrypt at rest (`DATA_ENCRYPTION_KEY`); audit access; mask in admin lists |
| Uploads | Path traversal / malware | Allowlists; sharp processing; private dirs outside web root; auth’d download for KYC/chat |
| Chat / KYC PII | Privacy | Retention jobs; admin ACL; no reference private copy |
| Admin RBAC | Privilege escalation | Server-side guards + role-permissions; CSRF strategy for cookie mode if used |
| API abuse | Credential stuffing | Redis throttling; optional CAPTCHA; access blocks |
| SSRF / webhooks | Fake payment events | HMAC secrets; IP allowlists when provider known |
| Next/Nginx | Header / TLS gaps | Reuse hardened Nginx snippets; security headers; HSTS on TLS vhost |
| Dependency majors | Accidental Nest 12 / Prisma 8 | Engines + pnpm overrides + CI check on major versions |
| License vendor file | Secret in repo | Keep example-only; real vendor config out of git |

---

## 9. Deployment approach (Ubuntu 24.04 + aaPanel, no Docker)

### 9.1 Target topology

| Service | Domain | Port | Process |
| --- | --- | --- | --- |
| Next.js web | `amarpin.com` (+ www) | 3000 → Nginx | PM2 `amarpin-web` |
| NestJS API | `api.amarpin.com` | 4000 → Nginx | PM2 `amarpin-api` |
| PostgreSQL | localhost | 5432 | aaPanel / system package |
| Redis | localhost | 6379 | system package (not Docker) |

### 9.2 Host setup checklist

1. Ubuntu 24.04 VPS + aaPanel
2. Nginx sites + Let’s Encrypt
3. Node.js **22.x** (or 20.19+) via aaPanel / NodeVersion Manager
4. PM2 global; Corepack pnpm
5. PostgreSQL 16 + create app role/db
6. Redis 7 (`systemd`), bind localhost, requirepass
7. App path e.g. `/www/wwwroot/amarpin`
8. `uploads/` with public subdirs only by default; private subdirs locked down
9. Env files from examples; generate JWT + encryption secrets
10. `prisma migrate deploy` + seed admin
11. `pnpm build` → PM2 ecosystem → `pm2 save`
12. Nginx: proxy `/socket.io/` (web and/or API host as designed); `/api/uploads/` to API

### 9.3 Redeploy discipline

- Prefer a `redeploy.sh` that installs, builds, migrates, reloads PM2, and verifies health/`deploy-info`
- Do not rely on `pm2 restart` alone after code upload
- Health: `/api/health`, `/api/health/ready`

### 9.4 Explicit non-goals

- No Docker / Compose in production or as a required local dependency
- Local Redis/Postgres: native Windows/WSL installs or remote dev DB — document alternatives without Docker mandates

---

## 10. Phased milestones

### Phase 0 — Scaffold (no business features)

- Create monorepo tooling, apps/web + apps/api shells
- Pin Nest **11.2.x**, Prisma **7.10.x**, Next **16.4.x**, React **19.x**
- Prisma schema stub + migrate; Redis connection; health endpoints
- aaPanel deploy docs + empty upload dir scaffold
- CI version-guard script (fail if Nest ≥12 or Prisma ≥8)

### Phase 1 — Identity & catalog foundation

- Auth register/login/refresh/logout/verify/reset + guest session
- Users + RBAC skeleton
- Categories, brands, products (read APIs + admin CRUD)
- Storefront home, listing, PDP, search (parity of structure)
- Public SEO basics

### Phase 2 — Cart, orders, mock payments, delivery

- Cart + checkout
- Orders lifecycle
- Mock payment adapter + intent + webhook + verify job
- Inventory reserve/deliver for `auto` digital codes
- Manual delivery admin path
- Customer orders UI + thank-you

### Phase 3 — Customer account depth

- Wallet (internal), wishlist, notifications
- Tickets; optional chat (Socket.IO `/chat`)
- Profile, settings, rewards/referral (as prioritized)
- Email templates + SMTP settings

### Phase 4 — Admin parity (core ops)

- Sales (orders, payments, refunds, coupons, vouchers)
- Stock, reviews, product requests
- Website/appearance/menus/homepage/SEO
- Security settings, activity, access blocks
- Role permissions

### Phase 5 — Partners & content

- Affiliate + reseller
- Suppliers + fulfillment registry (mock supplier first)
- Blog public + admin/contributor flows
- KYC queue (storage + review; no import of old private files)

### Phase 6 — Realtime polish & production hardening

- `/events` invalidation end-to-end
- Rate limits, audit completeness, backup/restore runbooks
- Load testing checkout + delivery idempotency
- Payment **provider selection ADR** → implement real adapter (out of scope until chosen)

### Phase 7 — Cutover

- Content/catalog migration scripts (public data only)
- DNS / SSL / monitoring
- Parallel run or maintenance window
- Decommission Mongo-based stack when stable

---

## 11. Feature parity matrix (planning view)

| Feature | MVP (Ph 1–2) | Full rebuild | Notes |
| --- | --- | --- | --- |
| Catalog + PDP | Yes | Yes | |
| Auth + guest checkout | Yes | Yes | |
| Cart / order / mock pay | Yes | Yes | |
| Auto/manual delivery | Yes | Yes | |
| Customer dashboard basics | Partial | Yes | |
| Admin catalog + orders | Yes | Yes | |
| Wallet | Later | Yes | |
| Live chat | Later | Yes | |
| Affiliate / reseller | Later | Yes | |
| Suppliers | Stub | Yes | |
| MFS TrxID / SMS verify | **No** | Only if new ADR | Explicitly excluded now |
| Live third-party gateway | **No** | After provider choice | Mock until then |
| Amarpin license gates | Defer | Optional | Reassess necessity |
| Blog | Later | Yes | |
| KYC | Later | Yes | No private file copy |

---

## 12. Testing strategy (plan-level)

- Unit: pricing, inventory reservation, idempotent payment confirm
- Integration: Prisma repos + mock payment webhook
- E2E (Playwright): browse → checkout → mock pay → see code
- Contract: OpenAPI snapshot for critical routes
- Load: delivery queue under concurrency

---

## 13. Open decisions

1. **License system** — keep Amarpin-style gates, replace, or remove for self-hosted rebuild?
2. **Admin host** — same origin `/admin` (reference) vs split app?
3. **Money storage** — integer minor units vs Decimal?
4. **Tailwind 3 vs 4** at greenfield time?
5. **Which payment provider** — Stripe-like international vs BD aggregator (decision after MVP)?
6. **Chat attachment retention** — keep 90-day cleanup default?
7. **Data migration** — greenfield empty catalog vs selective public ETL?

---

## 14. Working rules for implementers

1. Treat `D:\amarpin` as **read-only reference** forever unless the owner says otherwise.
2. Do not read or print secret env files from the reference.
3. Do not copy `uploads/avatars`, `uploads/live-chat`, KYC paths, or chat DB content.
4. Do not add Docker-based deploy as a requirement.
5. Do not bump to NestJS 12 or Prisma 8.
6. Do not implement MFS TrxID / SMS verification or live gateway SDKs until a written provider decision exists.
7. This phase delivers **planning only**; application scaffolding starts when the owner requests Phase 0.

---

## 15. Immediate next step (when approved)

Begin **Phase 0** in `D:\amarpin`: monorepo scaffold, pinned dependencies, Prisma 7 + PostgreSQL health check, Nest 11 hello API, Next 16 shell, aaPanel deploy stubs — still without porting business modules wholesale from the reference source.
