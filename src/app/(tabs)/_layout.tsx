import { Tabs } from "expo-router";
import { Home, Search, User } from "lucide-react-native";
import { colors } from "../../constants/theme";

export default function TabsLayout() {
  return <Tabs backBehavior="history" screenOptions={{ headerShown: false,
    tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted,
    tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
    tabBarItemStyle: { minHeight: 52 }, tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
    sceneStyle: { backgroundColor: colors.white } }}>
    <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
    <Tabs.Screen name="catalog" options={{ title: "Catálogo", tabBarIcon: ({ color, size }) => <Search color={color} size={size} /> }} />
    <Tabs.Screen name="account" options={{ title: "Cuenta", tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }} />
  </Tabs>;
}
