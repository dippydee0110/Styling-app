import { NextResponse } from "next/server";
import { search } from "../../../lib/providers/productProvider";
import { inferSlot } from "../../../lib/slotKeywords";

function detectMaxPrice(message: string): number | undefined {
  const match = message.match(/(?:under|below|less than)\s*\$?(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : undefined;
}

export async function POST(request: Request) {
  const body = await request.json();
  const message: string = body.message ?? "";

  const slot = inferSlot(message);
  const maxPrice = detectMaxPrice(message);
  const products = await search(message, { slot, maxPrice, limit: 5 });

  const reply =
    products.length > 0
      ? `Found ${products.length} option${products.length > 1 ? "s" : ""} for "${message}" — tap one to add it.`
      : `I couldn't find a match for "${message}" in the catalog yet — try describing the item differently (e.g. category, color, or a price limit like "under $50").`;

  return NextResponse.json({ reply, products });
}
