const { AndroidConfig, withAndroidManifest, withAppBuildGradle, withDangerousMod, withMainApplication } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOCKET = `implementation("io.socket:socket.io-client:2.1.1") {
        exclude group: "org.json", module: "json"
    }`;

function withChatBubbles(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.SYSTEM_ALERT_WINDOW",
  ]);
  config = withMainApplication(config, (mod) => {
    if (!mod.modResults.contents.includes("ChatBubblePackage()")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        "PackageList(this).packages.apply {",
        "PackageList(this).packages.apply {\n          add(ChatBubblePackage())",
      );
    }
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("socket.io-client")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'implementation("com.facebook.react:react-android")',
        `implementation("com.facebook.react:react-android")\n    ${SOCKET}`,
      );
    }
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    const services = application.service ?? [];
    const exists = services.some((service) => service.$?.["android:name"] === ".ChatBubbleService");
    if (!exists) {
      services.push({
        $: {
          "android:name": ".ChatBubbleService",
          "android:exported": "false",
          "android:foregroundServiceType": "dataSync",
        },
      });
      application.service = services;
    }
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const packageDir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/java/com/amarpin/app");
      const drawableDir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/drawable");
      const sourceDir = path.join(mod.modRequest.projectRoot, "chat-bubbles");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(drawableDir, { recursive: true });
      for (const file of fs.readdirSync(sourceDir)) {
        if (file.endsWith(".kt")) fs.copyFileSync(path.join(sourceDir, file), path.join(packageDir, file));
        if (file.endsWith(".xml")) fs.copyFileSync(path.join(sourceDir, file), path.join(drawableDir, file));
      }
      return mod;
    },
  ]);
}

module.exports = withChatBubbles;
