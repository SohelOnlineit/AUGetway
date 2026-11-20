import { AndroidConfig, type ConfigPlugin } from "expo/config-plugins";
import { brand, shop, siteUrl } from "./brand";

const withCamera: ConfigPlugin = (config) =>
  AndroidConfig.Permissions.withPermissions(config, ["android.permission.CAMERA"]);

type ExpoConfig = Parameters<ConfigPlugin>[0];

export default () => {
  const config: ExpoConfig = {
    name: brand.name,
    slug: brand.slug,
    version: "1.0.0",
    orientation: "portrait",
    icon: `./assets/${shop}/icon.png`,
    scheme: brand.scheme,
    userInterfaceStyle: "automatic",
    backgroundColor: "#01131A",
    ios: {
      bundleIdentifier: brand.iosBundle,
      supportsTablet: true,
      associatedDomains: [`applinks:${brand.host}`, `applinks:www.${brand.host}`],
      infoPlist: {
        NSCameraUsageDescription: "Take a photo to send in chat or attach to an order.",
        NSPhotoLibraryUsageDescription: "Choose a photo to send in chat or attach to an order.",
      },
    },
    android: {
      package: brand.androidPackage,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        foregroundImage: `./assets/${shop}/icon.png`,
        backgroundColor: "#01131A",
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            { scheme: "https", host: brand.host, pathPrefix: "/" },
            { scheme: "https", host: `www.${brand.host}`, pathPrefix: "/" },
          ],
        },
      ],
    },
    plugins: [
      [
        "expo-splash-screen",
        {
          backgroundColor: "#01131A",
          image: `./assets/${shop}/splash-icon.png`,
          imageWidth: 220,
          dark: {
            backgroundColor: "#01131A",
            image: `./assets/${shop}/splash-icon.png`,
          },
        },
      ],
      ["expo-navigation-bar", { style: "light", enforceContrast: false }],
      ["expo-build-properties", { android: { usesCleartextTraffic: siteUrl.startsWith("http://") } }],
      "expo-secure-store",
      "./plugins/withChatBubbles",
    ],
    extra: {
      storefront: shop,
      siteUrl,
    },
  };

  return withCamera(config);
};
