import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { brand } from "../brand";
import { useSession } from "./session";
import { colors, space } from "./theme";

export function AccountScreen() {
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await session.signIn(email, password);
      setPassword("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  if (session.user) {
    return (
      <View style={styles.screen}>
        <Text style={styles.kicker}>{brand.name}</Text>
        <Text style={styles.title}>{session.user.displayName || "Signed in"}</Text>
        <Text style={styles.email}>{session.user.email}</Text>
        <Text style={styles.body}>Orders and wallet stay on your {brand.name} account. Checkout can also continue as a guest.</Text>
        <Pressable style={styles.button} onPress={() => void session.signOut()}>
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>{brand.name}</Text>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.body}>Use the same email and password as the website. You can still check out as a guest.</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, busy && styles.busy]} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.screen },
  kicker: { color: colors.brand, fontWeight: "700" },
  title: { marginTop: 6, color: colors.text, fontSize: 28, fontWeight: "800" },
  email: { marginTop: 8, color: colors.text, fontSize: 16 },
  body: { marginTop: 8, color: colors.muted, lineHeight: 21 },
  input: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { marginTop: 12, color: colors.danger },
  button: {
    alignSelf: "flex-start",
    marginTop: 16,
    backgroundColor: colors.brand,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  busy: { opacity: 0.7 },
  buttonText: { color: colors.ink, fontWeight: "800" },
});
