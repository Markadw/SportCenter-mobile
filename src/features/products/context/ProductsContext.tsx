// src/context/ProductsContext.tsx
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { productsApi } from "../../../api/productsApi";
import { Product } from "../types";

interface ProductsContextType {
  products: Product[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getById: (id: number) => Product | undefined;
}

const ProductsContext = createContext<ProductsContextType | undefined>(
  undefined
);

export const ProductsProvider = ({ children }: { children: ReactNode }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await productsApi.getAll();
      setProducts(data);
    } catch (e: any) {
      setError(e?.message ?? "Error al cargar productos");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // useEffect(() => {
  //   refresh();
  // }, [refresh]);


  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      try {
        const data = await productsApi.getAll();

        if (!cancelled) {
          setProducts(data);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Error al cargar productos"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const getById = (id: number) => products.find((p) => p.id === id);

  return (
    <ProductsContext.Provider
      value={{ products, isLoading, error, refresh, getById }}
    >
      {children}
    </ProductsContext.Provider>
  );
};

export const useProducts = () => {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts debe usarse dentro de ProductsProvider");
  return ctx;
};