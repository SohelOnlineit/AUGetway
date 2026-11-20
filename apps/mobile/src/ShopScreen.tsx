import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api, mediaUrl, money, plainText } from "./api";
import { colors, space } from "./theme";
import type { Category, Page, ProductSummary } from "./types";

export function ShopScreen({ onOpen }: { onOpen: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: "24" });
    if (submitted.trim()) params.set("q", submitted.trim());
    if (category) params.set("category", category);
    const [catalog, page] = await Promise.all([
      categories.length ? Promise.resolve(categories) : api<Category[]>("/categories"),
      api<Page<ProductSummary>>(`/products?${params.toString()}`),
    ]);
    setCategories(catalog);
    setProducts(page.items);
  }, [categories, submitted, category]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the shop");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <View style={styles.screen}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search products"
        placeholderTextColor={colors.muted}
        style={styles.search}
        returnKeyType="search"
        onSubmitEditing={() => setSubmitted(query.trim())}
      />
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            tintColor={colors.brand}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load()
                .catch(() => {})
                .finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <View>
            <FlatList
              horizontal
              data={[{ id: "all", name: "All", slug: "" }, ...categories]}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => {
                const selected = item.slug ? category === item.slug : !category;
                return (
                  <Pressable
                    style={[styles.chip, selected && styles.chipOn]}
                    onPress={() => setCategory(item.slug || null)}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? <ActivityIndicator color={colors.brand} style={styles.spinner} /> : null}
          </View>
        }
        ListEmptyComponent={loading ? undefined : <Text style={styles.empty}>No products in this view yet.</Text>}
        renderItem={({ item }) => {
          const image = mediaUrl(item.primaryImage?.url);
          return (
            <Pressable style={styles.card} onPress={() => onOpen(item.slug)}>
              {image ? (
                <Image source={{ uri: image }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]} />
              )}
              <Text style={styles.category}>{item.category.name}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.price}>{money(item.priceMinor, item.currency)}</Text>
              {plainText(item.shortDescription) ? (
                <Text style={styles.summary} numberOfLines={2}>
                  {plainText(item.shortDescription)}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: {
    marginHorizontal: space.screen,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { gap: 10 },
  chips: { paddingHorizontal: 4, paddingBottom: 12, gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: colors.ink },
  card: {
    flex: 1,
    marginBottom: 10,
    borderRadius: space.radius,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 10,
  },
  photo: { width: "100%", height: 118, borderRadius: 12, backgroundColor: colors.surface },
  photoEmpty: { borderWidth: 1, borderColor: colors.line },
  category: { marginTop: 8, color: colors.brand, fontSize: 11, fontWeight: "700" },
  title: { marginTop: 2, color: colors.text, fontSize: 15, fontWeight: "700", minHeight: 38 },
  price: { marginTop: 6, color: colors.text, fontSize: 16, fontWeight: "800" },
  summary: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 16 },
  error: { color: colors.danger, marginBottom: 8, paddingHorizontal: 4 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 28 },
  spinner: { marginVertical: 12 },
});
