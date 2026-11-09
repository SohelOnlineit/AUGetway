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

const DEBIT = ["transferred to", "transfer to", "sent to", "send money", "cash out", "payment to"];

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
  const [payments, setPayments] = useState<PaymentSms[]>([]);
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
      const rows = await listPaymentSms(15);
      setPayments(rows);
      if (rows.length === 0) {
        setNote("No bKash, Nagad, Rocket, or Upay payment SMS found.");
        return;
      }
      if (!submitNew) {
        setNote(`Found ${rows.length} payment SMS. Submit the one that matches the checkout.`);
        return;
      }
      let sent = 0;
      for (const row of rows) {
        if (!row.trxId || !row.amount || looksLikeDebit(row.body)) continue;
        const key = `${row.receivedAt}:${row.trxId}:${row.address}`.slice(0, 80);
        if (seenSms.current.has(key)) continue;
        const ok = await submitMessage(row.body, row.address, key);
        if (!ok) return;
        seenSms.current.add(key);
        sent += 1;
      }
      setNote(sent > 0 ? `Sent ${sent} new payment SMS to the desk.` : "No new received payment SMS.");
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

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.mark}>
            <Text style={styles.markText}>UQ</Text>
          </View>
          <Text style={styles.wordmark}>UniqPay</Text>
          <Text style={styles.kicker}>SMS GATEWAY</Text>
        </View>
        <Text style={styles.note}>{note}</Text>
        {token ? (
          <>
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <View style={[styles.dot, online ? styles.dotOn : styles.dotWait]} />
                <Text style={online ? styles.live : styles.offline}>{online ? "Gateway online" : "Waiting for the desk"}</Text>
              </View>
              <Text style={styles.label}>Phone name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={() => void saveName()} maxLength={80} />
              <Text style={styles.label}>Device id</Text>
              <Text style={styles.uid} numberOfLines={1}>{uid}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.section}>SIM slot</Text>
              <Text style={styles.hint}>The desk chooses this. Outgoing SMS uses {simSlot === 1 ? "SIM 2" : "SIM 1"}.</Text>
              <View style={[styles.sim, styles.simOn]}>
                <Text style={[styles.simText, styles.simTextOn]}>{simSlot === 1 ? "SIM 2" : "SIM 1"}</Text>
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.section}>Payment SMS</Text>
              <Text style={styles.hint}>
                {smsReady
                  ? "bKash, Nagad, Rocket, and Upay messages can be read here. Other messages stay on the phone."
                  : "This Expo Go session can paste a message. Reading and sending SMS need the UniqPay Android build."}
              </Text>
              <Text style={styles.hint}>{smsReady ? "New payment SMS is sent to the desk automatically." : "Automatic collection needs the UniqPay Android build."}</Text>
              <Pressable style={styles.button} onPress={() => void readInbox(false)}>
                <Text style={styles.buttonText}>Read payment SMS</Text>
              </Pressable>
              {payments.map((row) => (
                <View key={`${row.receivedAt}:${row.trxId}:${row.address}`} style={styles.sms}>
                  <Text style={styles.smsTitle}>{row.trxId || "No TrxID"} · {row.amount ? `${row.amount} BDT` : "No amount"}</Text>
                  <Text style={styles.hint}>{row.address || "Unknown sender"}{looksLikeDebit(row.body) ? " · outgoing" : ""}</Text>
                  <Text style={styles.smsBody} numberOfLines={3}>{row.body}</Text>
                  <Pressable onPress={() => void submitMessage(row.body, row.address)}>
                    <Text style={styles.link}>Submit this payment</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.card}>
              <Text style={styles.section}>Send one SMS</Text>
              <TextInput style={styles.input} value={smsTo} onChangeText={setSmsTo} keyboardType="phone-pad" placeholder="01XXXXXXXXX" placeholderTextColor="#6d6790" />
              <TextInput
                style={[styles.input, styles.message]}
                multiline
                value={smsText}
                onChangeText={setSmsText}
                maxLength={320}
                placeholder="Message"
                placeholderTextColor="#6d6790"
              />
              <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void sendSms()}>
                <Text style={styles.buttonText}>Send SMS</Text>
              </Pressable>
            </View>
            <View style={styles.card}>
              <Text style={styles.section}>Paste a payment</Text>
              <Text style={styles.hint}>Use this when the message is not in the list.</Text>
              <Text style={styles.label}>Sender, if the message does not include it</Text>
              <TextInput style={styles.input} value={sender} onChangeText={setSender} autoCapitalize="none" placeholder="01XXXXXXXXX" placeholderTextColor="#6d6790" />
              <Text style={styles.label}>Payment message</Text>
              <TextInput
                style={[styles.input, styles.message]}
                multiline
                value={body}
                onChangeText={setBody}
                placeholder="Paste the message"
                placeholderTextColor="#6d6790"
              />
              <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void sendNotice()}>
                <Text style={styles.buttonText}>{busy ? "Sending" : "Submit to desk"}</Text>
              </Pressable>
              <Pressable onPress={() => void signOut()}>
                <Text style={styles.signOut}>Sign out</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.section}>Pair this phone</Text>
            <Text style={styles.hint}>Sign in with the same account you use on the desk.</Text>
            <Text style={styles.label}>Desk URL</Text>
            <TextInput style={styles.input} value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} placeholderTextColor="#6d6790" />
            <Text style={styles.label}>Phone name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} placeholderTextColor="#6d6790" />
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholderTextColor="#6d6790" />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#6d6790" />
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void signIn()}>
              <Text style={styles.buttonText}>{busy ? "Signing in" : "Sign in"}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#07060f" },
  scroll: { padding: 20, paddingBottom: 48, gap: 14 },
  hero: { alignItems: "center", marginTop: 12, marginBottom: 4 },
  mark: {
    width: 84,
    height: 84,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5b3df5",
    borderWidth: 3,
    borderColor: "#22d3ee",
  },
  markText: { color: "#ffffff", fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  wordmark: { color: "#f8f7ff", fontSize: 32, fontWeight: "800", marginTop: 12 },
  kicker: { color: "#a78bfa", fontSize: 12, fontWeight: "800", letterSpacing: 3, marginTop: 2 },
  note: { color: "#c4bfe0", lineHeight: 20, textAlign: "center" },
  card: {
    backgroundColor: "#141228",
    borderColor: "rgba(167, 139, 250, 0.28)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 8,
  },
  section: { color: "#f8f7ff", fontSize: 16, fontWeight: "800" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 99 },
  dotOn: { backgroundColor: "#22d3ee" },
  dotWait: { backgroundColor: "#fbbf24" },
  label: { color: "#c4b5fd", fontSize: 12, fontWeight: "700", marginTop: 4 },
  hint: { color: "#9b95b8", lineHeight: 18 },
  uid: { color: "#22d3ee", fontSize: 13, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.35)",
    borderRadius: 14,
    padding: 12,
    color: "#f8f7ff",
    backgroundColor: "#0d0b18",
  },
  message: { minHeight: 110, textAlignVertical: "top" },
  sims: { flexDirection: "row", gap: 8 },
  sim: { flex: 1, borderWidth: 1, borderColor: "rgba(167, 139, 250, 0.35)", borderRadius: 16, paddingVertical: 14, alignItems: "center", backgroundColor: "#0d0b18" },
  simOn: { backgroundColor: "#2a1d66", borderColor: "#22d3ee" },
  simText: { color: "#ddd6fe", fontWeight: "800" },
  simTextOn: { color: "#22d3ee" },
  button: { backgroundColor: "#6d4aff", borderRadius: 16, padding: 14, alignItems: "center", marginTop: 4 },
  buttonGhost: { borderWidth: 1, borderColor: "rgba(167, 139, 250, 0.35)", borderRadius: 16, padding: 14, alignItems: "center", backgroundColor: "#0d0b18" },
  ghostText: { color: "#ddd6fe", fontWeight: "800" },
  disabled: { opacity: 0.6 },
  live: { color: "#22d3ee", fontWeight: "800" },
  offline: { color: "#fbbf24", fontWeight: "800" },
  buttonText: { color: "#ffffff", fontWeight: "800" },
  link: { textAlign: "center", marginTop: 8, color: "#22d3ee", fontWeight: "800" },
  signOut: { textAlign: "center", marginTop: 8, color: "#fb7185", fontWeight: "800" },
  sms: { borderWidth: 1, borderColor: "rgba(167, 139, 250, 0.28)", borderRadius: 16, padding: 12, gap: 4, marginTop: 4, backgroundColor: "#0d0b18" },
  smsTitle: { color: "#f8f7ff", fontWeight: "800" },
  smsBody: { color: "#c4bfe0", lineHeight: 18 },
});
