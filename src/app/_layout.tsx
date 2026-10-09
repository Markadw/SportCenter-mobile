// src/app/_layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppHeader } from "../components/AppHeader";
import { colors } from "../constants/theme";
import { BannersProvider } from "../features/banners";
import { FiltersProvider } from "../features/catalog";
import { ProductsProvider } from "../features/products";

export default function RootLayout() {
  return (
    <ProductsProvider>
      <BannersProvider>
        <FiltersProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: true,
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: colors.white,
              headerTitle: () => <AppHeader />,
              headerTitleAlign: "left",
              contentStyle: { backgroundColor: colors.white },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="catalog" options={{ headerShown: false }} />
            <Stack.Screen
              name="product/[id]"
              options={{ headerShown: false }}
            />
          </Stack>
        </FiltersProvider>
      </BannersProvider>
    </ProductsProvider>
  );
}
