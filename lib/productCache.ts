import { Product } from "./types";

/**
 * Session-scoped cache for products sourced from live providers (Shopify,
 * Google Shopping) that don't have a database to look products back up by
 * id later (e.g. for "find similar"). Backed by a single in-memory Map, so
 * it only persists for the lifetime of this server process — fine for a
 * single-instance dev/demo deployment; a real deployment with multiple
 * server instances or serverless cold starts would need a shared store
 * (Redis, a DB row) instead.
 */
const MAX_ENTRIES = 1000;
const cache = new Map<string, Product>();

export function cacheProducts(products: Product[]): void {
  for (const product of products) {
    cache.delete(product.id);
    cache.set(product.id, product);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

export function getCachedProduct(id: string): Product | undefined {
  return cache.get(id);
}
