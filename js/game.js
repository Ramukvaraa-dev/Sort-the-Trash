/* ═══════════════════════════════════════════════════════════════════
   TRASH SORT — game.js
   Interaction: CLICK to pick up · DROP in correct bin
   UI: SCORE, LEVEL, ♥♥♥ lives
═══════════════════════════════════════════════════════════════════ */

(() => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const feedbackEl = document.getElementById('feedback');
  const resetBtn = document.getElementById('reset-btn');
  const lifeEls = [1, 2, 3].map((n) => document.getElementById(`life-${n}`)).filter(Boolean);

  const bins = Array.from(document.querySelectorAll('.bin'));
  const binByPoint = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const bin = el.closest?.('.bin');
    return bin || null;
  };

  const TRASH = [
    { type: 'plastic', emoji: '🧴', color: '#60a5fa' },
    { type: 'paper', emoji: '📄', color: '#fbbf24' },
    { type: 'organic', emoji: '🍌', color: '#4ade80' },
  ];

  const state = {
    running: true,
    score: 0,
    level: 1,
    lives: 3,
    time: 0,
    spawnTimer: 0,
    items: [],
    heldId: null,
    pointer: { x: 0, y: 0, active: false },
    feedbackTimer: null,
    slowUntil: 0,
    doubleUntil: 0,
  };

  const BASE_MAX_ONSCREEN = 2;
  const maxOnscreenForLevel = (level) => clamp(BASE_MAX_ONSCREEN + Math.floor((level - 1) / 2), 2, 4);

  const POWERUPS = [
    { kind: 'slow', emoji: '🧊', label: 'SLOW 5s' },
    { kind: 'life', emoji: '❤️', label: '+1 LIFE' },
    { kind: 'double', emoji: '✨', label: '2× 6s' },
    { kind: 'clear', emoji: '💥', label: 'CLEAR' },
  ];

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function setFeedback(text, color) {
    if (!feedbackEl) return;
    feedbackEl.textContent = text;
    feedbackEl.style.color = color || '#fff';
    feedbackEl.style.opacity = '1';
    clearTimeout(state.feedbackTimer);
    state.feedbackTimer = setTimeout(() => {
      feedbackEl.style.opacity = '0';
    }, 650);
  }

  function updateUI() {
    if (scoreEl) scoreEl.textContent = String(state.score);
    if (levelEl) levelEl.textContent = String(state.level);
    for (let i = 0; i < lifeEls.length; i++) {
      const el = lifeEls[i];
      if (!el) continue;
      const active = i < state.lives;
      el.classList.toggle('life-active', active);
      el.classList.toggle('life-lost', !active);
    }
  }

  function setCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function getPointerInCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  }

  function levelForScore(score) {
    if (score >= 120) return 8;
    if (score >= 90) return 7;
    if (score >= 60) return 6;
    if (score >= 40) return 5;
    if (score >= 24) return 4;
    if (score >= 12) return 3;
    if (score >= 5) return 2;
    return 1;
  }

  function spawnIntervalForLevel(level) {
    // Harder curve: faster spawns at higher levels, but still capped by onscreen limit.
    return clamp(1.10 - level * 0.16, 0.30, 1.10);
  }

  function speedForLevel(level) {
    return 65 + level * 32;
  }

  function loseLife(reason) {
    state.lives = Math.max(0, state.lives - 1);
    updateUI();
    if (reason === 'wrong') setFeedback('❌ Wrong bin!', '#f87171');
    else if (reason === 'miss') setFeedback('💨 Missed!', '#fbbf24');
    else setFeedback('⚠️ Oops!', '#fbbf24');

    if (state.lives <= 0) {
      state.running = false;
      canvas.style.cursor = 'default';
      setFeedback('Game over — refresh to try again', '#f87171');
    }
  }

  function addTrash() {
    const spawnPower = Math.random() < 0.13; // ~13% powerups
    const t = spawnPower ? null : TRASH[(Math.random() * TRASH.length) | 0];
    const p = spawnPower ? POWERUPS[(Math.random() * POWERUPS.length) | 0] : null;
    const margin = 44;
    const radius = 22;
    state.items.push({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
      kind: spawnPower ? 'power' : 'trash',
      type: spawnPower ? 'power' : t.type,
      power: spawnPower ? p.kind : null,
      emoji: spawnPower ? p.emoji : t.emoji,
      x: margin + Math.random() * (canvas.width - margin * 2),
      y: -40,
      vy: speedForLevel(state.level) * (0.75 + Math.random() * 0.55),
      radius,
      held: false,
    });
  }

  function findItemAt(x, y) {
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      const d = Math.hypot(it.x - x, it.y - y);
      if (d <= it.radius + 10) return it;
    }
    return null;
  }

  function removeItem(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx >= 0) state.items.splice(idx, 1);
  }

  function dropHeld(clientX, clientY) {
    if (!state.heldId) return;
    const held = state.items.find((it) => it.id === state.heldId);
    if (!held) {
      state.heldId = null;
      canvas.style.cursor = 'default';
      return;
    }

    held.held = false;
    canvas.style.cursor = 'default';

    const bin = binByPoint(clientX, clientY);
    const binType = bin?.getAttribute('data-bin') || null;

    if (held.kind === 'power') {
      // Powerups activate on drop (anywhere).
      activatePowerup(held.power);
      removeItem(held.id);
    } else if (binType && binType === held.type) {
      const mult = nowMs() < state.doubleUntil ? 2 : 1;
      state.score += 1 * mult;
      state.level = levelForScore(state.score);
      updateUI();
      setFeedback(mult === 2 ? '✅ Nice! (2×)' : '✅ Nice!', '#4ade80');
      removeItem(held.id);
    } else if (binType) {
      removeItem(held.id);
      // Tougher at higher levels: wrong bin can cost 2 lives.
      if (state.level >= 5 && state.lives > 1) {
        loseLife('wrong');
        loseLife('wrong');
      } else {
        loseLife('wrong');
      }
    } else {
      // Dropped nowhere: just continue falling
    }

    state.heldId = null;
  }

  function nowMs() {
    return performance.now();
  }

  function activatePowerup(kind) {
    if (!kind) return;
    if (kind === 'slow') {
      state.slowUntil = nowMs() + 5000;
      setFeedback('🧊 Slow time!', '#a7f3d0');
      return;
    }
    if (kind === 'double') {
      state.doubleUntil = nowMs() + 6000;
      setFeedback('✨ Double score!', '#c4b5fd');
      return;
    }
    if (kind === 'life') {
      state.lives = Math.min(3, state.lives + 1);
      updateUI();
      setFeedback('❤️ +1 life!', '#fb7185');
      return;
    }
    if (kind === 'clear') {
      const removed = state.items.filter((it) => it.kind === 'trash').length;
      state.items = state.items.filter((it) => it.kind !== 'trash');
      const mult = nowMs() < state.doubleUntil ? 2 : 1;
      state.score += removed * mult;
      state.level = levelForScore(state.score);
      updateUI();
      setFeedback('💥 Cleared!', '#fbbf24');
      return;
    }
  }

  function onPointerMove(e) {
    state.pointer.active = true;
    const p = getPointerInCanvas(e.clientX, e.clientY);
    state.pointer.x = p.x;
    state.pointer.y = p.y;

    if (state.heldId) {
      const held = state.items.find((it) => it.id === state.heldId);
      if (held) {
        held.x = clamp(p.x, held.radius, canvas.width - held.radius);
        held.y = clamp(p.y, held.radius, canvas.height - held.radius);
      }
    }
  }

  function onPointerDown(e) {
    if (!state.running) return;
    const p = getPointerInCanvas(e.clientX, e.clientY);
    const target = findItemAt(p.x, p.y);
    if (!target) return;
    state.heldId = target.id;
    target.held = true;
    target.x = p.x;
    target.y = p.y;
    canvas.style.cursor = 'grabbing';
    setFeedback('Picked up!', '#a7f3d0');
  }

  function onPointerUp(e) {
    if (!state.running) return;
    dropHeld(e.clientX, e.clientY);
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function renderBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#020617');
    grad.addColorStop(1, '#0b1220');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle grid
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#94a3b8';
    const step = 48;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderItem(it) {
    // Shadow / chip
    ctx.save();
    ctx.shadowBlur = it.held ? 28 : 18;
    ctx.shadowColor = it.kind === 'power' ? 'rgba(168,85,247,0.25)' : 'rgba(34,197,94,0.25)';
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    drawRoundedRect(it.x - 28, it.y - 28, 56, 56, 16);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Emoji
    ctx.font = '32px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(it.emoji, it.x, it.y + 1);
    ctx.restore();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    setCanvasSize();

    state.time += dt;
    if (state.running) {
      const interval = spawnIntervalForLevel(state.level);
      state.spawnTimer += dt;
      const maxOnscreen = maxOnscreenForLevel(state.level);
      if (state.items.length < maxOnscreen && state.spawnTimer >= interval) {
        state.spawnTimer = 0;
        addTrash();
      }
    }

    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      if (!it.held && state.running) {
        const slow = nowMs() < state.slowUntil ? 0.45 : 1;
        it.y += it.vy * dt * slow;
      }
      if (!it.held && it.y - it.radius > canvas.height + 6) {
        state.items.splice(i, 1);
        if (state.running) loseLife('miss');
      }
    }

    renderBackground();
    for (const it of state.items) renderItem(it);

    requestAnimationFrame(frame);
  }

  updateUI();
  setCanvasSize();

  function resetGame() {
    state.running = true;
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    state.spawnTimer = 0;
    state.items = [];
    state.heldId = null;
    state.slowUntil = 0;
    state.doubleUntil = 0;
    canvas.style.cursor = 'default';
    if (feedbackEl) feedbackEl.style.opacity = '0';
    updateUI();
    setFeedback('Reset!', '#a7f3d0');
  }

  resetBtn?.addEventListener('click', resetGame);

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  // Prevent scrolling on touch while interacting
  canvas.style.touchAction = 'none';

  requestAnimationFrame(frame);
})();
