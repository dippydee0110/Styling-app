import { CartItem, Slot } from "./types";

/**
 * Turns one cart item into a detailed clause for an image-generation prompt,
 * pulling in the *real* product's own description and tags (color, material,
 * cut) — not just its name — so a text-to-image model has enough to draw
 * something that actually resembles the specific real product, not a generic
 * stand-in for its category. This is not pixel-accurate virtual try-on (see
 * README), just the closest a prompt can get a general image model.
 */
const MAX_DESCRIPTION_LENGTH = 70;

// Per-item cap (rather than truncating the joined string) so every garment
// still gets mentioned — a longer outfit stays complete, just more concise
// per piece, instead of losing whichever items land past a total-length cutoff.
function describeItem(item: CartItem): string {
  const descriptors = item.tags.slice(0, 3).join(", ");
  const description =
    item.description.length > MAX_DESCRIPTION_LENGTH
      ? `${item.description.slice(0, MAX_DESCRIPTION_LENGTH)}…`
      : item.description;
  const parts = [item.name];
  if (description) parts.push(description);
  if (descriptors) parts.push(`(${descriptors})`);
  return parts.join(" — ");
}

export function describeOutfitForPrompt(wornBySlot: Partial<Record<Slot, CartItem>>): string {
  const pieces = Object.values(wornBySlot)
    .filter((item): item is CartItem => Boolean(item))
    .map(describeItem);
  return pieces.length > 0 ? pieces.join("; ") : "a simple, stylish everyday outfit";
}
