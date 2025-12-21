(() => {
  // ====== НАСТРОЙКИ ======
  const N = 10;                 // поле 10x10
  const CELL = 36;              // размер клетки в "логических" пикселях
  const SIZE = N * CELL;

  // флот: 1x4, 2x3, 3x2, 4x1
  const FLEET = [4,3,3,2,2,2,1,1,1,1];

  // клетки состояния
  // board[y][x] = 0 пусто, 1 корабль, 2 промах, 3 попадание
  function makeBoard() {
    return Array.from({length:N}, () => Array(N).fill(0));
  }

  // ====== DOM ======
  const pCanvas = document.getElementById("pBoard");
  const eCanvas = document.getElementById("eBoard");
  const pCtx = pCanvas.getContext("2d");
  const eCtx = eCanvas.getContext("2d");

  const statusEl = document.getElementById("status");
  const hintEl = document.getElementById("hint");
  const scoreEl = document.getElementById("score");

  const rotateBtn = document.getElementById("rotateBtn");
  const restartBtn = document.getElementById("restartBtn");

  // ====== DPR (чтобы на телефоне не было "пусто") ======
  function setupCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = SIZE + "px";
    canvas.style.height = SIZE + "px";
    canvas.width = Math.round(SIZE * dpr);
    canvas.height = Math.round(SIZE * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvas(pCanvas, pCtx);
  setupCanvas(eCanvas, eCtx);

  // ====== ИГРОВЫЕ ПЕРЕМЕННЫЕ ======
  let pBoard, eBoard;
  let placementIndex;          // какой корабль ставим
  let horizontal = true;
  let mode = "place";          // place | battle | end
  let score = 0;

  // для ИИ
  let aiShots;                 // set "y,x"
  let aiTargets;               // очередь "y,x" вокруг попадания

  function setStatus(text) { statusEl.textContent = text; }
  function setHint(text) { hintEl.textContent = text; }
  function setScore(v) { score = v; scoreEl.textContent = String(v); }

  // ====== УТИЛИТЫ ======
  function inBounds(x,y){ return x>=0 && x<N && y>=0 && y<N; }

  function key(x,y){ return `${y},${x}`; }
  function parseKey(k){ const [y,x]=k.split(",").map(Number); return {x,y}; }

  function getCellFromEvent(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    const cx = (evt.clientX - rect.left) * (SIZE / rect.width);
    const cy = (evt.clientY - rect.top) * (SIZE / rect.height);
    const x = Math.floor(cx / CELL);
    const y = Math.floor(cy / CELL);
    return {x,y};
  }

  // проверка: можно ли ставить корабль (без касаний даже по диагонали)
  function canPlace(board, x, y, len, horiz) {
    for (let i=0;i<len;i++){
      const xx = x + (horiz ? i : 0);
      const yy = y + (horiz ? 0 : i);
      if (!inBounds(xx,yy)) return false;
      if (board[yy][xx] !== 0) return false;

      // запрет касаний: проверяем окружение 8 клеток
      for (let dy=-1; dy<=1; dy++){
        for (let dx=-1; dx<=1; dx++){
          const nx = xx+dx, ny = yy+dy;
          if (inBounds(nx,ny) && board[ny][nx] === 1) return false;
        }
      }
    }
    return true;
  }

  function placeShip(board, x, y, len, horiz) {
    for (let i=0;i<len;i++){
      const xx = x + (horiz ? i : 0);
      const yy = y + (horiz ? 0 : i);
      board[yy][xx] = 1;
    }
  }

  // ====== РЕНДЕР ======
  function clear(ctx){
    ctx.clearRect(0,0,SIZE,SIZE);
  }

  function drawGrid(ctx){
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(233,237,247,.28)";
    for (let i=0;i<=N;i++){
      const p = i*CELL;
      ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(SIZE,p); ctx.stroke();
    }
  }

  function drawShips(ctx, board, hideShips) {
    for (let y=0;y<N;y++){
      for (let x=0;x<N;x++){
        const v = board[y][x];
        if (v === 1 && !hideShips){
          ctx.fillStyle = "rgba(120,175,255,.40)";
          ctx.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
        }
      }
    }
  }

  function drawShots(ctx, board) {
    for (let y=0;y<N;y++){
      for (let x=0;x<N;x++){
        const v = board[y][x];
        const cx = x*CELL + CELL/2;
        const cy = y*CELL + CELL/2;

        if (v === 2){ // промах
          ctx.fillStyle = "rgba(233,237,247,.55)";
          ctx.beginPath();
          ctx.arc(cx, cy, 3.2, 0, Math.PI*2);
          ctx.fill();
        }
        if (v === 3){ // попадание
          ctx.strokeStyle = "rgba(255,90,90,.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x*CELL+8, y*CELL+8);
          ctx.lineTo(x*CELL+CELL-8, y*CELL+CELL-8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x*CELL+CELL-8, y*CELL+8);
          ctx.lineTo(x*CELL+8, y*CELL+CELL-8);
          ctx.stroke();
        }
      }
    }
  }

  function render() {
    clear(pCtx);
    drawGrid(pCtx);
    drawShips(pCtx, pBoard, false);
    drawShots(pCtx, pBoard);

    clear(eCtx);
    drawGrid(eCtx);
    // корабли противника скрываем
    drawShips(eCtx, eBoard, true);
    drawShots(eCtx, eBoard);
  }

  // ====== ПОБЕДА/ПОРАЖЕНИЕ ======
  function countAlive(board) {
    let c = 0;
    for (let y=0;y<N;y++){
      for (let x=0;x<N;x++){
        if (board[y][x] === 1) c++;
      }
    }
    return c;
  }

  function endGame(win){
    mode = "end";
    setStatus(win ? "Победа! 🎉" : "Поражение 😿");
    setHint(win
      ? "Ты уничтожил все корабли противника. Нажми «Заново»."
      : "Противник уничтожил твой флот. Нажми «Заново»."
    );
  }

  // ====== РАССТАНОВКА ПРОТИВНИКА (случайно) ======
  function randomInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

  function autoPlaceFleet(board) {
    for (const len of FLEET){
      let placed = false;
      for (let tries=0; tries<5000 && !placed; tries++){
        const horiz = Math.random() < 0.5;
        const x = randomInt(0, N-1);
        const y = randomInt(0, N-1);
        if (canPlace(board, x, y, len, horiz)){
          placeShip(board, x, y, len, horiz);
          placed = true;
        }
      }
      if (!placed) return false;
    }
    return true;
  }

  // ====== ХОД ИИ ======
  function aiAddTargetsAround(x,y) {
    const dirs = [
      {dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1},
    ];
    for (const d of dirs){
      const nx = x+d.dx, ny = y+d.dy;
      if (!inBounds(nx,ny)) continue;
      const k = key(nx,ny);
      if (!aiShots.has(k)) aiTargets.push(k);
    }
  }

  function aiShootOne() {
    if (mode !== "battle") return;

    let pick = null;

    // сначала добиваем рядом с попаданием
    while (aiTargets.length > 0) {
      const k = aiTargets.shift();
      if (!aiShots.has(k)) { pick = k; break; }
    }

    // иначе случайно
    if (!pick) {
      let tries = 0;
      while (tries++ < 10000) {
        const x = randomInt(0,N-1);
        const y = randomInt(0,N-1);
        const k = key(x,y);
        if (!aiShots.has(k)) { pick = k; break; }
      }
    }

    if (!pick) return;

    aiShots.add(pick);
    const {x,y} = parseKey(pick);

    if (pBoard[y][x] === 1) {
      pBoard[y][x] = 3; // hit
      aiAddTargetsAround(x,y);
    } else if (pBoard[y][x] === 0) {
      pBoard[y][x] = 2; // miss
    }

    render();

    if (countAlive(pBoard) === 0) endGame(false);
  }

  // ====== ИГРОВЫЕ ДЕЙСТВИЯ ======
  function startBattle() {
    mode = "battle";
    setStatus("Режим: Бой");
    setHint("Стреляй по полю противника. Если промах — ходит противник.");
  }

  function onPlayerPlace(evt) {
    if (mode !== "place") return;

    const {x,y} = getCellFromEvent(pCanvas, evt);
    if (!inBounds(x,y)) return;

    const len = FLEET[placementIndex];
    if (!canPlace(pBoard, x, y, len, horizontal)) return;

    placeShip(pBoard, x, y, len, horizontal);
    placementIndex++;

    if (placementIndex >= FLEET.length) {
      // всё, расставили
      startBattle();
    } else {
      setHint(`Ставь корабль длиной ${FLEET[placementIndex]}. (Повернуть: ${horizontal ? "Гориз." : "Вертик."})`);
    }

    render();
  }

  function onPlayerShoot(evt) {
    if (mode !== "battle") return;

    const {x,y} = getCellFromEvent(eCanvas, evt);
    if (!inBounds(x,y)) return;

    const v = eBoard[y][x];
    if (v === 2 || v === 3) return; // уже стреляли

    if (v === 1) {
      eBoard[y][x] = 3; // hit
      setScore(score + 1);
      render();

      if (countAlive(eBoard) === 0) endGame(true);
    } else {
      eBoard[y][x] = 2; // miss
      render();
      // ход ИИ после маленькой паузы
      setTimeout(aiShootOne, 350);
    }
  }

  // ====== КНОПКИ ======
  rotateBtn.addEventListener("click", () => {
    horizontal = !horizontal;
    rotateBtn.textContent = "Повернуть: " + (horizontal ? "Гориз." : "Вертик.");
    if (mode === "place" && placementIndex < FLEET.length) {
      setHint(`Ставь корабль длиной ${FLEET[placementIndex]}. (Повернуть: ${horizontal ? "Гориз." : "Вертик."})`);
    }
  });

  restartBtn.addEventListener("click", reset);

  // ====== СОБЫТИЯ ТАПА ======
  pCanvas.addEventListener("click", onPlayerPlace);
  eCanvas.addEventListener("click", onPlayerShoot);

  // ====== СТАРТ/СБРОС ======
  function reset() {
    pBoard = makeBoard();
    eBoard = makeBoard();
    placementIndex = 0;
    horizontal = true;
    mode = "place";
    setScore(0);

    rotateBtn.textContent = "Повернуть: Гориз.";
    setStatus("Режим: Расстановка");
    setHint(`Ставь корабль длиной ${FLEET[placementIndex]}. Тапай по своему полю.`);

    aiShots = new Set();
    aiTargets = [];

    // ставим флот противнику
    autoPlaceFleet(eBoard);

    render();
  }

  reset();
})();
