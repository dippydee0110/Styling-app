import { CartItem, GeneratedModel, Slot, StyleProfile } from "../types";
import { SLOT_REGIONS, VIEWBOX } from "../slotLayout";
import { toDataUri } from "../placeholderImage";

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

async function generateReal(profile: StyleProfile, wornBySlot: Partial<Record<Slot, CartItem>>): Promise<string | null> {
  const apiKey = process.env.IMAGE_PROVIDER_API_KEY;
  if (!apiKey) return null;

  // TODO(real provider): build a descriptive prompt from `profile.freeText`
  // (body type/height/weight/ethnicity/characteristics as the user wrote it),
  // `profile.occasion`, and the worn product names/colors, then call an image
  // generation API. Example shapes:
  //
  // OpenAI (gpt-image-1):
  //   POST https://api.openai.com/v1/images/generations
  //   headers: { Authorization: `Bearer ${apiKey}` }
  //   body: { model: "gpt-image-1", prompt, size: "1024x1536" }
  //   -> response.data[0].b64_json or .url
  //
  // Google Gemini/Imagen:
  //   POST https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}
  //   body: { instances: [{ prompt }], parameters: { sampleCount: 1 } }
  //
  // Stability AI:
  //   POST https://api.stability.ai/v2beta/stable-image/generate/core
  //   headers: { Authorization: `Bearer ${apiKey}` }, multipart body: { prompt }
  //
  // Whichever is used, return a displayable image URL (data: URI or hosted
  // URL) here so the rest of the app doesn't need to change.
  try {
    return null; // not implemented — falls back to the mock renderer below
  } catch {
    return null;
  }
}

export async function generateModel(
  profile: StyleProfile,
  cartItems: CartItem[]
): Promise<GeneratedModel> {
  const wornBySlot: Partial<Record<Slot, CartItem>> = {};
  for (const item of cartItems) {
    wornBySlot[item.slot] = item;
  }

  const realImageUrl = await generateReal(profile, wornBySlot);
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
