/* ═══════════════════════════════════════════════════════════════════
   ECO GARBAGE SHOOTER — game.js
   Handles: canvas setup, game loop, shooting, trash, leaderboard
═══════════════════════════════════════════════════════════════════ */

/* ── Canvas ───────────────────────────────────────────────────────── */
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

/* ── Game state ───────────────────────────────────────────────────── */
let score    = 0;
let combo    = 0;
let selected = 'plastic';
let bullets  = [];
let trash    = [];
let rafId    = null;

const allowed = /^[a-zA-Z0-9_]+$/;

const trashTypes = [
  { type: 'plastic', emoji: '🧴' },
  { type: 'paper',   emoji: '📄' },
  { type: 'organic', emoji: '🍌' },
];

/* ── Type selector ────────────────────────────────────────────────── */
function setType(t, btn) {
  selected = t;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

/* ── HUD update ───────────────────────────────────────────────────── */
function updateUI() {
  document.getElementById('score').textContent = score;
  document.getElementById('combo').textContent = combo;
}

/* ── Feedback flash ───────────────────────────────────────────────── */
let feedbackTimer = null;

function flashFeedback(txt, color) {
  const el = document.getElementById('feedback');
  el.textContent   = txt;
  el.style.color   = color;
  el.style.opacity = '1';
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { el.style.opacity = '0'; }, 650);
}

/* ── Spawn trash ──────────────────────────────────────────────────── */
function spawnTrash() {
  const t = trashTypes[Math.floor(Math.random() * trashTypes.length)];
  trash.push({
    x:     Math.random() * (canvas.width - 60) + 10,
    y:     -50,
    emoji: t.emoji,
    type:  t.type,
    speed: 1 + Math.random() * 1.5,
  });
}

setInterval(spawnTrash, 900);

/* ── Shoot on click ───────────────────────────────────────────────── */
canvas.addEventListener('click', e => {
  const cx = canvas.width  / 2;
  const cy = canvas.height - 100;

  bullets.push({
    x:    cx,
    y:    cy,
    dx:   (e.clientX - cx) / 22,
    dy:   (e.clientY - cy) / 22,
    type: selected,
  });
});

/* ═══════════════════════════════════════════════════════════════════
   MAIN DRAW LOOP
═══════════════════════════════════════════════════════════════════ */
function draw() {
  rafId = requestAnimationFrame(draw);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const shooterX = canvas.width  / 2;
  const shooterY = canvas.height - 100;

  /* ── Truck ──────────────────────────────────────────────────── */
  ctx.font = '54px Arial';
  ctx.fillText('🚛', shooterX - 27, shooterY + 10);

  /* Selected type indicator above truck */
  const typeEmoji = trashTypes.find(t => t.type === selected)?.emoji || '🧴';
  ctx.font = '22px Arial';
  ctx.fillText(typeEmoji, shooterX - 10, shooterY - 14);

  /* ── Bullets ────────────────────────────────────────────────── */
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    b.x += b.dx;
    b.y += b.dy;

    // Remove bullets that fly off-screen
    if (b.x < -20 || b.x > canvas.width + 20 ||
        b.y < -20 || b.y > canvas.height + 20) {
      bullets.splice(bi, 1);
      continue;
    }

    // Draw bullet
    ctx.fillStyle   = '#facc15';
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#facc15';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Collision check with each trash item
    for (let ti = trash.length - 1; ti >= 0; ti--) {
      const t    = trash[ti];
      const dist = Math.hypot(b.x - t.x, b.y - t.y);

      if (dist < 38) {
        if (b.type === t.type) {
          score += 10 + combo;   // combo bonus stacks
          combo++;
          flashFeedback('✅ +' + (10 + combo - 1), '#4ade80');
        } else {
          score = Math.max(0, score - 5);
          combo = 0;
          flashFeedback('❌ Wrong type!', '#f87171');
        }

        updateUI();
        trash.splice(ti, 1);
        bullets.splice(bi, 1);
        break;
      }
    }
  }

  /* ── Trash ──────────────────────────────────────────────────── */
  for (let i = trash.length - 1; i >= 0; i--) {
    const t = trash[i];
    t.y += t.speed;

    ctx.font = '42px Arial';
    ctx.fillText(t.emoji, t.x, t.y);

    // Missed — fell past the bottom
    if (t.y > canvas.height + 10) {
      trash.splice(i, 1);
      score = Math.max(0, score - 2);
      combo = 0;
      flashFeedback('💨 Missed!', '#fbbf24');
      updateUI();
    }
  }
}

/* ── Start loop ───────────────────────────────────────────────────── */
draw();

/* ═══════════════════════════════════════════════════════════════════
   LEADERBOARD
═══════════════════════════════════════════════════════════════════ */

function saveScore() {
  const username = document.getElementById('username').value.trim();

  if (!allowed.test(username)) {
    alert('Only letters, numbers, and underscores allowed.');
    return;
  }
  if (username.length < 3) {
    alert('Username must be at least 3 characters.');
    return;
  }

  let scores = JSON.parse(localStorage.getItem('ecoScores') || '[]');
  scores.push({ name: username, score: score });
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 10);
  localStorage.setItem('ecoScores', JSON.stringify(scores));
  renderScores();
}

function renderScores() {
  const scores = JSON.parse(localStorage.getItem('ecoScores') || '[]');
  const div    = document.getElementById('scores');
  div.innerHTML = '';

  if (scores.length === 0) {
    div.innerHTML = '<p style="opacity:0.5;font-size:13px">No scores yet.</p>';
    return;
  }

  scores.forEach((s, i) => {
    div.innerHTML += `<p>#${i + 1} &nbsp;<b>${s.name}</b> — ${s.score}</p>`;
  });
}

// Render existing scores on load
renderScores();


// Extra hardcore scaling
function hardcoreMultiplier(level){
 return 1 + level * 0.1;
}

