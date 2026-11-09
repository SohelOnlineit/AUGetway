import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { listPaymentSms, sendOneSms, smsReady, type PaymentSms } from "uniqpay-sms";

const DEFAULT_BASE = "https://pay.uniqbd.com/api";

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
type Tab = "home" | "filters" | "settings";
type ListFilter = "all" | SyncState;

const WALLETS = ["All", "bKash", "Nagad", "Rocket", "Upay"];
const DEBIT = ["transferred to", "transfer to", "sent to", "send money", "cash out", "payment to"];

function walletOf(address: string, body: string) {
  const text = `${address} ${body}`.toLowerCase();
  if (text.includes("bkash") || text.includes("16216")) return "bKash";
  if (text.includes("nagad")) return "Nagad";
  if (text.includes("rocket") || text.includes("16316")) return "Rocket";
  if (text.includes("upay")) return "Upay";
  return "SMS";
}

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

function looksLikeDebit(body: string) {
  const lower = body.toLowerCase();
  return DEBIT.some((hint) => lower.includes(hint));
}

async function allowSms() {
  if (Platform.OS !== "android") return false;
  const result = await PermissionsAndroid.requestMultiple([
    "android.permission.READ_SMS",
    "android.permission.SEND_SMS",
    "android.permission.READ_PHONE_STATE",
  ]);
  return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
}

export default function App() {
  const [base, setBase] = useState(DEFAULT_BASE);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("UniqBD handset");
  const [simSlot, setSimSlot] = useState(0);
  const [handsetId, setHandsetId] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [walletFilter, setWalletFilter] = useState("All");
  const statusRef = useRef<Record<string, SyncState>>({});
  const [smsTo, setSmsTo] = useState("");
  const [smsText, setSmsText] = useState("");
  const [note, setNote] = useState("Sign in with the same account you use on the desk.");
  const seenSms = useRef(new Set<string>());
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    Promise.all([readStore("uniqpay_token"), readStore("uniqpay_base"), readStore("uniqpay_uid"), readStore("uniqpay_name")]).then(
      ([savedToken, savedBase, savedUid, savedName]) => {
        if (savedBase) setBase(savedBase);
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
        const response = await fetch(`${base}/handset/pulse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid, label: nameRef.current.trim() || "UniqBD handset", model: "Android" }),
        });
        const data = (await response.json()) as { id?: string; simSlot?: number; message?: string | string[] };
        if (!response.ok || !data.id) {
          if (!stop) {
            setOnline(false);
            setNote(problem(data, "Could not reach the desk."));
          }
          return;
        }
        if (!stop) {
          setHandsetId(data.id);
          setOnline(true);
          if (data.simSlot === 0 || data.simSlot === 1) setSimSlot(data.simSlot);
        }
        if (synced) return;
        const list = await fetch(`${base}/desk/handsets`, { headers: { Authorization: `Bearer ${token}` } });
        if (!list.ok) return;
        const rows = (await list.json()) as Handset[];
        const mine = rows.find((row) => row.uid === uid);
        if (mine && !stop) {
          synced = true;
          setHandsetId(mine.id);
          setName(mine.label);
          setSimSlot(mine.simSlot === 1 ? 1 : 0);
        }
      } catch {
        if (!stop) {
          setOnline(false);
          setNote("Could not reach the desk. Check the desk URL.");
        }
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token, base, uid]);

  async function signIn() {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await response.json()) as { accessToken?: string; message?: string | string[] };
      if (!response.ok || !data.accessToken) {
        setNote(problem(data, "Sign in failed"));
        return;
      }
      await writeStore("uniqpay_token", data.accessToken);
      await writeStore("uniqpay_base", base.trim());
      await writeStore("uniqpay_name", name.trim() || "UniqBD handset");
      setToken(data.accessToken);
      setNote(smsReady ? "This phone can read payment SMS and send one SMS at a time." : "Sign-in worked. SMS reading needs the UniqBD Pay Android build. You can still paste a message.");
    } catch {
      setNote("Could not reach the desk. Check the desk URL and your internet connection.");
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const label = name.trim();
    await writeStore("uniqpay_name", label || "UniqBD handset");
    if (!token || !handsetId) return;
    if (label.length < 2) {
      setNote("Phone name must be at least 2 characters.");
      return;
    }
    const response = await fetch(`${base}/desk/handsets/${handsetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label }),
    });
    const data = (await response.json()) as { message?: string | string[] };
    if (!response.ok) setNote(problem(data, "Could not save the phone name"));
  }

  async function submitMessage(message: string, from = "", receivedKey = "") {
    if (!token || busy) return false;
    const text = message.trim();
    if (text.length < 4) {
      setNote("The payment message is too short.");
      return false;
    }
    setBusy(true);
    setNote("");
    try {
      const pulse = await fetch(`${base}/handset/pulse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, label: name.trim() || "UniqBD handset", model: "Android" }),
      });
      if (!pulse.ok) {
        const data = (await pulse.json()) as { message?: string | string[] };
        setNote(problem(data, "Register this phone on the desk first."));
        return false;
      }
      const response = await fetch(`${base}/handset/notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uid,
          body: text,
          ...(from.trim() ? { sender: from.trim() } : {}),
          ...(receivedKey ? { receivedKey: receivedKey.slice(0, 80) } : {}),
        }),
      });
      const data = (await response.json()) as { matched?: string | null; message?: string | string[] };
      if (!response.ok) {
        setNote(problem(data, "Could not submit the message"));
        return false;
      }
      setNote(data.matched ? `Matched checkout ${data.matched}` : "Saved on the desk. A waiting payment matches when its reference and amount are in this message.");
      return true;
    } catch {
      setNote("Could not reach the desk.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function sendNotice() {
    const ok = await submitMessage(body, sender);
    if (ok) setBody("");
  }

  async function readInbox(submitNew: boolean) {
    if (!smsReady) {
      setNote("SMS reading needs the UniqBD Pay Android build, not Expo Go.");
      return;
    }
    if (!(await allowSms())) {
      setNote("Allow SMS permission to read payment messages.");
      return;
    }
    try {
      const rows = await listPaymentSms(20);
      const next = rows.map((row) => {
        const key = `${row.receivedAt}:${row.trxId}:${row.address}`.slice(0, 80);
        return { ...row, key, wallet: walletOf(row.address, row.body), status: statusRef.current[key] ?? "pending" };
      });
      setItems(next);
      if (rows.length === 0) {
        setNote("No bKash, Nagad, Rocket, or Upay payment SMS found.");
        return;
      }
      if (!submitNew) return;
      for (const row of next) {
        if (statusRef.current[row.key] === "synced") continue;
        if (!row.trxId || !row.amount || looksLikeDebit(row.body)) continue;
        if (seenSms.current.has(row.key)) continue;
        const ok = await submitMessage(row.body, row.address, row.key);
        const status: SyncState = ok ? "synced" : "failed";
        statusRef.current[row.key] = status;
        if (ok) seenSms.current.add(row.key);
        setItems((current) => current.map((item) => (item.key === row.key ? { ...item, status } : item)));
        if (!ok) return;
      }
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not read payment SMS");
    }
  }

  async function sendSms() {
    if (!smsReady) {
      setNote("SMS sending needs the UniqBD Pay Android build, not Expo Go.");
      return;
    }
    if (!(await allowSms())) {
      setNote("Allow SMS permission to send a message.");
      return;
    }
    setBusy(true);
    try {
      await sendOneSms(smsTo, smsText, simSlot);
      setSmsText("");
      setNote(`SMS sent to ${smsTo.trim()}.`);
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not send the SMS");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!token || !smsReady) return;
    void readInbox(true);
    const timer = setInterval(() => void readInbox(true), 20000);
    return () => clearInterval(timer);
  }, [token, smsReady]);

  useEffect(() => {
    if (!token || !uid || !smsReady) return;
    let stop = false;
    const deliver = async () => {
      try {
        const response = await fetch(`${base}/handset/jobs?uid=${encodeURIComponent(uid)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { simSlot?: number; jobs?: { id: string; to: string; body: string; simSlot: number }[] };
        if (!stop && (data.simSlot === 0 || data.simSlot === 1)) setSimSlot(data.simSlot);
        for (const job of data.jobs ?? []) {
          try {
            await sendOneSms(job.to, job.body, job.simSlot);
            await fetch(`${base}/handset/jobs/${job.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ uid, ok: true }),
            });
            if (!stop) setNote(`Sent SMS to ${job.to} from ${job.simSlot === 1 ? "SIM 2" : "SIM 1"}.`);
          } catch (cause) {
            const error = cause instanceof Error ? cause.message : "Could not send the SMS";
            await fetch(`${base}/handset/jobs/${job.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ uid, ok: false, error }),
            });
            if (!stop) setNote(error);
          }
        }
      } catch {
        if (!stop) setNote("Could not reach the desk for outgoing SMS.");
      }
    };
    void deliver();
    const timer = setInterval(() => void deliver(), 15000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token, uid, base, smsReady]);

  async function signOut() {
    await clearStore("uniqpay_token");
    setToken(null);
    setOnline(false);
    setHandsetId("");
    setNote("Signed out. This phone's saved messages stay on the desk.");
  }

  const visible = items.filter((item) => {
    if (listFilter !== "all" && item.status !== listFilter) return false;
    if (walletFilter !== "All" && item.wallet !== walletFilter) return false;
    return true;
  });
  const groups: { day: string; rows: InboxItem[] }[] = [];
  for (const item of visible) {
    const day = dayKey(item.receivedAt || Date.now());
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(item);
    else groups.push({ day, rows: [item] });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      {token ? (
        <>
          <View style={styles.top}>
            <View style={styles.logo}><Text style={styles.logoText}>U</Text></View>
            <Pressable onPress={() => void signOut()} hitSlop={10}><Text style={styles.logout}>↗</Text></Pressable>
          </View>
          {tab === "home" ? (
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.profile}>
                <View style={styles.profileText}>
                  <Text style={styles.profileDate}>{shortDay(Date.now())}</Text>
                  <Text style={styles.profileName}>{name.trim() || "Admin"}</Text>
                </View>
                <Pressable style={[styles.sync, busy && styles.disabled]} disabled={busy} onPress={() => void readInbox(true)}>
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
            <ScrollView contentContainerStyle={styles.scroll}>
              <Text style={styles.pageTitle}>Filters</Text>
              {WALLETS.map((wallet) => (
                <Pressable key={wallet} style={[styles.filterRow, walletFilter === wallet && styles.filterOn]} onPress={() => { setWalletFilter(wallet); setTab("home"); }}>
                  <Text style={styles.filterText}>{wallet}</Text>
                  {walletFilter === wallet ? <Text style={styles.filterMark}>●</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {tab === "settings" ? (
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.pageTitle}>Settings</Text>
              <Text style={styles.label}>Phone name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={() => void saveName()} maxLength={80} placeholderTextColor="#94a3b8" />
              <Text style={styles.hint}>Outgoing SMS uses {simSlot === 1 ? "SIM 2" : "SIM 1"}. Change the SIM on the website. {online ? "This phone is online." : "Waiting for the desk."}</Text>
              <Text style={styles.label}>Send one SMS</Text>
              <TextInput style={styles.input} value={smsTo} onChangeText={setSmsTo} keyboardType="phone-pad" placeholder="01XXXXXXXXX" placeholderTextColor="#94a3b8" />
              <TextInput style={[styles.input, styles.message]} multiline value={smsText} onChangeText={setSmsText} maxLength={320} placeholder="Message" placeholderTextColor="#94a3b8" />
              <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void sendSms()}>
                <Text style={styles.buttonText}>Send SMS</Text>
              </Pressable>
              <Text style={styles.label}>Paste a payment</Text>
              <TextInput style={styles.input} value={sender} onChangeText={setSender} autoCapitalize="none" placeholder="Sender" placeholderTextColor="#94a3b8" />
              <TextInput style={[styles.input, styles.message]} multiline value={body} onChangeText={setBody} placeholder="Paste the message" placeholderTextColor="#94a3b8" />
              <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void sendNotice()}>
                <Text style={styles.buttonText}>{busy ? "Sending" : "Submit to desk"}</Text>
              </Pressable>
            </ScrollView>
          ) : null}
          <View style={styles.nav}>
            <Pressable style={styles.navItem} onPress={() => setTab("home")}>
              <Text style={[styles.navIcon, tab === "home" && styles.navOn]}>⌂</Text>
              <Text style={[styles.navLabel, tab === "home" && styles.navOn]}>Dashboard</Text>
            </Pressable>
            <Pressable style={styles.navItem} onPress={() => setTab("filters")}>
              <Text style={[styles.navIcon, tab === "filters" && styles.navOn]}>⇅</Text>
              <Text style={[styles.navLabel, tab === "filters" && styles.navOn]}>Filters</Text>
            </Pressable>
            <Pressable style={styles.navItem} onPress={() => setTab("settings")}>
              <Text style={[styles.navIcon, tab === "settings" && styles.navOn]}>⚙</Text>
              <Text style={[styles.navLabel, tab === "settings" && styles.navOn]}>Settings</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}><Text style={styles.logoText}>U</Text></View>
          <Text style={styles.pageTitle}>Sign in</Text>
          {note ? <Text style={styles.note}>{note}</Text> : null}
          <Text style={styles.label}>Desk URL</Text>
          <TextInput style={styles.input} value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Phone name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholderTextColor="#94a3b8" />
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#94a3b8" />
          <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void signIn()}>
            <Text style={styles.buttonText}>{busy ? "Signing in" : "Sign in"}</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#01131a" },
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
  filterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#06212a", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 16 },
  filterOn: { borderWidth: 1, borderColor: "#26bfb0" },
  filterText: { color: "#f8fafc", fontSize: 16, fontWeight: "700" },
  filterMark: { color: "#26bfb0" },
  label: { color: "#94a3b8", fontSize: 13, fontWeight: "700", marginTop: 8 },
  hint: { color: "#94a3b8", lineHeight: 18 },
  input: { borderWidth: 1, borderColor: "#0e2832", borderRadius: 14, padding: 12, color: "#f8fafc", backgroundColor: "#06212a" },
  message: { minHeight: 90, textAlignVertical: "top" },
  button: { backgroundColor: "#0f766e", borderRadius: 14, padding: 14, alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "800" },
  disabled: { opacity: 0.6 },
  nav: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#0e2832", backgroundColor: "#01131a", paddingTop: 8, paddingBottom: 10 },
  navItem: { flex: 1, alignItems: "center", gap: 2 },
  navIcon: { color: "#94a3b8", fontSize: 18 },
  navLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  navOn: { color: "#26bfb0" },
});
