/* ═══════════════════════════════════════════════════════════════════
   TRASH SORT — game.js
   Interaction: Drag falling items into the matching column
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

  const TRASH_BY_TYPE = {
    plastic: [
      { emoji: '🧴', color: '#60a5fa' },
      { emoji: '🛍️', color: '#60a5fa' },
      { emoji: '🥤', color: '#60a5fa' },
      { emoji: '🧃', color: '#60a5fa' },
    ],
    paper: [
      { emoji: '📄', color: '#fbbf24' },
      { emoji: '📰', color: '#fbbf24' },
      { emoji: '📦', color: '#fbbf24' },
      { emoji: '📃', color: '#fbbf24' },
    ],
    organic: [
      { emoji: '🍌', color: '#4ade80' },
      { emoji: '🍎', color: '#4ade80' },
      { emoji: '🥬', color: '#4ade80' },
      { emoji: '🐟', color: '#4ade80' },
    ],
  };

  const COLUMN_TYPES = ['plastic', 'paper', 'organic'];

  const state = {
    running: true,
    score: 0,
    level: 1,
    lives: 3,
    spawnTimer: 0,
    items: [],
    feedbackTimer: null,
    drag: null,
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function setFeedback(text, color) {
    if (!feedbackEl) return;
    feedbackEl.textContent = text;
    feedbackEl.style.color = color || '#fff';
    feedbackEl.style.opacity = '1';
    clearTimeout(state.feedbackTimer);
    state.feedbackTimer = setTimeout(() => {
      feedbackEl.style.opacity = '0';
    }, 900);
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

  function maxOnscreenForLevel(level) {
    return clamp(1 + Math.floor((level - 1) / 3), 1, 3);
  }

  function spawnIntervalForLevel(level) {
    return clamp(1.25 - level * 0.08, 0.45, 1.25);
  }

  function fallDurationForLevel(level) {
    return clamp(7.2 - level * 0.55, 3.6, 7.2);
  }

  function landingY() {
    return canvas.height - 72;
  }

  function columnCenterForType(type) {
    const idx = COLUMN_TYPES.indexOf(type);
    return (canvas.width / 3) * (idx + 0.5);
  }

  function targetForType(type) {
    return {
      x: columnCenterForType(type),
      y: landingY() - 105,
    };
  }

  function loseLife() {
    state.lives = Math.max(0, state.lives - 1);
    updateUI();
    setFeedback('💨 Missed!', '#fbbf24');

    if (state.lives <= 0) {
      state.running = false;
      setFeedback('Game over — refresh to try again', '#f87171');
    }
  }

  function scorePoint() {
    state.score += 1;
    state.level = levelForScore(state.score);
    updateUI();
    setFeedback('✅ Sorted!', '#4ade80');
  }

  function addTrash() {
    const type = COLUMN_TYPES[(Math.random() * COLUMN_TYPES.length) | 0];
    const variants = TRASH_BY_TYPE[type] || [{ emoji: '🗑️', color: '#93c5fd' }];
    const variant = variants[(Math.random() * variants.length) | 0];
    const radius = 34;
    const startX = clamp(radius + 10 + Math.random() * (canvas.width - (radius + 10) * 2), radius + 10, canvas.width - radius - 10);
    const startY = -radius - 16;
    const duration = fallDurationForLevel(state.level);
    const travel = canvas.height + radius * 2 + 140;
    const vy = Math.max(55, travel / Math.max(0.1, duration));

    state.items.push({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
      type,
      emoji: variant.emoji,
      color: variant.color,
      radius,
      dragging: false,
      vx: (Math.random() - 0.5) * 26,
      vy,
      expiry: performance.now() + 12000,
      x: startX,
      y: startY,
    });
  }

  function removeItem(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx >= 0) state.items.splice(idx, 1);
  }

  function columnTypeAtX(x) {
    const laneWidth = canvas.width / 3;
    const idx = clamp(Math.floor(x / laneWidth), 0, 2);
    return COLUMN_TYPES[idx];
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function itemAtPoint(x, y) {
    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      const dx = x - item.x;
      const dy = y - item.y;
      if (dx * dx + dy * dy <= item.radius * item.radius) {
        return item;
      }
    }
    return null;
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

    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 1;
    const laneWidth = canvas.width / 3;
    for (let i = 1; i < 3; i++) {
      const x = laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderItem(item) {
    ctx.save();
    ctx.shadowBlur = item.dragging ? 28 : 18;
    ctx.shadowColor = 'rgba(34, 197, 94, 0.28)';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    drawRoundedRect(item.x - item.radius, item.y - item.radius, item.radius * 2, item.radius * 2, 20);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = `${Math.max(32, item.radius * 1.15)}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(item.emoji, item.x, item.y + 1);
    ctx.restore();
  }

  function pickUpItem(event) {
    if (!state.running) return;
    const point = getCanvasPoint(event);
    const item = itemAtPoint(point.x, point.y);
    if (!item) return;

    state.drag = {
      id: item.id,
      pointerId: event.pointerId,
      dx: point.x - item.x,
      dy: point.y - item.y,
      lastX: point.x,
      lastY: point.y,
      lastT: performance.now(),
      vx: 0,
      vy: 0,
    };
    item.dragging = true;
    item.vx = 0;
    item.vy = 0;
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(event.pointerId);
    setFeedback('Drag it into the matching column.', '#cbd5e1');
  }

  function dragItem(event) {
    if (!state.drag) return;
    const point = getCanvasPoint(event);
    const item = state.items.find((entry) => entry.id === state.drag.id);
    if (!item) return;

    const now = performance.now();
    const dt = Math.max(0.001, (now - state.drag.lastT) / 1000);
    state.drag.vx = (point.x - state.drag.lastX) / dt;
    state.drag.vy = (point.y - state.drag.lastY) / dt;
    state.drag.lastX = point.x;
    state.drag.lastY = point.y;
    state.drag.lastT = now;

    item.x = clamp(point.x - state.drag.dx, item.radius, canvas.width - item.radius);
    item.y = clamp(point.y - state.drag.dy, item.radius, canvas.height - item.radius);
  }

  function dropItem(event) {
    if (!state.drag) return;
    const item = state.items.find((entry) => entry.id === state.drag.id);
    if (item) {
      item.dragging = false;
      const maxThrow = 900;
      item.vx = clamp(state.drag.vx, -maxThrow, maxThrow);
      item.vy = clamp(state.drag.vy, -maxThrow, maxThrow);
      setFeedback('Nice — keep sorting!', '#a7f3d0');
    }

    state.drag = null;
    canvas.style.cursor = 'grab';
    canvas.releasePointerCapture?.(event.pointerId);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    setCanvasSize();

    if (state.running) {
      const interval = spawnIntervalForLevel(state.level);
      state.spawnTimer += dt;
      const maxItems = maxOnscreenForLevel(state.level);
      if (state.items.length < maxItems && state.spawnTimer >= interval) {
        state.spawnTimer = 0;
        addTrash();
      }
    }

    for (let i = state.items.length - 1; i >= 0; i -= 1) {
      const item = state.items[i];
      if (!state.running) break;

      if (!item.dragging) {
        const g = 120;
        const drag = 0.985;
        item.vy += g * dt;
        item.vx *= Math.pow(drag, dt * 60);
        item.vy *= Math.pow(0.992, dt * 60);

        let nextX = item.x + item.vx * dt;
        if (nextX < item.radius) {
          nextX = item.radius;
          item.vx *= -0.35;
        } else if (nextX > canvas.width - item.radius) {
          nextX = canvas.width - item.radius;
          item.vx *= -0.35;
        }
        item.x = nextX;
        item.y = item.y + item.vy * dt;
      }

      if (!item.dragging && performance.now() > item.expiry) {
        removeItem(item.id);
        loseLife();
        continue;
      }

      if (!item.dragging && item.y >= landingY()) {
        const landedType = columnTypeAtX(item.x);
        if (landedType === item.type) {
          scorePoint();
        } else {
          loseLife();
        }
        removeItem(item.id);
        continue;
      }
    }

    renderBackground();
    for (const item of state.items) renderItem(item);

    requestAnimationFrame(frame);
  }

  function resetGame() {
    state.running = true;
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    state.spawnTimer = 0;
    state.items = [];
    state.drag = null;
    if (feedbackEl) feedbackEl.style.opacity = '0';
    updateUI();
    addTrash();
    setFeedback('Reset! Drag each item into the correct column.', '#a7f3d0');
  }

  updateUI();
  setCanvasSize();
  resetBtn?.addEventListener('click', resetGame);
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', pickUpItem);
  canvas.addEventListener('pointermove', dragItem);
  canvas.addEventListener('pointerup', dropItem);
  canvas.addEventListener('pointercancel', dropItem);
  setFeedback('Drag each item into the matching column.', '#cbd5e1');
  requestAnimationFrame(frame);
})();
