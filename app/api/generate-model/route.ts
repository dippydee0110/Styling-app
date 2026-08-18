import { NextResponse } from "next/server";
import { generateModel } from "../../../lib/providers/imageProvider";
import { pickDefaultOutfit } from "../../../lib/providers/productProvider";
import { CartItem, StyleProfile } from "../../../lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const profile: StyleProfile = body.profile ?? { freeText: "" };
  let cartItems: CartItem[] = body.cartItems ?? [];

  if (cartItems.length === 0) {
    const defaults = pickDefaultOutfit(profile.freeText, profile.occasion);
    cartItems = defaults.map((product) => ({ ...product, quantity: 1 }));
  }

  const model = await generateModel(profile, cartItems);

  return NextResponse.json({ model, cartItems });
}
