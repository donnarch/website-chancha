# 찾차 Chancha — Boss Dashboard (web)

Big-screen dashboard for bosses. Same Supabase project and same boss accounts as the mobile app.

## Run on your computer
```bash
npm install
npm run dev          # http://localhost:5173
```

## Put it online (free)
1. Push this folder to a GitHub repo.
2. vercel.com → Add New → Project → pick the repo. Framework: **Vite**. Build: `npm run build`. Output: `dist`. Deploy.
   (Netlify or Cloudflare Pages work the same way.)
3. Supabase → Authentication → URL Configuration → add your site URL.
4. Optional, for instant live updates: Supabase → Database → Replication → enable `wash_jobs`, `users`, `cars`.
   Without it the page still refreshes by itself every 30 seconds.

## Checks
```bash
npm run test:parse   # plate/Excel/OCR text parser + auto-distribute tests
node scripts/check-keys.mjs   # every EN/KO string exists
```

## How the photo import works
Text recognition runs inside the browser (Tesseract, Korean model bundled in `public/tessdata`).
Photos never leave the computer. After reading, every row is editable before anything is saved.
