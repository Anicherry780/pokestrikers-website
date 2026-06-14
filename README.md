# PokeStrikers — Pokémon TCG Promo Code Giveaway

A community code-sharing site. Users upload Pokémon TCG Live promo codes they don't need and claim codes others have shared.

- **Frontend:** Pure HTML/CSS/JS (no frameworks) — `public/`
- **Backend:** Cloudflare Pages Functions — `functions/api/`
- **Database:** Cloudflare D1 — `schema.sql`
- **Scanning:** BarcodeDetector API + Tesseract.js (free, in-browser)

Theme: Mega Charizard X — dark navy/black with electric-blue (`#00AAFF`) glow.

---

## How it works

| Feature | Detail |
|---|---|
| **Claim limit** | 1 free code per user. Watch a full PokeStrikers video (embedded) → unlocks a 2nd code. Max 2 codes, then a 24h cooldown that starts on the first claim. |
| **Claiming** | A random available code is assigned and shown with a 5-minute countdown. After 5 min it disappears and is marked expired. |
| **Uploading** | Any logged-in user can add a code (`XXX-XXXX-XXX-XXX`). Pack name optional (defaults to "Random Pack"). |
| **Admin** | Username `pokestrikers`. View/delete/bulk-upload codes, see users, camera scanner. |

---

## Setup (do this once)

See **`SETUP.md`** for exact step-by-step Cloudflare instructions.

## Local dev

```bash
npm install
npm run db:local      # create local D1 schema
npm run dev           # wrangler pages dev
```

