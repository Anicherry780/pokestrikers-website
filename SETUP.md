# PokeStrikers — Setup Guide

This deploys to **Cloudflare Pages** with **Pages Functions** (the backend API) and **D1** (the database). Everything is on Cloudflare's free tier.

> The API is built as **Pages Functions** (the `functions/` folder), which run as Workers and bind directly to D1. You don't deploy a separate Worker — Pages handles it.

---

## Part 1 — Push the code to GitHub

1. Create a new **empty** repo on GitHub: https://github.com/new
   - Owner: `Anicherry780`
   - Name: `pokestrikers-website`
   - **Do not** add a README/.gitignore (this project already has them).
2. In a terminal, from the project folder:

   ```bash
   git init
   git add .
   git commit -m "Initial PokeStrikers site"
   git branch -M main
   git remote add origin https://github.com/Anicherry780/pokestrikers-website.git
   git push -u origin main
   ```

---

## Part 2 — Create the D1 database

You can do this in the dashboard **or** the CLI. Dashboard is simplest:

### Dashboard
1. Cloudflare dashboard → **Storage & Databases → D1** → **Create database**.
2. Name it exactly **`pokestrikers-db`** → Create.
3. Open the database → **Console** tab → paste the entire contents of `schema.sql` → **Execute**.
4. Copy the **Database ID** shown on the database's page.
5. Open `wrangler.toml` in this repo and replace `PASTE_YOUR_D1_DATABASE_ID_HERE` with that ID. Commit & push the change.

### CLI alternative
```bash
npm install
npx wrangler login
npx wrangler d1 create pokestrikers-db        # copy the database_id it prints into wrangler.toml
npm run db:remote                              # runs schema.sql against the remote DB
```

---

## Part 3 — Create the Pages project & connect GitHub

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the `pokestrikers-website` repo → **Begin setup**.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
4. Click **Save and Deploy**. Wait for the first build to finish.

---

## Part 4 — Bind D1 and set the secret

1. In your new Pages project → **Settings → Bindings** (or **Functions → D1 database bindings**):
   - **Add binding** → Variable name: **`DB`** (must be exactly `DB`) → Database: **`pokestrikers-db`** → Save.
2. **Settings → Variables and Secrets** → **Add** a secret:
   - Name: **`SESSION_SECRET`**
   - Value: a long random string (e.g. run `[guid]::NewGuid()` twice in PowerShell and mash them together).
   - Type: **Secret** → Save.
3. **Redeploy** (Deployments → ⋯ → Retry deployment) so the binding + secret take effect.

> Set the `DB` binding and `SESSION_SECRET` for **Production** (and Preview, if you use preview branches).

---

## Part 5 — Connect your domain

1. Pages project → **Custom domains → Set up a custom domain** → enter `pokestrikers.com`.
2. Since the domain is already on Cloudflare, it adds the DNS record automatically. (Add `www.pokestrikers.com` too if you want.)

---

## Part 6 — Create the admin account

1. Go to your site → **Sign up**.
2. Register with username exactly **`pokestrikers`** and any password you choose. That account is automatically the admin (the `/admin` page unlocks for it).
3. Log in → **Admin** tab appears in the nav.

> ⚠️ Register `pokestrikers` yourself **before** sharing the site, so nobody else claims that username.

---

## Local development (optional)

```bash
npm install
copy .dev.vars.example .dev.vars     # then edit SESSION_SECRET
npm run db:local                     # build local D1 schema
npm run dev                          # http://localhost:8788
```

---

## Resetting / wiping data

- Re-running `schema.sql` is safe (uses `CREATE TABLE IF NOT EXISTS`).
- To wipe codes: in the D1 Console run `DELETE FROM codes;`
- To wipe everything: `DROP TABLE codes; DROP TABLE users;` then re-run `schema.sql`.

---

## Notes & limitations

- **Claim cooldown** is a rolling **24 hours** that starts on the user's first claim (not a calendar-midnight reset).
- **Passwords** are hashed with PBKDF2-SHA256 via Web Crypto (Workers don't support native bcrypt; PBKDF2 is the secure in-Workers equivalent).
- **Sessions** are HMAC-signed tokens stored in `localStorage`. Accounts live in D1, so clearing the browser just means logging back in.
- **Scanning** (BarcodeDetector + Tesseract.js) runs **entirely in the browser** — nothing is uploaded. The QR scanner needs Chrome/Edge/Android; on unsupported browsers it falls back to OCR automatically.
- Camera access requires **HTTPS** (works on your live `pokestrikers.com`; on localhost it's also allowed).
