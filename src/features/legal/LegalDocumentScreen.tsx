import { Stack, useRouter, type Href } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useRef } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, storefront } from "../../constants/theme";
import type { LegalDocument, LegalInline } from "./documents";

/** Documento legal en pantalla propia: encabezado compacto, regreso y desplazamiento vertical. */
export function LegalDocumentScreen({ heading, document }: { heading: string; document: LegalDocument }) {
  const router = useRouter();
  const scroll = useRef<ScrollView>(null);
  const anchors = useRef<Record<string, number>>({});
  const open = (href: string) => {
    if (href.startsWith("#")) { scroll.current?.scrollTo({ y: anchors.current[href.slice(1)] ?? 0, animated: true }); return; }
    if (href.startsWith("/")) { router.push(href as Href); return; }
    void Linking.openURL(href).catch(() => {});
  };
  const inline = (parts: LegalInline[]) => parts.map((part, i) => typeof part === "string" ? part
    : "bold" in part ? <Text key={i} style={styles.bold}>{part.bold}</Text>
      : <Text key={i} accessibilityRole="link" style={styles.link} onPress={() => open(part.href)}>{part.link}</Text>);
  return <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2}
        onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.topTitle} numberOfLines={1}>{heading}</Text>
      <View style={styles.topSpacer} />
    </View>
    <ScrollView ref={scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{document.title}</Text>
      <Text style={styles.meta}>{document.meta}</Text>
      {document.headerLink && <Text accessibilityRole="link" style={[styles.link, styles.headerLink]} onPress={() => open(document.headerLink!.href)}>{document.headerLink.link}</Text>}
      {document.sections.map(section => <View key={section.title} style={styles.section}
        onLayout={section.id ? e => { anchors.current[section.id!] = e.nativeEvent.layout.y; } : undefined}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
        {section.blocks.map((block, b) => "paragraph" in block
          ? <Text key={b} style={styles.paragraph}>{inline(block.paragraph)}</Text>
          : <View key={b} style={styles.list}>{block.list.map((item, i) => <View key={i} style={styles.item}>
              <Text style={styles.paragraph} importantForAccessibility="no">•</Text>
              <Text style={[styles.paragraph, styles.itemText]}>{inline(item)}</Text>
            </View>)}</View>)}
      </View>)}
      <View style={styles.footer}>
        <Text style={styles.meta}>{document.footer.note}</Text>
        {document.footer.links.map(item => <Text key={item.link} accessibilityRole="link" style={styles.link} onPress={() => open(item.href)}>{item.link}</Text>)}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: storefront.border },
  // 44 px visibles + hitSlop de 2 px = 48 px táctiles.
  circle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border },
  pressed: { opacity: 0.6 },
  topTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.text },
  topSpacer: { width: 44 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm, width: "100%", maxWidth: 720, alignSelf: "center" },
  title: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: "700", color: colors.text },
  meta: { fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted },
  headerLink: { marginTop: spacing.xs },
  section: { gap: spacing.sm, paddingTop: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, lineHeight: 24, fontWeight: "700", color: colors.text },
  paragraph: { fontSize: fontSize.sm + 1, lineHeight: 22, color: colors.text },
  bold: { fontWeight: "700" },
  link: { color: colors.primary, fontWeight: "600", textDecorationLine: "underline" },
  list: { gap: spacing.xs },
  item: { flexDirection: "row", gap: spacing.sm, paddingLeft: spacing.xs },
  itemText: { flex: 1 },
  footer: { gap: spacing.sm, marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: storefront.border },
});
