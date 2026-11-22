# Shared production settings for the AU-Getway server (Ubuntu + aaPanel, next to the AmarPin shop).
# The shop keeps ports 3000 and 4000. AU-Getway uses 3100 and 4100.

# APP_ROOT is the folder this repository is in, so the scripts work wherever the folder is
# (/var/www/pay.uniqbd.com).
_site_env_here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="${APP_ROOT:-$(cd "${_site_env_here}/../.." && pwd)}"
unset _site_env_here

APP_USER="uniqpay"

# One desk, several website addresses. Each address has its own api. address for shops and programs
# (pay.amarpin.com <-> api.pay.amarpin.com). A visitor sees the name and logo of the address they came in on.
SITE_DOMAINS="pay.uniqbd.com pay.amarpin.com"

MAIN_DOMAIN="pay.uniqbd.com"
API_DOMAIN="api.pay.uniqbd.com"
WEB_PORT="3100"
API_PORT="4100"
