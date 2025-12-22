(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const uiBalls = document.getElementById("ballsCount");
  const uiRound = document.getElementById("round");
  const hint = document.getElementById("hint");
  const debugEl = document.getElementById("debug");

  // --- Debug / error overlay ---
  function setDebug(text) {
    debugEl.textContent = text;
  }

  window.addEventListener("error", (e) => {
    setDebug("JS ERROR:\n" + (e.message || "unknown") + "\n" + (e.filename || "") + ":" + (e.lineno || ""));
  });

  window.addEventListener("unhandledrejection", (e) => {
    setDebug("PROMISE ERROR:\n" + (e.reason?.message || String(e.reason)));
  });

  // Убираем скролл/зум
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.body.style.overflow = "hidden";

  // --- Resize canvas по РЕАЛЬНОМУ размеру элемента (важно!) ---
  let W = 0, H = 0, dpr = 1;

  function resizeCanvasToDisplaySize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);

    // берём реальные CSS размеры canvas
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    const needW = Math.floor(cssW * dpr);
    const needH = Math.floor(cssH * dpr);

    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }

    // логические размеры в CSS пикселях
    W = cssW;
    H = cssH;

    // рисуем в CSS координатах
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // иногда Telegram сначала даёт 0 размеров — делаем несколько попыток
  function ensureSized(tries = 0) {
    resizeCanvasToDisplaySize();
    if ((W < 10 || H < 10) && tries < 10) {
      requestAnimationFrame(() => ensureSized(tries + 1));
    }
  }

  window.addEventListener("resize", () => ensureSized(0));
  ensureSized(0);

  // --- Game constants ---
  const GRID_COLS = 8;
  const GRID_ROWS_VISIBLE = 10;
  const TOP_MARGIN = 12;
  const SIDE_MARGIN = 12;
  const CELL_GAP = 6;

  const BALL_RADIUS = 5;
  const BALL_SPEED = 720;  // px/sec
  const SHOT_INTERVAL = 40; // ms
  const MIN_AIM_ANGLE = -Math.PI + 0.25;
  const MAX_AIM_ANGLE = -0.25;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // --- Layout ---
  let cellSize = 0;
  function computeCellSize() {
    const usableW = W - SIDE_MARGIN * 2;
    cellSize = (usableW - (GRID_COLS - 1) * CELL_GAP) / GRID_COLS;
    cellSize = Math.max(18, cellSize);
  }

  function cellToRect(col, row) {
    const x = SIDE_MARGIN + col * (cellSize + CELL_GAP);
    const y = TOP_MARGIN + row * (cellSize + CELL_GAP);
    return { x, y, w: cellSize, h: cellSize };
  }

  // --- State ---
  let round = 1;
  let ballsTotal = 1;

  let blocks = []; // {col,row,hp}
  let gems = [];   // {col,row}

  let isAiming = false;
  let isShooting = false;
  let aimStart = null;
  let aimEnd = null;

  let balls = []; // active balls {x,y,vx,vy,alive}
  let ballsLaunched = 0;
  let ballsReturned = 0;
  let lastReturnX = null;

  function getShooterPos() {
    const x = lastReturnX ?? (W / 2);
    const y = H - 18;
    return { x: clamp(x, 16, W - 16), y };
  }

  function syncUI() {
    uiBalls.textContent = "x" + ballsTotal;
    uiRound.textContent = "Round " + round;
  }

  function spawnNewRow() {
    // ГАРАНТИРУЕМ что что-то появится
    let spawnedSomething = false;
    const row = 0;

    for (let col = 0; col < GRID_COLS; col++) {
      const r = Math.random();

      if (r < 0.62) {
        blocks.push({ col, row, hp: round * 2 + randInt(0, round) });
        spawnedSomething = true;
      } else if (r < 0.78) {
        gems.push({ col, row });
        spawnedSomething = true;
      }
    }

    // если вдруг ничего — добавим блок по центру
    if (!spawnedSomething) {
      blocks.push({ col: Math.floor(GRID_COLS / 2), row, hp: round * 2 });
    }
  }

  function shiftDown() {
    for (const b of blocks) b.row += 1;
    for (const g of gems) g.row += 1;
  }

  function checkLose() {
    return blocks.some(b => b.row >= GRID_ROWS_VISIBLE);
  }

  function resetGame() {
    round = 1;
    ballsTotal = 1;
    blocks = [];
    gems = [];
    balls = [];
    ballsLaunched = 0;
    ballsReturned = 0;
    lastReturnX = null;

    spawnNewRow();
    syncUI();
    hint.style.opacity = "1";
  }

  // --- Physics helpers ---
  function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx * dx + dy * dy) <= r * r;
  }

  function reflectBallFromRect(ball, rect) {
    const cx = ball.x;
    const cy = ball.y;
    const left = Math.abs(cx - rect.x);
    const right = Math.abs(cx - (rect.x + rect.w));
    const top = Math.abs(cy - rect.y);
    const bottom = Math.abs(cy - (rect.y + rect.h));
    const minSide = Math.min(left, right, top, bottom);

    if (minSide === left || minSide === right) ball.vx *= -1;
    else ball.vy *= -1;
  }

  // --- Shooting ---
  function startShot(angle) {
    if (isShooting) return;
    isShooting = true;
    hint.style.opacity = "0";

    balls = [];
    ballsLaunched = 0;
    ballsReturned = 0;

    const shooter = getShooterPos();
    const timer = setInterval(() => {
      if (ballsLaunched >= ballsTotal) {
        clearInterval(timer);
        return;
      }

      const vx = Math.cos(angle) * BALL_SPEED;
      const vy = Math.sin(angle) * BALL_SPEED;

      balls.push({ x: shooter.x, y: shooter.y, vx, vy, alive: true });
      ballsLaunched++;
    }, SHOT_INTERVAL);
  }

  function endRoundIfDone() {
    if (!isShooting) return;
    if (ballsReturned >= ballsTotal) {
      isShooting = false;
      round += 1;

      shiftDown();
      spawnNewRow();
      syncUI();

      if (checkLose()) {
        hint.textContent = "Проигрыш :( Потяни и отпусти, чтобы начать заново";
        resetGame();
      }
    }
  }

  // --- Input ---
  function getPosFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onDown(e) {
    if (isShooting) return;
    isAiming = true;
    aimStart = getPosFromEvent(e);
    aimEnd = aimStart;
  }

  function onMove(e) {
    if (!isAiming) return;
    aimEnd = getPosFromEvent(e);
  }

  function onUp() {
    if (!isAiming) return;
    isAiming = false;

    const shooter = getShooterPos();
    const a0 = aimStart ?? shooter;
    const a1 = aimEnd ?? shooter;

    const dx = a1.x - a0.x;
    const dy = a1.y - a0.y;

    // “тянем” и стреляем вверх
    let ang = Math.atan2(dy, dx) + Math.PI;
    ang = clamp(ang, MIN_AIM_ANGLE, MAX_AIM_ANGLE);

    aimStart = null;
    aimEnd = null;

    startShot(ang);
  }

  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp, { passive: false });

  // --- Update/draw ---
  function update(dt) {
    resizeCanvasToDisplaySize(); // безопасно вызывать каждый кадр
    computeCellSize();

    for (const ball of balls) {
      if (!ball.alive) continue;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // стены
      if (ball.x - BALL_RADIUS <= 0) { ball.x = BALL_RADIUS; ball.vx *= -1; }
      if (ball.x + BALL_RADIUS >= W) { ball.x = W - BALL_RADIUS; ball.vx *= -1; }
      if (ball.y - BALL_RADIUS <= 0) { ball.y = BALL_RADIUS; ball.vy *= -1; }

      // блоки
      for (let i = blocks.length - 1; i >= 0; i--) {
        const b = blocks[i];
        const r = cellToRect(b.col, b.row);
        if (circleRectCollision(ball.x, ball.y, BALL_RADIUS, r.x, r.y, r.w, r.h)) {
          b.hp -= 1;
          reflectBallFromRect(ball, r);
          if (b.hp <= 0) blocks.splice(i, 1);
          break;
        }
      }

      // гемы +1
      for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        const r = cellToRect(g.col, g.row);
        if (circleRectCollision(ball.x, ball.y, BALL_RADIUS, r.x, r.y, r.w, r.h)) {
          gems.splice(i, 1);
          ballsTotal += 1;
          syncUI();
          break;
        }
      }

      // низ: возвращение
      if (ball.y + BALL_RADIUS >= H) {
        ball.alive = false;
        ballsReturned += 1;
        if (lastReturnX === null) lastReturnX = clamp(ball.x, 16, W - 16);
        endRoundIfDone();
      }
    }

    // debug текст
    setDebug(
      `W×H: ${W}×${H}\n` +
      `blocks: ${blocks.length}  gems: ${gems.length}\n` +
      `ballsTotal: ${ballsTotal}  active: ${balls.filter(b=>b.alive).length}\n` +
      `shooting: ${isShooting}`
    );
  }

  function drawAimLine() {
    if (isShooting) return;
    if (!isAiming || !aimStart || !aimEnd) return;

    const shooter = getShooterPos();
    const dx = aimEnd.x - aimStart.x;
    const dy = aimEnd.y - aimStart.y;

    let ang = Math.atan2(dy, dx) + Math.PI;
    ang = clamp(ang, MIN_AIM_ANGLE, MAX_AIM_ANGLE);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    ctx.lineTo(shooter.x + Math.cos(ang) * 900, shooter.y + Math.sin(ang) * 900);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    // фон
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, H);

    // блоки
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const b of blocks) {
      const r = cellToRect(b.col, b.row);
      ctx.fillStyle = "rgba(72, 120, 255, 0.92)";
      ctx.fillRect(r.x, r.y, r.w, r.h);

      ctx.fillStyle = "white";
      ctx.font = "700 16px system-ui";
      ctx.fillText(String(b.hp), r.x + r.w / 2, r.y + r.h / 2);
    }

    // gems
    for (const g of gems) {
      const r = cellToRect(g.col, g.row);
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;

      ctx.fillStyle = "rgba(255, 64, 180, 0.95)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx + 12, cy);
      ctx.lineTo(cx, cy + 14);
      ctx.lineTo(cx - 12, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "white";
      ctx.font = "800 12px system-ui";
      ctx.fillText("+1", cx, cy + 24);
    }

    // прицел
    drawAimLine();

    // shooter
    const s = getShooterPos();
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
    ctx.fill();

    // шары
    for (const ball of balls) {
      if (!ball.alive) continue;
      ctx.fillStyle = "rgba(255, 230, 80, 0.95)";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Main loop ---
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // старт
  resetGame();
  requestAnimationFrame(loop);
})();