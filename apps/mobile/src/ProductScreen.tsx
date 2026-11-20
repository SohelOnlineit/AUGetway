import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, mediaUrl, money, plainText } from "./api";
import { useSession } from "./session";
import { colors, space } from "./theme";
import type { ProductDetail, ProductPackage } from "./types";

export function ProductScreen({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const session = useSession();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ProductDetail>(`/products/${encodeURIComponent(slug)}`)
      .then((next) => {
        if (cancelled) return;
        setProduct(next);
        const firstRegion = next.defaultRegion || next.regions[0] || null;
        setRegion(firstRegion);
        const firstPackage = next.packages.find((item) => !firstRegion || item.regions.includes(firstRegion));
        setPackageId(firstPackage?.valueId ?? next.packages[0]?.valueId ?? null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Product unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const packages = useMemo(() => {
    if (!product) return [];
    if (!region) return product.packages;
    const matched = product.packages.filter((item) => item.regions.length === 0 || item.regions.includes(region));
    return matched.length ? matched : product.packages;
  }, [product, region]);

  const selected = packages.find((item) => item.valueId === packageId) ?? packages[0] ?? null;

  async function addToCart() {
    if (!product || busy) return;
    for (const field of product.customerInputs) {
      if (field.required && !answers[field.id]?.trim()) {
        setError(`Fill in ${field.label}`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      await api("/cart/items", {
        method: "PUT",
        token: session.token,
        guest: session.guest,
        body: JSON.stringify({
          productId: product.id,
          packageValueId: selected?.valueId,
          quantity: 1,
          customerInputs: product.customerInputs
            .filter((field) => answers[field.id]?.trim())
            .map((field) => ({ id: field.id, value: answers[field.id]!.trim() })),
        }),
      });
      await session.refreshCart();
      setNotice("Added to cart");
      onAdded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this product");
    } finally {
      setBusy(false);
    }
  }

  if (!product && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  if (!product) return <Text style={styles.error}>{error}</Text>;

  const image = mediaUrl(selected?.imageUrl || product.images[0]?.url || product.primaryImage?.url);
  const price = selected?.priceMinor ?? product.priceMinor;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {image ? <Image source={{ uri: image }} style={styles.hero} /> : <View style={[styles.hero, styles.heroEmpty]} />}
        <Text style={styles.kicker}>{product.category.name}</Text>
        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.price}>{money(price, product.currency)}</Text>
        {plainText(product.shortDescription) ? <Text style={styles.summary}>{plainText(product.shortDescription)}</Text> : null}
        {product.regions.length ? (
          <View style={styles.block}>
            <Text style={styles.label}>Region</Text>
            <View style={styles.wrap}>
              {product.regions.map((code) => (
                <Pressable key={code} style={[styles.pill, region === code && styles.pillOn]} onPress={() => setRegion(code)}>
                  <Text style={[styles.pillText, region === code && styles.pillTextOn]}>{code}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        {packages.length ? (
          <View style={styles.block}>
            <Text style={styles.label}>Package</Text>
            {packages.map((item) => (
              <PackageRow key={item.valueId} item={item} currency={product.currency} selected={selected?.valueId === item.valueId} onPress={() => setPackageId(item.valueId)} />
            ))}
          </View>
        ) : null}
        {product.customerInputs.map((field) => (
          <View key={field.id} style={styles.block}>
            <Text style={styles.label}>
              {field.label}
              {field.required ? " *" : ""}
            </Text>
            <TextInput
              value={answers[field.id] ?? ""}
              onChangeText={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
              placeholder={field.placeholder || field.label}
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
          </View>
        ))}
        {plainText(product.description) ? <Text style={styles.body}>{plainText(product.description)}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </ScrollView>
      <View style={styles.bar}>
        <View>
          <Text style={styles.barLabel}>{selected?.name || "Price"}</Text>
          <Text style={styles.barPrice}>{money(price, product.currency)}</Text>
        </View>
        <Pressable style={[styles.add, busy && styles.addBusy]} onPress={() => void addToCart()} disabled={busy}>
          <Text style={styles.addText}>{busy ? "Adding…" : "Add to cart"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PackageRow({
  item,
  currency,
  selected,
  onPress,
}: {
  item: ProductPackage;
  currency: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.package, selected && styles.packageOn]} onPress={onPress}>
      <View style={styles.packageCopy}>
        <Text style={styles.packageName}>{item.name}</Text>
        <Text style={styles.packageMeta}>{item.inStock ? (item.instant ? "Instant delivery" : "Manual delivery") : "Out of stock"}</Text>
      </View>
      <Text style={styles.packagePrice}>{money(item.priceMinor, currency)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: space.screen, paddingBottom: 28 },
  hero: { width: "100%", height: 220, borderRadius: space.radius, backgroundColor: colors.surface },
  heroEmpty: { borderWidth: 1, borderColor: colors.line },
  kicker: { marginTop: 14, color: colors.brand, fontWeight: "700", fontSize: 12 },
  title: { marginTop: 4, color: colors.text, fontSize: 26, fontWeight: "800" },
  price: { marginTop: 8, color: colors.text, fontSize: 22, fontWeight: "800" },
  summary: { marginTop: 8, color: colors.muted, fontSize: 15, lineHeight: 22 },
  body: { marginTop: 16, color: colors.text, fontSize: 15, lineHeight: 22 },
  block: { marginTop: 16 },
  label: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 8 },
  pillOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { color: colors.text, fontWeight: "700" },
  pillTextOn: { color: colors.ink },
  package: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    backgroundColor: colors.card,
  },
  packageOn: { borderColor: colors.brand, backgroundColor: "rgba(38, 191, 176, 0.12)" },
  packageCopy: { flex: 1 },
  packageName: { color: colors.text, fontWeight: "700" },
  packageMeta: { marginTop: 2, color: colors.muted, fontSize: 12 },
  packagePrice: { color: colors.text, fontWeight: "800" },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  error: { marginTop: 12, color: colors.danger },
  notice: { marginTop: 12, color: colors.brand, fontWeight: "700" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: space.screen,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  barLabel: { color: colors.muted, fontSize: 12 },
  barPrice: { color: colors.text, fontSize: 18, fontWeight: "800" },
  add: { backgroundColor: colors.brand, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12 },
  addBusy: { opacity: 0.7 },
  addText: { color: colors.ink, fontWeight: "800" },
});
