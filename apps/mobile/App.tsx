import { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, NativeModules, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { NavigationBar } from "expo-navigation-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { brand, siteUrl } from "./brand";

SplashScreen.preventAutoHideAsync().catch(() => {});

const BOOT = `
(function () {
  function mark() {
    var root = document.documentElement;
    if (!root) return;
    root.classList.add("native-app");
    root.dataset.nativeApp = ${JSON.stringify(brand.scheme)};
    root.dataset.nativePlatform = ${JSON.stringify(Platform.OS)};
  }
  mark();
  document.addEventListener("DOMContentLoaded", mark);
})();
true;
`;

const WATCH = `
(function () {
  if (window.__amarpinChatWatch) return;
  window.__amarpinChatWatch = true;
  function send(payload) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
  async function sync() {
    try {
      var token = null;
      var tokenRes = await fetch("/api/auth/socket-token", { credentials: "include", cache: "no-store" });
      if (tokenRes.ok) token = (await tokenRes.json()).accessToken || null;
      if (!token) {
        var guest = await fetch("/api/chat/guest-token", { method: "POST", credentials: "include" });
        if (guest.ok) token = (await guest.json()).accessToken || null;
      }
      if (!token) {
        send({ type: "chat-watch", token: null });
        return;
      }
      var staff = false;
      var rooms = [];
      var admin = await fetch("/api/admin/chat/rooms?page=1&pageSize=50", { credentials: "include", cache: "no-store" });
      if (admin.ok) {
        staff = true;
        var page = await admin.json();
        rooms = (page.items || []).map(function (room) { return room.id; }).filter(Boolean);
      } else {
        var mine = await fetch("/api/chat/rooms", { credentials: "include", cache: "no-store" });
        if (mine.ok) {
          var list = await mine.json();
          rooms = (Array.isArray(list) ? list : []).map(function (room) { return room.id; }).filter(Boolean);
        }
      }
      send({ type: "chat-watch", token: token, staff: staff, rooms: rooms });
    } catch (error) {}
  }
  setTimeout(sync, 4000);
  setInterval(sync, 60000);
})();
true;
`;

const bubbles = NativeModules.ChatBubbles as
  | {
      canDrawOverlays: () => Promise<boolean>;
      askOverlayPermission: () => void;
      start: (token: string, staff: boolean, rooms: string[], origin: string, scheme: string) => void;
      stop: () => void;
    }
  | undefined;

function safeInsetsScript(top: number, bottom: number) {
  return `
(function () {
  var root = document.documentElement;
  root.style.setProperty("--app-safe-top", ${JSON.stringify(`${top}px`)});
  root.style.setProperty("--app-safe-bottom", ${JSON.stringify(`${bottom}px`)});
})();
true;
`;
}

async function onChatWatch(raw: string, askedOverlay: { current: boolean }) {
  if (!bubbles) return;
  let payload: { type?: string; token?: string | null; staff?: boolean; rooms?: string[] } | null = null;
  try {
    payload = JSON.parse(raw) as { type?: string; token?: string | null; staff?: boolean; rooms?: string[] };
  } catch {
    return;
  }
  if (!payload || payload.type !== "chat-watch") return;
  if (!payload.token) {
    bubbles.stop();
    return;
  }
  if (!askedOverlay.current) {
    askedOverlay.current = true;
    const allowed = await bubbles.canDrawOverlays();
    if (!allowed) bubbles.askOverlayPermission();
  }
  bubbles.start(payload.token, Boolean(payload.staff), payload.rooms ?? [], siteUrl, brand.scheme);
}

function allowedWebUrl(value: string) {
  return /^https?:/i.test(value) || value.startsWith("about:") || value.startsWith("blob:") || value.startsWith("data:");
}

function pageFromLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const host = url.host.toLowerCase();
      const siteHost = new URL(siteUrl).host.toLowerCase();
      const ours = host === siteHost || host === brand.host || host === `www.${brand.host}`;
      return ours ? value : null;
    }
    if (url.protocol === `${brand.scheme}:`) {
      const path = `${url.host}${url.pathname}${url.search}`.replace(/^\/+/, "");
      return path ? `${siteUrl}/${path}` : siteUrl;
    }
  } catch {
    return null;
  }
  return null;
}

function Shell() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView<NonNullable<unknown>>>(null);
  const canGoBack = useRef(false);
  const revealed = useRef(false);
  const askedOverlay = useRef(false);
  const [pageUrl, setPageUrl] = useState(siteUrl);
  const [failed, setFailed] = useState(false);
  const source = useMemo(() => ({ uri: pageUrl }), [pageUrl]);
  const insetScript = useMemo(
    () => safeInsetsScript(Math.round(insets.top), Math.round(insets.bottom)),
    [insets.top, insets.bottom],
  );

  function reveal() {
    if (revealed.current) return;
    revealed.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }

  useEffect(() => {
    reveal();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const next = pageFromLink(url);
      if (next) setPageUrl(next);
    });
    const subscription = Linking.addEventListener("url", (event) => {
      const next = pageFromLink(event.url);
      if (next) setPageUrl(next);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    webRef.current?.injectJavaScript(insetScript);
  }, [insetScript, pageUrl]);

  return (
    <View style={styles.root}>
      <StatusBar style="auto" />
      {Platform.OS === "android" ? <NavigationBar style="auto" /> : null}
      <WebView<NonNullable<unknown>>
        ref={webRef}
        source={source}
        style={styles.web}
        androidLayerType="hardware"
        cacheEnabled
        applicationNameForUserAgent={brand.token}
        injectedJavaScriptBeforeContentLoaded={BOOT}
        injectedJavaScript={WATCH}
        onMessage={(event) => {
          void onChatWatch(event.nativeEvent.data, askedOverlay);
        }}
        pullToRefreshEnabled
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={["*"]}
        onNavigationStateChange={(state: WebViewNavigation) => {
          canGoBack.current = state.canGoBack;
        }}
        onLoad={() => {
          setFailed(false);
          webRef.current?.injectJavaScript(insetScript);
          reveal();
        }}
        onError={() => {
          setFailed(true);
          reveal();
        }}
        onShouldStartLoadWithRequest={(request) => {
          if (allowedWebUrl(request.url)) return true;
          Linking.openURL(request.url).catch(() => {});
          return false;
        }}
      />
      {failed ? (
        <View style={styles.error}>
          <Text style={styles.errorTitle}>{brand.name} did not open</Text>
          <Text style={styles.errorBody}>Check the connection, then try again.</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              setFailed(false);
              webRef.current?.reload();
            }}
          >
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  web: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  error: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 24,
    backgroundColor: "#01131A",
  },
  errorTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "700",
  },
  errorBody: {
    color: "#94A3B8",
    fontSize: 15,
    textAlign: "center",
  },
  retry: {
    marginTop: 12,
    backgroundColor: "#26BFB0",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryLabel: {
    color: "#042F2E",
    fontWeight: "700",
  },
});
