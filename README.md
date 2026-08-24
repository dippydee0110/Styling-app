# AI Styling Studio

Describe yourself and your styling needs in plain English — body type, height/weight, ethnicity,
characteristics, preferences, occasion — and get an AI-generated model wearing a shoppable outfit.
Swap pieces by clicking the model, remove them the same way, add more via a chat box, and watch
shopping + shipping totals update live. Checkout splits the cart by merchant with a delivery
estimate for each.

## Status: real inventory + real image generation wired in, checkout still mocked

- **Product inventory** — **live** by default whenever you configure keys: real Google Shopping
  results via SerpApi (`lib/providers/googleShoppingProvider.ts`) and real in-stock products +
  local-pickup listings from any Shopify store you configure
  (`lib/providers/shopifyProvider.ts`, real Storefront API calls). The ~50-item seed catalog
  (`data/catalog.json`) always fills in alongside them, so search/alternatives/chat-add never go
  empty even with zero keys set.
- **AI model image** — **live by default, no key needed**: real photorealistic generation via the
  free, no-signup Pollinations.ai API (`lib/providers/pollinationsProvider.ts`), used automatically.
  A seed derived from your style profile keeps the model looking like the same person across
  outfit swaps, though this is a softer consistency guarantee than the Gemini path below — it's a
  free community service with no reliability/quality SLA. Set `GEMINI_API_KEY` (needs a billed
  Google account) for better photorealism and true identity-lock: it feeds the *previous* photo
  back in and asks Gemini to edit only the outfit, so the same face/pose/background carries over
  exactly. Falls back further to a deterministic SVG "model card" only if both real paths fail.
- **Checkout** — still a simulated per-merchant order confirmation flow. No mature,
  generally-available "agentic commerce" standard exists for placing real orders across arbitrary
  independent merchants, so this mirrors the shape a real one would have.

Each of these lives behind a provider interface in `lib/providers/`, so turning on a real source is
one environment variable — no UI or business-logic changes needed. See `.env.example` for the
exact variables.

### AI model image — already live, no setup needed

Click "Generate My Look" and you already get a real photorealistic photo (via Pollinations.ai) —
nothing to configure. For higher quality and stronger identity consistency across outfit swaps:

1. Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). **Note:** Gemini's
   image-generation models require a billed Google account — the free tier covers text models, but
   returns a quota-limit-0 error for image models specifically. Cost is typically a few cents per
   image once billing is enabled.
2. Set `GEMINI_API_KEY` in `.env.local`, restart `npm run dev`. Gemini is then tried first, with
   Pollinations as the automatic fallback if a Gemini call ever fails.

Note: generated people are always synthetic/fictional, built from whatever characteristics you
describe in plain text — not a real person. Image generation policies (what's allowed in prompts,
content filters) vary by provider and can change; if a generation is blocked or fails, the app
silently falls back down the chain (Gemini → Pollinations → SVG mock) rather than erroring.

### Getting real inventory showing

1. **Google Shopping (online products)** — sign up at [serpapi.com](https://serpapi.com/) (has a
   free tier), copy your API key, and set `SERPAPI_KEY` in `.env.local`. Every search, chat-add,
   and "find similar" call will now include live Google Shopping results, ranked first.
2. **Local store inventory + pickup (Shopify)** — there's no public API that searches "nearby
   stores" in general; the only real, public way to get genuine per-store stock is a specific
   store's own Shopify Storefront API. If you (or a local boutique you're integrating) run a
   Shopify store: Shopify Admin → Settings → Apps and sales channels → Develop apps → create an
   app → give it the **Storefront API** scope only → install → copy the Storefront access token.
   Then set `SHOPIFY_STORES` in `.env.local` to a JSON array, e.g.
   ```
   SHOPIFY_STORES=[{"name":"Studio Verve","domain":"studio-verve.myshopify.com","token":"<token>","region":"Bengaluru"}]
   ```
   You can list multiple stores. Only in-stock (`availableForSale`) products are shown, with
   `shippingCost: 0` and same-day delivery, framed as local pickup.
3. Restart `npm run dev` after editing `.env.local` (Next.js only reads env files at startup).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How it works

1. **Describe yourself** in the free-text box (`components/StyleIntakeForm.tsx`) — body type,
   measurements, ethnicity, preferences, occasion, region, anything you'd mention to a stylist.
2. Click **Generate My Look** — `/api/generate-model` picks a starter outfit that matches keywords
   in your description (office / ethnic / evening / casual templates in
   `lib/providers/productProvider.ts`) and renders the model.
3. **Click any highlighted item on the model** to open alternatives for that slot and swap it, or
   click the **×** that appears to remove it.
4. **Add anything via chat** — type e.g. "add a red belt under $30"; a lightweight keyword/price
   parser (`app/api/chat-add/route.ts`) matches it against the catalog.
5. The **cart sidebar** groups items by merchant and keeps subtotal / shipping / grand total live
   as you add, swap, or remove pieces.
6. **Checkout** shows the cart split per merchant with subtotal, shipping, and an estimated
   delivery date, then "places" a simulated order per merchant.

## Project structure

```
app/                 Next.js App Router pages + API routes
components/          UI components (intake form, model canvas, cart, chat, checkout)
lib/providers/       imageProvider, productProvider, checkoutProvider (mock, swap-ready)
lib/store/           Zustand store (profile, cart, generated model, chat)
lib/types.ts         Shared TypeScript types
data/catalog.json    Seed product catalog
```

## Going from mock to real

| Provider | Env var | Status |
| --- | --- | --- |
| Online product search | `SERPAPI_KEY` | **Live** — real Google Shopping results via `lib/providers/googleShoppingProvider.ts` |
| Local store inventory / pickup | `SHOPIFY_STORES` | **Live** — real Shopify Storefront API calls via `lib/providers/shopifyProvider.ts` |
| Image generation (default) | *(none)* | **Live** — free, no-key photorealistic photos via Pollinations.ai, `lib/providers/pollinationsProvider.ts` |
| Image generation (upgrade) | `GEMINI_API_KEY` | **Live** (needs a billed Google account — image models aren't on the free tier) — higher-quality photos + true identity-lock via Gemini's native image model, `lib/providers/imageProvider.ts` |
| Checkout | `CHECKOUT_PROVIDER_API_KEY` | Mock — replace `placeOrders` in `lib/providers/checkoutProvider.ts` with real per-merchant order calls once an agentic-commerce API is available, or wire Stripe (see below) |

### Checkout — Stripe

There are two realistic paths, and which one applies depends on what these "shopkeepers" actually
are to you:

- **You're the seller of record** (e.g. you personally fulfill/forward these orders, or this is
  your own aggregated storefront): use plain **Stripe Checkout Sessions** — one session per
  merchant group, all paid into your own Stripe account. This is a day of work: create a Checkout
  Session per `MerchantGroup` from `lib/cartMath.ts` inside `placeOrders`, redirect the browser to
  each session's URL (or open them in sequence), and confirm via a webhook.
- **These are real independent businesses who should each get paid directly**: that needs
  **Stripe Connect** — each merchant onboards their own Connect account through you first (a
  compliance/business relationship, not just an API call), and `placeOrders` creates a destination
  charge or transfer per merchant. Only pursue this if you actually have real merchant
  relationships to onboard.
Tell me which applies and I'll wire the actual `placeOrders` implementation.

## Publishing to GitHub

```bash
git init
git add .
git commit -m "Initial commit: AI Styling Studio"
```

Then either install the [GitHub CLI](https://cli.github.com/) and run:

```bash
gh repo create ai-styling-app --public --source=. --remote=origin --push
```

...or create an empty public repo on github.com and run:

```bash
git remote add origin https://github.com/<your-username>/ai-styling-app.git
git branch -M main
git push -u origin main
```
