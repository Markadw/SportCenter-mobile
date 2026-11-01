import { useProducts } from "../../products";
import { useFilters } from "../../catalog";

export function useHomeViewModel() {
  const source = useProducts();
  const filters = useFilters();
  return { ...source, recent: source.products.filter(p => p.totalStock > 0).slice(0, 8),
    browseAll: () => { filters.clearFilters(); filters.requestCatalog(); }, search: filters.requestCatalog };
}
