# AuGetway হোস্ট করা

Git থেকে এই VPS-এ উঠবে। ডাটাবেস এই সার্ভারের PostgreSQL। Neon নয়।

| | |
| --- | --- |
| ওয়েবসাইট | https://pay.uniqbd.com → `127.0.0.1:3001` |
| API | https://api.uniqbd.com → `127.0.0.1:4001` |
| কোড | `/var/www/pay.uniqbd.com` |
| ইউজার | `payuniqbd` |
| সার্ভিস | `payuniqbd-api`, `payuniqbd-web` |
| ডাটাবেস | `payuniqbd` ইউজার `payuniqbd`, `127.0.0.1:5432` |
| Git | https://github.com/SohelOnlineit/AmarPin.git |

aaPanel শুধু Nginx আর SSL। `apt install nginx` চালাবেন না। পোর্ট 3001, 4001, 5432, 6379 ফায়ারওয়ালে খুলবেন না।

`amarpin.com` আলাদা সাইট। তার ডাটাবেস ও পোর্ট এখানে ব্যবহার হবে না।

নিচের কমান্ডগুলো রুট হিসেবে, একটা শেষ হওয়ার পর পরেরটা।

## 1. ডাটাবেস

পাসওয়ার্ড নিজে বসান।

```bash
sudo -u postgres /usr/lib/postgresql/18/bin/psql -v ON_ERROR_STOP=1 -c "CREATE ROLE payuniqbd LOGIN PASSWORD 'CHANGE_THIS_PASSWORD'"
```

```bash
sudo -u postgres /usr/lib/postgresql/18/bin/createdb -O payuniqbd payuniqbd
```

## 2. Git থেকে কোড

`/var/www/pay.uniqbd.com` আগে থেকে থাকলে ক্লোন হবে না। পেমেন্ট অ্যাপ ওই ফোল্ডারে থাকলে আগে সরিয়ে রাখুন। মুছবেন না।

```bash
mv /var/www/pay.uniqbd.com /var/www/uniqpay-app
```

```bash
sudo git clone https://github.com/SohelOnlineit/AmarPin.git /var/www/pay.uniqbd.com
```

ইউজারনেম `sohelonlineit`। পাসওয়ার্ডের জায়গায় GitHub token দিন। `git config` চালাবেন না।

## 3. স্ট্যাক

```bash
cd /var/www/pay.uniqbd.com
```

```bash
sudo bash deploy/ubuntu/install-stack.sh
```

```bash
sudo chown -R payuniqbd:payuniqbd /var/www/pay.uniqbd.com
```

## 4. এনভায়রনমেন্ট

উপরের ডাটাবেস পাসওয়ার্ড এখানে দিন। একবার চালান। `.env` থাকলে স্ক্রিপ্ট আবার লেখে না।

```bash
cd /var/www/pay.uniqbd.com
```

```bash
DATABASE_URL='postgresql://payuniqbd:CHANGE_THIS_PASSWORD@127.0.0.1:5432/payuniqbd' sudo -E bash deploy/ubuntu/prepare-env.sh pay.uniqbd.com api.uniqbd.com
```

## 5. বিল্ড এবং স্টার্ট

`.env`-এ `MAIL_PROVIDER=noop` এবং `PAYMENT_SANDBOX_ENABLED=false` থাকতে হবে। Prisma টেবিল ড্রপ করতে বললে `y` দেবেন না।

```bash
sudo bash /var/www/pay.uniqbd.com/deploy/ubuntu/redeploy.sh
```

শেষে `verify-live: OK (API :4001, web :3001)` আসবে।

খালি ডাটাবেসে অ্যাডমিন একবার:

```bash
cd /var/www/pay.uniqbd.com/apps/api
```

```bash
export ALLOW_ADMIN_SEED=true
```

```bash
export ADMIN_SEED_EMAIL='you@email.com'
```

```bash
export ADMIN_SEED_PASSWORD='ChangeThisPass1'
```

পাসওয়ার্ডে বড় হাতের অক্ষর, ছোট হাতের অক্ষর, একটি সংখ্যা, অন্তত ১০ অক্ষর।

```bash
corepack pnpm seed:identity
```

## 6. aaPanel

DNS-এ `pay` এবং `api` দুটো A রেকর্ড `103.114.38.211`।

একবার:

```bash
cp /var/www/pay.uniqbd.com/deploy/ubuntu/nginx-websocket-map.conf /www/server/panel/vhost/nginx/00-amarpin-websocket-map.conf
```

তারপর প্যানেলে:

- `pay.uniqbd.com` এর কনফিগে `deploy/ubuntu/nginx-site-snippet.conf` বসান। প্রক্সি `127.0.0.1:3001`।
- নতুন সাইট `api.uniqbd.com`। কনফিগে `deploy/ubuntu/nginx-api-snippet.conf` বসান। প্রক্সি `127.0.0.1:4001`।
- দুটোতে Let's Encrypt। তারপর Nginx রিলোড।

## পরে আপডেট

```bash
cd /var/www/pay.uniqbd.com
```

```bash
sudo git -c safe.directory=/var/www/pay.uniqbd.com pull
```

```bash
sudo bash deploy/ubuntu/redeploy.sh
```

## চেক

```bash
curl -fsS http://127.0.0.1:4001/api/health/ready
```

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/
```

লগ:

```bash
journalctl -u payuniqbd-api -u payuniqbd-web -f
```
