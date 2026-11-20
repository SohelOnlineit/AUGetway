# AU-Getway

মার্চেন্ট চেকআউট ডেস্ক। ওয়েবসাইট আর API আলাদা ডোমেনে চলে। ডাটাবেস VPS-এর নিজের PostgreSQL। Neon ব্যবহার হয় না।

| | |
| --- | --- |
| ওয়েবসাইট | https://pay.uniqbd.com |
| API | https://api.uniqbd.com/api |
| কোড | `/var/www/pay.uniqbd.com` |
| সার্ভিস | `uniqpay-api` (`127.0.0.1:4100`), `uniqpay-web` (`127.0.0.1:3100`) |
| ডাটাবেস | `uniqpay` ইউজার `uniqpay`, `127.0.0.1:5432` |
| Git | https://github.com/SohelOnlineit/Payment-Getway.git |

হোস্ট করার ধাপ: [`deploy/ubuntu/README.md`](./deploy/ubuntu/README.md)

ফোন অ্যাপের ডেস্ক ঠিকানা: `https://api.uniqbd.com/api`
