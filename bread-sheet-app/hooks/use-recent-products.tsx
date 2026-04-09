import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface RecentProduct {
  barcode: string;
  name: string;
  brand: string | null;
  image: string | null;
  viewedAt: Date;
}

interface RecentProductsContextValue {
  recentProducts: RecentProduct[];
  addRecentProduct: (product: Omit<RecentProduct, 'viewedAt'>) => void;
}

const RecentProductsContext = createContext<RecentProductsContextValue>({
  recentProducts: [],
  addRecentProduct: () => {},
});

const MAX_RECENT = 20;

export function RecentProductsProvider({ children }: { children: ReactNode }) {
  const [recentProducts, setRecentProducts] = useState<RecentProduct[]>([]);

  const addRecentProduct = useCallback((product: Omit<RecentProduct, 'viewedAt'>) => {
    setRecentProducts((prev) => {
      // Move to top if already exists, otherwise prepend
      const filtered = prev.filter((p) => p.barcode !== product.barcode);
      return [{ ...product, viewedAt: new Date() }, ...filtered].slice(0, MAX_RECENT);
    });
  }, []);

  return (
    <RecentProductsContext.Provider value={{ recentProducts, addRecentProduct }}>
      {children}
    </RecentProductsContext.Provider>
  );
}

export function useRecentProducts() {
  return useContext(RecentProductsContext);
}
