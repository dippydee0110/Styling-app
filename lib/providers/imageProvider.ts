import { CartItem, GeneratedModel, Slot, StyleProfile } from "../types";
import { SLOT_REGIONS, VIEWBOX } from "../slotLayout";
import { toDataUri } from "../placeholderImage";
import { generatePollinationsImage } from "./pollinationsProvider";

const SKIN_TONES = ["#8d5a3c", "#c68a5f", "#e0b088", "#f2cfa0", "#f6e2c8"];

function pickSkinTone(profile: StyleProfile): string {
  const text = profile.freeText.toLowerCase();
  if (/(deep|dark)\s*(skin|complexion|tone)/.test(text)) return SKIN_TONES[0];
  if (/(tan|olive|medium)\s*(skin|complexion|tone)/.test(text)) return SKIN_TONES[2];
  if (/(fair|light|pale)\s*(skin|complexion|tone)/.test(text)) return SKIN_TONES[4];
  // Deterministic but varied default based on text length so repeated calls with
  // the same profile stay stable.
  return SKIN_TONES[text.length % SKIN_TONES.length];
}

function buildModelSvg(wornBySlot: Partial<Record<Slot, CartItem>>, skinTone: string): string {
  const { width, height } = VIEWBOX;
  const hasDress = Boolean(wornBySlot.dress);

  const shapes: string[] = [];

  // Base body (neutral underlayer so uncovered slots don't look empty)
  shapes.push(`<ellipse cx="150" cy="90" rx="34" ry="40" fill="${skinTone}" />`); // head
  shapes.push(`<rect x="138" y="120" width="24" height="24" fill="${skinTone}" />`); // neck
  shapes.push(`<rect x="60" y="160" width="26" height="150" rx="12" fill="${skinTone}" opacity="0.9" />`); // left arm
  shapes.push(`<rect x="214" y="160" width="26" height="150" rx="12" fill="${skinTone}" opacity="0.9" />`); // right arm
  shapes.push(`<rect x="96" y="150" width="108" height="${hasDress ? 260 : 280}" rx="18" fill="#d8d2c4" />`); // base torso+legs
  shapes.push(`<ellipse cx="120" cy="470" rx="20" ry="10" fill="${skinTone}" opacity="0.85" />`); // left foot
  shapes.push(`<ellipse cx="180" cy="470" rx="20" ry="10" fill="${skinTone}" opacity="0.85" />`); // right foot

  const drawOrder: Slot[] = hasDress
    ? ["dress", "outerwear", "belt", "scarf", "jewelry", "headwear", "shoes", "bag"]
    : ["bottom", "top", "outerwear", "belt", "scarf", "jewelry", "headwear", "shoes", "bag"];

  for (const slot of drawOrder) {
    const item = wornBySlot[slot];
    if (!item) continue;
    const region = SLOT_REGIONS[slot];
    const rx = slot === "bag" ? 8 : 14;
    if (region.shape === "ellipse") {
      shapes.push(
        `<ellipse cx="${region.x + region.width / 2}" cy="${region.y + region.height / 2}" rx="${region.width / 2}" ry="${region.height / 2}" fill="${item.imageColor}" stroke="#00000022" />`
      );
    } else {
      shapes.push(
        `<rect x="${region.x}" y="${region.y}" width="${region.width}" height="${region.height}" rx="${rx}" fill="${item.imageColor}" stroke="#00000022" />`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f4efe4" />
    ${shapes.join("\n    ")}
  </svg>`;
}

function summarize(profile: StyleProfile, wornBySlot: Partial<Record<Slot, CartItem>>): string {
  const pieces = Object.values(wornBySlot)
    .filter(Boolean)
    .map((item) => (item as CartItem).name);
  const occasionPart = profile.occasion ? ` for ${profile.occasion}` : "";
  if (pieces.length === 0) {
    return `Your model, ready to be styled${occasionPart}.`;
  }
  return `Styled${occasionPart} with ${pieces.join(", ")}.`;
}

function describeOutfit(wornBySlot: Partial<Record<Slot, CartItem>>): string {
  const pieces = Object.values(wornBySlot)
    .filter((item): item is CartItem => Boolean(item))
    .map((item) => item.name);
  return pieces.length > 0 ? pieces.join(", ") : "a simple, stylish everyday outfit";
}

/** Parses a `data:<mime>;base64,<data>` URI. Returns null for non-data URIs
 * or the SVG mock placeholder (not usable as a photo reference). */
function parsePhotoDataUri(url: string | undefined): { mimeType: string; data: string } | null {
  if (!url) return null;
  const match = url.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

/**
 * Real photorealistic generation via Google's Gemini API (GEMINI_API_KEY —
 * free tier available at https://aistudio.google.com/apikey, no card
 * required). Uses gemini-2.5-flash-image's native image generation/editing:
 * on the very first render it generates a fresh photorealistic portrait from
 * the user's free-text description; on every outfit change after that, it
 * feeds the *previous* generated photo back in and asks for only the outfit
 * to change — keeping the same face/pose/background so it reads as one
 * consistent "model" across swaps, the way a real influencer account would.
 */
async function generateReal(
  profile: StyleProfile,
  wornBySlot: Partial<Record<Slot, CartItem>>,
  previousImageUrl?: string
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  const outfitDescription = describeOutfit(wornBySlot);
  const referencePhoto = parsePhotoDataUri(previousImageUrl);

  const prompt = referencePhoto
    ? `Using the attached reference photo, keep the exact same person completely unchanged — same face, body, pose, hairstyle, skin tone, and background. Only change their outfit so they are now wearing: ${outfitDescription}. Photorealistic professional fashion photography, polished Instagram-influencer style, high detail, no text or watermark.`
    : `Ultra-realistic professional fashion photography of a person, styled like a polished Instagram fashion/style influencer. Person: ${
        profile.freeText || "a stylish adult model"
      }.${profile.occasion ? ` Styled for: ${profile.occasion}.` : ""} They are wearing: ${outfitDescription}. Full-body vertical portrait, soft natural studio lighting, shallow depth of field, confident editorial pose, clean minimal neutral background, photorealistic skin texture, high detail, no text, no watermark, no logos.`;

  const parts: GeminiPart[] = [];
  if (referencePhoto) parts.push({ inlineData: referencePhoto });
  parts.push({ text: prompt });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.warn(`Gemini image generation responded ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const responseParts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((p) => p.inlineData);
    if (!imagePart?.inlineData) {
      console.warn("Gemini image generation returned no image part.");
      return null;
    }
    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
  } catch (err) {
    console.warn("Gemini image generation failed:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateModel(
  profile: StyleProfile,
  cartItems: CartItem[],
  previousImageUrl?: string
): Promise<GeneratedModel> {
  const wornBySlot: Partial<Record<Slot, CartItem>> = {};
  for (const item of cartItems) {
    wornBySlot[item.slot] = item;
  }

  const realImageUrl =
    (await generateReal(profile, wornBySlot, previousImageUrl)) ??
    (await generatePollinationsImage(profile, wornBySlot));
  const skinTone = pickSkinTone(profile);
  const imageUrl = realImageUrl ?? toDataUri(buildModelSvg(wornBySlot, skinTone));

  const wornSlots: Partial<Record<Slot, string>> = {};
  for (const [slot, item] of Object.entries(wornBySlot)) {
    if (item) wornSlots[slot as Slot] = item.id;
  }

  return {
    id: `model_${Date.now()}`,
    summary: summarize(profile, wornBySlot),
    imageUrl,
    wornSlots,
    generatedAt: new Date().toISOString(),
    source: realImageUrl ? "real" : "mock",
  };
}
