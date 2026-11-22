# AU-Getway হোস্ট করা

Git: https://github.com/SohelOnlineit/AUGetway.git

aaPanel শুধু Nginx আর SSL। Node, PostgreSQL 18, আর অ্যাপ systemd দিয়ে চলে। Neon ব্যবহার হয় না। `apt install nginx` চালাবেন না। পোর্ট 3100, 4100, 5432 ফায়ারওয়ালে খুলবেন না।

| | |
| --- | --- |
| ওয়েবসাইট (দুটো) | https://pay.uniqbd.com আর https://pay.amarpin.com → `127.0.0.1:3100` |
| API (প্রতি ওয়েবসাইটে `/api`) | https://pay.uniqbd.com/api আর https://pay.amarpin.com/api → `127.0.0.1:4100` |
| শপের জন্য API ঠিকানা | https://api.pay.uniqbd.com আর https://api.pay.amarpin.com → `127.0.0.1:4100` |
| কোড | `/var/www/pay.uniqbd.com` |
| ইউজার | `uniqpay` |
| সার্ভিস | `uniqpay-api`, `uniqpay-web` |
| ডাটাবেস | `uniqpay` ইউজার `uniqpay`, `127.0.0.1:5432` |

AmarPin আলাদা সাইট। তার পোর্ট 3000 আর 4000। এই অ্যাপের ডাটাবেসে AmarPin-এর URL দেবেন না। `pay.amarpin.com` শুধু একটা নতুন ঠিকানা, যেটা এই অ্যাপেরই।

একটাই অ্যাপ দুই ডোমেইনে চলে। ভিজিটর যে ঠিকানা দিয়ে আসে সেই ঠিকানার নাম, লোগো ও লিংক দেখে (ডেস্কের **Website Domains** পেজে ঠিক করা হয়)। এর জন্য nginx প্রতিটি ঠিকানায় অবশ্যই `Host $host` পাঠাবে (snippet-এ আছে)।

কমান্ডগুলো রুট হিসেবে, একটা শেষ হওয়ার পর পরেরটা।

## 1. ডাটাবেস

পাসওয়ার্ড নিজে বসান।

```bash
sudo -u postgres /usr/lib/postgresql/18/bin/psql -v ON_ERROR_STOP=1 -c "CREATE ROLE uniqpay LOGIN PASSWORD 'CHANGE_THIS_PASSWORD'"
```

```bash
sudo -u postgres /usr/lib/postgresql/18/bin/createdb -O uniqpay uniqpay
```

## 2. Git থেকে কোড

ইউজারনেম `sohelonlineit`। পাসওয়ার্ডের জায়গায় GitHub token দিন। `git config` চালাবেন না।

```bash
sudo git clone https://github.com/SohelOnlineit/AUGetway.git /var/www/pay.uniqbd.com
```

## 3. স্ট্যাক

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/install-stack.sh
```

```bash
sudo chown -R uniqpay:uniqpay /var/www/pay.uniqbd.com
```

## 4. এনভায়রনমেন্ট

উপরের ডাটাবেস পাসওয়ার্ড এখানে দিন। `.env` থাকলে স্ক্রিপ্ট আবার লেখে না। আউটপুটে ডেস্ক ইমেইল আর পাসওয়ার্ড একবার আসে। সেটা রেখে দিন। ঠিকানার তালিকা আসে `deploy/ubuntu/site.env.sh`-এর `SITE_DOMAINS` থেকে, আর `.env`-এ `SITE_DOMAINS` ও `WEB_ORIGIN` লেখা হয়।

```bash
DATABASE_URL='postgresql://uniqpay:CHANGE_THIS_PASSWORD@127.0.0.1:5432/uniqpay' sudo -E bash /var/www/pay.uniqbd.com/deploy/ubuntu/prepare-env.sh
```

## 5. বিল্ড এবং স্টার্ট

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/redeploy.sh
```

শেষে `verify-live: OK (API :4100, web :3100)` আসবে।

## 6. aaPanel: প্রতিটি ঠিকানার জন্য একবার

প্রতিটি ওয়েবসাইট ঠিকানার (`pay.uniqbd.com`, `pay.amarpin.com`) জন্য:

1. DNS-এ ঠিকানাটা এই VPS-এর IP-তে পয়েন্ট করুন।
2. aaPanel-এ সাইট বানান, Let's Encrypt SSL চালু করুন, আর **Force HTTPS** চালু করুন (নইলে `http://` সরাসরি খোলে)।
3. সাইটের কনফিগে [`nginx-site-snippet.conf`](./nginx-site-snippet.conf)-এর লাইনগুলো বসান (`/api/` → 4100, `/` → 3100, আর `Host $host`)।

শপের জন্য `api.` ঠিকানা (`api.pay.uniqbd.com`, `api.pay.amarpin.com`) চাইলে একইভাবে সাইট বানিয়ে [`nginx-api-snippet.conf`](./nginx-api-snippet.conf) বসান। এগুলো না থাকলেও চলে, কারণ API প্রতিটি ওয়েবসাইট ঠিকানার `/api`-তেও আছে।

PHP ব্লক রাখবেন না। `listen`, `server_name`, আর `ssl_certificate` প্যানেলের লাইন রাখুন। তারপর:

```bash
nginx -t && nginx -s reload
```

একই `server_name` দুই ফাইলে থাকলে Nginx একটাকে বাদ দেয়। বাকি ফাইল সরিয়ে আবার রিলোড দিন।

তারপর ডেস্কে ঢুকে **Website Domains** পেজে প্রতিটি ঠিকানার নাম ও লোগো দিন। `.env`-এ `SITE_DOMAINS` থাকলে ঠিকানাগুলো আগে থেকেই যোগ হয়ে থাকে।

## pay.amarpin.com যোগ করা (pay.uniqbd.com চালু থাকলে)

`pay.uniqbd.com` ইতিমধ্যে চললে দ্বিতীয় ঠিকানা `pay.amarpin.com` যোগ করতে, ধাপে ধাপে। ডাটাবেস ও কোড একই থাকে, কিছু মোছা হয় না।

1. DNS: `pay.amarpin.com` (আর চাইলে `api.pay.uniqbd.com`, `api.pay.amarpin.com`) এই VPS-এর IP-তে পয়েন্ট করুন। `pay.uniqbd.com` আগে থেকেই থাকবে।
2. aaPanel: ওপরের ধাপ ৬ অনুযায়ী `pay.amarpin.com`-এর সাইট, Let's Encrypt, Force HTTPS আর [`nginx-site-snippet.conf`](./nginx-site-snippet.conf)। **`pay.uniqbd.com` সাইট মুছবেন না।**
3. সার্ভারের `.env`-এ দুটো ঠিকানা বসান (প্রথমটাই পেমেন্ট লিংকের ডিফল্ট):

```bash
sudo nano /var/www/pay.uniqbd.com/.env
```

```
WEB_ORIGIN=https://pay.uniqbd.com,https://pay.amarpin.com
SITE_DOMAINS=pay.uniqbd.com,pay.amarpin.com
```

4. নতুন কোড আনুন ও রিস্টার্ট:

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/update.sh
```

5. ব্রাউজারে https://pay.uniqbd.com আর https://pay.amarpin.com খুলে ঢুকুন, **Website Domains** পেজে প্রতিটি ঠিকানার নাম ও লোগো দিন।
6. Cloudflare Turnstile widget-এ `pay.uniqbd.com` আর `pay.amarpin.com` দুটোই যোগ করুন।
7. (ঐচ্ছিক) শপের জন্য `api.pay.*` সাইট চাইলে ধাপ ৬-এর মতো [`nginx-api-snippet.conf`](./nginx-api-snippet.conf) বসান।

ডেস্কের মূল অ্যাডমিনের লগইন ইমেইল আগের মতোই থাকে (যেমন `admin@pay.uniqbd.com`)। বদলাতে চাইলে Account পেজ থেকে বদলান। `.env`-এর `ADMIN_EMAIL` বদলালে নতুন অ্যাডমিন তৈরি হয় না।

## পরে আপডেট (এক কমান্ড)

কম্পিউটার থেকে `git push` করার পর সার্ভারে SSH করে শুধু এটা চালান। স্ক্রিপ্ট GitHub থেকে নতুন কোড আনে, তারপর `redeploy.sh` দিয়ে ইনস্টল, ডাটাবেস স্কিমা, বিল্ড, রিস্টার্ট ও চেক করে। `.env`, ডাটাবেসের ডেটা আর `backups` ফোল্ডার ছোঁয় না।

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/update.sh
```

GitHub ইউজারনেম আর পাসওয়ার্ড চাইলে ইউজারনেম `sohelonlineit`, পাসওয়ার্ডের জায়গায় GitHub token দিন।

শুরুতেই স্ক্রিপ্ট দেখে নেয় `.env`-এর `JWT_SECRET` কমপক্ষে ৩২ অক্ষরের কি না। না হলে কিছু বদলানোর আগেই থেমে যায়, কারণ নতুন API এমন secret নিয়ে চালু হয় না। বদলানোর কমান্ড: `openssl rand -hex 32` (বদলালে সবাই সাইন-আউট হবে, আর সেটিংসে সেভ করা SMTP/Telegram/গেটওয়ের পাসওয়ার্ড আবার বসাতে হবে)।

### রিপোজিটরি সরানোর পর প্রথমবার (একবারই)

কোড এখন `AUGetway` রিপোজিটরিতে। সার্ভারের পুরনো কপির ইতিহাস আলাদা হলে স্ক্রিপ্ট প্রথমবার থেমে গিয়ে একটা কমান্ড দেখাবে। সার্ভারে কোডে নিজে কোনো এডিট না থাকলে সেটাই চালান, তারপর আবার `update.sh`:

```bash
sudo git -c safe.directory=/var/www/pay.uniqbd.com -C /var/www/pay.uniqbd.com reset --hard origin/main
```

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/update.sh
```

এটা শুধু কোডের ফাইল (git-এ থাকা) বদলায়। `.env`, `backups` আর ডাটাবেস নিরাপদ থাকে।

### আপডেট ঠিক হলো কি না

```bash
sudo git -c safe.directory=/var/www/pay.uniqbd.com -C /var/www/pay.uniqbd.com log -1 --oneline
```

আর `verify-live: OK` ও https://pay.uniqbd.com/api/health দেখুন। তারপর `sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/audit-server.sh` চালিয়ে প্রতিটি ঠিকানার অবস্থা দেখুন।

### কিছু ভাঙলে আগের কোডে ফেরা

আপডেটের আগের commit-এর নাম (স্ক্রিপ্টের `Code আগের -> পরের` লাইনে দেখায়) দিয়ে:

```bash
sudo git -c safe.directory=/var/www/pay.uniqbd.com -C /var/www/pay.uniqbd.com reset --hard আগের_commit
```

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/redeploy.sh
```

ডাটাবেসে শুধু নতুন টেবিল/কলাম যোগ হয় (`prisma db push`), কিছু মোছা হয় না। তবে নতুন কোড চালু হওয়ার সময় সেটিংসের পাসওয়ার্ড ও গেটওয়ের ক্রেডেনশিয়াল এনক্রিপ্ট হয়ে যায়, যা পুরনো কোড পড়তে পারে না। তাই ২০২৬-১১-২২-এর আগের কোডে ফেরার আগে জানিয়ে নিন।

## চেক

- https://pay.uniqbd.com
- https://pay.amarpin.com
- https://pay.uniqbd.com/api/health
- https://pay.amarpin.com/api/health
- (থাকলে) https://api.pay.uniqbd.com/api/health আর https://api.pay.amarpin.com/api/health

প্রতিটি health `{"ok":true,"service":"uniqpay"}` দেখাবে।

প্রতিটি ঠিকানার নিজের নাম ঠিক দেখাচ্ছে কি না: `curl -s https://pay.amarpin.com/api/public/site`। উত্তরের `"host"` ঠিকানার নামে হবে আর `"brandName"` সেই ঠিকানার নাম।

ফোন অ্যাপের ডেস্ক ঠিকানা: `https://pay.uniqbd.com/api` (অ্যাপ ২.৩৩ থেকে)

## লগ

```bash
journalctl -u uniqpay-api -u uniqpay-web -f
```

## ডাটাবেস ফিরিয়ে আনা

`pg_dump` ফাইল সার্ভারে রাখুন: `/var/www/pay.uniqbd.com/uniqpay-restore.sql`

সাইট বন্ধ করে খালি ডাটাবেসে `psql` 18 দিয়ে বসান। তারপর `uniqpay` ইউজারকে টেবিলের অনুমতি দিয়ে সার্ভিস চালু করুন। বসানোর পর লগইন ডাম্পের পুরনো ডেস্ক অ্যাকাউন্ট।

## ব্যাকআপ

ডেস্কের **Backups** পেজ (`/admin/backups`) থেকে ডাটাবেসের কপি সেভ, ডাউনলোড ও মুছা যায়। শুধু মূল অ্যাডমিন এটা ব্যবহার করতে পারেন।

- প্রতিদিন ভোর ৫:০০টায় (Asia/Dhaka) অটো কপি সেভ হয়। সার্ভার তখন বন্ধ থাকলে চালু হওয়ার সময় একবার সেভ হয়।
- ৬০ দিনের পুরনো কপি নিজে থেকে মুছে যায়।
- ফাইল থাকে `/var/www/pay.uniqbd.com/backups/augetway-database-তারিখ-সময়.sql`। ফোল্ডার শুধু `uniqpay` ইউজার পড়তে পারে।
- কপিতে সব ডেটা থাকে (পাসওয়ার্ড হ্যাশ, API কী হ্যাশ, গেটওয়ে ক্রেডেনশিয়াল সহ)। ডাউনলোড করা ফাইল নিরাপদ জায়গায় রাখুন, আর সার্ভারের বাইরেও একটা কপি রাখুন।

কপি থেকে ফিরিয়ে আনতে (সাইট বন্ধ করে, স্কিমা আগে থেকে `prisma db push` করা থাকতে হবে):

```bash
sudo systemctl stop uniqpay-api uniqpay-web
```

```bash
sudo -u uniqpay psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f /var/www/pay.uniqbd.com/backups/augetway-database-তারিখ-সময়.sql
```

```bash
sudo systemctl start uniqpay-api uniqpay-web
```

ফাইলটা একটাই ট্রানজ্যাকশনে চলে। মাঝখানে ভুল হলে কিছুই বদলায় না।

## Cloudflare Turnstile

বট ঠেকাতে ডেস্ক লগইন এবং পাবলিক পেমেন্ট পেজে (পেমেন্ট লিংক, বিল, ট্রানজেকশন আইডি যাচাই) Cloudflare Turnstile চালানো যায়। ফোন অ্যাপের লগইনে এটা চায় না।

সেটআপ (শুধু মূল অ্যাডমিন): ডেস্কে **Security Monitoring** পেজের উপরে **Cloudflare Turnstile** কার্ড।

1. Cloudflare ড্যাশবোর্ডে Turnstile → Add widget। Domain-এ `pay.uniqbd.com` আর `pay.amarpin.com` দুটোই দিন। **Site key** আর **Secret key** কপি করুন।
2. কার্ডে দুটো key বসিয়ে **Save keys** চাপুন।
3. নিচের চেকটা একবার সলভ করে **Test and turn on** চাপুন। টেস্ট পাশ না করলে চালু হয় না, তাই ভুল key দিয়ে নিজে লগইন বন্ধ হয়ে যাওয়ার ভয় নেই।
4. key বদলালে চেক নিজে থেকে বন্ধ হয়, আবার টেস্ট পাশ করে চালু করতে হয়। **Turn off** দিলে key সেভ থাকে।

কখনো লগইন আটকে গেলে (যেমন Cloudflare সমস্যা বা domain বদল): সার্ভারের `/var/www/pay.uniqbd.com/.env`-এ `TURNSTILE_OFF=1` লিখে API রিস্টার্ট করুন। ঢুকে সমস্যা ঠিক করে লাইনটা মুছে আবার রিস্টার্ট করুন।

```bash
sudo systemctl restart uniqpay-api
```

নতুন টেবিল (`SecuritySettings`) `redeploy.sh`-এর `prisma db push` নিজে বানায়।
