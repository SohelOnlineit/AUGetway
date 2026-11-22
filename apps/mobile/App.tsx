import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import { AppState, Dimensions, Keyboard, Linking, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { askBattery, batteryIgnored, batteryLevel, clearSynced, listRecentSms, rememberSynced, setSmsSync, smsReady, startKeepAlive, stopKeepAlive, syncedKeys, type PaymentSms } from "uniqpay-sms";
import { DEFAULT_SENDERS, keepMessage, senderLabel, shouldUpload, type InboxRules, type Sender } from "./inbox-rules";
import { SERVICES, emptyBooks, formatTaka, mergeRemote, normalizeBook, parseTaka, setBalance, type Books, type Service } from "./ledger";

const DESK = "https://pay.uniqbd.com/api";

function pulsePayload(uid: string, label: string) {
  const battery = batteryLevel();
  return JSON.stringify({
    uid,
    label: label.trim() || "UniqBD handset",
    model: "Android",
    ...(battery === null ? {} : { battery }),
  });
}

type Handset = { id: string; uid: string; label: string; simSlot: number; lastSeenAt: string | null };

async function readStore(key: string) {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeStore(key: string, value: string) {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // The sign-in still works for this session if the phone cannot store secrets.
  }
}

async function clearStore(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing stored.
  }
}

function deviceUid() {
  return `uq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function problem(data: { message?: string | string[] }, fallback: string) {
  if (Array.isArray(data.message)) return data.message.join(", ");
  return data.message || fallback;
}

type SyncState = "pending" | "synced" | "failed";
type InboxItem = PaymentSms & { key: string; status: SyncState; wallet: string };
type Tab = "home" | "filters" | "balances" | "settings";
type ListFilter = "all" | SyncState;

function dayKey(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function longDay(time: number) {
  return new Date(time).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" });
}

function shortDay(time: number) {
  return new Date(time).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "long" });
}

function stamp(time: number) {
  const date = new Date(time);
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const clock = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `${day} at ${clock}`;
}

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showName = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideName = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showName, (event) => {
      const covered = Math.round(Dimensions.get("window").height - event.endCoordinates.screenY);
      setHeight(covered > 0 ? covered : 0);
    });
    const hide = Keyboard.addListener(hideName, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

function reveal(scroll: ScrollViewInstance | null, node: number) {
  if (!scroll || !node) return;
  const view = scroll as ScrollViewInstance & {
    scrollResponderScrollNativeHandleToKeyboard?: (handle: number, extra: number, preventNegative: boolean) => void;
  };
  setTimeout(() => {
    if (view.scrollResponderScrollNativeHandleToKeyboard) {
      view.scrollResponderScrollNativeHandleToKeyboard(node, 140, true);
      return;
    }
    view.scrollToEnd({ animated: true });
  }, 80);
}

function Field({ scroll, ...props }: ComponentProps<typeof TextInput> & { scroll: RefObject<ScrollViewInstance | null> }) {
  return (
    <TextInput
      {...props}
      onFocus={(event) => {
        props.onFocus?.(event);
        const node = typeof event.nativeEvent.target === "number" ? event.nativeEvent.target : 0;
        reveal(scroll.current, node);
      }}
    />
  );
}

async function smsAllowed() {
  if (Platform.OS !== "android") return false;
  const read = await PermissionsAndroid.check("android.permission.READ_SMS");
  const send = await PermissionsAndroid.check("android.permission.SEND_SMS");
  return read && send;
}

async function allowSms() {
  if (Platform.OS !== "android") return false;
  await PermissionsAndroid.requestMultiple([
    "android.permission.READ_SMS",
    "android.permission.SEND_SMS",
    "android.permission.READ_PHONE_STATE",
  ]);
  return smsAllowed();
}

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Shown only after the desk says this account also needs the code from an authenticator app.
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("UniqBD handset");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [books, setBooks] = useState<Books>(emptyBooks());
  const [amounts, setAmounts] = useState<Record<Service, string>>({ bkash: "", nagad: "", rocket: "", upay: "" });
  const booksRef = useRef<Books>(emptyBooks());
  const balancing = useRef(false);
  const [balanceOn, setBalanceOn] = useState(true);
  const checkRef = useRef(true);
  const checkWrite = useRef(0);
  const checkSeen = useRef(0);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [senders, setSenders] = useState<Sender[]>(DEFAULT_SENDERS);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [whitelistOn, setWhitelistOn] = useState(true);
  const [cloudSync, setCloudSync] = useState(true);
  const [cleanDays, setCleanDays] = useState(0);
  const [smsPerm, setSmsPerm] = useState(false);
  const [batteryOn, setBatteryOn] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [keywordDraft, setKeywordDraft] = useState("");
  const [panel, setPanel] = useState<"clean" | "keywords" | null>(null);
  const [settingsReady, setSettingsReady] = useState(false);
  const rulesRef = useRef<InboxRules>({ whitelistOn: true, senders: DEFAULT_SENDERS, keywords: [], cleanDays: 0 });
  const cloudRef = useRef(true);
  rulesRef.current = { whitelistOn, senders, keywords, cleanDays };
  booksRef.current = books;

  useEffect(() => {
    setAmounts((current) => {
      let changed = false;
      const next = { ...current };
      for (const service of SERVICES) {
        const cents = books[service].cents;
        if (cents === null) continue;
        const text = formatTaka(cents);
        if (next[service] === text) continue;
        next[service] = text;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [books]);
  cloudRef.current = cloudSync;
  const statusRef = useRef<Record<string, SyncState>>({});
  const [note, setNote] = useState("Sign in with the same account you use on the desk.");
  const seenSms = useRef(new Set<string>());
  const work = useRef(false);
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const loginScroll = useRef<ScrollViewInstance>(null);
  const pageScroll = useRef<ScrollViewInstance>(null);
  const nameRef = useRef(name);
  const tokenRef = useRef(token);
  const uidRef = useRef(uid);
  nameRef.current = name;
  tokenRef.current = token;
  uidRef.current = uid;

  useEffect(() => {
    Promise.all([
      readStore("uniqpay_senders"),
      readStore("uniqpay_keywords"),
      readStore("uniqpay_whitelist"),
      readStore("uniqpay_cloud"),
      readStore("uniqpay_clean"),
    ]).then(([savedSenders, savedKeywords, savedWhitelist, savedCloud, savedClean]) => {
      if (savedSenders) {
        try {
          const parsed = JSON.parse(savedSenders) as Sender[];
          if (Array.isArray(parsed) && parsed.every((row) => typeof row?.name === "string" && typeof row?.enabled === "boolean")) {
            const known = new Set(parsed.map((row) => row.name.toLowerCase()));
            const next = [...parsed, ...DEFAULT_SENDERS.filter((row) => !known.has(row.name.toLowerCase()))].slice(0, 40);
            rulesRef.current = { ...rulesRef.current, senders: next };
            setSenders(next);
          }
        } catch {
          // Keep the built-in sender list.
        }
      }
      if (savedKeywords) {
        try {
          const parsed = JSON.parse(savedKeywords) as string[];
          if (Array.isArray(parsed)) {
            const next = parsed.filter((word) => typeof word === "string").slice(0, 40);
            rulesRef.current = { ...rulesRef.current, keywords: next };
            setKeywords(next);
          }
        } catch {
          // Keep an empty keyword list.
        }
      }
      if (savedWhitelist === "0") setWhitelistOn(false);
      if (savedCloud === "0") setCloudSync(false);
      if (savedClean === "7" || savedClean === "30") setCleanDays(Number(savedClean));
      cloudRef.current = savedCloud !== "0";
      rulesRef.current = {
        whitelistOn: savedWhitelist !== "0",
        senders: rulesRef.current.senders,
        keywords: rulesRef.current.keywords,
        cleanDays: savedClean === "7" || savedClean === "30" ? Number(savedClean) : 0,
      };
      setSettingsReady(true);
      publishRules();
    });
    void refreshDevice();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void refreshDevice();
      const savedToken = tokenRef.current;
      const savedUid = uidRef.current;
      if (!savedToken || !savedUid || Platform.OS !== "android") return;
      try {
        startKeepAlive(DESK, savedToken, savedUid, nameRef.current.trim() || "UniqBD handset");
      } catch {
        // Expo Go has no background watch.
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    void readStore("uniqpay_balance_check").then((saved) => {
      if (checkWrite.current !== checkSeen.current) return;
      const on = saved !== "0";
      checkRef.current = on;
      setBalanceOn(on);
    });
    void readStore("uniqpay_books").then((saved) => {
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved) as Books;
        if (parsed?.bkash && parsed?.nagad && parsed?.rocket && parsed?.upay) {
          const next = emptyBooks();
          for (const service of SERVICES) next[service] = normalizeBook(parsed[service]);
          booksRef.current = next;
          setBooks(next);
        }
      } catch {
        // A new balance entry starts empty.
      }
    });
  }, []);

  async function storeBooks(next: Books) {
    booksRef.current = next;
    setBooks(next);
    await writeStore("uniqpay_books", JSON.stringify(next));
  }

  async function toggleBalanceCheck() {
    if (!token || !uid) return;
    const next = !checkRef.current;
    const stamp = ++checkWrite.current;
    checkRef.current = next;
    setBalanceOn(next);
    await writeStore("uniqpay_balance_check", next ? "1" : "0");
    try {
      const saved = await fetch(`${DESK}/handset/balance-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid, on: next }),
      });
      if (checkWrite.current !== stamp) return;
      if (!saved.ok) throw new Error("Could not save");
      checkSeen.current = stamp;
      setNote(next ? "Realtime balance check is on" : "Realtime balance check is off");
    } catch {
      if (checkWrite.current !== stamp) return;
      checkRef.current = !next;
      setBalanceOn(!next);
      checkSeen.current = stamp;
      await writeStore("uniqpay_balance_check", next ? "0" : "1");
      setNote("Could not save the balance check");
    }
  }

  async function saveBalance(service: Service) {
    const cents = parseTaka(amounts[service]);
    if (cents === null) {
      setNote("Enter the balance like 101 or 101.50");
      return;
    }
    if (!token || !uid) return;
    const kind = booksRef.current[service].cents === null ? "initial" : "manual";
    const nextBook = setBalance(booksRef.current[service], cents, kind, new Date().toISOString());
    if (!nextBook) return;
    setBusy(true);
    try {
      const response = await fetch(`${DESK}/handset/balances`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, service, balanceCents: cents, kind }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string | string[] };
      if (!response.ok) {
        setNote(problem(data, "Could not save the balance"));
        return;
      }
      await storeBooks({ ...booksRef.current, [service]: nextBook });
      setNote(`${service} balance saved`);
    } catch {
      setNote("Could not save the balance");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token || !uid) return;
    let stop = false;
    const run = async () => {
      if (balancing.current || AppState.currentState !== "active") return;
      balancing.current = true;
      try {
        const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
        const listed = await fetch(`${DESK}/handset/balances?uid=${encodeURIComponent(uid)}`, { headers });
        if (listed.status === 401) {
          if (!stop) void signOut();
          return;
        }
        if (listed.ok) {
          const data = (await listed.json()) as { balanceCheck?: boolean; services?: Record<string, { cents?: number | null; trx?: string[] }> };
          if (checkWrite.current === checkSeen.current && typeof data.balanceCheck === "boolean") {
            checkRef.current = data.balanceCheck;
            setBalanceOn(data.balanceCheck);
            void writeStore("uniqpay_balance_check", data.balanceCheck ? "1" : "0");
          }
          const remote: Partial<Record<Service, { cents: number | null; trx: string[] }>> = {};
          for (const service of SERVICES) {
            const row = data.services?.[service];
            if (!row) continue;
            remote[service] = {
              cents: typeof row.cents === "number" ? row.cents : null,
              trx: Array.isArray(row.trx) ? row.trx.filter((item) => typeof item === "string") : [],
            };
          }
          const merged = mergeRemote(booksRef.current, remote);
          if (JSON.stringify(merged) !== JSON.stringify(booksRef.current)) await storeBooks(merged);
        }
      } catch {
        // The next poll tries the same pending order again.
      } finally {
        balancing.current = false;
      }
    };
    void run();
    const timer = setInterval(() => void run(), 10000);
    const watch = AppState.addEventListener("change", (next) => {
      if (next === "active") void run();
    });
    return () => {
      stop = true;
      clearInterval(timer);
      watch.remove();
    };
  }, [token, uid]);

  useEffect(() => {
    Promise.all([readStore("uniqpay_token"), readStore("uniqpay_uid"), readStore("uniqpay_name")]).then(
      ([savedToken, savedUid, savedName]) => {
        if (savedName) setName(savedName);
        const nextUid = savedUid || deviceUid();
        setUid(nextUid);
        if (!savedUid) void writeStore("uniqpay_uid", nextUid);
        if (savedToken) setToken(savedToken);
      },
    );
  }, []);

  useEffect(() => {
    if (!token || !uid) return;
    let stop = false;
    let synced = false;
    const beat = async () => {
      try {
        const response = await fetch(`${DESK}/handset/pulse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: pulsePayload(uid, nameRef.current),
        });
        const data = (await response.json()) as { id?: string; message?: string | string[] };
        if (response.status === 401) {
          if (!stop) void signOut();
          return;
        }
        if (!response.ok || !data.id) {
          if (!stop) setNote(problem(data, "Could not reach the desk."));
          return;
        }
        if (synced) return;
        const list = await fetch(`${DESK}/desk/handsets`, { headers: { Authorization: `Bearer ${token}` } });
        if (!list.ok) return;
        const rows = (await list.json()) as Handset[];
        const mine = rows.find((row) => row.uid === uid);
        if (mine && !stop) {
          synced = true;
          setName(mine.label);
        }
      } catch {
        if (!stop) setNote("Could not reach the desk. Check the desk URL.");
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), 20000);
    let watch = false;
    const arm = async () => {
      if (Platform.OS !== "android") return;
      if (Number(Platform.Version) >= 33) {
        try {
          await PermissionsAndroid.request("android.permission.POST_NOTIFICATIONS");
        } catch {
          // The watch still starts. Android may hide its notification.
        }
      }
      if (watch) return;
      try {
        startKeepAlive(DESK, token, uid, nameRef.current.trim() || "UniqBD handset");
      } catch {
        // Expo Go has no background watch.
      }
      try {
        // Website SMS is sent from this phone, so it needs the send permission without a manual tap.
        if (!(await smsAllowed())) {
          await allowSms();
          if (!stop) setSmsPerm(await smsAllowed());
        }
      } catch {
        // The Allow SMS switch on the Home tab asks again.
      }
      try {
        if (!batteryIgnored()) askBattery();
      } catch {
        // The phone stays online only while Android lets this app run.
      }
    };
    void arm();
    return () => {
      stop = true;
      watch = true;
      clearInterval(timer);
    };
  }, [token, uid]);

  async function signIn() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`${DESK}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, client: "handset", ...(code.trim() ? { code: code.trim() } : {}) }),
      });
      const data = (await response.json()) as { accessToken?: string; message?: string | string[] };
      if (!response.ok || !data.accessToken) {
        if (data.message === "TWO_FACTOR_REQUIRED") {
          setNeedCode(true);
          setNote("Enter the 6-digit code from your authenticator app.");
          return;
        }
        setNote(problem(data, "Sign in failed"));
        return;
      }
      setPassword("");
      setCode("");
      setNeedCode(false);
      await writeStore("uniqpay_token", data.accessToken);
      await writeStore("uniqpay_name", name.trim() || "UniqBD handset");
      setToken(data.accessToken);
      setNote(smsReady ? "This phone is online. Website SMS goes out from here, and payment SMS syncs to the desk." : "Sign-in worked. SMS needs the AU-Getway Android app.");
    } catch {
      setNote("Could not reach the desk. Check the desk URL and your internet connection.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshDevice() {
    if (Platform.OS !== "android") return;
    setSmsPerm(await smsAllowed());
    try {
      setBatteryOn(batteryIgnored());
    } catch {
      setBatteryOn(false);
    }
  }

  function saveSenders(next: Sender[]) {
    setSenders(next);
    rulesRef.current = { ...rulesRef.current, senders: next };
    void writeStore("uniqpay_senders", JSON.stringify(next));
    publishRules();
  }

  function saveKeywords(next: string[]) {
    setKeywords(next);
    rulesRef.current = { ...rulesRef.current, keywords: next };
    void writeStore("uniqpay_keywords", JSON.stringify(next));
    publishRules();
  }

  function addSender() {
    const name = draft.trim();
    if (name.length < 2 || name.length > 40) {
      setNote("Sender name must be 2 to 40 characters.");
      return;
    }
    if (senders.some((sender) => sender.name.toLowerCase() === name.toLowerCase())) {
      setNote("That sender is already in the list.");
      return;
    }
    saveSenders([...senders, { name, enabled: true }]);
    setDraft("");
    setAdding(false);
    setNote("");
  }

  function addKeyword() {
    const word = keywordDraft.trim();
    if (word.length < 3 || word.length > 40) {
      setNote("A keyword must be 3 to 40 characters.");
      return;
    }
    if (keywords.some((item) => item.toLowerCase() === word.toLowerCase())) {
      setNote("That keyword is already ignored.");
      return;
    }
    saveKeywords([...keywords, word]);
    setKeywordDraft("");
    setNote("");
  }

  async function toggleSmsPermission() {
    if (smsPerm) {
      await Linking.openSettings();
      return;
    }
    const granted = await allowSms();
    setSmsPerm(granted);
    if (!granted) {
      setNote("Allow both Read SMS and Send SMS. Website messages cannot go out without Send SMS.");
      await Linking.openSettings();
    }
  }

  function toggleBattery() {
    try {
      askBattery();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not open battery settings.");
    }
  }

  function publishRules() {
    const rules = rulesRef.current;
    try {
      setSmsSync({
        enabled: cloudRef.current,
        senders: rules.senders.filter((row) => row.enabled).map((row) => row.name),
        keywords: rules.keywords,
        cleanDays: rules.cleanDays,
      });
    } catch {
      // Expo Go has no background sync.
    }
  }

  async function uploadPending(rows: InboxItem[]) {
    const pending = rows.filter((row) => row.status !== "synced" && shouldUpload(row, rulesRef.current.senders) && !seenSms.current.has(row.key));
    if (!pending.length || !token) return;
    const saved = new Set<string>();
    for (let index = 0; index < pending.length; index += 20) {
      const chunk = pending.slice(index, index + 20);
      let done: string[] = [];
      try {
        const response = await fetch(`${DESK}/handset/notices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            uid,
            messages: chunk.map((row) => ({ body: row.body, sender: row.address, receivedKey: row.key })),
          }),
        });
        if (response.status === 401) {
          void signOut();
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as { results?: { receivedKey?: string; ok?: boolean }[] };
          done = (data.results ?? []).filter((row) => row.ok && row.receivedKey).map((row) => row.receivedKey as string);
        } else if (response.status === 404) {
          const single = await Promise.all(chunk.map(async (row) => {
            const one = await fetch(`${DESK}/handset/notice`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ uid, body: row.body, sender: row.address, receivedKey: row.key }),
            });
            if (one.status === 401) return "unauthorized";
            return one.ok ? row.key : "";
          }));
          if (single.includes("unauthorized")) {
            void signOut();
            return;
          }
          done = single.filter((key) => key && key !== "unauthorized");
        }
      } catch {
        done = [];
      }
      done.forEach((key) => saved.add(key));
      chunk.forEach((row) => {
        const status: SyncState = saved.has(row.key) ? "synced" : "failed";
        statusRef.current[row.key] = status;
        if (status === "synced") seenSms.current.add(row.key);
      });
    }
    if (saved.size) {
      try {
        rememberSynced([...saved]);
      } catch {
        // The next open reads the desk again.
      }
    }
    setItems((current) => current.map((item) => (statusRef.current[item.key] ? { ...item, status: statusRef.current[item.key] } : item)));
  }

  async function readInbox(submitNew: boolean, manual = false) {
    if (work.current) return;
    work.current = true;
    setBusy(true);
    try {
    if (!manual) setBusy(false);
    if (!smsReady) {
      if (manual) setNote("SMS reading needs the AU-Getway Android app, not Expo Go.");
      return;
    }
    const alreadyAllowed = Platform.OS === "android" && (await PermissionsAndroid.check("android.permission.READ_SMS"));
    if (Platform.OS === "android") setSmsPerm(await smsAllowed());
    if (!alreadyAllowed) {
      if (!manual || !(await allowSms())) {
        if (manual) setNote("Allow SMS permission to read payment messages.");
        return;
      }
    }
    try {
      publishRules();
      let known: string[] = [];
      try {
        known = syncedKeys();
      } catch {
        known = [];
      }
      known.forEach((key) => {
        statusRef.current[key] = "synced";
        seenSms.current.add(key);
      });
      const rows = await listRecentSms(60);
      const rules = rulesRef.current;
      const now = Date.now();
      const kept = rows.filter((row) => keepMessage(row, rules, now));
      const next = kept.map((row) => {
        const key = `${row.receivedAt}:${row.trxId}:${row.address}`.slice(0, 80);
        return { ...row, key, wallet: senderLabel(row.address, row.body, rules.senders), status: statusRef.current[key] ?? "pending" };
      });
      setItems(next);
      if (kept.length === 0) {
        if (manual) setNote(rows.length === 0 ? "No SMS found on this phone." : "No SMS matched the whitelist, keywords, or cleaning window.");
        return;
      }
      if (!submitNew) return;
      await uploadPending(next);
      if (manual) {
        const synced = next.filter((row) => statusRef.current[row.key] === "synced").length;
        setNote(synced ? `${synced} payment messages are synced.` : "No new payment message to sync.");
      }
    } catch (cause) {
      if (manual) setNote(cause instanceof Error ? cause.message : "Could not read payment SMS");
    }
    } finally {
      work.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token || !smsReady || !settingsReady) return;
    const tick = () => void readInbox(cloudRef.current);
    void tick();
    const timer = setInterval(tick, 20000);
    return () => clearInterval(timer);
  }, [token, smsReady, settingsReady]);

  async function signOut() {
    try {
      stopKeepAlive();
    } catch {
      // Expo Go has no background watch.
    }
    try {
      clearSynced();
    } catch {
      // Expo Go keeps no synced list.
    }
    await clearStore("uniqpay_token");
    setToken(null);
    setNote("Signed out. This phone's saved messages stay on the desk.");
  }

  const visible = items.filter((item) => listFilter === "all" || item.status === listFilter);
  const counts = {
    total: items.length,
    synced: items.filter((item) => item.status === "synced").length,
    pending: items.filter((item) => item.status === "pending").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
  const chartMax = Math.max(1, counts.total);
  const groups: { day: string; rows: InboxItem[] }[] = [];
  for (const item of visible) {
    const day = dayKey(item.receivedAt || Date.now());
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(item);
    else groups.push({ day, rows: [item] });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: keyboard }]}>
      <StatusBar style="light" />
      {token ? (
        <>
          <View style={styles.top}>
            <View style={styles.logo}><Text style={styles.logoText}>U</Text></View>
            <Pressable onPress={() => void signOut()} hitSlop={10}><Text style={styles.logout}>↗</Text></Pressable>
          </View>
          {tab === "home" ? (
            <ScrollView style={styles.fill} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.profile}>
                <View style={styles.profileText}>
                  <Text style={styles.profileDate}>{shortDay(Date.now())}</Text>
                  <Text style={styles.profileName}>{name.trim() || "Admin"}</Text>
                </View>
                <Pressable style={[styles.sync, busy && styles.disabled]} disabled={busy} onPress={() => void readInbox(true, true)}>
                  <Text style={styles.syncText}>↻  Sync</Text>
                </Pressable>
              </View>
              <View style={styles.tabs}>
                {(["all", "pending", "synced", "failed"] as const).map((value) => (
                  <Pressable key={value} style={styles.tab} onPress={() => setListFilter(value)}>
                    <Text style={[styles.tabText, listFilter === value && styles.tabTextOn]}>{value === "all" ? "All" : value[0].toUpperCase() + value.slice(1)}</Text>
                    {listFilter === value ? <View style={styles.tabLine} /> : null}
                  </Pressable>
                ))}
              </View>
              {note ? <Text style={styles.note}>{note}</Text> : null}
              {groups.length === 0 ? <Text style={styles.empty}>No messages in this list.</Text> : null}
              {groups.map((group) => (
                <View key={group.day}>
                  <Text style={styles.day}>{longDay(group.rows[0].receivedAt || Date.now())}</Text>
                  {group.rows.map((row) => (
                    <View key={row.key} style={styles.sms}>
                      <View style={styles.smsHead}>
                        <Text style={styles.smsTitle}>{row.wallet}</Text>
                        <View style={[styles.pill, row.status === "synced" ? styles.pillOn : row.status === "failed" ? styles.pillBad : styles.pillWait]}>
                          <Text style={styles.pillText}>{row.status === "synced" ? "Synced" : row.status === "failed" ? "Failed" : "Pending"}</Text>
                        </View>
                      </View>
                      <Text style={styles.smsBody} numberOfLines={2}>{row.body}</Text>
                      <Text style={styles.smsWhen}>{stamp(row.receivedAt || Date.now())}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : null}
          {tab === "filters" ? (
            <ScrollView ref={pageScroll} style={styles.fill} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.headRow}>
                <Text style={styles.pageTitle}>Whitelist Senders</Text>
                <View style={styles.headActions}>
                  <Pressable onPress={() => void readInbox(cloudSync, true)} hitSlop={8}><Text style={styles.refresh}>↻</Text></Pressable>
                  <Pressable style={styles.add} onPress={() => setAdding((open) => !open)}><Text style={styles.addText}>+ Add</Text></Pressable>
                </View>
              </View>
              {adding ? (
                <View style={styles.addRow}>
                  <Field scroll={pageScroll} style={[styles.input, styles.addInput]} value={draft} onChangeText={setDraft} placeholder="Sender name" placeholderTextColor="#94a3b8" maxLength={40} />
                  <Pressable style={styles.button} onPress={addSender}><Text style={styles.buttonText}>Save</Text></Pressable>
                </View>
              ) : null}
              {note ? <Text style={styles.note}>{note}</Text> : null}
              {senders.map((sender) => (
                <View key={sender.name} style={styles.sender}>
                  <View style={styles.senderText}>
                    <Text style={styles.senderName}>{sender.name}</Text>
                    <Text style={styles.senderHint}>{sender.enabled ? "Status enabled - syncing transactions" : "Status disabled - not syncing"}</Text>
                  </View>
                  <Switch on={sender.enabled} onPress={() => saveSenders(senders.map((item) => item.name === sender.name ? { ...item, enabled: !item.enabled } : item))} />
                </View>
              ))}
            </ScrollView>
          ) : null}
          {tab === "settings" ? (
            <ScrollView ref={pageScroll} style={styles.fill} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.chart}>
                <View style={styles.plot}>
                  {[
                    ["Total", counts.total, "#26bfb0"],
                    ["Synced", counts.synced, "#059669"],
                    ["Pending", counts.pending, "#b45309"],
                    ["Failed", counts.failed, "#e11d48"],
                  ].map(([label, count, color]) => (
                    <View key={String(label)} style={styles.barCol}>
                      <View style={[styles.bar, { height: Number(count) === 0 ? 0 : Math.max(8, (Number(count) / chartMax) * 120), backgroundColor: String(color) }]} />
                      <Text style={styles.barLabel}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
              {panel === "clean" ? (
                <>
                  <Pressable onPress={() => setPanel(null)}><Text style={styles.back}>‹ SMS Cleaning Setting</Text></Pressable>
                  {[
                    [0, "Keep every message"],
                    [7, "Hide messages older than 7 days"],
                    [30, "Hide messages older than 30 days"],
                  ].map(([days, label]) => (
                    <Pressable key={String(days)} style={[styles.choice, cleanDays === days && styles.choiceOn]} onPress={() => { const next = Number(days); setCleanDays(next); rulesRef.current = { ...rulesRef.current, cleanDays: next }; void writeStore("uniqpay_clean", String(days)); publishRules(); }}>
                      <Text style={styles.choiceText}>{label}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {panel === "keywords" ? (
                <>
                  <Pressable onPress={() => setPanel(null)}><Text style={styles.back}>‹ Ignore Keywords</Text></Pressable>
                  <View style={styles.addRow}>
                    <Field scroll={pageScroll} style={[styles.input, styles.addInput]} value={keywordDraft} onChangeText={setKeywordDraft} placeholder="Keyword" placeholderTextColor="#94a3b8" maxLength={40} />
                    <Pressable style={styles.button} onPress={addKeyword}><Text style={styles.buttonText}>Add</Text></Pressable>
                  </View>
                  {keywords.length === 0 ? <Text style={styles.hint}>No keyword is ignored. A message that contains one is not synced.</Text> : null}
                  {keywords.map((word) => (
                    <View key={word} style={styles.sender}>
                      <Text style={styles.senderName}>{word}</Text>
                      <Pressable onPress={() => saveKeywords(keywords.filter((item) => item !== word))}><Text style={styles.remove}>Remove</Text></Pressable>
                    </View>
                  ))}
                </>
              ) : null}
              {panel === null ? (
                <>
                  <Text style={styles.sectionLabel}>STORAGE</Text>
                  <Pressable style={styles.menuRow} onPress={() => setPanel("clean")}>
                    <Text style={styles.menuText}>SMS Cleaning Setting</Text>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                  <Text style={styles.sectionLabel}>Filtering</Text>
                  <Pressable style={styles.menuRow} onPress={() => setPanel("keywords")}>
                    <Text style={styles.menuText}>Ignore Keywords</Text>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                  <Text style={styles.sectionLabel}>CORE SETTINGS</Text>
                  <View style={styles.core}>
                    <View style={styles.coreRow}>
                      <Text style={styles.menuText}>Realtime balance check</Text>
                      <Switch on={balanceOn} onPress={() => void toggleBalanceCheck()} />
                    </View>
                    <View style={styles.coreRow}>
                      <Text style={styles.menuText}>Whitelist Sender Validation</Text>
                      <Switch on={whitelistOn} onPress={() => { const next = !whitelistOn; setWhitelistOn(next); void writeStore("uniqpay_whitelist", next ? "1" : "0"); }} />
                    </View>
                    <View style={styles.coreRow}>
                      <Text style={styles.menuText}>Battery Optimization Disabled</Text>
                      <Switch on={batteryOn} onPress={toggleBattery} />
                    </View>
                    <View style={styles.coreRow}>
                      <Text style={styles.menuText}>Read SMS Permissions Enabled</Text>
                      <Switch on={smsPerm} onPress={() => void toggleSmsPermission()} />
                    </View>
                    <View style={[styles.coreRow, styles.coreLast]}>
                      <Text style={styles.menuText}>Cloud Sync Enabled</Text>
                      <Switch on={cloudSync} onPress={() => { const next = !cloudSync; setCloudSync(next); cloudRef.current = next; void writeStore("uniqpay_cloud", next ? "1" : "0"); publishRules(); }} />
                    </View>
                  </View>
                </>
              ) : null}
              {note ? <Text style={styles.note}>{note}</Text> : null}
            </ScrollView>
          ) : null}
          {tab === "balances" ? (
            <ScrollView ref={pageScroll} style={styles.fill} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.pageTitle}>Wallet balances</Text>
              <View style={styles.core}>
                <View style={[styles.coreRow, styles.coreLast]}>
                  <Text style={styles.menuText}>Realtime balance check</Text>
                  <Switch on={balanceOn} onPress={() => void toggleBalanceCheck()} />
                </View>
              </View>
              <Text style={styles.hint}>{balanceOn ? "On. The website approves a payment only when the SMS balance equals this saved balance plus the payment." : "Off. The website can approve a payment without matching the saved balance."}</Text>
              {note ? <Text style={styles.note}>{note}</Text> : null}
              {SERVICES.map((service) => (
                <View key={service} style={styles.sms}>
                  <Text style={styles.smsTitle}>{service}</Text>
                  <Text style={styles.smsBody}>Current {books[service].cents === null ? "not set" : `${formatTaka(books[service].cents)} BDT`}</Text>
                  <Field scroll={pageScroll} style={styles.input} value={amounts[service]} onChangeText={(value) => setAmounts((current) => ({ ...current, [service]: value }))} keyboardType="decimal-pad" placeholder="101.00" placeholderTextColor="#94a3b8" />
                  <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void saveBalance(service)}>
                    <Text style={styles.buttonText}>{books[service].cents === null ? "Set balance" : "Update balance"}</Text>
                  </Pressable>
                  {books[service].events.slice(-3).reverse().map((event) => (
                    <Text key={`${event.at}-${event.kind}-${event.trxId}`} style={styles.smsWhen}>{event.kind} {formatTaka(event.cents)}{event.trxId ? ` · ${event.trxId}` : ""}{event.note ? ` · ${event.note}` : ""}</Text>
                  ))}
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={[styles.nav, { paddingBottom: 12 + (keyboard > 0 ? 0 : insets.bottom) }]}>
            <Pressable style={styles.navItem} onPress={() => setTab("home")}>
              <Text style={[styles.navIcon, tab === "home" && styles.navOn]}>⌂</Text>
              <Text style={[styles.navLabel, tab === "home" && styles.navOn]}>Dashboard</Text>
            </Pressable>
            <Pressable style={styles.navItem} onPress={() => setTab("filters")}>
              <Text style={[styles.navIcon, tab === "filters" && styles.navOn]}>⇅</Text>
              <Text style={[styles.navLabel, tab === "filters" && styles.navOn]}>Filters</Text>
            </Pressable>
            <Pressable style={styles.navItem} onPress={() => setTab("balances")}>
              <Text style={[styles.navIcon, tab === "balances" && styles.navOn]}>৳</Text>
              <Text style={[styles.navLabel, tab === "balances" && styles.navOn]}>Balance</Text>
            </Pressable>
            <Pressable style={styles.navItem} onPress={() => setTab("settings")}>
              <Text style={[styles.navIcon, tab === "settings" && styles.navOn]}>⚙</Text>
              <Text style={[styles.navLabel, tab === "settings" && styles.navOn]}>Settings</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <ScrollView ref={loginScroll} style={styles.fill} contentContainerStyle={[styles.scroll, { paddingBottom: 28 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}><Text style={styles.logoText}>U</Text></View>
          <Text style={styles.pageTitle}>Sign in</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Text style={styles.hint}>This phone signs in only at pay.uniqbd.com.</Text>
          <Text style={styles.label}>Phone name</Text>
          <Field scroll={loginScroll} style={styles.input} value={name} onChangeText={setName} maxLength={80} placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Email</Text>
          <Field scroll={loginScroll} style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Password</Text>
          <Field scroll={loginScroll} style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94a3b8" />
          {needCode ? (
            <>
              <Text style={styles.label}>Authenticator code</Text>
              <Field scroll={loginScroll} style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={7} placeholder="123456" placeholderTextColor="#94a3b8" />
            </>
          ) : null}
          <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void signIn()}>
            <Text style={styles.buttonText}>{busy ? "Signing in" : "Sign in"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#01131a" },
  fill: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 8, paddingBottom: 6 },
  logo: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#0f766e", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#f8fafc", fontSize: 22, fontWeight: "800" },
  logout: { color: "#f8fafc", fontSize: 22, fontWeight: "700", paddingRight: 4 },
  scroll: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  profile: { flexDirection: "row", alignItems: "center", backgroundColor: "#06212a", borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14, marginTop: 8 },
  profileText: { flex: 1 },
  profileDate: { color: "#94a3b8", fontSize: 13 },
  profileName: { color: "#f8fafc", fontSize: 20, fontWeight: "800", marginTop: 2 },
  sync: { backgroundColor: "#0e2832", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10 },
  syncText: { color: "#f8fafc", fontWeight: "700" },
  tabs: { flexDirection: "row", marginTop: 8 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabText: { color: "#94a3b8", fontSize: 15, fontWeight: "600" },
  tabTextOn: { color: "#f8fafc" },
  tabLine: { position: "absolute", left: 10, right: 10, bottom: 0, height: 3, borderRadius: 3, backgroundColor: "#26bfb0" },
  day: { color: "#f8fafc", fontSize: 16, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  sms: { backgroundColor: "#06212a", borderRadius: 16, padding: 16, gap: 8, marginBottom: 12 },
  smsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  smsTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "800" },
  smsBody: { color: "#94a3b8", lineHeight: 20 },
  smsWhen: { color: "#64748b", fontSize: 13 },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: "#ffffff", fontSize: 12, fontWeight: "700" },
  pillOn: { backgroundColor: "#059669" },
  pillWait: { backgroundColor: "#b45309" },
  pillBad: { backgroundColor: "#e11d48" },
  note: { color: "#94a3b8", lineHeight: 20 },
  empty: { color: "#94a3b8", textAlign: "center", marginTop: 28 },
  pageTitle: { color: "#f8fafc", fontSize: 22, fontWeight: "800", marginTop: 12 },
  label: { color: "#94a3b8", fontSize: 13, fontWeight: "700", marginTop: 8 },
  hint: { color: "#94a3b8", lineHeight: 18 },
  input: { borderWidth: 1, borderColor: "#0e2832", borderRadius: 14, padding: 12, color: "#f8fafc", backgroundColor: "#06212a" },
  button: { backgroundColor: "#0f766e", borderRadius: 14, padding: 14, alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
  nav: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#0e2832", backgroundColor: "#01131a", paddingTop: 8, paddingBottom: 10 },
  navItem: { flex: 1, alignItems: "center", gap: 2 },
  navIcon: { color: "#94a3b8", fontSize: 18 },
  navLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  navOn: { color: "#26bfb0" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  headActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  refresh: { color: "#f8fafc", fontSize: 22 },
  add: { backgroundColor: "#0f766e", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  addText: { color: "#ffffff", fontWeight: "800" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addInput: { flex: 1 },
  sender: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#0e2832" },
  senderText: { flex: 1, paddingRight: 12 },
  senderName: { color: "#f8fafc", fontSize: 16, fontWeight: "800" },
  senderHint: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: "#334155", flexDirection: "row", alignItems: "center", paddingHorizontal: 3 },
  switchOn: { backgroundColor: "#0f766e" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#f8fafc" },
  knobOn: { marginLeft: "auto" },
  chart: { backgroundColor: "#06212a", borderRadius: 18, padding: 16, marginTop: 8 },
  plot: { height: 150, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around" },
  barCol: { alignItems: "center", width: 64, justifyContent: "flex-end" },
  bar: { width: 34, borderRadius: 6 },
  barLabel: { color: "#94a3b8", fontSize: 12, marginTop: 8 },
  sectionLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "800", letterSpacing: 1, marginTop: 16 },
  menuRow: { backgroundColor: "#06212a", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  menuText: { color: "#f8fafc", fontSize: 16, fontWeight: "700", flex: 1 },
  chevron: { color: "#94a3b8", fontSize: 22 },
  core: { backgroundColor: "#06212a", borderRadius: 16, paddingHorizontal: 16 },
  coreRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#0e2832", gap: 12 },
  coreLast: { borderBottomWidth: 0 },
  back: { color: "#26bfb0", fontSize: 18, fontWeight: "800", marginTop: 12 },
  choice: { backgroundColor: "#06212a", borderRadius: 14, padding: 16 },
  choiceOn: { borderWidth: 1, borderColor: "#26bfb0" },
  choiceText: { color: "#f8fafc", fontWeight: "700" },
  remove: { color: "#e11d48", fontWeight: "700" },
});

function Switch({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.switch, on ? styles.switchOn : null]} accessibilityRole="switch" accessibilityState={{ checked: on }}>
      <View style={[styles.knob, on ? styles.knobOn : null]} />
    </Pressable>
  );
}
