# Ubuntu 22.04 / 24.04 deploy (UniqBD Pay)

This is the same VPS pattern as AmarPin: aaPanel handles Nginx and SSL only. Node and the app run through systemd. PostgreSQL is Neon, not a database installed on the VPS.

| Host | Role |
|------|------|
| **pay.uniqbd.com** | Desk and checkout (Next.js → `127.0.0.1:3100`) |
| **api.pay.uniqbd.com** | Nest API → `127.0.0.1:4100` |

Install path: **`/var/www/pay.uniqbd.com`**  
System user: **`uniqpay`**  
Services: **`uniqpay-api`**, **`uniqpay-web`**

AmarPin stays where it is: `/var/www/amarpin.com`, user `amarpin`, ports **3000** and **4000**. Do not point these Nginx sites at those ports. Do not `apt install nginx`. Do not open ports 3100 or 4100 in the firewall.

Use a Neon database for UniqBD Pay. Do not put AmarPin's `AUWebsiteData` URL in this app.

## 1. Clone

```bash
sudo mkdir -p /var/www
sudo git clone https://github.com/SohelOnlineit/Payment-Getway.git /var/www/pay.uniqbd.com
```

The GitHub repo is private. Clone with an account that can read it.

## 2. Stack

```bash
cd /var/www/pay.uniqbd.com && sudo bash deploy/ubuntu/install-stack.sh
```

If this VPS already has Node 22 from AmarPin, the script keeps that Node and only adds the `uniqpay` user and the two systemd units.

## 3. Environment

Copy a pooled Neon connection string from the Neon console. `sslmode=require` is enough. The script removes `channel_binding`, which Node's `pg` driver does not support.

```bash
DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require' \
  sudo -E bash deploy/ubuntu/prepare-env.sh
```

This writes `.env` and `apps/web/.env.production.local`. It refuses to overwrite those files. It prints the desk password once. That password is not stored in git.

## 4. aaPanel Nginx

Add two sites and issue Let's Encrypt for each:

1. **pay.uniqbd.com** — paste `deploy/ubuntu/nginx-site-snippet.conf` inside the site `server { }` block. Remove the default PHP `location /`.
2. **api.pay.uniqbd.com** — paste `deploy/ubuntu/nginx-api-snippet.conf` the same way.

Point both DNS records at this VPS before requesting certificates. Reload Nginx from the panel.

## 5. Build and start

```bash
sudo bash deploy/ubuntu/redeploy.sh
```

Later updates:

```bash
cd /var/www/pay.uniqbd.com
sudo git pull
sudo bash deploy/ubuntu/redeploy.sh
```

## 6. Check

- https://pay.uniqbd.com
- https://api.pay.uniqbd.com/api/health
- Desk login uses the email and password printed by `prepare-env.sh`

On a phone, set the handset app desk URL to `https://api.pay.uniqbd.com/api`.

## Logs

```bash
journalctl -u uniqpay-api -u uniqpay-web -f
```
