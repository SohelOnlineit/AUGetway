import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, mediaUrl, money } from "./api";
import { useSession } from "./session";
import { colors, space } from "./theme";
import { useState } from "react";

export function CartScreen({ onShop, onCheckout }: { onShop: () => void; onCheckout: () => void }) {
  const session = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cart = session.cart;

  async function change(itemId: string, quantity: number) {
    setBusyId(itemId);
    setError(null);
    try {
      if (quantity < 1) {
        await api(`/cart/items/${itemId}`, { method: "DELETE", token: session.token, guest: session.guest });
      } else {
        await api(`/cart/items/${itemId}`, {
          method: "PATCH",
          token: session.token,
          guest: session.guest,
          body: JSON.stringify({ quantity }),
        });
      }
      await session.refreshCart();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the cart");
    } finally {
      setBusyId(null);
    }
  }

  if (!session.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyBody}>Browse the shop and add a package.</Text>
        <Pressable style={styles.button} onPress={onShop}>
          <Text style={styles.buttonText}>Browse products</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.list}>
        {cart.items.map((item) => {
          const image = mediaUrl(item.primaryImageUrl);
          return (
            <View key={item.id} style={styles.item}>
              {image ? <Image source={{ uri: image }} style={styles.photo} /> : <View style={styles.photo} />}
              <View style={styles.copy}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.meta}>{[item.packageName, item.region].filter(Boolean).join(" · ")}</Text>
                <Text style={styles.price}>{money(item.lineTotalMinor, item.currency)}</Text>
                <View style={styles.qty}>
                  <Pressable style={styles.qtyBtn} onPress={() => void change(item.id, item.quantity - 1)} disabled={busyId === item.id}>
                    <Text style={styles.qtyText}>{item.quantity === 1 ? "Remove" : "−"}</Text>
                  </Pressable>
                  <Text style={styles.qtyCount}>{item.quantity}</Text>
                  <Pressable style={styles.qtyBtn} onPress={() => void change(item.id, item.quantity + 1)} disabled={busyId === item.id}>
                    <Text style={styles.qtyText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.bar}>
        <View>
          <Text style={styles.barLabel}>Subtotal</Text>
          <Text style={styles.barPrice}>{money(cart.subtotalMinor, cart.currency)}</Text>
        </View>
        <Pressable style={styles.button} onPress={onCheckout}>
          <Text style={styles.buttonText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  emptyBody: { marginTop: 6, color: colors.muted, textAlign: "center" },
  list: { padding: space.screen, gap: 12 },
  item: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: space.radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  photo: { width: 72, height: 72, borderRadius: 12, backgroundColor: colors.surface },
  copy: { flex: 1 },
  title: { color: colors.text, fontWeight: "700" },
  meta: { marginTop: 2, color: colors.muted, fontSize: 12 },
  price: { marginTop: 6, color: colors.text, fontWeight: "800" },
  qty: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: {
    minWidth: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
  },
  qtyText: { color: colors.text, fontWeight: "700" },
  qtyCount: { color: colors.text, fontWeight: "800" },
  error: { color: colors.danger },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.screen,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  barLabel: { color: colors.muted, fontSize: 12 },
  barPrice: { color: colors.text, fontSize: 18, fontWeight: "800" },
  button: { backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, marginTop: 16 },
  buttonText: { color: colors.ink, fontWeight: "800" },
});
