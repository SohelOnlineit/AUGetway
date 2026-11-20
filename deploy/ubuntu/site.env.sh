# Shared production paths and hostnames for the AuGetway shop on pay.uniqbd.com.
# This copy runs beside the existing amarpin.com site. Do not reuse its ports or database.

APP_USER="payuniqbd"
APP_ROOT="/var/www/pay.uniqbd.com"
MAIN_DOMAIN="pay.uniqbd.com"
API_DOMAIN="api.uniqbd.com"
DB_USER="payuniqbd"
DB_NAME="payuniqbd"
REDIS_PREFIX="payuniqbd:"
API_PORT="4001"
WEB_PORT="3001"
API_SERVICE="payuniqbd-api"
WEB_SERVICE="payuniqbd-web"
