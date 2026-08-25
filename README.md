<div align="center">

# AI Styling Studio

**Describe yourself in plain English. Watch an AI model wear your outfit. Shop it for real.**

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey)](#license)

</div>

<br/>

<table>
<tr>
<td width="42%" valign="top">

<img src="docs/demo-model.jpeg" alt="AI-generated photorealistic styling model" width="100%" />

<sub><i>Real output — generated from the text description on the right, free tier, zero setup.</i></sub>

</td>
<td width="58%" valign="top">

### Type this:

> *"I'm a 5'6" curvy South Asian woman, warm brown skin, long dark hair. I love earthy tones and tailored, modest fits. Need a look for a client-facing office day."*

### Get this:

- A **real, photorealistic AI model** built to match — not a cartoon avatar
- Dressed in a **complete outfit pulled from real inventory** — Shopify stores, Google Shopping, or the built-in catalog
- Every piece **priced with real shipping**, grouped by merchant, running total live in the sidebar
- **Click any item on the model** to swap it for an alternative, or remove it — the model regenerates wearing the new pick
- **Type anything** — *"add a red belt under $30"* — and it shows up as an option to add
- **Save the whole look**, rename it, come back to it later

</td>
</tr>
</table>

<br/>

## Why this exists

Most "AI stylist" demos stop at a chatbot describing an outfit. This one closes the loop: it generates
an actual photo of a model built from your description, sources the pieces from real, live product data,
keeps a running shopping cart with real shipping costs, and prepares checkout split by merchant with a
delivery estimate for each — the way a real multi-retailer purchase would actually work.

## What's real right now

| Capability | Status | How |
| --- | --- | --- |
| AI model photo | **Live, zero setup** | Free photorealistic generation via [Pollinations.ai](https://pollinations.ai) — no key needed |
| AI model photo (upgrade) | Optional | Higher fidelity + true identity-lock across swaps via Gemini, if you add a billed `GEMINI_API_KEY` |
| Online product search | **Live** with a free key | Real Google Shopping results via [SerpApi](https://serpapi.com/) |
| Local store inventory | **Live** with your store | Real in-stock products + local pickup via the Shopify Storefront API |
| Seed catalog fallback | **Always on** | ~50-item catalog fills in so results are never empty, even with no keys set |
| Checkout | Simulated | Per-merchant order summary + delivery estimate; no agentic-commerce standard exists yet to place real multi-merchant orders |

Every integration lives behind a swappable provider in `lib/providers/` — turning on a real source is one
environment variable, never a code change. Full setup steps for each are below.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Generate My Look** — no API keys required
for the core experience.

## How it works

1. **Describe yourself** — body type, measurements, ethnicity, characteristics, style preferences, and
   the occasion, all in one free-text box, exactly like you'd brief a real stylist.
2. **Generate My Look** — the app picks a starter outfit matching your description and renders a
   photorealistic model wearing it.
3. **Click any item on the model** to see shoppable alternatives for that slot, or hit the **×** to
   remove it — the model regenerates wearing the change, keeping the same face/pose/background.
4. **Add anything via chat** — *"show me a wool scarf"* or *"add a red belt under $30"* — matched
   against live inventory and the catalog.
5. **Watch the cart** — grouped by merchant, subtotal/shipping/grand total update on every change.
6. **Save the look** — name it, revisit it later, or delete it.
7. **Checkout** — see the order split per merchant with an estimated delivery date for each.

## Setting up real data sources

<details>
<summary><b>Real online product search (Google Shopping)</b></summary>

<br/>

Sign up at [serpapi.com](https://serpapi.com/) (free tier available), copy your API key, and set:

```
SERPAPI_KEY=your-key-here
```

in `.env.local`. Every search, chat-add, and "find similar" call now includes live Google Shopping
results, ranked first.

</details>

<details>
<summary><b>Real local store inventory + pickup (Shopify)</b></summary>

<br/>

There's no public API that searches "nearby stores" in general — the only real, public way to get
genuine per-store stock is a specific store's own Shopify Storefront API. If you (or a local boutique
you're integrating) run a Shopify store:

1. Shopify Admin → Settings → Apps and sales channels → Develop apps → create an app
2. Give it the **Storefront API** scope only, install it, copy the access token
3. Set in `.env.local`:

```
SHOPIFY_STORES=[{"name":"Studio Verve","domain":"studio-verve.myshopify.com","token":"<token>","region":"Bengaluru"}]
```

List multiple stores in the same array. Only in-stock products are shown, framed as free local pickup.

</details>

<details>
<summary><b>Higher-fidelity AI model photos (Gemini upgrade, optional)</b></summary>

<br/>

The default (Pollinations) is already free and live — this is only for higher photorealism and a
true identity-lock across outfit swaps (it re-edits the *same* photo instead of regenerating fresh).

1. Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). **Note:** Gemini's
   image models require a billed Google account — the free tier doesn't cover image generation, only
   text. Cost is typically a few cents per image.
2. Set `GEMINI_API_KEY` in `.env.local`. Gemini is then tried first, with Pollinations as the automatic
   fallback if a call ever fails.

</details>

Restart `npm run dev` after editing `.env.local` — Next.js only reads env files at startup.

## Honest limitations

- **Not virtual try-on.** The model doesn't wear the literal product photos — the image model re-draws
  each garment from its real name, description, and color/material tags, which gets close but isn't a
  pixel-accurate composite. True virtual try-on needs a specialized model (e.g. IDM-VTON) and isn't free.
- **Pollinations is a free community service**, not an SLA-backed API — generation can take up to a
  minute and identity consistency across swaps is a soft guarantee (a stable seed), not a hard lock.
  The Gemini upgrade path fixes both.
- **Checkout is simulated.** No mature, generally-available standard exists yet for placing real orders
  across arbitrary independent merchants in one flow. The cart-splitting and delivery-estimate logic is
  real and ready to wire into Stripe (Checkout Sessions or Connect, depending on who the seller of
  record is) once you decide which model fits.

## Tech stack

- **Next.js 15** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** for styling
- **Zustand** for state, persisted to `localStorage`
- No database — product/image/checkout providers are swappable modules under `lib/providers/`

## Project structure

```
app/                      Next.js App Router pages + API routes
components/                UI components (intake form, model canvas, cart, chat, checkout, saved looks)
lib/providers/              image, product, checkout providers — mock by default, swap-ready
lib/store/                  Zustand store (profile, cart, generated model, chat, saved looks)
lib/types.ts                 Shared TypeScript types
data/catalog.json            Seed product catalog
docs/                         README assets
```

## License

MIT
