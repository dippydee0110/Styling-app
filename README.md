# AI Styling Studio

Describe yourself and your styling needs in plain English — body type, height/weight, ethnicity,
characteristics, preferences, occasion — and get an AI-generated model wearing a shoppable outfit.
Swap pieces by clicking the model, remove them the same way, add more via a chat box, and watch
shopping + shipping totals update live. Checkout splits the cart by merchant with a delivery
estimate for each.

## Status: fully working demo, mocked data providers

Everything runs end-to-end with **zero API keys** using local mock providers:

- **AI model image** — a deterministic SVG "model card" rendered locally, colored per worn item.
- **Product catalog** — a ~50-item seed catalog (`data/catalog.json`) spanning bags, scarves, tops,
  bottoms, outerwear, shoes, jewelry, ethnic wear, etc., across a mix of online and local/regional
  mock merchants.
- **Checkout** — a simulated per-merchant order confirmation flow. No mature, generally-available
  "agentic commerce" standard exists yet for placing real orders across arbitrary independent
  merchants, so this mirrors the shape a real one would have and is ready to be swapped in.

Each of these lives behind a provider interface in `lib/providers/`, so you can go from mock to
real by setting one environment variable — no UI or business-logic changes needed. See
`.env.example` and the `TODO(real provider)` comments in each provider file for the exact request
shapes (OpenAI/Gemini/Stability for images, SerpApi Google Shopping for products).

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

| Provider | Env var | What to change |
| --- | --- | --- |
| Image generation | `IMAGE_PROVIDER_API_KEY` | Implement the `generateReal` fetch call in `lib/providers/imageProvider.ts` (request shapes for OpenAI/Gemini/Stability are commented in place) |
| Product search | `SERPAPI_KEY` | Implement the SerpApi call in `lib/providers/productProvider.ts` (`search`), mapping results into the `Product` type |
| Checkout | `CHECKOUT_PROVIDER_API_KEY` | Replace `placeOrders` in `lib/providers/checkoutProvider.ts` with real per-merchant order calls once an agentic-commerce API is available |

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
