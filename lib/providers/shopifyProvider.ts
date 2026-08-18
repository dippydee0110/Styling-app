import { Product, Slot } from "../types";
import { inferSlot } from "../slotKeywords";
import { productPlaceholder } from "../placeholderImage";

export interface ShopifyStoreConfig {
  name: string;
  domain: string; // e.g. "my-boutique.myshopify.com"
  token: string; // Storefront API access token (public, read-only — safe for a storefront)
  region?: string;
}

/**
 * SHOPIFY_STORES env var: a JSON array of real stores to pull live inventory
 * from, e.g.
 *   SHOPIFY_STORES=[{"name":"Studio Verve","domain":"studio-verve.myshopify.com","token":"abc123","region":"Bengaluru"}]
 *
 * Each store owner generates their own Storefront API access token in
 * Shopify Admin -> Settings -> Apps and sales channels -> Develop apps
 * (Storefront API scope only — this token cannot see orders/customers/etc,
 * it's meant to be public-facing). There is no public directory of Shopify
 * stores to search automatically — this only surfaces stores you configure.
 */
function loadStoreConfigs(): ShopifyStoreConfig[] {
  const raw = process.env.SHOPIFY_STORES;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && s.domain && s.token && s.name);
  } catch {
    console.warn("SHOPIFY_STORES env var is not valid JSON — ignoring.");
    return [];
  }
}

function storeSlug(domain: string): string {
  return domain.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const STOREFRONT_QUERY = `
  query SearchProducts($query: String, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          description
          productType
          tags
          handle
          onlineStoreUrl
          availableForSale
          featuredImage { url }
          priceRange { minVariantPrice { amount currencyCode } }
        }
      }
    }
  }
`;

interface ShopifyProductNode {
  id: string;
  title: string;
  description: string;
  productType: string;
  tags: string[];
  handle: string;
  onlineStoreUrl: string | null;
  availableForSale: boolean;
  featuredImage: { url: string } | null;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
}

async function fetchFromStore(
  store: ShopifyStoreConfig,
  query: string,
  limit: number
): Promise<Product[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`https://${store.domain}/api/2024-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": store.token,
      },
      body: JSON.stringify({
        query: STOREFRONT_QUERY,
        variables: { query: query || undefined, first: limit },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`Shopify store ${store.domain} responded ${res.status}`);
      return [];
    }

    const data = await res.json();
    const edges: { node: ShopifyProductNode }[] = data?.data?.products?.edges ?? [];
    const slug = storeSlug(store.domain);

    return edges
      .map(({ node }) => node)
      .filter((node) => node.availableForSale)
      .map((node): Product | null => {
        const slot = inferSlot(`${node.title} ${node.productType} ${node.tags.join(" ")}`);
        if (!slot) return null;
        const price = Number(node.priceRange.minVariantPrice.amount);
        return {
          id: `shopify_${slug}_${encodeURIComponent(node.id)}`,
          name: node.title,
          category: node.productType || "Apparel",
          slot,
          price,
          currency: node.priceRange.minVariantPrice.currencyCode,
          merchant: {
            id: `shopify_${slug}`,
            name: store.name,
            region: store.region ? `${store.region} · Local Pickup` : "Local Pickup",
          },
          shippingCost: 0,
          estimatedDeliveryDays: 0,
          imageColor: "#cbbfae",
          imageUrl: node.featuredImage?.url ?? productPlaceholder(node.title, "#cbbfae", node.productType || "Apparel"),
          description: node.description || `${node.title} — available for local pickup at ${store.name}.`,
          purchaseUrl: node.onlineStoreUrl ?? `https://${store.domain}/products/${node.handle}`,
          tags: node.tags.map((t) => t.toLowerCase()),
        };
      })
      .filter((p): p is Product => p !== null);
  } catch (err) {
    console.warn(`Shopify store ${store.domain} lookup failed:`, err);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export interface ShopifySearchOptions {
  slot?: Slot;
  limit?: number;
}

export async function searchShopifyStores(
  query: string,
  opts: ShopifySearchOptions = {}
): Promise<Product[]> {
  const stores = loadStoreConfigs();
  if (stores.length === 0) return [];

  const perStoreLimit = opts.limit ?? 10;
  const results = await Promise.all(stores.map((store) => fetchFromStore(store, query, perStoreLimit)));
  let merged = results.flat();

  if (opts.slot) merged = merged.filter((p) => p.slot === opts.slot);

  return merged;
}

export function hasShopifyStoresConfigured(): boolean {
  return loadStoreConfigs().length > 0;
}
