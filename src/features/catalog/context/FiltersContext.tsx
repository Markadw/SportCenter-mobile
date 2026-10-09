// src/features/catalog/context/FiltersContext.tsx
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import {
    catalogApi,
    type Brand,
    type Category,
    type Sport,
} from "../../../api";

interface FiltersState {
  categoryId: number | null;
  brandId: number | null;
  sportName: string | null;
}

interface FiltersContextType {
  categories: Category[];
  brands: Brand[];
  sports: Sport[];

  filters: FiltersState;
  setCategory: (id: number | null) => void;
  setBrand: (id: number | null) => void;
  setSport: (name: string | null) => void;
  clearFilters: () => void;
  activeCount: number;
}

const FiltersContext = createContext<FiltersContextType | undefined>(undefined);

export const FiltersProvider = ({ children }: { children: ReactNode }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [filters, setFilters] = useState<FiltersState>({
    categoryId: null,
    brandId: null,
    sportName: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const [cats, brs, sps] = await Promise.all([
          catalogApi.getCategories(),
          catalogApi.getBrands(),
          catalogApi.getSports(),
        ]);
        setCategories(cats);
        setBrands(brs);
        setSports(sps);
      } catch (e) {
        console.log("Error cargando filtros:", e);
      }
    })();
  }, []);

  const setCategory = useCallback((id: number | null) => {
    setFilters((f) => ({ ...f, categoryId: id }));
  }, []);

  const setBrand = useCallback((id: number | null) => {
    setFilters((f) => ({ ...f, brandId: id }));
  }, []);

  const setSport = useCallback((name: string | null) => {
    setFilters((f) => ({ ...f, sportName: name }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ categoryId: null, brandId: null, sportName: null });
  }, []);

  const activeCount = useMemo(
    () =>
      (filters.categoryId !== null ? 1 : 0) +
      (filters.brandId !== null ? 1 : 0) +
      (filters.sportName !== null ? 1 : 0),
    [filters]
  );

  return (
    <FiltersContext.Provider
      value={{
        categories,
        brands,
        sports,
        filters,
        setCategory,
        setBrand,
        setSport,
        clearFilters,
        activeCount,
      }}
    >
      {children}
    </FiltersContext.Provider>
  );
};

export const useFilters = () => {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters debe usarse dentro de FiltersProvider");
  return ctx;
};