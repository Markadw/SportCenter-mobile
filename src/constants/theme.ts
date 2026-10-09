// src/constants/theme.ts — agrega/ajusta estas keys
export const colors = {
  primary: "#0367A6",
  secondary: "#04588C",
  accent: "#E67E22",
  success: "#22C55E",
  error: "#EF4444",
  warning: "#F59E0B",
  info: "#0EA5E9",

  white: "#FFFFFF",
  lightBg: "#F2F2F2",
  neutral: "#A6A6A6",
  border: "#E5E5E5",

  text: "#111111",
  textMuted: "#666666",
  brandChipBg: "#E8F1F8", // 👈 chip de marca
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  card: {
    boxShadow: "0 2px 8px rgba(3,103,166,0.08)",
    elevation: 2,
  },
  soft: {
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    elevation: 1,
  },
} as const;