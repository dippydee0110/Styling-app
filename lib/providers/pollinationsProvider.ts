import { CartItem, Slot, StyleProfile } from "../types";
import { describeOutfitForPrompt } from "../outfitPromptDescription";

/**
 * Deterministic hash so the same style profile always maps to the same
 * seed. Pollinations has no image-editing/identity-lock API (unlike the
 * Gemini path in imageProvider.ts), so a stable seed + a stable "core
 * description" clause repeated on every call is the only lever available
 * to keep the model looking like the same person across outfit swaps —
 * a weaker guarantee than true image-to-image editing, but genuinely free.
 */
function seedFromText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 1_000_000;
}

/**
 * Free, no-key, no-signup photorealistic generation via
 * https://pollinations.ai — an open, self-serve image API (Flux-based).
 * Used automatically as the default "real" image source when
 * GEMINI_API_KEY isn't set (or a Gemini call fails), so the app has a
 * genuine photorealistic model out of the box at zero cost.
 */
export async function generatePollinationsImage(
  profile: StyleProfile,
  wornBySlot: Partial<Record<Slot, CartItem>>
): Promise<string | null> {
  const outfitDescription = describeOutfitForPrompt(wornBySlot);
  const corePrompt = `Ultra-realistic professional fashion photography portrait of a person, styled like a polished Instagram fashion/style influencer. Person: ${
    profile.freeText || "a stylish adult model"
  }.${profile.occasion ? ` Styled for: ${profile.occasion}.` : ""} Full-body vertical portrait, soft natural studio lighting, shallow depth of field, confident editorial pose, clean minimal neutral background, photorealistic skin texture, high detail.`;
  const prompt = `${corePrompt} They are wearing: ${outfitDescription}. Render each garment/accessory as closely as possible to its exact stated color, material, cut, and silhouette — these are real products, not generic placeholders.`;

  const seed = seedFromText(`${profile.freeText}|${profile.occasion ?? ""}`);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt
  )}?width=768&height=1024&seed=${seed}&nologo=true&model=flux`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`Pollinations image generation responded ${res.status}`);
      return null;
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.warn("Pollinations image generation failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
