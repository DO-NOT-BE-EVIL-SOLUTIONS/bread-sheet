const OFF_API = 'https://world.openfoodfacts.org/api/v2/product';

interface OFFResponse {
  status: number;
  product?: {
    product_name?: string;
    brands?: string;
    image_url?: string;
    generic_name?: string;
  };
}

export interface ProductData {
  barcode: string;
  name: string;
  brand: string | null;
  image: string | null;
  description: string | null;
}

export async function fetchFromOpenFoodFacts(barcode: string): Promise<ProductData | null> {
  const res = await fetch(`${OFF_API}/${barcode}?fields=product_name,brands,image_url,generic_name`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;

  const data = await res.json() as OFFResponse;

  if (data.status !== 1 || !data.product) return null;

  const { product } = data;

  return {
    barcode,
    name: product.product_name?.trim() || 'Unknown Product',
    brand: product.brands?.trim() || null,
    image: product.image_url || null,
    description: product.generic_name?.trim() || null,
  };
}
