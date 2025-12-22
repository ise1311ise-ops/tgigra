(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const uiBalls = document.getElementById("ballsCount");
  const uiRound = document.getElementById("round");
  const hint = document.getElementById("hint");
  const debugEl = document.getElementById("debug");

  function setDebug(text) {
    if (debugEl) debugEl.textContent = text;
  }

  window.addEventListener("error", (e) => {
    setDebug("JS ERROR:\n" + (e.message || "unknown") + "\n" + (e.filename || "") + ":" + (e.lineno || ""));
  });

  window.addEventListener("unhandledrejection", (e) => {
    setDebug("PROMISE ERROR:\n" + (e.reason?.message || String(e.reason)));
  });

  document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  document.body.style.overflow = "hidden";

  // --- Resize canvas to real size ---
  let W = 0, H = 0, dpr = 1;

  function resizeCanvasToDisplaySize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));

    const needW = Math.floor(cssW * dpr);
    const needH = Math.floor(cssH * dpr);

    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }

    W = cssW;
    H = cssH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ensureSized(tries = 0) {
    resizeCanvasToDisplaySize();
    if ((W < 10 || H < 10) && tries < 10) requestAnimationFrame(() => ensureSized(tries + 1));
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
  const BALL_SPEED = 720;      // px/sec
  const SHOT_INTERVAL = 40;    // ms
  const MIN_AIM_ANGLE = -Math.PI + 0.25;
  const MAX_AIM_ANGLE = -0.25;

  // Платформа
  const PADDLE_H = 10;
  const PADDLE_Y_OFFSET = 26; // от низа
  let paddle = { x: 0, y: 0, w: 120, h: PADDLE_H };

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

  // куда “возвращаем” старт следующего выстрела
  let lastReturnX = null;

  function syncUI() {
    uiBalls.textContent = "x" + ballsTotal;
    uiRound.textContent = "Round " + round;
  }

  function updatePaddleGeometry() {
    // адаптивная ширина платформы
    paddle.w = clamp(W * 0.28, 90, 150);
    paddle.h = PADDLE_H;
    paddle.y = H - PADDLE_Y_OFFSET;

    if (paddle.x === 0) {
      paddle.x = (lastReturnX ?? (W / 2)) - paddle.w / 2;
    }

    paddle.x = clamp(paddle.x, 8, W - paddle.w - 8);
  }

  function spawnNewRow() {
    let spawned = false;
    const row = 0;

    for (let col = 0; col < GRID_COLS; col++) {
      const r = Math.random();
      if (r < 0.62) {
        blocks.push({ col, row, hp: round * 2 + randInt(0, round) });
        spawned = true;
      } else if (r < 0.78) {
        gems.push({ col, row });
        spawned = true;
      }
    }

    if (!spawned) blocks.push({ col: Math.floor(GRID_COLS / 2), row, hp: round * 2 });
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

    paddle.x = 0; // пересчитается в updatePaddleGeometry()

    spawnNewRow();
    syncUI();
    if (hint) {
      hint.textContent = "Проведи и отпусти, чтобы выстрелить";
      hint.style.opacity = "1";
    }
  }

  // --- Collision helpers ---
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

  // Отражение от платформы с “углом” по месту удара
  function bounceFromPaddle(ball) {
    // нормализуем точку удара: -1 (лево) .. +1 (право)
    const hitX = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
    const t = clamp(hitX, -1, 1);

    // сохраняем скорость, меняем направление
    const speed = Math.hypot(ball.vx, ball.vy) || BALL_SPEED;

    // чем ближе к краю — тем больше горизонтальная составляющая
    const maxDeflect = 0.85; // насколько можно “увести” по горизонтали
    const vx = t * maxDeflect * speed;

    // вверх (vy отрицательная)
    const vy = -Math.sqrt(Math.max(10, speed * speed - vx * vx));

    ball.vx = vx;
    ball.vy = vy;

    // чуть поднимаем, чтобы не залип
    ball.y = paddle.y - BALL_RADIUS - 0.5;
  }

  // --- Shooting ---
  function getShooterPos() {
    // старт из центра платформы, чуть выше неё
    return {
      x: paddle.x + paddle.w / 2,
      y: paddle.y - 14
    };
  }

  function startShot(angle) {
    if (isShooting) return;
    isShooting = true;
    if (hint) hint.style.opacity = "0";

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
        if (hint) {
          hint.textContent = "Проигрыш :( Потяни и отпусти, чтобы начать заново";
          hint.style.opacity = "1";
        }
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

  // ВАЖНО: если идёт стрельба — drag двигает платформу
  function onDown(e) {
    const p = getPosFromEvent(e);

    if (isShooting) {
      // перемещаем платформу под палец
      paddle.x = p.x - paddle.w / 2;
      paddle.x = clamp(paddle.x, 8, W - paddle.w - 8);
      return;
    }

    isAiming = true;
    aimStart = p;
    aimEnd = p;
  }

  function onMove(e) {
    const p = getPosFromEvent(e);

    if (isShooting) {
      paddle.x = p.x - paddle.w / 2;
      paddle.x = clamp(paddle.x, 8, W - paddle.w - 8);
      return;
    }

    if (!isAiming) return;
    aimEnd = p;
  }

  function onUp() {
    if (isShooting) return;

    if (!isAiming) return;
    isAiming = false;

    const shooter = getShooterPos();
    const a0 = aimStart ?? shooter;
    const a1 = aimEnd ?? shooter;

    const dx = a1.x - a0.x;
    const dy = a1.y - a0.y;

    let ang = Math.atan2(dy, dx) + Math.PI; // тянем и стреляем вверх
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

  // --- Update / draw ---
  function update(dt) {
    resizeCanvasToDisplaySize();
    computeCellSize();
    updatePaddleGeometry();

    for (const ball of balls) {
      if (!ball.alive) continue;

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      // стены
      if (ball.x - BALL_RADIUS <= 0) { ball.x = BALL_RADIUS; ball.vx *= -1; }
      if (ball.x + BALL_RADIUS >= W) { ball.x = W - BALL_RADIUS; ball.vx *= -1; }
      if (ball.y - BALL_RADIUS <= 0) { ball.y = BALL_RADIUS; ball.vy *= -1; }

      // Платформа: отбивание
      if (circleRectCollision(ball.x, ball.y, BALL_RADIUS, paddle.x, paddle.y, paddle.w, paddle.h)) {
        // если летит вниз — отбиваем, если вверх — не трогаем (чтобы не заедало)
        if (ball.vy > 0) bounceFromPaddle(ball);
      }

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

      // если шар прошёл НИЖЕ платформы — считаем “упал/вернулся”
      if (ball.y - BALL_RADIUS > H + 20) {
        ball.alive = false;
        ballsReturned += 1;

        // точка старта следующего раунда — куда упал первый шар
        if (lastReturnX === null) {
          lastReturnX = clamp(ball.x, 16, W - 16);
          paddle.x = lastReturnX - paddle.w / 2;
        }

        endRoundIfDone();
      }
    }

    setDebug(
      `W×H: ${W}×${H}\n` +
      `paddle: x=${Math.round(paddle.x)} w=${Math.round(paddle.w)}\n` +
      `blocks: ${blocks.length} gems: ${gems.length}\n` +
      `ballsTotal: ${ballsTotal} active: ${balls.filter(b=>b.alive).length}\n` +
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

    // Платформа
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    const rr = 8; // “скругление” визуально
    ctx.beginPath();
    ctx.moveTo(paddle.x + rr, paddle.y);
    ctx.lineTo(paddle.x + paddle.w - rr, paddle.y);
    ctx.quadraticCurveTo(paddle.x + paddle.w, paddle.y, paddle.x + paddle.w, paddle.y + rr);
    ctx.lineTo(paddle.x + paddle.w, paddle.y + paddle.h - rr);
    ctx.quadraticCurveTo(paddle.x + paddle.w, paddle.y + paddle.h, paddle.x + paddle.w - rr, paddle.y + paddle.h);
    ctx.lineTo(paddle.x + rr, paddle.y + paddle.h);
    ctx.quadraticCurveTo(paddle.x, paddle.y + paddle.h, paddle.x, paddle.y + paddle.h - rr);
    ctx.lineTo(paddle.x, paddle.y + rr);
    ctx.quadraticCurveTo(paddle.x, paddle.y, paddle.x + rr, paddle.y);
    ctx.closePath();
    ctx.fill();

    // shooter точка (из центра платформы)
    const s = getShooterPos();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
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

  resetGame();
  requestAnimationFrame(loop);
})();