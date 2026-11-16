# AU-Getway হোস্ট করা

Git: https://github.com/SohelOnlineit/Payment-Getway.git

aaPanel শুধু Nginx আর SSL। Node, PostgreSQL 18, আর অ্যাপ systemd দিয়ে চলে। Neon ব্যবহার হয় না। `apt install nginx` চালাবেন না। পোর্ট 3100, 4100, 5432 ফায়ারওয়ালে খুলবেন না।

| | |
| --- | --- |
| ওয়েবসাইট | https://pay.uniqbd.com → `127.0.0.1:3100` |
| API | https://api.uniqbd.com → `127.0.0.1:4100` |
| কোড | `/var/www/pay.uniqbd.com` |
| ইউজার | `uniqpay` |
| সার্ভিস | `uniqpay-api`, `uniqpay-web` |
| ডাটাবেস | `uniqpay` ইউজার `uniqpay`, `127.0.0.1:5432` |

AmarPin আলাদা সাইট। তার পোর্ট 3000 আর 4000। এই অ্যাপের ডাটাবেসে AmarPin-এর URL দেবেন না।

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
sudo git clone https://github.com/SohelOnlineit/Payment-Getway.git /var/www/pay.uniqbd.com
```

## 3. স্ট্যাক

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/install-stack.sh
```

```bash
sudo chown -R uniqpay:uniqpay /var/www/pay.uniqbd.com
```

## 4. এনভায়রনমেন্ট

উপরের ডাটাবেস পাসওয়ার্ড এখানে দিন। `.env` থাকলে স্ক্রিপ্ট আবার লেখে না। আউটপুটে ডেস্ক ইমেইল আর পাসওয়ার্ড একবার আসে। সেটা রেখে দিন।

```bash
DATABASE_URL='postgresql://uniqpay:CHANGE_THIS_PASSWORD@127.0.0.1:5432/uniqpay' sudo -E bash /var/www/pay.uniqbd.com/deploy/ubuntu/prepare-env.sh pay.uniqbd.com api.uniqbd.com
```

## 5. বিল্ড এবং স্টার্ট

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/redeploy.sh
```

শেষে `verify-live: OK (API :4100, web :3100)` আসবে।

## 6. aaPanel

DNS-এ `pay.uniqbd.com` আর `api.uniqbd.com` এই VPS-এর IP-তে পয়েন্ট করুন। দুটো সাইটে Let's Encrypt চালু করুন।

`pay.uniqbd.com` কনফিগ:

- `location /api/` → `http://127.0.0.1:4100`
- `location /` → `http://127.0.0.1:3100`

`api.uniqbd.com` কনফিগ:

- `location /` → `http://127.0.0.1:4100`

PHP ব্লক রাখবেন না। `listen`, `server_name`, আর `ssl_certificate` প্যানেলের লাইন রাখুন। তারপর:

```bash
nginx -t && nginx -s reload
```

একই `server_name` দুই ফাইলে থাকলে Nginx একটাকে বাদ দেয়। বাকি ফাইল সরিয়ে আবার রিলোড দিন।

## পরে আপডেট

```bash
sudo git -c safe.directory=/var/www/pay.uniqbd.com -C /var/www/pay.uniqbd.com pull
```

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/redeploy.sh
```

## চেক

- https://pay.uniqbd.com
- https://pay.uniqbd.com/api/health
- https://api.uniqbd.com/api/health

দুটো health-ই `{"ok":true,"service":"uniqpay"}` দেখাবে।

ফোন অ্যাপের ডেস্ক ঠিকানা: `https://api.uniqbd.com/api`

## লগ

```bash
journalctl -u uniqpay-api -u uniqpay-web -f
```

## ডাটাবেস ফিরিয়ে আনা

`pg_dump` ফাইল সার্ভারে রাখুন: `/var/www/pay.uniqbd.com/uniqpay-restore.sql`

সাইট বন্ধ করে খালি ডাটাবেসে `psql` 18 দিয়ে বসান। তারপর `uniqpay` ইউজারকে টেবিলের অনুমতি দিয়ে সার্ভিস চালু করুন। বসানোর পর লগইন ডাম্পের পুরনো ডেস্ক অ্যাকাউন্ট।
