// Bricks vs Balls — минимальная полноценная версия под Telegram WebApp
// Управление: потяни/наведи и отпусти — выстрел. Раунд: блоки спускаются вниз.

(() => {
  // --- Telegram safe init ---
  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.body.style.overflow = "hidden";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const uiBalls = document.getElementById("ballsCount");
  const uiRound = document.getElementById("round");
  const hint = document.getElementById("hint");

  // --- HiDPI resize ---
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight - 44; // topbar approx height; canvas flex will set actual size in CSS, but we keep logic simple
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor((window.innerHeight - 44) * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = (window.innerHeight - 44) + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Game constants ---
  const GRID_COLS = 8;
  const GRID_ROWS_VISIBLE = 10;
  const TOP_MARGIN = 12;
  const SIDE_MARGIN = 12;
  const CELL_GAP = 6;
  const BALL_RADIUS = 5;
  const BALL_SPEED = 720; // px/sec
  const SHOT_INTERVAL = 40; // ms между шарами в очереди
  const BOUNCE_EPS = 0.001;
  const MIN_AIM_ANGLE = -Math.PI + 0.2; // ограничение чтоб не стрелять в совсем горизонт
  const MAX_AIM_ANGLE = -0.2;

  let cellSize = 0;
  function computeCellSize() {
    const usableW = W - SIDE_MARGIN * 2;
    cellSize = (usableW - (GRID_COLS - 1) * CELL_GAP) / GRID_COLS;
  }
  computeCellSize();

  // --- State ---
  let round = 1;
  let ballsTotal = 1;
  let isAiming = false;
  let isShooting = false;
  let aimStart = null;
  let aimEnd = null;
  let lastReturnX = null;

  // spawn point at bottom
  function getShooterPos() {
    const x = lastReturnX ?? (W / 2);
    const y = (window.innerHeight - 44) - 16;
    return { x, y };
  }

  // blocks: {col,row,hp}
  let blocks = [];
  let gems = []; // {col,row} -> gives +1 ball when hit (collected by passing through)

  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  function cellToRect(col, row) {
    const x = SIDE_MARGIN + col * (cellSize + CELL_GAP);
    const y = TOP_MARGIN + row * (cellSize + CELL_GAP);
    return { x, y, w: cellSize, h: cellSize };
  }

  function spawnNewRow() {
    // шанс блока в колонке
    const chance = 0.55;
    const row = 0;
    for (let col = 0; col < GRID_COLS; col++) {
      if (Math.random() < chance) {
        blocks.push({ col, row, hp: round * 2 + randInt(0, round) });
      } else if (Math.random() < 0.18) {
        gems.push({ col, row });
      }
    }
  }

  function shiftDown() {
    for (const b of blocks) b.row += 1;
    for (const g of gems) g.row += 1;
  }

  function checkLose() {
    // если блок дошёл до нижней границы сетки (видимой) — проигрыш
    const maxRow = Math.max(-1, ...blocks.map(b => b.row));
    if (maxRow >= GRID_ROWS_VISIBLE) return true;
    return false;
  }

  function resetGame() {
    round = 1;
    ballsTotal = 1;
    blocks = [];
    gems = [];
    lastReturnX = null;
    spawnNewRow();
    syncUI();
  }

  function syncUI() {
    uiBalls.textContent = "x" + ballsTotal;
    uiRound.textContent = "Round " + round;
  }

  // --- Ball simulation ---
  let balls = []; // active balls {x,y,vx,vy,alive,returned}
  let ballsLaunched = 0;
  let ballsReturned = 0;
  let shotAngle = -Math.PI / 2;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function startShot(angle) {
    if (isShooting) return;
    isShooting = true;
    hint.style.opacity = "0";
    balls = [];
    ballsLaunched = 0;
    ballsReturned = 0;
    shotAngle = angle;

    const { x, y } = getShooterPos();

    const timer = setInterval(() => {
      if (ballsLaunched >= ballsTotal) {
        clearInterval(timer);
        return;
      }
      const vx = Math.cos(shotAngle) * BALL_SPEED;
      const vy = Math.sin(shotAngle) * BALL_SPEED;
      balls.push({ x, y, vx, vy, alive: true });
      ballsLaunched++;
    }, SHOT_INTERVAL);
  }

  function endRoundIfDone() {
    if (!isShooting) return;
    if (ballsReturned >= ballsTotal) {
      // раунд завершён
      isShooting = false;
      round += 1;

      // сдвигаем блоки вниз и добавляем новый ряд
      shiftDown();
      spawnNewRow();

      // удаляем всё, что вышло за видимую область сверху? не нужно
      // проверка проигрыша
      if (checkLose()) {
        // простой restart
        hint.textContent = "Проигрыш :( Нажми и стреляй, чтобы начать заново";
        hint.style.opacity = "1";
        resetGame();
        return;
      }

      syncUI();
    }
  }

  function circleRectCollision(cx, cy, r, rx, ry, rw, rh) {
    const nearestX = clamp(cx, rx, rx + rw);
    const nearestY = clamp(cy, ry, ry + rh);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return (dx * dx + dy * dy) <= r * r;
  }

  function reflectBallFromRect(ball, rect) {
    // определяем сторону удара по глубине проникновения (простая эвристика)
    const cx = ball.x;
    const cy = ball.y;

    const left = Math.abs(cx - rect.x);
    const right = Math.abs(cx - (rect.x + rect.w));
    const top = Math.abs(cy - rect.y);
    const bottom = Math.abs(cy - (rect.y + rect.h));
    const minSide = Math.min(left, right, top, bottom);

    if (minSide === left || minSide === right) {
      ball.vx *= -1;
      ball.x += Math.sign(ball.vx) * BOUNCE_EPS;
    } else {
      ball.vy *= -1;
      ball.y += Math.sign(ball.vy) * BOUNCE_EPS;
    }
  }

  function update(dt) {
    computeCellSize();

    // прицеливание
    if (!isShooting && isAiming && aimStart && aimEnd) {
      // ничего
    }

    // двигаем шары
    const playH = window.innerHeight - 44;
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
        const rect = cellToRect(b.col, b.row);
        if (circleRectCollision(ball.x, ball.y, BALL_RADIUS, rect.x, rect.y, rect.w, rect.h)) {
          b.hp -= 1;
          reflectBallFromRect(ball, rect);
          if (b.hp <= 0) blocks.splice(i, 1);
          break;
        }
      }

      // бонусы (гемы)
      for (let i = gems.length - 1; i >= 0; i--) {
        const g = gems[i];
        const rect = cellToRect(g.col, g.row);
        if (circleRectCollision(ball.x, ball.y, BALL_RADIUS, rect.x, rect.y, rect.w, rect.h)) {
          gems.splice(i, 1);
          ballsTotal += 1;
          syncUI();
          break;
        }
      }

      // низ: возвращение
      if (ball.y + BALL_RADIUS >= playH) {
        ball.alive = false;
        ballsReturned += 1;

        // фиксируем точку возврата по первому шару
        if (lastReturnX === null) lastReturnX = clamp(ball.x, 16, W - 16);

        endRoundIfDone();
      }
    }
  }

  function drawAimLine() {
    if (isShooting) return;
    if (!isAiming || !aimStart || !aimEnd) return;

    const shooter = getShooterPos();
    const dx = aimEnd.x - aimStart.x;
    const dy = aimEnd.y - aimStart.y;

    // тянем “назад” чтобы стрелять “вверх”
    let ang = Math.atan2(dy, dx) + Math.PI; // разворачиваем
    ang = clamp(ang, MIN_AIM_ANGLE, MAX_AIM_ANGLE);

    // пунктирная линия
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    ctx.lineTo(shooter.x + Math.cos(ang) * 800, shooter.y + Math.sin(ang) * 800);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const playH = window.innerHeight - 44;

    // фон
    ctx.clearRect(0, 0, W, playH);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, W, playH);

    // сетка блоков
    for (const b of blocks) {
      const r = cellToRect(b.col, b.row);
      // блок
      ctx.fillStyle = "rgba(72, 120, 255, 0.9)";
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // hp
      ctx.fillStyle = "white";
      ctx.font = "700 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
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
      ctx.fillText("+1", cx, cy + 26);
    }

    // прицел
    drawAimLine();

    // shooter
    const shooter = getShooterPos();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(shooter.x, shooter.y, 8, 0, Math.PI * 2);
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
    const p = getPosFromEvent(e);
    aimStart = p;
    aimEnd = p;
  }

  function onMove(e) {
    if (!isAiming) return;
    aimEnd = getPosFromEvent(e);
  }

  function onUp(e) {
    if (!isAiming) return;
    isAiming = false;

    const shooter = getShooterPos();
    const dx = (aimEnd?.x ?? shooter.x) - (aimStart?.x ?? shooter.x);
    const dy = (aimEnd?.y ?? shooter.y) - (aimStart?.y ?? shooter.y);

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

  // --- Loop ---
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