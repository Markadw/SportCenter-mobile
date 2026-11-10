import { Tabs, useRouter } from "expo-router";
import { Home, Menu, Search, ShoppingBag } from "lucide-react-native";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, storefront } from "../../constants/theme";

export default function TabsLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  // Área táctil de 48 px, etiqueta ampliable y área segura inferior.
  const paddingBottom = insets.bottom > 0 ? insets.bottom : 6;
  const tabBarHeight = 4 + 48 + paddingBottom + 14 * Math.max(0, fontScale - 1);
  return <Tabs initialRouteName="index" backBehavior="history" screenOptions={{ headerShown: false,
    tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: { backgroundColor: colors.white, borderTopColor: storefront.border, height: tabBarHeight, paddingTop: 4, paddingBottom, elevation: 0, boxShadow: "none" },
    tabBarActiveBackgroundColor: colors.brandChipBg, tabBarLabelPosition: "below-icon",
    tabBarItemStyle: { minHeight: 48, marginHorizontal: 4, borderRadius: radius.md, overflow: "hidden" }, tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
    sceneStyle: { backgroundColor: colors.white } }}>
    <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color }) => <Home color={color} size={22} /> }} />
    <Tabs.Screen name="catalog" options={{ title: "Catálogo", tabBarIcon: ({ color }) => <Search color={color} size={22} /> }} />
    {/* El carrito sigue siendo la pantalla /cart del stack raíz; la pestaña sólo la abre. */}
    <Tabs.Screen name="cart-shortcut" options={{ title: "Carrito", tabBarIcon: ({ color }) => <ShoppingBag color={color} size={22} /> }}
      listeners={{ tabPress: event => { event.preventDefault(); router.navigate("/cart"); } }} />
    <Tabs.Screen name="account" options={{ title: "Menú", tabBarIcon: ({ color }) => <Menu color={color} size={22} /> }} />
  </Tabs>;
}
