# Smart Utility Desk v1.1 Full-stack

Plain HTML/CSS/JavaScript Telegram Mini App with Node.js/Express backend.

## Features
Text analyzer/converter, length/weight/temperature converter, local quick notes, countdown timer/stopwatch, QR generator, Telegram Web Apps SDK, backend Telegram initData HMAC validation, AdsGram.ai Rewarded/Interstitial SDK integration.

## Setup
Requires Node.js 20+, a Telegram bot from @BotFather and (optionally) AdsGram.ai publisher blocks.
1. Copy `.env.example` to `.env`.
2. Set `TELEGRAM_BOT_TOKEN` from @BotFather. Keep it server-side only.
3. Optionally set AdsGram block IDs from your AdsGram.ai publisher dashboard.
4. Run `npm install` then `npm run dev`.
5. Visit `http://localhost:3000`. Telegram authentication requires launching the Mini App inside Telegram; direct browser visits are not authenticated Telegram sessions.

## AdsGram.ai
This code targets `partner.adsgram.ai` / `docs.adsgram.ai`.
- SDK: `https://sad.adsgram.ai/js/sad.min.js`
- Rewarded ID: `ADSGRAM_REWARDED_BLOCK_ID`
- Interstitial ID: `ADSGRAM_INTERSTITIAL_BLOCK_ID`
- IDs are public placement identifiers, not secrets; `/api/config` supplies them to the browser.
- Set `ADSGRAM_DEBUG=false` in production.
- This demo grants no cash, points or valuable reward. Do not treat a client-side callback as authoritative proof for valuable rewards. Implement rewards only if your account has a documented server-verifiable completion mechanism.
- Do not mix IDs or SDKs from different similarly named products/domains.

## Telegram security
Frontend sends raw `Telegram.WebApp.initData` to `/api/telegram/session`; backend verifies HMAC with bot token and checks `auth_date`. `initDataUnsafe` is display-only, never authentication. This demo returns a minimal verified profile but does not create persistent login sessions or a database. Protect future private endpoints with verified sessions or fresh initData validation.

## API
`GET /api/health`; `GET /api/config`; `POST /api/telegram/session` with `{ "initData": "<raw Telegram.WebApp.initData>" }`.

## Deploy
This is a Node server, not static-only hosting. Push to GitHub without `.env`; create a Node service on Render, Railway or VPS; install `npm install`; start `npm start`; set `TELEGRAM_BOT_TOKEN`, AdsGram IDs, `ADSGRAM_DEBUG=false`, `NODE_ENV=production`; enable HTTPS; test `/api/health`; set deployed URL in @BotFather; test inside Telegram on Android/Desktop.

## Before moderation
Add real support contact; update privacy disclosures to match hosting/CDNs/logs/ads; test all tools; keep core tools usable without ads; never fabricate audience or rewards; submit the actual working URL. Approval cannot be guaranteed.
