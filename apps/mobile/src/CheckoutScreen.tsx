import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { brand } from "../brand";
import { api, money, uuid } from "./api";
import { useSession } from "./session";
import { colors, space } from "./theme";
import type { OrderDetail, PaymentIntent } from "./types";

export function CheckoutScreen({ onDone }: { onDone: () => void }) {
  const session = useSession();
  const [name, setName] = useState(session.user?.displayName ?? "");
  const [phone, setPhone] = useState(session.user?.phone ?? "");
  const [email, setEmail] = useState(session.user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetail | null>(null);

  async function place() {
    if (!session.cart) return;
    setBusy(true);
    setError(null);
    try {
      const key = uuid();
      const placed = await api<OrderDetail>("/checkout", {
        method: "POST",
        token: session.token,
        guest: session.guest,
        headers: { "idempotency-key": key },
        body: JSON.stringify({
          idempotencyKey: key,
          paymentMethod: "gateway",
          originSource: brand.host,
          contactName: name.trim(),
          contactPhone: phone.trim(),
          contactEmail: email.trim(),
        }),
      });
      const intent = await api<PaymentIntent>("/payments/intents", {
        method: "POST",
        token: session.token,
        guest: session.guest,
        body: JSON.stringify({ orderId: placed.id, idempotencyKey: uuid() }),
      });
      await session.refreshCart();
      setOrder(placed);
      if (intent.checkoutUrl) await Linking.openURL(intent.checkoutUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    return (
      <View style={styles.screen}>
        <Text style={styles.kicker}>Order placed</Text>
        <Text style={styles.title}>{order.orderNumber}</Text>
        <Text style={styles.body}>
          {money(order.totalMinor, order.currency)} is waiting for payment. If a payment page opened, finish it there. Your codes arrive after the payment is confirmed.
        </Text>
        <Pressable style={styles.button} onPress={onDone}>
          <Text style={styles.buttonText}>Back to shop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>Checkout</Text>
      <Text style={styles.title}>{session.cart ? money(session.cart.subtotalMinor, session.cart.currency) : ""}</Text>
      <Text style={styles.body}>
        {session.user ? "This order uses your signed-in account." : "Guest checkout uses the name, mobile number, and email below."}
      </Text>
      <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} />
      <TextInput value={phone} onChangeText={setPhone} placeholder="Mobile number" placeholderTextColor={colors.muted} keyboardType="phone-pad" style={styles.input} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.button, busy && styles.busy]} onPress={() => void place()} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Placing order…" : "Pay now"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.screen },
  kicker: { color: colors.brand, fontWeight: "700" },
  title: { marginTop: 6, color: colors.text, fontSize: 28, fontWeight: "800" },
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
    marginTop: 18,
    backgroundColor: colors.brand,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  busy: { opacity: 0.7 },
  buttonText: { color: colors.ink, fontWeight: "800" },
});
