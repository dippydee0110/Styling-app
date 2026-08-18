import { NextResponse } from "next/server";
import { getAlternatives } from "../../../../../lib/providers/productProvider";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alternatives = await getAlternatives(id);
  return NextResponse.json({ products: alternatives });
}
