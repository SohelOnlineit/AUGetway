const shop = process.env.EXPO_PUBLIC_STOREFRONT === "uniqbd" ? "uniqbd" : "amarpin";

const shops = {
  amarpin: {
    name: "AmarPin",
    slug: "amarpin",
    scheme: "amarpin",
    host: "amarpin.com",
    site: "https://amarpin.com",
    iosBundle: "com.amarpin.app",
    androidPackage: "com.amarpin.app",
    token: "AmarPinApp/1.0",
    mark: "A",
  },
  uniqbd: {
    name: "UniQbd",
    slug: "uniqbd",
    scheme: "uniqbd",
    host: "uniqbd.com",
    site: "https://uniqbd.com",
    iosBundle: "com.uniqbd.app",
    androidPackage: "com.uniqbd.app",
    token: "UniQbdApp/1.0",
    mark: "U",
  },
};

const brand = shops[shop];
const siteUrl = (process.env.EXPO_PUBLIC_SITE_URL || brand.site).replace(/\/$/, "");

module.exports = { shop, brand, siteUrl };
