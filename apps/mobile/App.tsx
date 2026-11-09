import { useEffect, useRef, useState } from "react";
import { AppState, Linking, PermissionsAndroid, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { askBattery, batteryIgnored, listRecentSms, sendOneSms, smsReady, type PaymentSms } from "uniqpay-sms";
import { DEFAULT_SENDERS, keepMessage, senderLabel, type InboxRules, type Sender } from "./inbox-rules";

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

const DEBIT = ["transferred to", "transfer to", "sent to", "send money", "cash out", "payment to"];

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
  cloudRef.current = cloudSync;
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
            const next = parsed.slice(0, 40);
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
      rulesRef.current = {
        whitelistOn: savedWhitelist !== "0",
        senders: rulesRef.current.senders,
        keywords: rulesRef.current.keywords,
        cleanDays: savedClean === "7" || savedClean === "30" ? Number(savedClean) : 0,
      };
      setSettingsReady(true);
    });
    void refreshDevice();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshDevice();
    });
    return () => sub.remove();
  }, []);

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

  async function refreshDevice() {
    if (Platform.OS !== "android") return;
    setSmsPerm(await PermissionsAndroid.check("android.permission.READ_SMS"));
    try {
      setBatteryOn(batteryIgnored());
    } catch {
      setBatteryOn(false);
    }
  }

  function saveSenders(next: Sender[]) {
    setSenders(next);
    void writeStore("uniqpay_senders", JSON.stringify(next));
  }

  function saveKeywords(next: string[]) {
    setKeywords(next);
    void writeStore("uniqpay_keywords", JSON.stringify(next));
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
    if (word.length < 2 || word.length > 40) {
      setNote("A keyword must be 2 to 40 characters.");
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
    await allowSms();
    setSmsPerm(await PermissionsAndroid.check("android.permission.READ_SMS"));
  }

  function toggleBattery() {
    try {
      askBattery();
    } catch (cause) {
      setNote(cause instanceof Error ? cause.message : "Could not open battery settings.");
    }
  }

  async function submitMessage(message: string, from = "", receivedKey = "", quiet = false) {
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
      if (!quiet) setNote(data.matched ? `Matched checkout ${data.matched}` : "Saved on the desk.");
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
      const rows = await listRecentSms(40);
      const rules = rulesRef.current;
      const now = Date.now();
      const kept = rows.filter((row) => keepMessage(row, rules, now));
      const next = kept.map((row) => {
        const key = `${row.receivedAt}:${row.trxId}:${row.address}`.slice(0, 80);
        return { ...row, key, wallet: senderLabel(row.address, row.body, rules.senders), status: statusRef.current[key] ?? "pending" };
      });
      setItems(next);
      if (kept.length === 0) {
        setNote(rows.length === 0 ? "No SMS found on this phone." : "No SMS matched the whitelist, keywords, or cleaning window.");
        return;
      }
      if (!submitNew) return;
      for (const row of next) {
        if (statusRef.current[row.key] === "synced") continue;
        if (!row.trxId || !row.amount || looksLikeDebit(row.body)) continue;
        if (seenSms.current.has(row.key)) continue;
        const ok = await submitMessage(row.body, row.address, row.key, true);
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
    if (!token || !smsReady || !settingsReady) return;
    const tick = () => void readInbox(cloudRef.current);
    void tick();
    const timer = setInterval(tick, 20000);
    return () => clearInterval(timer);
  }, [token, smsReady, settingsReady]);

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
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.headRow}>
                <Text style={styles.pageTitle}>Whitelist Senders</Text>
                <View style={styles.headActions}>
                  <Pressable onPress={() => void readInbox(cloudSync)} hitSlop={8}><Text style={styles.refresh}>↻</Text></Pressable>
                  <Pressable style={styles.add} onPress={() => setAdding((open) => !open)}><Text style={styles.addText}>+ Add</Text></Pressable>
                </View>
              </View>
              {adding ? (
                <View style={styles.addRow}>
                  <TextInput style={[styles.input, styles.addInput]} value={draft} onChangeText={setDraft} placeholder="Sender name" placeholderTextColor="#94a3b8" maxLength={40} />
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
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
                    <Pressable key={String(days)} style={[styles.choice, cleanDays === days && styles.choiceOn]} onPress={() => { setCleanDays(Number(days)); void writeStore("uniqpay_clean", String(days)); }}>
                      <Text style={styles.choiceText}>{label}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {panel === "keywords" ? (
                <>
                  <Pressable onPress={() => setPanel(null)}><Text style={styles.back}>‹ Ignore Keywords</Text></Pressable>
                  <View style={styles.addRow}>
                    <TextInput style={[styles.input, styles.addInput]} value={keywordDraft} onChangeText={setKeywordDraft} placeholder="Keyword" placeholderTextColor="#94a3b8" maxLength={40} />
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
                      <Switch on={cloudSync} onPress={() => { const next = !cloudSync; setCloudSync(next); void writeStore("uniqpay_cloud", next ? "1" : "0"); }} />
                    </View>
                  </View>
                  <Text style={styles.sectionLabel}>PHONE</Text>
                  <Text style={styles.hint}>Outgoing SMS uses {simSlot === 1 ? "SIM 2" : "SIM 1"}. Change the SIM on the website. {online ? "This phone is online." : "Waiting for the desk."}</Text>
                  <Text style={styles.label}>Phone name</Text>
                  <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={() => void saveName()} maxLength={80} placeholderTextColor="#94a3b8" />
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
                </>
              ) : null}
              {note ? <Text style={styles.note}>{note}</Text> : null}
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
