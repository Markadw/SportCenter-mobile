import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { useFilters } from "..";
import { useProducts } from "../../products/context/ProductsContext";

export type CatalogSort = "recent" | "priceAsc" | "priceDesc" | "name";
export const SORT_LABELS: Record<CatalogSort, string> = { recent: "Más recientes", priceAsc: "Precio: menor a mayor", priceDesc: "Precio: mayor a menor", name: "Nombre: A a Z" };
export const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const firstParam = (value?: string | string[]) => Array.isArray(value) ? value[0] ?? "" : value ?? "";

export function useCatalogViewModel() {
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const source = useProducts();
  const filterSource = useFilters();
  const routeQuery = firstParam(params.q);
  const requestKey = filterSource.catalogRequest?.key ?? 0;
  const [search, setSearch] = useState({ route: routeQuery, requestKey, value: routeQuery || filterSource.catalogRequest?.query || "" });
  const incomingQuery = search.requestKey !== requestKey ? filterSource.catalogRequest?.query ?? routeQuery : routeQuery;
  const changed = search.route !== routeQuery || search.requestKey !== requestKey;
  const query = changed ? incomingQuery : search.value;
  const setQuery = (value: string) => setSearch({ route: routeQuery, requestKey, value });
  const [sort, setSort] = useState<CatalogSort>("recent");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  if (changed) {
    setSearch({ route: routeQuery, requestKey, value: incomingQuery });
    if (search.requestKey !== requestKey) {
      setMinPrice(""); setMaxPrice(""); setSort("recent");
    }
  }
  const parsePrice = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
  const min = parsePrice(minPrice), max = parsePrice(maxPrice);
  const priceError = (min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0))
    ? "Escribe precios válidos, mayores o iguales a cero." : min !== null && max !== null && min > max ? "El precio mínimo no puede superar al máximo." : null;
  const { filters, categories, brands } = filterSource;
  const filtered = useMemo(() => {
    const terms = normalizeSearch(query.trim()).split(/\s+/).filter(Boolean);
    const category = categories.find(c => c.id === filters.categoryId);
    const brand = brands.find(b => b.id === filters.brandId);
    const list = source.products.filter(p => {
      if (category && p.category !== category.name && p.parentCategory !== category.name) return false;
      if (brand && p.brand !== brand.name) return false;
      if (filters.sportName && !p.sports.includes(filters.sportName)) return false;
      const haystack = normalizeSearch([p.name, p.description, p.brand, p.category, ...p.sports].join(" "));
      if (!terms.every(term => haystack.includes(term))) return false;
      if (!priceError && (min !== null || max !== null)) {
        // Una misma variante debe cumplir ambos límites; no basta con cruzar el rango de la tarjeta.
        if (!p.variants.some(v => (min === null || v.price >= min) && (max === null || v.price <= max))) return false;
      }
      return true;
    });
    const lowest = (p: typeof list[number]) => p.variants.length ? Math.min(...p.variants.map(v => v.price)) : Infinity;
    if (sort === "priceAsc") list.sort((a, b) => lowest(a) - lowest(b));
    if (sort === "priceDesc") list.sort((a, b) => lowest(b) - lowest(a));
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    // El servicio entrega el catálogo en fecha de creación descendente.
    return list;
  }, [source.products, query, categories, brands, filters, sort, min, max, priceError]);
  const signature = JSON.stringify([requestKey, query, filters, sort, minPrice, maxPrice]);
  const [page, setPage] = useState({ signature, count: 20 });
  if (page.signature !== signature) setPage({ signature, count: 20 });
  const count = page.signature === signature ? page.count : 20;
  const clear = () => { setQuery(""); setMinPrice(""); setMaxPrice(""); filterSource.clearFilters(); };
  return { ...source, ...filterSource, query, setQuery, sort, setSort, minPrice, setMinPrice, maxPrice, setMaxPrice,
    priceError, filtered, visibleProducts: filtered.slice(0, count), hasMore: count < filtered.length,
    loadMore: () => setPage({ signature, count: count + 20 }), clear };
}
