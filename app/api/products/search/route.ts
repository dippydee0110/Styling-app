import { NextResponse } from "next/server";
import { search } from "../../../../lib/providers/productProvider";
import { Slot } from "../../../../lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const slot = (searchParams.get("slot") as Slot | null) ?? undefined;
  const maxPriceParam = searchParams.get("maxPrice");
  const region = searchParams.get("region") ?? undefined;
  const limitParam = searchParams.get("limit");

  const results = await search(q, {
    slot,
    region,
    maxPrice: maxPriceParam ? Number(maxPriceParam) : undefined,
    limit: limitParam ? Number(limitParam) : undefined,
  });

  return NextResponse.json({ products: results });
}
