import { Slot } from "./types";

export const SLOT_KEYWORDS: Record<Slot, string[]> = {
  bag: ["bag", "tote", "purse", "clutch", "crossbody", "handbag"],
  scarf: ["scarf", "dupatta", "stole"],
  shoes: ["shoes", "heels", "sandals", "boots", "loafers", "juttis", "flats", "footwear", "sneakers"],
  top: ["top", "blouse", "shirt", "kurti", "kurta", "sweater", "turtleneck", "tee", "t-shirt"],
  bottom: ["trousers", "pants", "skirt", "palazzo", "shorts", "bottom", "jeans"],
  dress: ["dress", "saree", "gown", "anarkali", "jumpsuit"],
  outerwear: ["jacket", "blazer", "coat", "outerwear", "cardigan"],
  jewelry: ["necklace", "earrings", "jewelry", "jewellery", "bracelet", "choker", "ring", "pendant"],
  belt: ["belt"],
  headwear: ["hat", "cap", "fedora", "beanie", "headwear"],
};

/** Best-effort slot classification for a free-text product title/type/tags string.
 * Returns undefined when nothing matches (caller should decide whether to
 * default or drop the item — dropping is usually more honest for live data). */
export function inferSlot(text: string): Slot | undefined {
  const lower = text.toLowerCase();
  for (const [slot, keywords] of Object.entries(SLOT_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return slot as Slot;
  }
  return undefined;
}
