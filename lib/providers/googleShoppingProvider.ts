import { Product, Slot } from "../types";
import { inferSlot } from "../slotKeywords";
import { productPlaceholder } from "../placeholderImage";

interface SerpApiShoppingResult {
  position?: number;
  product_id?: string;
  title: string;
  link?: string;
  product_link?: string;
  source?: string;
  price?: string;
  extracted_price?: number;
  thumbnail?: string;
  delivery?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "₹": "INR",
  "£": "GBP",
  "€": "EUR",
};

function detectCurrency(priceText?: string): string {
  if (!priceText) return "USD";
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (priceText.includes(symbol)) return code;
  }
  return "USD";
}

function parseShipping(delivery?: string): { shippingCost: number; estimatedDeliveryDays: number } {
  if (!delivery) return { shippingCost: 6.99, estimatedDeliveryDays: 7 };
  const lower = delivery.toLowerCase();
  const shippingCost = lower.includes("free") ? 0 : (() => {
    const match = delivery.match(/[$₹£€]\s?([\d.]+)/);
    return match ? Number(match[1]) : 6.99;
  })();
  const dayRangeMatch = delivery.match(/(\d+)\s*-\s*(\d+)\s*day/);
  const singleDayMatch = delivery.match(/(\d+)\s*day/);
  const estimatedDeliveryDays = dayRangeMatch
    ? Number(dayRangeMatch[2])
    : singleDayMatch
    ? Number(singleDayMatch[1])
    : 7;
  return { shippingCost, estimatedDeliveryDays };
}

const REGION_TO_COUNTRY: Record<string, string> = {
  india: "in",
  us: "us",
  usa: "us",
  "united states": "us",
  uk: "gb",
  "united kingdom": "gb",
  canada: "ca",
  australia: "au",
};

function regionToCountryCode(region?: string): string | undefined {
  if (!region) return undefined;
  return REGION_TO_COUNTRY[region.trim().toLowerCase()];
}

export interface GoogleShoppingSearchOptions {
  slot?: Slot;
  limit?: number;
  region?: string;
}

/**
 * Real Google Shopping results via SerpApi (https://serpapi.com/) — a public,
 * self-serve API that scrapes/serves Google Shopping results legitimately.
 * Requires SERPAPI_KEY. Falls back to an empty array (never throws) so a
 * missing key or a flaky request just means fewer results, not a crash.
 */
export async function searchGoogleShopping(
  query: string,
  opts: GoogleShoppingSearchOptions = {}
): Promise<Product[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey || !query.trim()) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      api_key: apiKey,
      num: String(opts.limit ?? 10),
    });
    const gl = regionToCountryCode(opts.region);
    if (gl) params.set("gl", gl);

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`SerpApi responded ${res.status}`);
      return [];
    }
    const data = await res.json();
    const results: SerpApiShoppingResult[] = data?.shopping_results ?? [];

    const products = results
      .map((result): Product | null => {
        const slot = inferSlot(result.title);
        if (!slot) return null;
        const { shippingCost, estimatedDeliveryDays } = parseShipping(result.delivery);
        const price = result.extracted_price ?? Number((result.price ?? "0").replace(/[^0-9.]/g, "")) ?? 0;
        const sourceName = result.source || "Google Shopping";
        return {
          id: `serp_${result.product_id ?? result.position ?? Math.random().toString(36).slice(2)}`,
          name: result.title,
          category: slot.charAt(0).toUpperCase() + slot.slice(1),
          slot,
          price,
          currency: detectCurrency(result.price),
          merchant: {
            id: `serp_${sourceName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()}`,
            name: sourceName,
            region: "Online",
          },
          shippingCost,
          estimatedDeliveryDays,
          imageColor: "#cbbfae",
          imageUrl: result.thumbnail ?? productPlaceholder(result.title, "#cbbfae", slot),
          description: result.title,
          purchaseUrl: result.product_link ?? result.link ?? "#",
          tags: result.title.toLowerCase().split(/\s+/).filter(Boolean),
        };
      })
      .filter((p): p is Product => p !== null);

    return opts.slot ? products.filter((p) => p.slot === opts.slot) : products;
  } catch (err) {
    console.warn("SerpApi Google Shopping lookup failed:", err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function hasGoogleShoppingConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}
