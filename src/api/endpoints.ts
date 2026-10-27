export const ENDPOINTS = {
  products: {
    list: "/products/get-all-products",
    detail: (id: number | string) => `/products/get-product-details/${id}`,
    categories: "/products/get-all-categories",
    brands: "/products/get-all-marcas",
    sports: "/products/menu/sports",
  },
  registration: {
    create: "/users/create-user",
    verify: "/users/verify-email",
    resend: "/users/resend-code",
  },
  banners: {
    list: "/company/banner",
  },
} as const;