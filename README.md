# AU-Getway

AU-Getway is a digital-goods marketplace for game top-ups, gift cards, and vouchers.

Repository: **https://github.com/SohelOnlineit/AU-Getway.git** (branch `main`)

Live store: **https://amarpin.com**  
API: **https://api.amarpin.com**

## Git workflow (read before you push)

This is the only repository for AU-Getway. Do not push this code to any other repository (for example `Payment-Getway`, which holds a different project).

```bash
git clone https://github.com/SohelOnlineit/AU-Getway.git
cd AU-Getway
git pull origin main          # always pull first, so your push is never rejected
# ...make changes...
git add -A
git commit -m "Short description of the change"
git push origin main
```

Rules:

- If a push is rejected, run `git pull --rebase origin main`, fix any conflicts, then push again. Never force-push `main`.
- Never commit `.env`, `.env.local`, passwords, API keys, or the `uploads/` folder. They are already in `.gitignore`; only the `*.env.example` templates belong in git.
- On Windows, "dubious ownership" means the folder belongs to another Windows user. Fix it once with `git config --global --add safe.directory <folder path>`.
- If `git remote -v` does not show the URL above, set it with `git remote set-url origin https://github.com/SohelOnlineit/AU-Getway.git`.

## Deploy

After pushing, run on the server (path and process names are in the Production section below):

```bash
cd /var/www/pay.uniqbd.com && git pull origin main && sudo bash deploy/ubuntu/redeploy.sh
```

Before the first deploy of the security update, `.env` on the server must have different, random `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values (generate with `openssl rand -base64 48`). In production the API refuses to start with placeholder or identical secrets.

## Security notes

- Email-verification and password-reset **codes need the account email**; failed attempts lock the code for 30 minutes after 5 tries.
- Sign-in locks an email for 15 minutes after 10 failed attempts. Passwords need 8+ characters.
- Payment webhooks store nothing from their body; the gateway's own verify call is the source of truth, and one invoice can settle only one order.
- Requests other than image uploads are limited to 1 MB.
- The web app and API send HSTS and CSP headers; nginx examples in `deploy/` include HSTS.

Live store: **https://amarpin.com**  
API: **https://api.amarpin.com**

## Multi-storefront (one database)

Two public websites, one backend:

| Storefront | Role |
| --- | --- |
| **amarpin.com** | AU-Getway shop |
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
