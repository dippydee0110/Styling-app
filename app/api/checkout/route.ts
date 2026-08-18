import { NextResponse } from "next/server";
import { placeOrders } from "../../../lib/providers/checkoutProvider";
import { CartItem } from "../../../lib/types";

export async function POST(request: Request) {
  const body = await request.json();
  const cartItems: CartItem[] = body.cartItems ?? [];

  if (cartItems.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  const orders = await placeOrders(cartItems);
  return NextResponse.json({ orders });
}
