# ESS — Ecosystem System Services

Live interactive quiz platform built for an EU Nature Restoration Law academic presentation.

Pick a Stan, fight ten 10-second questions, and watch the scoreboard rank the four teams in real time.

## Quick start

### Single-device (no setup)

```bash
# from this folder
python -m http.server 8000
# open http://localhost:8000
```

Works offline; rosters and scores persist via `localStorage`.

### Multi-device (Firebase free tier)

1. Follow [`FIREBASE_SETUP.md`](FIREBASE_SETUP.md) — 5 minutes.
2. Drop the folder onto any static host (Netlify, Vercel, GitHub Pages, Cloudflare Pages).
3. Open the URL on every device — rosters and the scoreboard sync live.

The footer shows `[Cloud · live sync]` or `[Local · single device]` so you can confirm the active mode.

## How it works

| Screen | Behaviour |
|---|---|
| **Name** | Modal-style entry → plays `Choose_Your_Destiny.mp3` |
| **Stan select** | 4 cards (Lin / Sham / Kim / Ring), 3-fighter cap each, locks when full |
| **Welcome** | Confetti + balloons + `welcome.mp3` |
| **Quiz** | 10 questions, 10s timer per question, auto-advance on timeout |
| **End** | Per-player score + “Show Results” / “Pass to another fighter” |
| **Results** | Stans ranked by total correct answers; winner gets a red `FATALITY` button, loser gets a yellow `LOSER` button |

Stan capacity is enforced atomically via Firestore `runTransaction`, so two students tapping the same Stan at the same instant can never both grab the last slot.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup + screen templates + audio elements |
| `styles.css` | Soft, elegant palette + animations + responsive mobile patch |
| `app.js` | Game logic, screens, scoring, timer, animations |
| `store.js` | Storage abstraction — picks Firestore or `localStorage` automatically |
| `firebase-config.js` | Paste your Firebase web config here |
| `firestore.rules` | Security rules — copy into Firebase Console → Firestore → Rules |
| `FIREBASE_SETUP.md` | Step-by-step backend setup |

## Tech

Plain HTML / CSS / vanilla ES modules. Firebase v10 modular SDK is dynamically imported only when a config is supplied. `canvas-confetti` via CDN. No build step.
