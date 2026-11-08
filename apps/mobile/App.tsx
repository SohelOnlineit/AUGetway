import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";

const DEFAULT_BASE = Platform.OS === "android" ? "http://10.0.2.2:4100/api" : "http://127.0.0.1:4100/api";

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
  const [note, setNote] = useState("Sign in with the same account you use on the desk.");
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
        const data = (await response.json()) as { id?: string; message?: string | string[] };
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
      setNote("This phone is checking in. It does not read or send SMS.");
    } catch {
      setNote("Could not reach the desk. On a real phone, use this computer's address instead of 10.0.2.2.");
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
      body: JSON.stringify({ label, simSlot }),
    });
    const data = (await response.json()) as { message?: string | string[] };
    if (!response.ok) setNote(problem(data, "Could not save the phone name"));
  }

  async function chooseSim(slot: number) {
    setSimSlot(slot);
    if (!token || !handsetId) return;
    const response = await fetch(`${base}/desk/handsets/${handsetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: name.trim() || "UniqBD handset", simSlot: slot }),
    });
    const data = (await response.json()) as { message?: string | string[] };
    setNote(response.ok ? (slot === 1 ? "SIM 2 is marked on the desk." : "SIM 1 is marked on the desk.") : problem(data, "Could not save the SIM"));
  }

  async function sendNotice() {
    if (!token || busy) return;
    const message = body.trim();
    if (message.length < 4) {
      setNote("Paste the payment message you received.");
      return;
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
        return;
      }
      const response = await fetch(`${base}/handset/notice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, body: message, ...(sender.trim() ? { sender: sender.trim() } : {}) }),
      });
      const data = (await response.json()) as { matched?: string | null; message?: string | string[] };
      if (!response.ok) {
        setNote(problem(data, "Could not submit the message"));
        return;
      }
      setBody("");
      setNote(data.matched ? `Matched checkout ${data.matched}` : "Saved on the desk. A waiting payment matches when its reference and amount are in this message.");
    } catch {
      setNote("Could not reach the desk.");
    } finally {
      setBusy(false);
    }
  }

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
        <Text style={styles.brand}>
          Uni<Text style={styles.q}>Q</Text>bd
        </Text>
        <Text style={styles.title}>Payment handset</Text>
        <Text style={styles.note}>{note}</Text>
        {token ? (
          <View style={styles.card}>
            <Text style={online ? styles.live : styles.offline}>{online ? "Online on the desk" : "Waiting for the desk"}</Text>
            <Text style={styles.label}>Phone name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} onBlur={() => void saveName()} maxLength={80} />
            <Text style={styles.label}>Active SIM</Text>
            <View style={styles.sims}>
              <Pressable style={[styles.sim, simSlot === 0 && styles.simOn]} onPress={() => void chooseSim(0)}>
                <Text style={[styles.simText, simSlot === 0 && styles.simTextOn]}>SIM 1</Text>
              </Pressable>
              <Pressable style={[styles.sim, simSlot === 1 && styles.simOn]} onPress={() => void chooseSim(1)}>
                <Text style={[styles.simText, simSlot === 1 && styles.simTextOn]}>SIM 2</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>Paste the payment message this phone received. UniqBD Pay does not read the inbox or send SMS.</Text>
            <Text style={styles.label}>Sender, if the message does not include it</Text>
            <TextInput style={styles.input} value={sender} onChangeText={setSender} autoCapitalize="none" placeholder="01XXXXXXXXX" placeholderTextColor="#6f747c" />
            <Text style={styles.label}>Payment message</Text>
            <TextInput
              style={[styles.input, styles.message]}
              multiline
              value={body}
              onChangeText={setBody}
              placeholder="Paste the message"
              placeholderTextColor="#6f747c"
            />
            <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => void sendNotice()}>
              <Text style={styles.buttonText}>{busy ? "Sending" : "Submit to desk"}</Text>
            </Pressable>
            <Pressable onPress={() => void signOut()}>
              <Text style={styles.link}>Sign out</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>Desk URL</Text>
            <TextInput style={styles.input} value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false} />
            <Text style={styles.label}>Phone name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} />
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
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
  screen: { flex: 1, backgroundColor: "#0c0d0f" },
  scroll: { padding: 20, paddingBottom: 40 },
  brand: { color: "#f3f3f3", fontSize: 28, fontWeight: "800", marginTop: 18 },
  q: { color: "#3ddc97" },
  title: { color: "#f5f5f5", fontSize: 22, fontWeight: "700", marginTop: 6 },
  note: { color: "#b7b7b7", marginTop: 8, marginBottom: 16, lineHeight: 20 },
  card: { backgroundColor: "#16181c", borderColor: "#2c3036", borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  label: { color: "#c8c8c8", fontSize: 13, fontWeight: "600", marginTop: 4 },
  hint: { color: "#8b9098", lineHeight: 18, marginTop: 4 },
  input: { borderWidth: 1, borderColor: "#34383f", borderRadius: 10, padding: 12, color: "#f4f4f5", backgroundColor: "#0e0f12" },
  message: { minHeight: 110, textAlignVertical: "top" },
  sims: { flexDirection: "row", gap: 8 },
  sim: { flex: 1, borderWidth: 1, borderColor: "#34383f", borderRadius: 999, paddingVertical: 10, alignItems: "center" },
  simOn: { backgroundColor: "#143024", borderColor: "#3ddc97" },
  simText: { color: "#d7d7d7", fontWeight: "700" },
  simTextOn: { color: "#3ddc97" },
  button: { backgroundColor: "#3ddc97", borderRadius: 999, padding: 14, alignItems: "center", marginTop: 8 },
  disabled: { opacity: 0.6 },
  live: { color: "#3ddc97", fontWeight: "700" },
  offline: { color: "#e2b657", fontWeight: "700" },
  buttonText: { color: "#062116", fontWeight: "800" },
  link: { textAlign: "center", marginTop: 12, color: "#f07178", fontWeight: "700" },
});
