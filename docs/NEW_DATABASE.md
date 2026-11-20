# নতুন ডাটাবেস ওয়েবসাইটের সাথে যুক্ত করা

PostgreSQL (যেমন **Neon**) নতুন করলে **ইউজার নাম ও পাসওয়ার্ড** সেখানেই তৈরি হয় — AuGetway কোড এগুলো **উৎপন্ন করে না**।

## ১) ডাটাবেস তৈরি (Neon)

1. [Neon](https://neon.tech) এ প্রোজেক্ট ব্রাঞ্চ তৈরি করুন।
2. **Connection string** কপি করুন (অথবা ইউজার `neondb_owner` + পাসওয়ার্ড আলাদা দেখুন)।
3. পাসওয়ার্ড **শুধু আপনি দেখুন** — কখনো Git বা চ্যাটে শেয়ার করবেন না।

## ২) প্রোজেক্টে লিঙ্ক (`d:\amarpin.com\.env`)

রিপো **রুট** `.env` ফাইলে (gitignored):

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require&channel_binding=require"
```

- URL এ `&` থাকলে পুরোটা **ডাবল কোট** `"..."` এ বাঁধুন।
- পাসওয়ার্ডে বিশেষ অক্ষর থাকলে URL-encode করুন বা Neon যেটা দেয় সেটাই ব্যবহার করুন।

## ৩) স্কিমা চালানো

```bash
cd d:\amarpin.com
corepack pnpm --filter @amarpin/api exec prisma migrate deploy --schema prisma/schema.prisma
```

## ৪) JWT সিক্রেট (লোকাল ওয়েব + API একসাথে)

- রুট `.env`: `JWT_ACCESS_SECRET` (কমপক্ষে ৩২ অক্ষর)
- `apps/web/.env.local`: `AUTH_JWT_ACCESS_SECRET` = **একই মান** (API যে টোকেন সাইন করে)

যাচাই: `pnpm dev:env-check`

## ৫) ওয়েবসাইটে লগইন (অ্যাপ ইউজার — ডাটাবেস ইউজার নয়)

ডাটাবেস ইউজার (`neondb_owner`) দিয়ে সাইটে লগইন হয় না। সাইটের জন্য:

রুট `.env` এ:

```env
ADMIN_SEED_EMAIL=আপনার_অ্যাডমিন@ইমেইল.com
ADMIN_SEED_PASSWORD=আপনারশক্তিশালীপাস123
ALLOW_ADMIN_SEED=true
```

তারপর (একবার):

```bash
cd d:\amarpin.com\apps\api
node scripts/seed-identity.cjs
```

শেষে:

```env
ALLOW_ADMIN_SEED=false
```

লগইন: যে **ইমেইল/পাস** উপরে দিয়েছেন সেটা দিয়ে **সাইন ইন**।

## ৬) প্রোডাকশন (VPS)

PostgreSQL VPS-এ ইনস্টল হয় না। ডাটাবেস Neon-এ, রিজিয়ন `ap-southeast-1`, নাম `AUWebsiteData`।

সার্ভারের `/var/www/amarpin.com/.env` এ রুট `.env`-এর একই `DATABASE_URL` বসান (pooled, `sslmode=require`)। তারপর `deploy/ubuntu/redeploy.sh`। পাসওয়ার্ড README বা git-এ রাখবেন না।

---

**সংক্ষেপ:**  
- **ডাটাবেস ID/পাস** = Neon কনসোল / connection string।  
- **ওয়েবসাইট লগইন ID/পাস** = সিড করে সেট করা `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` (বা আগে থেকে থাকা ইউজার)।
