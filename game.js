(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const modeEl = document.getElementById("mode");
  const hintEl = document.getElementById("hint");
  const rotateBtn = document.getElementById("rotate");
  const oriEl = document.getElementById("ori");
  const restartBtn = document.getElementById("restart");

  // Поле 10x10
  const N = 10;
  const pad = 20;
  const gridSize = 320; // квадрат поля
  const cell = gridSize / N;

  // Центрируем поле по горизонтали
  const boardX = (canvas.width - gridSize) / 2;
  const boardY = 60; // сверху место под подписи

  // Состояния
  // 0 - пусто
  // 1 - корабль
  // 2 - промах
  // 3 - попадание
  let board, shipsLeftCells, score;
  let placing = true;
  let horizontal = true;

  // Набор кораблей: 4,3,3,2,2,2,1,1,1,1
  const fleet = [4,3,3,2,2,2,1,1,1,1];
  let placeIndex = 0; // какой корабль ставим сейчас

  function newBoard() {
    board = Array.from({ length: N }, () => Array(N).fill(0));
  }

  function reset() {
    newBoard();
    score = 0;
    shipsLeftCells = 0;
    placing = true;
    horizontal = true;
    placeIndex = 0;
    scoreEl.textContent = "0";
    modeEl.textContent = "Расстановка";
    oriEl.textContent = "Гориз.";
    hintEl.textContent =
      "Расстановка: тапай по сетке, чтобы поставить корабли. Потом начнётся атака: тапай по клеткам, чтобы стрелять.";
    draw();
  }

  // Проверка, можно ли поставить корабль (без касания по диагонали и вплотную тоже запрещаем)
  function canPlace(r, c, len, horiz) {
    const dr = horiz ? 0 : 1;
    const dc = horiz ? 1 : 0;

    const endR = r + dr * (len - 1);
    const endC = c + dc * (len - 1);
    if (endR < 0 || endR >= N || endC < 0 || endC >= N) return false;

    // Проверяем клетки корабля и окружение 1 клетка вокруг
    for (let i = 0; i < len; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;

      for (let ar = rr - 1; ar <= rr + 1; ar++) {
        for (let ac = cc - 1; ac <= cc + 1; ac++) {
          if (ar < 0 || ar >= N || ac < 0 || ac >= N) continue;
          if (board[ar][ac] === 1) return false;
        }
      }
    }
    return true;
  }

  function placeShip(r, c, len, horiz) {
    const dr = horiz ? 0 : 1;
    const dc = horiz ? 1 : 0;
    for (let i = 0; i < len; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      board[rr][cc] = 1;
      shipsLeftCells++;
    }
  }

  function startBattle() {
    placing = false;
    modeEl.textContent = "Атака";
    hintEl.textContent =
      "Атака: тапай по клеткам. Попадание = +1 очко. Цель — открыть все клетки кораблей!";
  }

  function finishBattle() {
    modeEl.textContent = "Победа!";
    hintEl.textContent = `Ты потопил весь флот! Очки: ${score}. Нажми "Заново", чтобы сыграть ещё.`;
  }

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

    // Пересчёт координат, т.к. canvas растянут CSS-ом 1:1, но всё равно корректно:
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;

    const cx = x * sx;
    const cy = y * sy;

    const c = Math.floor((cx - boardX) / cell);
    const r = Math.floor((cy - boardY) / cell);

    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return { r, c };
  }

  function onTap(e) {
    e.preventDefault();
    const pos = cellFromEvent(e);
    if (!pos) return;

    const { r, c } = pos;

    if (placing) {
      const len = fleet[placeIndex];
      if (!canPlace(r, c, len, horizontal)) return;

      placeShip(r, c, len, horizontal);
      placeIndex++;

      if (placeIndex >= fleet.length) {
        startBattle();
      }
      draw();
      return;
    }

    // Атака
    const v = board[r][c];
    if (v === 2 || v === 3) return; // уже стреляли

    if (v === 1) {
      board[r][c] = 3;
      score++;
      shipsLeftCells--;
      scoreEl.textContent = String(score);
      if (shipsLeftCells === 0) finishBattle();
    } else if (v === 0) {
      board[r][c] = 2;
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Заголовок внутри canvas
    ctx.fillStyle = "#e8eefc";
    ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Поле 10×10", pad, 30);

    // Подсказка текущего корабля при расстановке
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillStyle = "rgba(232,238,252,.85)";
    if (placing) {
      const len = fleet[placeIndex];
      ctx.fillText(`Поставь корабль: ${len} клетк. (${placeIndex+1}/${fleet.length})`, pad, 50);
    } else {
      ctx.fillText("Стреляй по клеткам", pad, 50);
    }

    // Поле
    // рамка
    ctx.strokeStyle = "rgba(232,238,252,.25)";
    ctx.lineWidth = 2;
    roundRect(ctx, boardX, boardY, gridSize, gridSize, 12);
    ctx.stroke();

    // сетка
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(232,238,252,.12)";
    for (let i = 1; i < N; i++) {
      // вертикальные
      ctx.beginPath();
      ctx.moveTo(boardX + i * cell, boardY);
      ctx.lineTo(boardX + i * cell, boardY + gridSize);
      ctx.stroke();

      // горизонтальные
      ctx.beginPath();
      ctx.moveTo(boardX, boardY + i * cell);
      ctx.lineTo(boardX + gridSize, boardY + i * cell);
      ctx.stroke();
    }

    // Рисуем состояния
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const x = boardX + c * cell;
        const y = boardY + r * cell;
        const v = board[r][c];

        // В режиме расстановки показываем корабли
        if (placing && v === 1) {
          ctx.fillStyle = "rgba(80, 200, 120, .65)";
          ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
        }

        // В режиме атаки: корабли скрыты, но показываем попадания/промахи
        if (!placing) {
          if (v === 2) { // промах
            ctx.fillStyle = "rgba(232,238,252,.45)";
            dot(x, y);
          } else if (v === 3) { // попадание
            ctx.strokeStyle = "rgba(255, 90, 90, .95)";
            ctx.lineWidth = 3;
            cross(x, y);
          }
        }
      }
    }

    // Превью корабля при расстановке (на нижней панели canvas)
    if (placing) {
      const len = fleet[placeIndex];
      const px = pad;
      const py = boardY + gridSize + 18;

      ctx.fillStyle = "rgba(232,238,252,.85)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.fillText("Ориентация: " + (horizontal ? "Горизонтальная" : "Вертикальная"), px, py);

      // мини-корабль
      const mx = px;
      const my = py + 10;
      ctx.fillStyle = "rgba(80, 200, 120, .75)";
      for (let i = 0; i < len; i++) {
        const rx = mx + (horizontal ? i * 18 : 0);
        const ry = my + (horizontal ? 0 : i * 18);
        ctx.fillRect(rx, ry, 16, 16);
      }
    }
  }

  function dot(x, y) {
    const cx = x + cell / 2;
    const cy = y + cell / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function cross(x, y) {
    const p = 6;
    ctx.beginPath();
    ctx.moveTo(x + p, y + p);
    ctx.lineTo(x + cell - p, y + cell - p);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + cell - p, y + p);
    ctx.lineTo(x + p, y + cell - p);
    ctx.stroke();
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

  rotateBtn.addEventListener("click", () => {
    horizontal = !horizontal;
    oriEl.textContent = horizontal ? "Гориз." : "Вертик.";
    draw();
  });

  restartBtn.addEventListener("click", reset);

  canvas.addEventListener("click", onTap);
  canvas.addEventListener("touchstart", onTap, { passive: false });

  reset();
})();
