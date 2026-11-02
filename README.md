# SmartTools Pro — Telegram Mini App

An original, offline-first utility mini app. Core tools work without ads. AdsGram is an explicitly user-initiated optional placement.

## Included tools
- Text Lab: word/character count, case conversion, trim and whitespace cleanup
- Unit Converter: length, weight and temperature
- Quick Notes: create, edit, delete and locally save notes
- Timer & Stopwatch
- QR Generator (uses a public QRCodeJS CDN when online)
- About, Privacy and Terms pages

## Run locally
Requires Node.js 20+.

```bash
npm start
```

Open `http://localhost:3000`. Health check: `http://localhost:3000/health`.

## Deploy to Render
1. Push this folder to a new GitHub repository.
2. In Render, create a new **Web Service** from that repository.
3. Render can detect `render.yaml`; otherwise use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Wait for the service to become Live and test `/health`.
5. Set the HTTPS URL as the Telegram Mini App URL in BotFather.

## Telegram setup
1. Open `@BotFather` and select your bot.
2. Use `/setmenubutton` and choose the bot.
3. Set button text to `Open App`.
4. Set the Web App URL to your Render HTTPS URL.
5. Open the app from the actual Telegram bot and test on mobile and desktop.

The app calls `Telegram.WebApp.ready()` and `expand()` when available. It does not trust browser-supplied Telegram identity for any server-side action because this starter has no authenticated backend actions or user accounts.

## AdsGram setup — optional and user initiated
1. Create/register the Mini App platform in the AdsGram Publisher dashboard.
2. Make sure the platform URL matches the final Render HTTPS URL exactly.
3. Create an ad block for the correct format and obtain its `blockId`.
4. In `public/index.html`, replace `YOUR_ADSGRAM_BLOCK_ID` in `window.APP_CONFIG` with your real block ID.
5. Keep the `Show optional ad` button as a deliberate user action. The app does not auto-show ads on load, on every click, or as a condition for using tools.
6. Test in Telegram with the real AdsGram block. If no fill or SDK error occurs, the tools remain usable.

This project uses the AdsGram publisher SDK pattern:
- `https://sad.adsgram.ai/js/sad.min.js`
- `window.Adsgram.init({ blockId })`
- `controller.show()`

Use the exact SDK and format supported by your AdsGram Publisher account and current documentation. Never substitute a made-up block ID. AdsGram moderation/approval is decided by AdsGram, not by this code.

## Important production checklist
- Replace the support contact and policy contact details with a real contact you control.
- Publish the privacy policy at the final HTTPS URL and update the in-app links if you move it.
- Test all controls on Telegram Android, iOS and Desktop.
- Confirm that the Mini App link, bot username, bot ID and submitted Web App URL match.
- Keep genuine audience activity; do not buy, simulate or inflate traffic.
- Show AdsGram placement clearly in the app before submission.
- Do not promise cash payouts or rewards unless you can actually fulfill and verify them.
- This app stores notes locally in the user's browser storage. Clearing Telegram/browser data may delete them. No cloud sync is provided.

## Files
- `public/` — app UI and client-side tools
- `server.js` — small static Node server and health endpoint
- `render.yaml` — Render deployment configuration
