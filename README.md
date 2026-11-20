# AuGetway

Digital-goods marketplace for game top-ups, gift cards, and vouchers.

Live store: **https://amarpin.com**  
API: **https://api.amarpin.com**

## Multi-storefront (one database)

Two public websites, one backend:

| Storefront | Role |
| --- | --- |
| **amarpin.com** | AuGetway shop |
| **uniqbd.com** | Second shop, same catalog engine |

Both sites use the **same PostgreSQL database**, API, live chat, and admin. Completing work on either site updates the other immediately.

Shared across both sites:

- Product catalog and **stock**
- **Orders** and order details
- **Live chat**
- Customers, wallet, refunds, tickets
- Admin panel

Each site keeps its own public look (domain, branding, homepage). Checkout, inventory, and support stay on the shared database so a sale or chat reply on one domain is already done on the other.

**amarpin.com** is the main shop. **uniqbd.com** is the second shop on the same Next.js app (`127.0.0.1:3000`), the same API, and the same database. The request host picks the name and logo. Products, stock, orders, customers, and live chat are not split.

Point uniqbd.com at the server with `deploy/ubuntu/nginx-uniqbd-snippet.conf`. A customer signs in on each domain once; the account and orders are the same records.

## What the app includes

- Storefront: shop, product pages, cart, checkout, account
- Admin: products, categories, brands, inventory, orders, customers, payments, refunds, tickets, live chat, email, appearance
- Account security: signed-in users can change email and password; sessions last 5 years until logout

## Stack (pinned)

| Layer | Pin |
| --- | --- |
| Node.js | ≥ 20.19 (prefer 22.12+) |
| pnpm | 9.15.9 |
| Next.js / React | 16.4.3 / 19.2.9 |
| NestJS | 11.2.8 |
| Prisma ORM | 7.10.1 + `@prisma/adapter-pg` |
| BullMQ | 5.81.5 |
| Socket.IO | 4.8.4 |

Workspace packages: `@amarpin/web`, `@amarpin/api`, `@amarpin/types`, `@amarpin/config-ts`.

NestJS 12 and Prisma 8 are blocked by `pnpm guard:versions`.

## Local setup (no Docker)

1. Install **Redis** and **PostgreSQL** natively (Windows, WSL, or the VPS). The database name is `amarpin`. Production PostgreSQL runs on the VPS at `127.0.0.1:5432`.
2. Copy env templates:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

3. Edit `.env` placeholders (JWT / encryption strings must be ≥ 32 chars).

   Set `DATABASE_URL` to `postgresql://amarpin:PASSWORD@127.0.0.1:5432/amarpin`. Keep that password only in `.env`. The server copy is `/var/www/amarpin.com/.env` and points at PostgreSQL on the VPS. **JWT must match:** copy `JWT_ACCESS_SECRET` from root `.env` into `apps/web/.env.local` as `AUTH_JWT_ACCESS_SECRET` (the web app verifies access tokens with this secret). Run `pnpm dev:env-check` to verify DB + secret alignment.

4. Install and generate:

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install
pnpm --filter @amarpin/api prisma:generate
pnpm --filter @amarpin/api prisma:deploy
```

5. Seed an admin (set `ADMIN_SEED_EMAIL`, `ADMIN_SEED_PASSWORD`, and `ALLOW_ADMIN_SEED=true` in `.env` first):

```bash
pnpm --filter @amarpin/api seed:identity
```

Optional development data:

```bash
pnpm --filter @amarpin/api seed:catalog
pnpm --filter @amarpin/api seed:inventory
pnpm --filter @amarpin/api seed:account-demo
```

6. Run:

```bash
pnpm dev
```

| Service | URL |
| --- | --- |
| Web | http://localhost:3000 |
| Login | http://localhost:3000/login |
| API health | http://localhost:4000/api/health |
| API ready | http://localhost:4000/api/health/ready |

Set `MAIL_PROVIDER=dev` for local verification and reset previews. Production uses real SMTP from the admin email settings and ignores the `dev` mail adapter.

## Production (Ubuntu 22.04 / 24.04 + aaPanel)

Node, Redis, PostgreSQL 18, and systemd run on the VPS. The database is `payuniqbd` on `127.0.0.1`. aaPanel is only Nginx and SSL. Hosting steps are in [`deploy/ubuntu/README.md`](./deploy/ubuntu/README.md).

| Host | Process |
| --- | --- |
| **pay.uniqbd.com** | Next.js on `127.0.0.1:3001` |
| **api.uniqbd.com** | Nest API and live-chat Socket.IO on `127.0.0.1:4001` |

Path: `/var/www/pay.uniqbd.com`  
Services: `payuniqbd-api`, `payuniqbd-web`

Steps: **[`deploy/ubuntu/README.md`](./deploy/ubuntu/README.md)**

## Scripts

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm guard:versions
```
