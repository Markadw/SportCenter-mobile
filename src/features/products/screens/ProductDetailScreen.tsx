import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Minus, Plus, Share2, Star } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { reviewsApi } from "../../../api/reviewsApi";
import { ProductImage } from "../../../components/ProductImage";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing, storefront } from "../../../constants/theme";
import { useProductDetailViewModel } from "../hooks/useProductDetailViewModel";
import { useSession } from "../../auth/context/SessionContext";
import { useAddToCart } from "../../cart/hooks/useCartViewModel";
import { money, productWebsiteUrl } from "../presentation";
import type { Variant } from "../types";

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const isColorKey = (key: string) => /^colou?r(es)?$/.test(normalize(key));
// Sólo traduce el nombre recibido a una muestra visual; los colores disponibles vienen de cada variante.
const SWATCHES: Record<string, string> = {
  negro: "#111111", blanco: "#FFFFFF", gris: "#9CA3AF", "gris oscuro": "#4B5563", plata: "#C0C0C0", rojo: "#DC2626",
  azul: "#2563EB", "azul marino": "#1E3A8A", marino: "#1E3A8A", celeste: "#7DD3FC", "azul cielo": "#7DD3FC", verde: "#16A34A",
  "verde militar": "#4B5320", amarillo: "#FACC15", naranja: "#F97316", morado: "#7C3AED", violeta: "#8B5CF6", lila: "#C4B5FD",
  rosa: "#EC4899", "rosa claro": "#F9A8D4", cafe: "#7C4A21", marron: "#7C4A21", beige: "#E8D9B5", crema: "#F5F0E1",
  dorado: "#D4AF37", vino: "#7F1D1D", turquesa: "#14B8A6", coral: "#FB7185", caqui: "#BDB76B",
};
const swatch = (value: string) => /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : SWATCHES[normalize(value)] ?? null;

/** Atributos presentes en las variantes, con sus valores en el orden en que aparecen. */
function attributeGroups(variants: Variant[]) {
  const groups = new Map<string, string[]>();
  for (const v of variants) for (const [key, value] of Object.entries(v.attributes)) {
    if (!value) continue;
    const values = groups.get(key) ?? [];
    if (!values.includes(value)) values.push(value);
    groups.set(key, values);
  }
  // Color primero, como en la tienda web; el resto (talla u otros) conserva su orden.
  return [...groups.entries()].sort(([a], [b]) => Number(isColorKey(b)) - Number(isColorKey(a)));
}

/** Variante para un valor: conserva los demás atributos elegidos si la combinación existe y prefiere la que tiene existencias. */
function variantFor(variants: Variant[], current: Variant | null, key: string, value: string) {
  const candidates = variants.filter(v => v.attributes[key] === value);
  const score = (v: Variant) => Object.entries(current?.attributes ?? {}).filter(([k, val]) => k !== key && v.attributes[k] === val).length * 2 + (v.stock > 0 ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

function useReviewSummary(productId: number | null) {
  const [summary, setSummary] = useState<{ productId: number; average: number; total: number } | null>(null);
  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    reviewsApi.list(productId, controller.signal)
      .then(page => setSummary({ productId, average: page.average, total: page.total }))
      .catch(() => {});
    return () => controller.abort();
  }, [productId]);
  return summary?.productId === productId ? summary : null;
}

export function ProductDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = typeof params.id === "string" ? params.id : "";
  const vm = useProductDetailViewModel(id);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [shareError, setShareError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const { session } = useSession();
  const cart = useAddToCart(session?.accessToken ?? null, session?.sessionId);
  const [quantity, setQuantity] = useState({ variantId: 0, value: 1 });
  const reviews = useReviewSummary(vm.product?.id ?? null);
  if (vm.isLoading) return <ScreenState appearance="storefront" loading title="Cargando producto…" />;
  if (vm.error || !vm.product) return <ScreenState appearance="storefront" title={vm.error ?? "Producto no encontrado"} action={vm.error === "Producto no encontrado" ? "Volver" : "Reintentar"} onAction={() => vm.error === "Producto no encontrado" ? (router.canGoBack() ? router.back() : router.replace("/catalog")) : vm.retry()} />;
  const { product, selected } = vm;
  const galleryWidth = Math.max(1, width - insets.left - insets.right - spacing.lg * 2);
  const galleryHeight = Math.min(galleryWidth, 380);
  const images = selected?.images ?? [];
  const max = selected ? Math.min(99, selected.stock) : 0;
  const count = quantity.variantId === selected?.id ? quantity.value : 1;
  const canAdd = !!selected && selected.stock >= count && count > 0 && count <= 99 && !cart.busy;
  const groups = attributeGroups(product.variants);
  const select = (variant: Variant | null) => { if (variant) { vm.selectVariant(variant.id); setImageIndex(0); } };
  const goBack = () => router.canGoBack() ? router.back() : router.replace("/catalog");
  const openReviews = () => router.push({ pathname: "/reviews/[id]", params: { id: String(product.id) } });
  const share = async () => {
    setShareError(null);
    try { await Share.share({ message: `${product.name}\n${productWebsiteUrl(product)}` }); }
    catch { setShareError("No se pudo abrir la opción de compartir. Intenta de nuevo."); }
  };
  const rating = reviews?.total ? Math.round(reviews.average * 10) / 10 : 0;
  return <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <View style={[styles.gallery, { height: galleryHeight }]}>
        {images.length ? <ScrollView key={`${selected?.id}-${galleryWidth}`} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setImageIndex(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))}>
          {images.map((uri, i) => <ProductImage key={`${uri}-${i}`} uri={uri} label={`${product.name}, imagen ${i + 1}`} style={[styles.galleryImage, { width: galleryWidth, height: galleryHeight }]} />)}
        </ScrollView> : <ProductImage label={product.name} style={[styles.galleryImage, { height: galleryHeight }]} />}
        {images.length > 1 && <Text style={styles.counter}>{Math.min(imageIndex + 1, images.length)} / {images.length}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2} onPress={goBack} style={({ pressed }) => [styles.circle, styles.overlayLeft, pressed && styles.pressed]}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Compartir producto" hitSlop={2} onPress={() => void share()} style={({ pressed }) => [styles.circle, styles.overlayRight, pressed && styles.pressed]}>
          <Share2 size={20} color={colors.primary} />
        </Pressable>
      </View>
      <View style={styles.info}>
        <Text style={styles.brand}>{product.brand}</Text>
        <Text accessibilityRole="header" style={styles.title}>{product.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver reseñas del producto"
          accessibilityHint={reviews?.total ? `Calificación ${rating} de 5, ${reviews.total} ${reviews.total === 1 ? "reseña" : "reseñas"}` : undefined}
          onPress={openReviews} hitSlop={6} style={({ pressed }) => [styles.ratingRow, pressed && styles.pressed]}>
          <View style={styles.stars}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={16} color={colors.warning} fill={n <= Math.round(rating) ? colors.warning : "transparent"} />)}</View>
          <Text style={styles.ratingText}>{reviews?.total ? `${rating.toFixed(1)} · ${reviews.total} ${reviews.total === 1 ? "reseña" : "reseñas"}` : "Ver reseñas"}</Text>
        </Pressable>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{selected ? money(selected.price) : "Sin precio disponible"}</Text>
          <Text style={[styles.stock, !(selected && selected.stock > 0) && styles.soldOut]}>{selected && selected.stock > 0 ? `${selected.stock} disponibles` : "Agotado"}</Text>
        </View>
        {!!shareError && <Text accessibilityRole="alert" style={styles.error}>{shareError}</Text>}

        {groups.map(([key, values]) => {
          const color = isColorKey(key);
          const current = selected?.attributes[key];
          return <View key={key} style={styles.group}>
            <Text style={styles.label}>{key}{current ? <Text style={styles.labelValue}>: {current}</Text> : null}</Text>
            <View style={styles.choices}>
              {values.map(value => {
                const target = variantFor(product.variants, selected, key, value);
                const active = current === value;
                // Disponible si existe esa combinación con los demás atributos elegidos y tiene existencias.
                const combo = product.variants.find(v => v.attributes[key] === value &&
                  Object.entries(selected?.attributes ?? {}).every(([k, val]) => k === key || v.attributes[k] === val));
                const available = !!combo && combo.stock > 0;
                const fill = color ? swatch(value) : null;
                return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${key}: ${value}`}
                  accessibilityState={{ checked: active }} accessibilityHint={available ? undefined : "Sin existencias"} hitSlop={color ? 4 : 0}
                  onPress={() => select(target)} style={({ pressed }) => [color ? styles.swatchRing : styles.size, active && (color ? styles.swatchRingActive : styles.sizeActive), !available && styles.unavailable, pressed && styles.pressed]}>
                  {color
                    ? <View style={[styles.swatch, fill ? { backgroundColor: fill } : styles.swatchUnknown]}>{!fill && <Text style={styles.swatchInitial}>{value.slice(0, 1).toUpperCase()}</Text>}</View>
                    : <Text style={[styles.sizeLabel, active && styles.sizeLabelActive, !available && styles.strike]}>{value}</Text>}
                </Pressable>;
              })}
            </View>
          </View>;
        })}
        {/* Varias variantes sin atributos: se eligen por posición, sin exponer el SKU. */}
        {!groups.length && product.variants.length > 1 && <View style={styles.group}>
          <Text style={styles.label}>Opción</Text>
          <View style={styles.choices}>{product.variants.map((v, i) => <Pressable key={v.id} accessibilityRole="radio" accessibilityLabel={`Opción ${i + 1}`}
            accessibilityState={{ checked: selected?.id === v.id }} onPress={() => select(v)} style={[styles.size, selected?.id === v.id && styles.sizeActive, v.stock <= 0 && styles.unavailable]}>
            <Text style={[styles.sizeLabel, selected?.id === v.id && styles.sizeLabelActive]}>{i + 1}</Text></Pressable>)}</View>
        </View>}

        <View style={styles.group}>
          <Text style={styles.label}>Cantidad{selected && selected.stock > 0 ? <Text style={styles.labelValue}>  ·  máx. {max}</Text> : null}</Text>
          <View style={styles.quantity}>
            <Pressable accessibilityRole="button" accessibilityLabel="Restar cantidad" accessibilityState={{ disabled: count <= 1 || cart.busy }} disabled={count <= 1 || cart.busy} hitSlop={4}
              style={[styles.step, (count <= 1 || cart.busy) && styles.disabled]} onPress={() => selected && setQuantity({ variantId: selected.id, value: count - 1 })}><Minus size={18} color={colors.secondary} /></Pressable>
            <Text style={styles.quantityLabel}>{count}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Sumar cantidad" accessibilityState={{ disabled: !selected || count >= max || cart.busy }} disabled={!selected || count >= max || cart.busy} hitSlop={4}
              style={[styles.step, (!selected || count >= max || cart.busy) && styles.disabled]} onPress={() => selected && setQuantity({ variantId: selected.id, value: count + 1 })}><Plus size={18} color={colors.secondary} /></Pressable>
          </View>
        </View>

        {!!selected && <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{money(selected.price * count)}</Text></View>}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canAdd }} disabled={!canAdd} style={({ pressed }) => [styles.add, !canAdd && styles.disabled, pressed && styles.pressed]}
          onPress={() => { if (!session) router.push({ pathname: "/login", params: { returnTo: "/product/" + product.id } }); else if (selected) void cart.add(selected.id, count); }}>
          <Text style={styles.addLabel}>{cart.busy ? "Agregando…" : session ? "Agregar al carrito" : "Iniciar sesión para agregar"}</Text>
        </Pressable>
        {!!cart.result && <Text accessibilityRole="alert" style={cart.result.error ? styles.error : styles.muted}>{cart.result.message}</Text>}
        {cart.result && <Pressable accessibilityRole="button" style={styles.cartLink} onPress={() => router.push("/cart")}><Text style={styles.cartLinkLabel}>{cart.result.error ? "Consultar carrito" : "Ver carrito"}</Text></Pressable>}

        <View style={styles.section}>
          <Text style={styles.heading}>Descripción</Text>
          <Text style={styles.description}>{product.description || "Sin descripción disponible."}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>Especificaciones</Text>
          <View style={styles.detail}><Text style={[styles.muted, styles.detailLabel]}>Categoría</Text><Text style={styles.detailValue}>{product.category}</Text></View>
          <View style={styles.detail}><Text style={[styles.muted, styles.detailLabel]}>Tipo</Text><Text style={styles.detailValue}>{product.parentCategory}</Text></View>
          {Object.entries(selected?.attributes ?? {}).map(([key, value]) => <View key={key} style={styles.detail}><Text style={[styles.muted, styles.detailLabel]}>{key}</Text><Text style={styles.detailValue}>{value}</Text></View>)}
          {!!product.sports.length && <View style={[styles.detail, styles.detailLast]}><Text style={[styles.muted, styles.detailLabel]}>Deportes</Text><Text style={styles.detailValue}>{product.sports.join(", ")}</Text></View>}
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  // Botones sobre la imagen: 44 px visibles + hitSlop de 2 px = 48 px táctiles.
  // Fondo blanco casi opaco, borde y sombra para distinguirse sobre imágenes claras u oscuras.
  circle: { position: "absolute", top: spacing.md, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.92)", borderWidth: 1, borderColor: storefront.border, boxShadow: "0 2px 6px rgba(0,0,0,0.18)" },
  overlayLeft: { left: spacing.md },
  overlayRight: { right: spacing.md },
  pressed: { opacity: 0.65 },
  content: { paddingBottom: spacing.xxl },
  gallery: { marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radius.xl, overflow: "hidden", backgroundColor: storefront.imageBackground },
  galleryImage: { padding: spacing.xl, backgroundColor: storefront.imageBackground },
  counter: { position: "absolute", bottom: spacing.md, alignSelf: "center", paddingHorizontal: spacing.md, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.white, color: colors.textMuted, fontSize: 12, lineHeight: 19 },
  info: { padding: spacing.lg, gap: spacing.sm },
  brand: { color: colors.secondary, fontSize: 12, lineHeight: 18, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3, fontWeight: "700", color: colors.text },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "flex-start", minHeight: 32 },
  stars: { flexDirection: "row", gap: 2 },
  ratingText: { color: colors.secondary, fontSize: 14, lineHeight: 20, fontWeight: "600", textDecorationLine: "underline" },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" },
  price: { fontSize: 26, lineHeight: 34, fontWeight: "700", color: colors.secondary },
  stock: { paddingHorizontal: spacing.md, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.brandChipBg, color: colors.secondary, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  soldOut: { backgroundColor: "#FEE4E2", color: storefront.errorText },
  group: { gap: spacing.sm, marginTop: spacing.md },
  label: { fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.text },
  labelValue: { fontWeight: "400", color: colors.textMuted },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // Círculos de color de 36 px dentro de un anillo de 44 (+ hitSlop 4 = 52 táctiles).
  swatchRing: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatchRingActive: { borderColor: colors.primary },
  swatch: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center" },
  swatchUnknown: { backgroundColor: storefront.background },
  swatchInitial: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  size: { minWidth: 48, height: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  sizeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sizeLabel: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.text, includeFontPadding: false },
  sizeLabelActive: { color: colors.white },
  unavailable: { opacity: 0.45 },
  strike: { textDecorationLine: "line-through" },
  quantity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  step: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  quantityLabel: { minWidth: 28, textAlign: "center", fontSize: 18, lineHeight: 26, fontWeight: "600", color: colors.text },
  totalRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: storefront.border },
  totalLabel: { fontSize: 15, lineHeight: 22, color: colors.textMuted, fontWeight: "600" },
  total: { fontSize: 22, lineHeight: 30, fontWeight: "700", color: colors.text },
  add: { minHeight: 52, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.pill, marginTop: spacing.sm },
  addLabel: { color: colors.white, fontSize: 16, lineHeight: 24, fontWeight: "700", textAlign: "center" },
  cartLink: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border },
  cartLinkLabel: { color: colors.secondary, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  error: { color: storefront.errorText, fontSize: 14, lineHeight: 22 },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  section: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: storefront.background, gap: spacing.sm },
  heading: { fontSize: 16, lineHeight: 24, fontWeight: "700", color: colors.text },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  detail: { flexDirection: "row", gap: spacing.lg, paddingVertical: spacing.sm, justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: storefront.border },
  detailLast: { borderBottomWidth: 0 },
  detailLabel: { flex: 1 },
  detailValue: { flex: 1, textAlign: "right", color: colors.text, fontSize: 14, lineHeight: 22 },
});
