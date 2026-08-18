import catalogRaw from "../../data/catalog.json";
import { Merchant, Product, Slot } from "../types";
import { productPlaceholder } from "../placeholderImage";

interface RawProduct {
  id: string;
  name: string;
  category: string;
  slot: Slot;
  price: number;
  currency: string;
  merchantId: string;
  shippingCost: number;
  estimatedDeliveryDays: number;
  imageColor: string;
  description: string;
  tags: string[];
}

const merchantsById = new Map<string, Merchant>(
  (catalogRaw.merchants as Merchant[]).map((m) => [m.id, m])
);

function hydrate(raw: RawProduct): Product {
  const merchant = merchantsById.get(raw.merchantId);
  if (!merchant) throw new Error(`Unknown merchant ${raw.merchantId}`);
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    slot: raw.slot,
    price: raw.price,
    currency: raw.currency,
    merchant,
    shippingCost: raw.shippingCost,
    estimatedDeliveryDays: raw.estimatedDeliveryDays,
    imageColor: raw.imageColor,
    imageUrl: productPlaceholder(raw.name, raw.imageColor, raw.category),
    description: raw.description,
    purchaseUrl: `https://example.com/shop/${raw.merchantId}/${raw.id}`,
    tags: raw.tags,
  };
}

const ALL_PRODUCTS: Product[] = (catalogRaw.products as RawProduct[]).map(hydrate);
const PRODUCTS_BY_ID = new Map(ALL_PRODUCTS.map((p) => [p.id, p]));

export interface SearchFilters {
  slot?: Slot;
  maxPrice?: number;
  region?: string;
  excludeId?: string;
  limit?: number;
}

function scoreAgainstQuery(product: Product, terms: string[]): number {
  const haystack = [
    product.name,
    product.category,
    product.description,
    product.merchant.region,
    ...product.tags,
  ]
    .join(" ")
    .toLowerCase();
  return terms.reduce((score, term) => (haystack.includes(term) ? score + 1 : score), 0);
}

/** MOCK provider — reads the local seed catalog. Swap for a real search API
 * (e.g. SerpApi Google Shopping) by setting SERPAPI_KEY and implementing the
 * fetch below; the return shape (Product[]) stays the same either way. */
export async function search(query: string, filters: SearchFilters = {}): Promise<Product[]> {
  if (process.env.SERPAPI_KEY) {
    // TODO(real provider): call
    //   https://serpapi.com/search.json?engine=google_shopping&q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_KEY}
    // then map the `shopping_results` array into Product[] (source/price/link/thumbnail).
    // Falls through to mock search below until implemented.
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  let results = ALL_PRODUCTS.filter((p) => p.id !== filters.excludeId);

  if (filters.slot) results = results.filter((p) => p.slot === filters.slot);
  if (filters.maxPrice !== undefined) results = results.filter((p) => p.price <= filters.maxPrice!);
  if (filters.region) {
    const region = filters.region.toLowerCase();
    results = results.filter((p) => p.merchant.region.toLowerCase().includes(region));
  }

  if (terms.length > 0) {
    results = results
      .map((p) => ({ p, score: scoreAgainstQuery(p, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.p);
  }

  return results.slice(0, filters.limit ?? 12);
}

export async function getAlternatives(productId: string, limit = 6): Promise<Product[]> {
  const product = PRODUCTS_BY_ID.get(productId);
  if (!product) return [];
  const candidates = ALL_PRODUCTS.filter((p) => p.slot === product.slot && p.id !== productId);
  const scored = candidates
    .map((p) => {
      const sharedTags = p.tags.filter((t) => product.tags.includes(t)).length;
      return { p, score: sharedTags };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.p);
}

export function getById(productId: string): Product | undefined {
  return PRODUCTS_BY_ID.get(productId);
}

export function allProducts(): Product[] {
  return ALL_PRODUCTS;
}

interface OutfitTemplate {
  keywords: string[];
  productIds: string[];
}

const TEMPLATES: Record<string, OutfitTemplate> = {
  ethnic_festive: {
    keywords: ["saree", "ethnic", "indian", "festive", "wedding", "traditional", "kurta", "diwali", "occasion"],
    productIds: ["p012", "p034", "p036", "p020", "p022"],
  },
  ethnic_office: {
    keywords: ["indian", "ethnic", "kurta", "kurti", "office", "work"],
    productIds: ["p013", "p014", "p035", "p044", "p048", "p021"],
  },
  office: {
    keywords: ["office", "work", "formal", "business", "interview", "professional", "boardroom"],
    productIds: ["p001", "p002", "p003", "p005", "p017", "p008", "p023", "p024"],
  },
  evening: {
    keywords: ["evening", "party", "date night", "cocktail", "gala", "dinner"],
    productIds: ["p041", "p036", "p017", "p045", "p049"],
  },
  casual: {
    keywords: ["casual", "weekend", "everyday", "relaxed", "brunch", "travel"],
    productIds: ["p016", "p033", "p007", "p019", "p050"],
  },
};

const DEFAULT_TEMPLATE = "casual";

export function pickDefaultOutfit(freeText: string, occasion?: string): Product[] {
  const text = `${freeText} ${occasion ?? ""}`.toLowerCase();
  let bestKey = DEFAULT_TEMPLATE;
  let bestScore = 0;
  for (const [key, template] of Object.entries(TEMPLATES)) {
    const score = template.keywords.reduce((s, kw) => (text.includes(kw) ? s + 1 : s), 0);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  const template = TEMPLATES[bestKey];
  return template.productIds.map((id) => PRODUCTS_BY_ID.get(id)).filter((p): p is Product => Boolean(p));
}
