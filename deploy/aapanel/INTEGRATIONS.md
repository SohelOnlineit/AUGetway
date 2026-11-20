# External integrations (boundaries)

Amarpin production can run **without** live email, push, monitoring SaaS, or payment SDKs. Missing credentials must not be faked as successful delivery.

## Email

| Env | Behavior |
| --- | --- |
| `MAIL_PROVIDER=noop` | Default production-safe. Outbound send returns `delivered: false`. Health reports provider not ready. |
| `MAIL_PROVIDER=dev` | Local/dev only. **Forced to noop when `NODE_ENV=production`.** |

To add a real SMTP/API provider later: implement `MailPort`, register behind `MAIL_PORT`, and only then mark channel delivery `ACCEPTED` after provider acknowledgement. Notification EMAIL/PUSH rows currently stay `SKIPPED_NO_PROVIDER`.

## Push notifications

No provider is wired. `NotificationDelivery` for `PUSH` is recorded as `SKIPPED_NO_PROVIDER` with reason text — never `ACCEPTED` without a real vendor.

## Payments

| Env | Behavior |
| --- | --- |
| `PAYMENT_SANDBOX_ENABLED=true` | Allowed only outside production. |
| Production | Sandbox is disabled by code + PM2 ecosystem override. Live gateways are **not selected** — do not enable until a written provider decision exists. |

## Monitoring / APM

No Datadog/Sentry/New Relic SDK is required for launch. Use:

- `GET /api/health/live` — process up
- `GET /api/health/ready` — PostgreSQL + Redis + BullMQ (+ mail/payments detail)
- `GET /api/health/deploy-info` — version/env flags (no secrets)
- `GET /api/health` on the web origin — Next + upstream API live

Wire an external uptime checker to those URLs when you have credentials. Do not invent green status in-app.

## Analytics

First-party allowlisted events only (`page_view`, `product_view`, `add_to_cart`, `checkout_start`, `search`). No third-party pixel is bundled. Do not send chat text, emails, or tokens.
