import {
  createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { catalogApi, type Brand, type Category, type Sport } from "../../../api";

interface FiltersState {
  categoryId: number | null;
  brandId: number | null;
  sportName: string | null;
}

type OptionsSource = "categories" | "brands" | "sports";
type OptionsErrors = Partial<Record<OptionsSource, string>>;

interface FiltersContextType {
  categories: Category[];
  brands: Brand[];
  sports: Sport[];
  // Opcionales para conservar compatibilidad con consumidores que proveen estados mínimos.
  loading?: boolean;
  loadError?: string | null;
  loadErrors?: OptionsErrors;
  retryLoad?: () => Promise<void>;
  filters: FiltersState;
  setCategory: (id: number | null) => void;
  setBrand: (id: number | null) => void;
  setSport: (name: string | null) => void;
  clearFilters: () => void;
  activeCount: number;
  catalogRequest: { key: number; query: string } | null;
  requestCatalog: (query?: string) => void;
}

const SOURCE_NAMES: Record<OptionsSource, string> = { categories: "categorías", brands: "marcas", sports: "deportes" };
const FiltersContext = createContext<FiltersContextType | undefined>(undefined);

export const FiltersProvider = ({ children }: { children: ReactNode }) => {
  const [catalogRequest, setCatalogRequest] = useState<{ key: number; query: string } | null>(null);
  const requestCatalog = useCallback((query = "") => setCatalogRequest(previous => ({ key: (previous?.key ?? 0) + 1, query })), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<OptionsErrors>({});
  const failures = useRef<OptionsErrors>({});
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [filters, setFilters] = useState<FiltersState>({ categoryId: null, brandId: null, sportName: null });

  const retryLoad = useCallback(async () => {
    if (!mounted.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const attempt = ++generation.current;
    setLoading(true);
    // Tras un fallo se reconsulta sólo su fuente, sin descartar las opciones que sí cargaron.
    const onlyFailed = Object.keys(failures.current).length > 0;
    const shouldLoad = (source: OptionsSource) => !onlyFailed || !!failures.current[source];
    const [categoryResult, brandResult, sportResult] = await Promise.allSettled([
      shouldLoad("categories") ? Promise.resolve().then(() => catalogApi.getCategories(controller.signal)) : Promise.resolve(null),
      shouldLoad("brands") ? Promise.resolve().then(() => catalogApi.getBrands(controller.signal)) : Promise.resolve(null),
      shouldLoad("sports") ? Promise.resolve().then(() => catalogApi.getSports(controller.signal)) : Promise.resolve(null),
    ]);
    if (!mounted.current || controller.signal.aborted || generation.current !== attempt) return;
    const nextErrors = { ...failures.current };
    function accept<T>(source: OptionsSource, result: PromiseSettledResult<T[] | null>, update: (values: T[]) => void) {
      if (result.status === "rejected") nextErrors[source] = "No pudimos cargar " + SOURCE_NAMES[source] + ".";
      else if (result.value !== null) { update(result.value); delete nextErrors[source]; }
    }
    accept("categories", categoryResult, setCategories);
    accept("brands", brandResult, setBrands);
    accept("sports", sportResult, setSports);
    failures.current = nextErrors;
    setLoadErrors(nextErrors);
    setLoading(false);
    if (request.current === controller) request.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void retryLoad();
    return () => {
      mounted.current = false;
      generation.current += 1;
      request.current?.abort();
      request.current = null;
    };
  }, [retryLoad]);

  const setCategory = useCallback((id: number | null) => setFilters(f => ({ ...f, categoryId: id })), []);
  const setBrand = useCallback((id: number | null) => setFilters(f => ({ ...f, brandId: id })), []);
  const setSport = useCallback((name: string | null) => setFilters(f => ({ ...f, sportName: name })), []);
  const clearFilters = useCallback(() => setFilters({ categoryId: null, brandId: null, sportName: null }), []);
  const activeCount = useMemo(() =>
    (filters.categoryId !== null ? 1 : 0) + (filters.brandId !== null ? 1 : 0) + (filters.sportName !== null ? 1 : 0), [filters]);
  const failedSources = Object.keys(loadErrors) as OptionsSource[];
  const loadError = failedSources.length
    ? "No pudimos cargar estas opciones: " + failedSources.map(source => SOURCE_NAMES[source]).join(", ") + ". Puedes usar las opciones disponibles o reintentar."
    : null;

  return <FiltersContext.Provider value={{
    categories, brands, sports, loading, loadError, loadErrors, retryLoad,
    filters, setCategory, setBrand, setSport, clearFilters, activeCount, catalogRequest, requestCatalog,
  }}>{children}</FiltersContext.Provider>;
};

export const useFilters = () => {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters debe usarse dentro de FiltersProvider");
  return ctx;
};
