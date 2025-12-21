(() => {
  // ====== DOM ======
  const youCanvas = document.getElementById("you");
  const enemyCanvas = document.getElementById("enemy");
  const scoreEl = document.getElementById("score");
  const leftToPlaceEl = document.getElementById("leftToPlace");
  const statusText = document.getElementById("statusText");
  const yourHint = document.getElementById("yourHint");
  const enemyHint = document.getElementById("enemyHint");
  const rotBtn = document.getElementById("rotate");
  const rotText = document.getElementById("rotText");
  const restartBtn = document.getElementById("restart");

  const ctxYou = youCanvas.getContext("2d");
  const ctxEnemy = enemyCanvas.getContext("2d");

  // ====== Game settings ======
  const N = 10;                 // grid size
  const PAD = 14;               // inner padding in px
  const WATER_ANIM = true;

  // Fleet plan: sizes
  const fleetPlan = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1]; // total 10 ships
  let planIndex = 0;

  // Boards:
  // 0 empty, 1 ship, 2 miss, 3 hit
  let you = makeGrid();
  let enemy = makeGrid();
  let enemyShips = []; // list of ship cells for enemy (for win check)

  // Placement state
  let horizontal = true; // orientation for placing on your board
  let mode = "place";    // "place" | "fight" | "end"
  let score = 0;

  // Visual effects
  const splashes = [];   // water splash particles
  const explosions = []; // hit particles
  let t0 = performance.now();

  // ====== Helpers ======
  function makeGrid() {
    return Array.from({ length: N }, () => Array(N).fill(0));
  }

  function inBounds(r, c) {
    return r >= 0 && r < N && c >= 0 && c < N;
  }

  function forEachNeighbor(r, c, fn) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (inBounds(rr, cc)) fn(rr, cc);
      }
    }
  }

  function cellFromEvent(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    const { cell, ox, oy } = metrics(canvas);
    const col = Math.floor((x - ox) / cell);
    const row = Math.floor((y - oy) / cell);

    if (!inBounds(row, col)) return null;
    return { row, col, x, y };
  }

  function metrics(canvas) {
    const w = canvas.width, h = canvas.height;
    const size = Math.min(w, h);
    const ox = Math.floor((w - size) / 2) + PAD;
    const oy = Math.floor((h - size) / 2) + PAD;
    const gridSize = size - PAD * 2;
    const cell = gridSize / N;
    return { size, gridSize, cell, ox, oy };
  }

  // ====== Ship placement rules (no touching even diagonally) ======
  function canPlace(board, r, c, len, horiz) {
    for (let i = 0; i < len; i++) {
      const rr = r + (horiz ? 0 : i);
      const cc = c + (horiz ? i : 0);
      if (!inBounds(rr, cc)) return false;

      // must be empty and no neighbors with ships
      if (board[rr][cc] !== 0) return false;

      let ok = true;
      forEachNeighbor(rr, cc, (nr, nc) => {
        if (board[nr][nc] === 1) ok = false;
      });
      if (!ok) return false;
    }
    return true;
  }

  function placeShip(board, r, c, len, horiz) {
    const cells = [];
    for (let i = 0; i < len; i++) {
      const rr = r + (horiz ? 0 : i);
      const cc = c + (horiz ? i : 0);
      board[rr][cc] = 1;
      cells.push([rr, cc]);
    }
    return cells;
  }

  // ====== Enemy auto placement (still fair, same rules) ======
  function placeEnemyFleet() {
    enemy = makeGrid();
    enemyShips = [];
    for (const len of fleetPlan) {
      let placed = false;
      for (let tries = 0; tries < 5000 && !placed; tries++) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * N);
        const c = Math.floor(Math.random() * N);
        if (canPlace(enemy, r, c, len, horiz)) {
          const cells = placeShip(enemy, r, c, len, horiz);
          enemyShips.push(...cells.map(([rr,cc]) => `${rr},${cc}`));
          placed = true;
        }
      }
      if (!placed) {
        // fallback reset
        return placeEnemyFleet();
      }
    }
  }

  // ====== Drawing ======
  function drawAll() {
    drawBoard(ctxYou, youCanvas, you, { showShips: true, label: "you" });
    drawBoard(ctxEnemy, enemyCanvas, enemy, { showShips: false, label: "enemy" });
  }

  function drawBoard(ctx, canvas, board, opts) {
    const { cell, ox, oy, gridSize } = metrics(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background ocean
    drawOcean(ctx, canvas, opts.label);

    // grid glass
    roundRect(ctx, ox - 6, oy - 6, gridSize + 12, gridSize + 12, 18);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // grid lines
    ctx.save();
    ctx.translate(ox, oy);
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.lineWidth = 1;

    for (let i = 0; i <= N; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, gridSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(gridSize, i * cell);
      ctx.stroke();
    }

    // ships (your board only)
    if (opts.showShips) {
      drawShipsPretty(ctx, board, cell);
    }

    // hits & misses
    drawMarks(ctx, board, cell);

    ctx.restore();

    // effects (global particles)
    drawParticles(ctx, canvas);
  }

  function drawOcean(ctx, canvas, label) {
    // subtle moving gradient
    const now = performance.now();
    const t = (now - t0) / 1000;
    const g = ctx.createRadialGradient(
      canvas.width * (label === "you" ? 0.25 : 0.75),
      canvas.height * 0.2,
      40,
      canvas.width * 0.5,
      canvas.height * 0.6,
      canvas.width
    );
    g.addColorStop(0, "rgba(73,214,255,0.18)");
    g.addColorStop(0.35, "rgba(124,92,255,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = "rgb(5,8,22)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!WATER_ANIM) return;

    // animated waves
    const step = 26;
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    for (let y = 0; y < canvas.height; y += step) {
      ctx.beginPath();
      for (let x = 0; x <= canvas.width; x += 18) {
        const yy = y + Math.sin((x * 0.02) + (t * 1.7) + y * 0.03) * 3;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawShipsPretty(ctx, board, cell) {
    // draw each ship cell as a "sprite-like" rounded hull + small highlights
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[r][c] !== 1) continue;

        const x = c * cell;
        const y = r * cell;

        const pad = cell * 0.12;
        const w = cell - pad * 2;
        const h = cell - pad * 2;

        // hull gradient
        const gx = x + pad + w * 0.5;
        const gy = y + pad + h * 0.2;
        const grad = ctx.createRadialGradient(gx, gy, 2, gx, gy, w);
        grad.addColorStop(0, "rgba(255,255,255,0.22)");
        grad.addColorStop(0.25, "rgba(73,214,255,0.14)");
        grad.addColorStop(1, "rgba(10,30,60,0.85)");

        roundRect(ctx, x + pad, y + pad, w, h, Math.max(8, cell * 0.22));
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // small "deck" line
        ctx.beginPath();
        ctx.moveTo(x + pad + w * 0.2, y + pad + h * 0.55);
        ctx.lineTo(x + pad + w * 0.8, y + pad + h * 0.55);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.stroke();

        // tiny portholes
        for (let i = 0; i < 2; i++) {
          const px = x + pad + w * (0.35 + i * 0.22);
          const py = y + pad + h * 0.35;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(1.6, cell * 0.05), 0, Math.PI * 2);
          ctx.fillStyle = "rgba(124,92,255,0.35)";
          ctx.fill();
        }
      }
    }
  }

  function drawMarks(ctx, board, cell) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const v = board[r][c];
        if (v !== 2 && v !== 3) continue;

        const cx = c * cell + cell / 2;
        const cy = r * cell + cell / 2;

        if (v === 2) {
          // miss = splash ring + dot
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.18, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.33, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(73,214,255,0.50)";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // hit = explosion cross + glow
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.34, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,74,106,0.18)";
          ctx.fill();

          ctx.strokeStyle = "rgba(255,74,106,0.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx - cell * 0.22, cy - cell * 0.22);
          ctx.lineTo(cx + cell * 0.22, cy + cell * 0.22);
          ctx.moveTo(cx + cell * 0.22, cy - cell * 0.22);
          ctx.lineTo(cx - cell * 0.22, cy + cell * 0.22);
          ctx.stroke();

          // ember dot
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.08, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fill();
        }
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ====== Particles ======
  function spawnSplash(x, y) {
    for (let i = 0; i < 16; i++) {
      splashes.push({
        x, y,
        vx: (Math.random() - 0.5) * 110,
        vy: (Math.random() - 1.2) * 130,
        life: 0.65 + Math.random() * 0.25,
        t: 0
      });
    }
  }

  function spawnExplosion(x, y) {
    for (let i = 0; i < 22; i++) {
      explosions.push({
        x, y,
        vx: (Math.random() - 0.5) * 170,
        vy: (Math.random() - 0.5) * 170,
        life: 0.55 + Math.random() * 0.25,
        t: 0
      });
    }
  }

  function drawParticles(ctx, canvas) {
    const now = performance.now();
    const dt = Math.min(0.034, (now - t0) / 1000); // not perfect, ok
    // (We update in RAF below; here just draw current arrays)
    // draw splashes
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (const p of splashes) {
      const a = Math.max(0, 1 - p.t / p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(73,214,255,${0.55 * a})`;
      ctx.fill();
    }

    for (const p of explosions) {
      const a = Math.max(0, 1 - p.t / p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,74,106,${0.65 * a})`;
      ctx.fill();
    }

    ctx.restore();
  }

  function tickParticles(dt) {
    for (const p of splashes) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 240 * dt;
    }
    for (const p of explosions) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 2.2 * dt);
      p.vy *= (1 - 2.2 * dt);
    }
    // cleanup
    for (let i = splashes.length - 1; i >= 0; i--) {
      if (splashes[i].t >= splashes[i].life) splashes.splice(i, 1);
    }
    for (let i = explosions.length - 1; i >= 0; i--) {
      if (explosions[i].t >= explosions[i].life) explosions.splice(i, 1);
    }
  }

  // ====== Gameplay ======
  function updateUI() {
    scoreEl.textContent = String(score);
    leftToPlaceEl.textContent = String(fleetPlan.length - planIndex);

    if (mode === "place") {
      statusText.innerHTML = `Режим: <b>Расстановка</b> — ставь корабли на своём поле`;
      yourHint.textContent = `Сейчас ставим корабль длиной ${fleetPlan[planIndex] || 0}`;
      enemyHint.textContent = "Пока нельзя стрелять — сначала расставь корабли";
    } else if (mode === "fight") {
      statusText.innerHTML = `Режим: <b>Бой</b> — стреляй по полю противника`;
      yourHint.textContent = "Твоё поле (корабли видны)";
      enemyHint.textContent = "Тапай по клеткам: попадание — ещё ход, мимо — ход противника";
    } else {
      statusText.innerHTML = `Режим: <b>Конец</b> — сыграем ещё раз?`;
      yourHint.textContent = "Готово";
      enemyHint.textContent = "Готово";
    }
  }

  function tryPlaceOnYou(row, col) {
    if (mode !== "place") return;

    const len = fleetPlan[planIndex];
    if (!len) return;

    if (!canPlace(you, row, col, len, horizontal)) {
      // little "nope" splash
      const { cell, ox, oy } = metrics(youCanvas);
      spawnSplash(ox + col * cell + cell / 2, oy + row * cell + cell / 2);
      return;
    }

    placeShip(you, row, col, len, horizontal);
    planIndex++;

    if (planIndex >= fleetPlan.length) {
      // start fight
      mode = "fight";
      placeEnemyFleet();
    }

    updateUI();
    drawAll();
  }

  function enemyShoot() {
    // very simple AI: random shot on your board cells not shot yet
    const candidates = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (you[r][c] === 0 || you[r][c] === 1) candidates.push([r, c]);
      }
    }
    if (!candidates.length) return;

    const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
    const { cell, ox, oy } = metrics(youCanvas);
    const x = ox + c * cell + cell / 2;
    const y = oy + r * cell + cell / 2;

    if (you[r][c] === 1) {
      you[r][c] = 3;
      spawnExplosion(x, y);
      // enemy continues? (classic rules: if hit continue)
      if (!checkAllShipsSunk(you)) {
        setTimeout(enemyShoot, 420);
      } else {
        mode = "end";
        updateUI();
      }
    } else {
      you[r][c] = 2;
      spawnSplash(x, y);
    }
    drawAll();
  }

  function playerShoot(row, col) {
    if (mode !== "fight") return;

    // already shot?
    if (enemy[row][col] === 2 || enemy[row][col] === 3) return;

    const { cell, ox, oy } = metrics(enemyCanvas);
    const x = ox + col * cell + cell / 2;
    const y = oy + row * cell + cell / 2;

    if (enemy[row][col] === 1) {
      enemy[row][col] = 3;
      score += 1;
      spawnExplosion(x, y);

      // win?
      if (checkEnemyWin()) {
        mode = "end";
        updateUI();
      }

      // hit -> player keeps turn
      updateUI();
      drawAll();
    } else {
      enemy[row][col] = 2;
      spawnSplash(x, y);
      updateUI();
      drawAll();
      // miss -> enemy turn
      setTimeout(enemyShoot, 420);
    }
  }

  function checkEnemyWin() {
    // all enemyShips must be hit (3)
    for (const key of enemyShips) {
      const [r, c] = key.split(",").map(Number);
      if (enemy[r][c] !== 3) return false;
    }
    return true;
  }

  function checkAllShipsSunk(board) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[r][c] === 1) return false;
      }
    }
    return true;
  }

  // ====== Events ======
  function onYouTap(e) {
    e.preventDefault();
    const hit = cellFromEvent(youCanvas, e);
    if (!hit) return;
    tryPlaceOnYou(hit.row, hit.col);
  }

  function onEnemyTap(e) {
    e.preventDefault();
    const hit = cellFromEvent(enemyCanvas, e);
    if (!hit) return;
    playerShoot(hit.row, hit.col);
  }

  function restart() {
    you = makeGrid();
    enemy = makeGrid();
    enemyShips = [];
    score = 0;
    mode = "place";
    planIndex = 0;
    splashes.length = 0;
    explosions.length = 0;
    updateUI();
    drawAll();
  }

  function toggleRotate() {
    horizontal = !horizontal;
    rotText.textContent = horizontal ? "Гориз." : "Вертик.";
  }

  // attach
  youCanvas.addEventListener("click", onYouTap);
  youCanvas.addEventListener("touchstart", onYouTap, { passive: false });

  enemyCanvas.addEventListener("click", onEnemyTap);
  enemyCanvas.addEventListener("touchstart", onEnemyTap, { passive: false });

  rotBtn.addEventListener("click", toggleRotate);
  restartBtn.addEventListener("click", restart);

  // ====== Render loop ======
  function loop(now) {
    const dt = Math.min(0.033, (now - t0) / 1000);
    t0 = now;
    tickParticles(dt);
    drawAll();
    requestAnimationFrame(loop);
  }

  // init
  toggleRotate(); // will flip to vertical, so flip back:
  toggleRotate();
  restart();
  placeEnemyFleet();
  // but enemy is hidden until fight, so it's ok

  requestAnimationFrame((t) => {
    t0 = t;
    requestAnimationFrame(loop);
  });
})();
