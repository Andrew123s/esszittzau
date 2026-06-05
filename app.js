/* ===================================================================
   ESS — Ecosystem System Services
   Live quiz platform for the EU Nature Restoration Law presentation.

   - Storage is delegated to ./store.js, which selects Firestore
     (real-time, multi-device) when firebase-config.js is filled in
     and falls back to localStorage otherwise.
   - The choose-Stan and results screens subscribe to live state so
     remote joins / scores show up instantly across every connected
     device.
   - Correct answers live only in QUESTIONS below; they are never
     written to the DOM until results time.
   =================================================================== */

import { createStore, STAN_IDS, STAN_CAPACITY } from './store.js';

// ---------------- Data ----------------

const STANS = [
  { id: 'lin',  name: 'Lin',  tag: 'Linnaeus',  c1: '#9bb1a4', c2: '#5e7a6b' },
  { id: 'sham', name: 'Sham', tag: 'Shamanic',  c1: '#e8c089', c2: '#a37939' },
  { id: 'kim',  name: 'Kim',  tag: 'Kimura',    c1: '#d49a93', c2: '#9a4f4d' },
  { id: 'ring', name: 'Ring', tag: 'Ringside',  c1: '#9ab4d4', c2: '#4a6995' },
];

// Question set — strictly from EU_Nature_Restoration_Law_Research_Brief.docx.
const QUESTIONS = [
  {
    q: "What is the formal name of the EU Nature Restoration Law?",
    options: ["Directive (EU) 2024/1991", "Regulation (EU) 2024/1991",
              "Regulation (EU) 2020/1991", "Directive (EU) 2024/991"],
    correctIndex: 1,
  },
  {
    q: "Roughly what share of the EU's natural habitats are currently in poor condition?",
    options: ["More than 50%", "More than 60%", "More than 80%", "More than 90%"],
    correctIndex: 2,
  },
  {
    q: "By 2030, at least what share of the EU's land and sea must have restoration measures in place?",
    options: ["10%", "20%", "30%", "50%"],
    correctIndex: 1,
  },
  {
    q: "By 2050, what share of habitats currently in poor condition must be restored?",
    options: ["60%", "75%", "90%", "100%"],
    correctIndex: 2,
  },
  {
    q: "How many kilometres of rivers must be restored to a free-flowing state by 2030?",
    options: ["10,000 km", "25,000 km", "50,000 km", "100,000 km"],
    correctIndex: 1,
  },
  {
    q: "By 2030, member states must show an increasing trend in at least how many of 7 forest biodiversity indicators?",
    options: ["3 of 7", "4 of 7", "6 of 7", "All 7"],
    correctIndex: 2,
  },
  {
    q: "How many additional trees must be planted across the EU by 2030?",
    options: ["1 billion", "2 billion", "3 billion", "5 billion"],
    correctIndex: 2,
  },
  {
    q: "By when must each member state submit its first National Restoration Plan to the European Commission?",
    options: ["September 2025", "September 2026", "December 2026", "September 2030"],
    correctIndex: 1,
  },
  {
    q: "Every €1 invested in nature restoration is estimated to yield approximately what range of economic returns?",
    options: ["€1–€5", "€2–€10", "€4–€38", "€10–€50"],
    correctIndex: 2,
  },
  {
    q: "Which member state cast the decisive last-minute vote that secured the qualified majority in the Council?",
    options: ["Germany", "France", "Austria", "Ireland"],
    correctIndex: 2,
  },
];

const QUESTION_TIME = 10;

// ---------------- Module state ----------------

let store = null;
let unsubscribe = null;    // current screen's live-state subscription

const session = {
  name: null,
  stanId: null,
  answers: [],
  score: 0,
};

// ---------------- DOM helpers ----------------

const stage      = document.getElementById('stage');
const playerChip = document.getElementById('player-chip');
const stanChip   = document.getElementById('stan-chip');
const resetBtn   = document.getElementById('reset-btn');

const sfx = {
  choose:   document.getElementById('sfx-choose'),
  welcome:  document.getElementById('sfx-welcome'),
  fatality: document.getElementById('sfx-fatality'),
  loser:    document.getElementById('sfx-loser'),
  fight:    document.getElementById('sfx-fight'),
};

function play(audioEl) {
  if (!audioEl) return;
  try {
    audioEl.currentTime = 0;
    const p = audioEl.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) {}
}
function stopAll() {
  Object.values(sfx).forEach(a => {
    if (a) { try { a.pause(); a.currentTime = 0; } catch (_) {} }
  });
}

function mount(templateId, after) {
  if (unsubscribe) { try { unsubscribe(); } catch (_) {} unsubscribe = null; }
  const tpl = document.getElementById(templateId);
  stage.innerHTML = '';
  stage.appendChild(tpl.content.cloneNode(true));
  if (typeof after === 'function') after();
}

function updateChips() {
  if (session.name) {
    playerChip.textContent = session.name;
    playerChip.classList.remove('hidden');
  } else {
    playerChip.classList.add('hidden');
  }
  if (session.stanId) {
    const s = STANS.find(x => x.id === session.stanId);
    stanChip.textContent = `Team ${s.name}`;
    stanChip.classList.remove('hidden');
  } else {
    stanChip.classList.add('hidden');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// ---------------- Modal ----------------

function modal({ title, body, actions }) {
  const root = document.createElement('div');
  root.className = 'modal-backdrop';
  root.innerHTML = `
    <div class="modal">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(body)}</p>
      <div class="modal-actions"></div>
    </div>`;
  const actionsEl = root.querySelector('.modal-actions');
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = a.primary ? 'primary-btn' : 'ghost-btn';
    b.textContent = a.label;
    b.addEventListener('click', () => { root.remove(); a.onClick && a.onClick(); });
    actionsEl.appendChild(b);
  });
  document.body.appendChild(root);
}

// ---------------- Animations ----------------

function burstConfetti() {
  if (!window.confetti) return;
  const defaults = { startVelocity: 35, spread: 360, ticks: 80, zIndex: 90 };
  const colors = ['#c2a155', '#6e8266', '#d49a93', '#4a6995', '#1f2a3b', '#a37939'];
  confetti({ ...defaults, particleCount: 90, origin: { x: 0.2, y: 0.7 }, colors });
  confetti({ ...defaults, particleCount: 90, origin: { x: 0.8, y: 0.7 }, colors });
  confetti({ ...defaults, particleCount: 60, origin: { x: 0.5, y: 0.3 }, colors });
}
function confettiLong(seconds = 3) {
  if (!window.confetti) return;
  const end = Date.now() + seconds * 1000;
  const colors = ['#c2a155', '#6e8266', '#d49a93', '#4a6995', '#ffffff', '#a37939'];
  (function frame() {
    confetti({ particleCount: 5, angle: 60,  spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
function releaseBalloons(count = 22) {
  const layer = document.getElementById('balloon-layer');
  const colors = ['#d49a93', '#c2a155', '#9bb1a4', '#9ab4d4', '#e8c089', '#a37939'];
  for (let i = 0; i < count; i++) {
    const b = document.createElement('div');
    b.className = 'balloon';
    const left = Math.random() * 100;
    const size = 30 + Math.random() * 22;
    const delay = Math.random() * 0.8;
    const dur = 4.5 + Math.random() * 3;
    const color = colors[Math.floor(Math.random() * colors.length)];
    b.style.left = `${left}%`;
    b.style.width = `${size}px`;
    b.style.height = `${size * 1.25}px`;
    b.style.animationDelay = `${delay}s`;
    b.style.animationDuration = `${dur}s`;
    b.style.setProperty('--bc', color);
    layer.appendChild(b);
    setTimeout(() => b.remove(), (dur + delay) * 1000 + 500);
  }
}

// ---------------- Screens ----------------

function screenName() {
  mount('tpl-name', () => {
    const form  = document.getElementById('name-form');
    const input = document.getElementById('name-input');
    input.focus();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      session.name = name;
      session.stanId = null;
      session.answers = [];
      session.score = 0;
      updateChips();
      play(sfx.choose);
      screenChooseStan();
    });
  });
  updateChips();
}

function screenChooseStan() {
  mount('tpl-choose-stan', () => {
    render();
    // Live re-render when other students join or the arena resets.
    unsubscribe = store.subscribe(render);
  });

  function render() {
    const state = store.getState();
    const grid  = document.getElementById('stan-grid');
    if (!grid) return;
    grid.innerHTML = '';
    STANS.forEach(stan => {
      const roster = state.rosters[stan.id] || [];
      const filled = roster.length;
      const locked = filled >= STAN_CAPACITY;
      const card = document.createElement('div');
      card.className = 'stan-card' + (locked ? ' locked' : '');
      card.style.setProperty('--c1', stan.c1);
      card.style.setProperty('--c2', stan.c2);
      card.innerHTML = `
        <div class="stan-avatar">${stan.name[0]}</div>
        <h3 class="stan-name">${stan.name}</h3>
        <div class="stan-tag">${stan.tag} · Team</div>
        <div class="stan-capacity">
          ${Array.from({ length: STAN_CAPACITY })
            .map((_, i) => `<span class="cap-dot ${i < filled ? 'filled' : ''}"></span>`).join('')}
        </div>
        <div class="stan-roster">
          ${roster.length
            ? roster.map(n => `<span class="roster-name">${escapeHtml(n)}</span>`).join('')
            : '<em>No fighters yet</em>'}
        </div>
        <div class="stan-cta">
          <span class="stan-status">${filled} / ${STAN_CAPACITY}</span>
          <button class="stan-pick">${locked ? 'FULL' : 'CHOOSE'}</button>
        </div>`;
      if (!locked) {
        const pickBtn = card.querySelector('.stan-pick');
        const handler = async (e) => {
          e?.stopPropagation();
          pickBtn.textContent = 'JOINING…';
          pickBtn.disabled = true;
          const res = await store.joinStan(stan.id, session.name);
          if (res.ok) {
            pickStanLocal(stan.id);
          } else if (res.reason === 'full') {
            modal({
              title: 'Stan is full',
              body:  `Team ${stan.name} just hit ${STAN_CAPACITY} fighters. Choose another Stan.`,
              actions: [{ label: 'OK', primary: true }],
            });
            render();
          } else {
            modal({
              title: 'Could not join',
              body:  'Something went wrong joining that Stan. Check your connection and try again.',
              actions: [{ label: 'OK', primary: true }],
            });
            render();
          }
        };
        card.addEventListener('click', handler);
        pickBtn.addEventListener('click', handler);
      }
      grid.appendChild(card);
    });
  }
}

function pickStanLocal(stanId) {
  session.stanId = stanId;
  updateChips();
  burstConfetti();
  releaseBalloons(28);
  play(sfx.welcome);
  screenWelcome();
}

function screenWelcome() {
  mount('tpl-welcome', () => {
    document.getElementById('start-quiz-btn').addEventListener('click', () => {
      stopAll();
      play(sfx.fight);
      screenQuiz(0);
    });
  });
}

// ---------------- Quiz ----------------

function screenQuiz(index) {
  if (index >= QUESTIONS.length) { screenQuizEnd(); return; }

  mount('tpl-quiz', () => {
    const q = QUESTIONS[index];
    const counter   = document.getElementById('q-counter');
    const scoreEl   = document.getElementById('q-score');
    const timerBar  = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    const qText     = document.getElementById('question-text');
    const optsWrap  = document.getElementById('options');

    counter.textContent = `Q ${index + 1} / ${QUESTIONS.length}`;
    scoreEl.textContent = `${session.score} correct`;
    qText.textContent   = q.q;

    const letters = ['A','B','C','D','E'];
    const buttons = [];
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'opt-btn';
      b.innerHTML = `
        <span class="opt-letter">${letters[i]}</span>
        <span class="opt-label"></span>`;
      b.querySelector('.opt-label').textContent = opt;
      b.addEventListener('click', () => answer(i));
      optsWrap.appendChild(b);
      buttons.push(b);
    });

    let remaining = QUESTION_TIME;
    let answered  = false;
    timerBar.style.setProperty('--p', '100%');
    timerText.textContent = remaining;

    const tickMs = 100;
    const total  = QUESTION_TIME * 1000;
    let elapsed  = 0;
    const interval = setInterval(() => {
      elapsed += tickMs;
      const pct = Math.max(0, 100 - (elapsed / total) * 100);
      timerBar.style.setProperty('--p', `${pct}%`);
      const left = Math.max(0, Math.ceil((total - elapsed) / 1000));
      if (left !== remaining) {
        remaining = left;
        timerText.textContent = remaining;
        if (remaining <= 3) timerBar.classList.add('warn');
      }
      if (elapsed >= total) finish(-1);
    }, tickMs);

    function answer(choiceIndex) { if (!answered) finish(choiceIndex); }
    function finish(choiceIndex) {
      if (answered) return;
      answered = true;
      clearInterval(interval);
      buttons.forEach((b, i) => {
        b.classList.add('locked');
        if (i === choiceIndex) b.classList.add('chosen');
        if (choiceIndex === -1) b.classList.add('timed-out');
      });
      const correct = (choiceIndex === q.correctIndex);
      if (correct) session.score += 1;
      session.answers.push(choiceIndex);
      scoreEl.textContent = `${session.score} correct`;
      setTimeout(() => screenQuiz(index + 1), choiceIndex === -1 ? 250 : 350);
    }
  });
}

async function screenQuizEnd() {
  // Commit this player's score to their Stan total (atomic on cloud, sync on local).
  await store.submitScore(session.stanId, session.name, session.score);

  mount('tpl-quiz-end', () => {
    const stan = STANS.find(s => s.id === session.stanId);
    document.getElementById('end-name').textContent  = session.name;
    document.getElementById('end-score').textContent = session.score;
    document.getElementById('end-stan').textContent  = `Team ${stan.name}`;

    document.getElementById('show-results-btn').addEventListener('click', () => {
      confettiLong(3);
      releaseBalloons(40);
      setTimeout(() => screenResults(), 400);
    });
    document.getElementById('another-fighter-btn').addEventListener('click', () => {
      session.name = null; session.stanId = null;
      session.answers = []; session.score = 0;
      updateChips();
      screenName();
    });
  });
}

// ---------------- Results ----------------

function screenResults() {
  mount('tpl-results', () => {
    render();
    // Live re-render so the scoreboard updates as more fighters finish.
    unsubscribe = store.subscribe(render);
  });

  function render() {
    const state = store.getState();
    const board = document.getElementById('results-board');
    if (!board) return;
    board.innerHTML = '';

    const ranked = STANS
      .map(s => ({ ...s, total: state.scores[s.id] || 0, roster: state.rosters[s.id] || [] }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const max = Math.max(1, ranked[0].total);
    const winnerId = ranked[0].total > 0 ? ranked[0].id : null;
    const loserId  = ranked[ranked.length - 1].id;

    ranked.forEach((r, idx) => {
      const isWinner = r.id === winnerId;
      const isLoser  = !isWinner && r.id === loserId;
      const card = document.createElement('div');
      card.className = 'rank-card' + (isWinner ? ' winner' : '') + (isLoser ? ' loser' : '');
      card.style.setProperty('--c1', r.c1);
      card.style.setProperty('--c2', r.c2);
      const widthPct = Math.round((r.total / max) * 100);
      const fighters = r.roster.length ? r.roster.map(escapeHtml).join(', ') : '— no fighters —';
      card.innerHTML = `
        <div class="rank-num">${idx + 1}</div>
        <div class="rank-info">
          <h3 class="rank-stan-name">Team ${r.name}</h3>
          <div class="rank-detail">${r.roster.length} fighter${r.roster.length === 1 ? '' : 's'} · ${fighters}</div>
          <div class="rank-bar"><span style="width:${widthPct}%"></span></div>
        </div>
        <div class="rank-score">${r.total}</div>
        ${(isWinner || isLoser) ? `
          <div class="rank-action">
            ${isWinner ? `<button class="sfx-btn fatality" data-sfx="fatality">▶ FATALITY</button>` : ''}
            ${isLoser  ? `<button class="sfx-btn loser"    data-sfx="loser">▶ LOSER</button>`   : ''}
          </div>` : ''}`;
      board.appendChild(card);
    });

    board.querySelectorAll('.sfx-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        stopAll();
        play(sfx[btn.dataset.sfx]);
      });
    });
  }

  const play_again_btn = () => document.getElementById('play-again-btn');
  const hard_reset_btn = () => document.getElementById('hard-reset-btn');

  // These buttons exist in the static template, wire them once.
  document.getElementById('play-again-btn').addEventListener('click', () => {
    session.name = null; session.stanId = null;
    session.answers = []; session.score = 0;
    updateChips();
    screenName();
  });
  document.getElementById('hard-reset-btn').addEventListener('click', confirmReset);
}

// ---------------- Reset ----------------

function confirmReset() {
  modal({
    title: 'Reset the arena?',
    body:  'This clears every Stan roster, every score, and every play log. Cannot be undone.',
    actions: [
      { label: 'Cancel', primary: false },
      { label: 'Reset everything', primary: true, onClick: async () => {
          await store.reset();
          session.name = null; session.stanId = null;
          session.answers = []; session.score = 0;
          updateChips();
          screenName();
        }
      },
    ],
  });
}

resetBtn.addEventListener('click', confirmReset);

// ---------------- Boot ----------------

(async function boot() {
  try {
    store = await createStore();
  } catch (e) {
    console.error('[ESS] Failed to create store, falling back to fresh local.', e);
    store = await (await import('./store.js')).createStore();
  }

  // Show backend mode in the footer for quick debugging during setup.
  const footer = document.querySelector('.footer');
  if (footer) {
    const mode = store.mode === 'cloud' ? 'Cloud · live sync' : 'Local · single device';
    footer.insertAdjacentHTML('beforeend',
      `<span style="opacity:.55; margin-left:14px;">[${mode}]</span>`);
  }

  updateChips();
  screenName();
})();
