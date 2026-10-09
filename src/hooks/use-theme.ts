/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { colors } from "@/constants/theme";

export function useTheme() {
  return colors;
}

// import { Colors } from '@/constants/theme';
// import { useColorScheme } from '@/hooks/use-color-scheme';

// export function useTheme() {
//   const scheme = useColorScheme();
//   const theme = scheme === 'unspecified' ? 'light' : scheme;

//   return Colors[theme];
// }
