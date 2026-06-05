# ESS — Firebase setup (5 minutes, free tier)

The platform auto-detects whether Firebase is configured.
Leave `firebase-config.js` blank → falls back to single-device `localStorage`.
Fill it in → all devices viewing the same arena sync rosters and scores in real time.

## 1. Create a Firebase project

1. Open <https://console.firebase.google.com/> and sign in with any Google account.
2. Click **Add project** → give it a name (e.g. `ess-arena`) → accept defaults → **Create**.
   *No billing card required. Spark (free) tier is plenty: 50K reads/day, 20K writes/day, 1 GB storage.*

## 2. Add a Web app

1. In the project overview, click the **`</>`** (Web) icon.
2. Nickname it `ESS`, leave Hosting unticked, click **Register app**.
3. Firebase shows a `firebaseConfig = { ... }` snippet — copy the six values.

## 3. Paste the config

Open `firebase-config.js` in this folder and replace the empty strings:

```js
window.ESS_FIREBASE_CONFIG = {
  apiKey:            "AIza...",
  authDomain:        "ess-arena.firebaseapp.com",
  projectId:         "ess-arena",
  storageBucket:     "ess-arena.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abc123",
};
```

## 4. Enable Firestore

1. In the left sidebar: **Build → Firestore Database → Create database**.
2. **Start in production mode** (we'll paste rules in a moment) → pick the region closest to you → **Enable**.
3. Switch to the **Rules** tab → replace the contents with the file `firestore.rules` from this folder → **Publish**.

## 5. Deploy the static files

Drop the whole folder onto any static host:

| Host | How |
|---|---|
| **Netlify** | drag-and-drop the folder onto <https://app.netlify.com/drop> |
| **Vercel** | `npx vercel --prod` from this folder |
| **GitHub Pages** | push to a repo, enable Pages on the branch |
| **Cloudflare Pages** | connect the repo, build command empty, output `/` |
| **Firebase Hosting** | `firebase init hosting` → `firebase deploy` |

That's it. Open the deployed URL on a laptop, on phones, on the projector — everyone sees the same Stan rosters and scoreboard in real time.

## Optional extras

- **Multiple parallel arenas.** Append `#arena=round-2` to the URL (any short slug works) — that opens a second independent scoreboard. Useful for breakout rooms.
- **Footer mode indicator.** The page footer shows `[Cloud · live sync]` or `[Local · single device]` so you can confirm at a glance which mode is active.
- **Quotas.** A 10-question session for 12 fighters writes ~30 documents total — you could run hundreds of sessions a day on the free tier.

## Troubleshooting

- **Footer shows `Local`** — `firebase-config.js` is missing one of `apiKey`, `projectId`, or `appId`. Re-copy from the Firebase console.
- **Permission denied errors in the console** — the Firestore rules tab still has the default `allow read, write: if false;`. Paste in `firestore.rules` and publish.
- **Audio doesn't play on first load** — browsers block autoplay until the user clicks something. The first user gesture (typing a name, clicking Continue) unblocks it.
