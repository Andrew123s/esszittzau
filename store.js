/* ===================================================================
   ESS — Storage layer
   Exposes a single createStore() that returns either:
     - LocalStore     (fallback, browser-only)
     - FirestoreStore (real-time multi-device sync)
   The choice is automatic based on whether firebase-config.js was
   filled in.
   =================================================================== */

export const STAN_IDS = ['lin', 'sham', 'kim', 'ring'];
export const STAN_CAPACITY = 3;

function emptyState() {
  return {
    rosters: { lin: [], sham: [], kim: [], ring: [] },
    scores:  { lin: 0,  sham: 0,  kim: 0,  ring: 0 },
    plays:   [],
  };
}

/* Normalise any persisted blob into the expected shape, so missing
   fields from older saves never throw. */
function normalise(raw) {
  const s = emptyState();
  if (raw && typeof raw === 'object') {
    for (const id of STAN_IDS) {
      if (Array.isArray(raw.rosters?.[id])) s.rosters[id] = raw.rosters[id].slice();
      if (Number.isFinite(raw.scores?.[id])) s.scores[id]  = raw.scores[id];
    }
    if (Array.isArray(raw.plays)) s.plays = raw.plays.slice();
  }
  return s;
}

/* -------------------------------------------------------------------
   LocalStore — browser-only fallback, identical behaviour to the
   original implementation.
   ------------------------------------------------------------------- */
class LocalStore {
  constructor() {
    this.mode    = 'local';
    this.KEY     = 'ess.state.v1';
    this.state   = this.#read();
    this.subs    = new Set();
  }
  async init() { return this.state; }

  getState() { return this.state; }

  subscribe(cb) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  #notify() { this.subs.forEach(cb => cb(this.state)); }

  #read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return normalise(raw ? JSON.parse(raw) : null);
    } catch (_) { return emptyState(); }
  }
  #write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch (_) {}
  }

  async joinStan(stanId, playerName) {
    if (!STAN_IDS.includes(stanId)) return { ok: false, reason: 'bad-stan' };
    const roster = this.state.rosters[stanId];
    if (roster.length >= STAN_CAPACITY) return { ok: false, reason: 'full' };
    roster.push(playerName);
    this.#write(); this.#notify();
    return { ok: true };
  }

  async submitScore(stanId, playerName, score) {
    this.state.scores[stanId] = (this.state.scores[stanId] || 0) + score;
    this.state.plays.push({
      name: playerName, stan: stanId, score, ts: Date.now(),
    });
    this.#write(); this.#notify();
    return { ok: true };
  }

  async reset() {
    this.state = emptyState();
    this.#write(); this.#notify();
  }
}

/* -------------------------------------------------------------------
   FirestoreStore — real-time multi-device backend.
   - Stan capacity is enforced atomically with runTransaction so two
     students can never both grab the same last slot.
   - The arena document is the single source of truth for rosters and
     scores. Plays are appended to a subcollection.
   - onSnapshot pushes updates instantly to every connected client.
   ------------------------------------------------------------------- */
class FirestoreStore {
  constructor(config, arenaId) {
    this.mode     = 'cloud';
    this.config   = config;
    this.arenaId  = arenaId || 'default';
    this.state    = emptyState();
    this.subs     = new Set();
    this.app      = null;
    this.db       = null;
    this.arenaRef = null;
    this.unsub    = null;
    this._fb      = null;   // imported Firebase namespace
  }

  async init() {
    // Dynamically import the modular Firebase v10 SDK from the official CDN.
    const [{ initializeApp }, fs] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js'),
    ]);
    this._fb = fs;
    this.app  = initializeApp(this.config);
    this.db   = fs.getFirestore(this.app);
    this.arenaRef = fs.doc(this.db, 'arenas', this.arenaId);

    // Make sure the document exists so onSnapshot has something to watch.
    await fs.setDoc(this.arenaRef, {
      rosters:   emptyState().rosters,
      scores:    emptyState().scores,
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
    }, { merge: true });

    // Live listener — every roster / score change pushes to all clients.
    this.unsub = fs.onSnapshot(this.arenaRef, snap => {
      const data = snap.exists() ? snap.data() : null;
      this.state = normalise({
        rosters: data?.rosters,
        scores:  data?.scores,
        plays:   this.state.plays, // local cache; full list in subcollection
      });
      this.subs.forEach(cb => cb(this.state));
    });

    return this.state;
  }

  getState() { return this.state; }

  subscribe(cb) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  async joinStan(stanId, playerName) {
    if (!STAN_IDS.includes(stanId)) return { ok: false, reason: 'bad-stan' };
    const fs = this._fb;
    try {
      await fs.runTransaction(this.db, async tx => {
        const snap = await tx.get(this.arenaRef);
        const data = normalise(snap.exists() ? snap.data() : null);
        const roster = data.rosters[stanId];
        if (roster.length >= STAN_CAPACITY) {
          // Throwing aborts the transaction without writing.
          const err = new Error('full'); err.code = 'full'; throw err;
        }
        roster.push(playerName);
        tx.set(this.arenaRef, {
          rosters: data.rosters,
          scores:  data.scores,
          updatedAt: fs.serverTimestamp(),
        }, { merge: true });
      });
      return { ok: true };
    } catch (e) {
      if (e && e.code === 'full') return { ok: false, reason: 'full' };
      console.error('joinStan failed', e);
      return { ok: false, reason: 'error' };
    }
  }

  async submitScore(stanId, playerName, score) {
    const fs = this._fb;
    try {
      await fs.runTransaction(this.db, async tx => {
        const snap = await tx.get(this.arenaRef);
        const data = normalise(snap.exists() ? snap.data() : null);
        data.scores[stanId] = (data.scores[stanId] || 0) + score;
        tx.set(this.arenaRef, {
          rosters: data.rosters,
          scores:  data.scores,
          updatedAt: fs.serverTimestamp(),
        }, { merge: true });
      });
      await fs.addDoc(fs.collection(this.db, 'arenas', this.arenaId, 'plays'), {
        name: playerName, stan: stanId, score, ts: fs.serverTimestamp(),
      });
      return { ok: true };
    } catch (e) {
      console.error('submitScore failed', e);
      return { ok: false, reason: 'error' };
    }
  }

  async reset() {
    const fs = this._fb;
    try {
      const fresh = emptyState();
      await fs.setDoc(this.arenaRef, {
        rosters:   fresh.rosters,
        scores:    fresh.scores,
        updatedAt: fs.serverTimestamp(),
      });
      // Wipe the plays subcollection.
      const playsSnap = await fs.getDocs(fs.collection(this.db, 'arenas', this.arenaId, 'plays'));
      await Promise.all(playsSnap.docs.map(d => fs.deleteDoc(d.ref)));
    } catch (e) {
      console.error('reset failed', e);
    }
  }
}

/* -------------------------------------------------------------------
   Factory — picks the backend automatically.
   ------------------------------------------------------------------- */
function isConfigured(cfg) {
  return cfg && typeof cfg === 'object'
    && cfg.apiKey && cfg.projectId && cfg.appId;
}

function readArenaIdFromUrl() {
  try {
    const m = location.hash.match(/arena=([\w-]{1,40})/);
    if (m) return m[1];
  } catch (_) {}
  return null;
}

export async function createStore() {
  const cfg     = window.ESS_FIREBASE_CONFIG;
  const arenaId = readArenaIdFromUrl() || window.ESS_DEFAULT_ARENA || 'default';

  if (isConfigured(cfg)) {
    try {
      const store = new FirestoreStore(cfg, arenaId);
      await store.init();
      console.info(`[ESS] Cloud mode — arena: ${arenaId}`);
      return store;
    } catch (e) {
      console.warn('[ESS] Firebase init failed, falling back to local mode.', e);
    }
  } else {
    console.info('[ESS] Local mode — firebase-config.js not filled in.');
  }
  const store = new LocalStore();
  await store.init();
  return store;
}
