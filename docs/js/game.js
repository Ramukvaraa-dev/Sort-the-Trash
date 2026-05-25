/* ═══════════════════════════════════════════════════════════════════
   TRASH SORT — game.js
   Interaction: Drag each item along its curved path into the matching column
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

  const TRASH = [
    { type: 'plastic', emoji: '🧴', color: '#60a5fa' },
    { type: 'paper', emoji: '📄', color: '#fbbf24' },
    { type: 'organic', emoji: '🍌', color: '#4ade80' },
  ];

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
    const type = TRASH[(Math.random() * TRASH.length) | 0];
    const radius = 34;
    const target = targetForType(type);
    const side = Math.random() < 0.5 ? -1 : 1;
    const curve = 0.14 + Math.random() * 0.12;
    const startX = target.x + side * (canvas.width * 0.26);
    const startY = -radius - 16;

    state.items.push({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2),
      type: type.type,
      emoji: type.emoji,
      color: type.color,
      radius,
      pathStartX: startX,
      pathStartY: startY,
      pathEndX: target.x,
      pathEndY: target.y,
      curve,
      progress: 0,
      dragging: false,
      expiry: performance.now() + 9000,
      x: startX,
      y: startY,
    });
  }

  function removeItem(id) {
    const idx = state.items.findIndex((it) => it.id === id);
    if (idx >= 0) state.items.splice(idx, 1);
  }

  function computePosition(item) {
    const progress = clamp(item.progress, 0, 1);
    const curveLift = Math.sin(progress * Math.PI) * (canvas.height * item.curve * 0.32);
    const laneBias = (item.pathEndX - item.pathStartX) * progress;
    const verticalBias = (item.pathEndY - item.pathStartY) * progress;
    return {
      x: item.pathStartX + laneBias,
      y: item.pathStartY + verticalBias - curveLift,
    };
  }

  function updateItemPosition(item) {
    const pos = computePosition(item);
    item.x = pos.x;
    item.y = pos.y;
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
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

  function progressForPointer(item, point) {
    const span = item.pathEndX - item.pathStartX;
    if (Math.abs(span) < 0.001) return 0;
    return clamp((point.x - item.pathStartX) / span, 0, 1);
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

    state.drag = { id: item.id, pointerId: event.pointerId };
    item.dragging = true;
    item.progress = progressForPointer(item, point);
    updateItemPosition(item);
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(event.pointerId);
    setFeedback('Drag it along the curved path.', '#cbd5e1');
  }

  function dragItem(event) {
    if (!state.drag) return;
    const point = getCanvasPoint(event);
    const item = state.items.find((entry) => entry.id === state.drag.id);
    if (!item) return;

    item.progress = progressForPointer(item, point);
    updateItemPosition(item);
  }

  function dropItem(event) {
    if (!state.drag) return;
    const item = state.items.find((entry) => entry.id === state.drag.id);
    if (item) {
      item.dragging = false;
      if (item.progress >= 0.97) {
        scorePoint();
        removeItem(item.id);
      } else {
        setFeedback('Keep dragging it toward the matching column.', '#fbbf24');
      }
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

      if (!item.dragging && performance.now() > item.expiry) {
        removeItem(item.id);
        loseLife();
        continue;
      }

      updateItemPosition(item);
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
    setFeedback('Reset! Drag each item along the path.', '#a7f3d0');
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
  setFeedback('Drag the trash along its curved route.', '#cbd5e1');
  requestAnimationFrame(frame);
})();
