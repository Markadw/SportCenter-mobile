import { useLocalSearchParams, useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductImage } from "../../../components/ProductImage";
import { ScreenState } from "../../../components/ScreenState";
import { colors } from "../../../constants/theme";
import { useProductDetailViewModel } from "../hooks/useProductDetailViewModel";
import { money, productWebsiteUrl } from "../presentation";

export function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] ?? "" : params.id ?? "";
  const vm = useProductDetailViewModel(id);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [shareError, setShareError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  if (vm.isLoading) return <ScreenState loading title="Cargando producto…" />;
  if (vm.error || !vm.product) return <ScreenState title={vm.error ?? "Producto no encontrado"} action={vm.error === "Producto no encontrado" ? "Volver" : "Reintentar"} onAction={() => vm.error === "Producto no encontrado" ? (router.canGoBack() ? router.back() : router.replace("/catalog")) : vm.retry()} />;
  const { product, selected } = vm;
  const galleryWidth = Math.max(1, width);
  const images = selected?.images ?? [];
  const share = async () => {
    setShareError(null);
    try { await Share.share({ message: `${product.name}\n${productWebsiteUrl(product)}` }); }
    catch { setShareError("No se pudo abrir la opción de compartir. Intenta de nuevo."); }
  };
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={styles.gallery}>
        {images.length ? <ScrollView key={`${selected?.id}-${galleryWidth}`} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))}>
          {images.map((uri, i) => <ProductImage key={`${uri}-${i}`} uri={uri} label={`${product.name}, imagen ${i + 1}`} style={{ width: galleryWidth, height: Math.min(galleryWidth, 420), padding: 24 }} />)}
        </ScrollView> : <ProductImage label={product.name} style={{ height: Math.min(galleryWidth, 420) }} />}
        {images.length > 1 && <Text style={styles.counter}>{Math.min(imageIndex + 1, images.length)} / {images.length}</Text>}
      </View>
      <View style={styles.info}>
        <View style={styles.brandRow}><Text style={styles.brand}>{product.brand}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Compartir producto" style={styles.share} onPress={() => void share()}><Share2 size={22} color={colors.primary} /></Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{product.name}</Text>
        <Text style={styles.price}>{selected ? money(selected.price) : "Sin precio disponible"}</Text>
        <Text style={styles.stock}>{selected && selected.stock > 0 ? `${selected.stock} disponibles` : "Agotado"}</Text>
        {!!shareError && <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text>}
        <Text style={styles.heading}>Elige una opción</Text>
        <View style={styles.options}>
          {product.variants.map(v => {
            const label = Object.entries(v.attributes).map(([key, value]) => `${key}: ${value}`).join(" · ") || v.sku;
            return <Pressable key={v.id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected?.id === v.id }}
              onPress={() => { vm.selectVariant(v.id); setImageIndex(0); }} style={[styles.option, selected?.id === v.id && styles.optionSelected]}>
              <Text style={[styles.optionLabel, selected?.id === v.id && styles.optionLabelSelected]}>{label}</Text>
              {v.stock <= 0 && <Text style={styles.muted}>Sin existencias</Text>}
            </Pressable>;
          })}
        </View>
        {!!selected && <Text style={styles.muted}>SKU: {selected.sku}</Text>}
        <View style={styles.divider} />
        <Text style={styles.heading}>Descripción</Text>
        <Text style={styles.description}>{product.description || "Sin descripción disponible."}</Text>
        <Text style={styles.heading}>Detalles</Text>
        <View style={styles.detail}><Text style={styles.muted}>Categoría</Text><Text style={styles.detailValue}>{product.category}</Text></View>
        <View style={styles.detail}><Text style={styles.muted}>Tipo</Text><Text style={styles.detailValue}>{product.parentCategory}</Text></View>
        {Object.entries(selected?.attributes ?? {}).map(([key, value]) => <View key={key} style={styles.detail}><Text style={styles.muted}>{key}</Text><Text style={styles.detailValue}>{value}</Text></View>)}
        {!!product.sports.length && <View style={styles.detail}><Text style={styles.muted}>Deportes</Text><Text style={styles.detailValue}>{product.sports.join(", ")}</Text></View>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, content: { paddingBottom: 32 }, gallery: { backgroundColor: colors.white },
  counter: { alignSelf: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.lightBg, color: colors.textMuted, fontSize: 12 },
  info: { padding: 24, gap: 12 }, brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: colors.textMuted, fontSize: 14, fontWeight: "600", flex: 1 }, share: { minWidth: 48, minHeight: 48, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 26, lineHeight: 34, fontWeight: "700", color: colors.text }, price: { fontSize: 28, fontWeight: "700", color: colors.primary },
  stock: { color: colors.textMuted, fontSize: 14 }, heading: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 12 },
  options: { gap: 10 }, option: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, gap: 6 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.brandChipBg }, optionLabel: { fontSize: 15, color: colors.text }, optionLabelSelected: { color: colors.primary, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 14 }, description: { color: colors.textMuted, fontSize: 16, lineHeight: 25 },
  detail: { flexDirection: "row", gap: 16, paddingVertical: 6, justifyContent: "space-between" }, detailValue: { flexShrink: 1, textAlign: "right", color: colors.text, fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 }, error: { color: colors.error, fontSize: 14 },
});
