// src/features/banners/context/BannersContext.tsx
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { bannersApi, type Banner } from "../../../api";

interface BannersContextType {
  banners: Banner[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const BannersContext = createContext<BannersContextType | undefined>(undefined);

export const BannersProvider = ({ children }: { children: ReactNode }) => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await bannersApi.getAll();
      setBanners(data);
    } catch (e: any) {
      setError(e?.message ?? "Error al cargar banners");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // useEffect(() => {
  //   refresh();
  // }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const loadBanners = async () => {
      try {
        const data = await bannersApi.getAll();

        if (!cancelled) {
          setBanners(data);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setError(
            error instanceof Error
              ? error.message
              : "Error al cargar banners"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadBanners();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BannersContext.Provider value={{ banners, isLoading, error, refresh }}>
      {children}
    </BannersContext.Provider>
  );
};

export const useBanners = () => {
  const ctx = useContext(BannersContext);
  if (!ctx) throw new Error("useBanners debe usarse dentro de BannersProvider");
  return ctx;
};