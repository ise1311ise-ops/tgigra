(() => {
  // ====== Настройки ======
  const N = 10;                 // 10x10
  const fleet = [4,3,3,2,2,2,1,1,1,1]; // классика
  const CELL = 36;              // canvas 360 => 36px

  // ====== DOM ======
  const pCanvas = document.getElementById("pBoard");
  const eCanvas = document.getElementById("eBoard");
  const pCtx = pCanvas.getContext("2d");
  const eCtx = eCanvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const modeEl  = document.getElementById("mode");
  const hintEl  = document.getElementById("hint");
  const rotateBtn = document.getElementById("rotate");
  const rotStateEl = document.getElementById("rotState");
  const restartBtn = document.getElementById("restart");

  // ====== Игровые данные ======
  // board: 0 пусто, 1 корабль
  // shots: 0 не стреляли, 1 мимо, 2 попадание
  let playerBoard, enemyBoard;
  let playerShots, enemyShots;

  let placing = true;
  let currentShipIdx = 0;
  let horizontal = true;
  let score = 0;

  // ИИ (простенький): если попал — добивает рядом
  let aiTargets = [];

  // ====== Утилиты ======
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
  function inb(x,y){ return x>=0 && x<N && y>=0 && y<N; }

  function newGrid(fill=0){
    return Array.from({length:N}, () => Array(N).fill(fill));
  }

  function cellFromEvent(canvas, ev){
    const r = canvas.getBoundingClientRect();
    const x = (ev.clientX - r.left) * (canvas.width / r.width);
    const y = (ev.clientY - r.top)  * (canvas.height/ r.height);
    return { cx: clamp(Math.floor(x / CELL), 0, N-1),
             cy: clamp(Math.floor(y / CELL), 0, N-1) };
  }

  function canPlace(board, x, y, len, horiz){
    for(let i=0;i<len;i++){
      const xx = x + (horiz ? i : 0);
      const yy = y + (horiz ? 0 : i);
      if(!inb(xx,yy)) return false;

      // нельзя касаться даже углами
      for(let dy=-1; dy<=1; dy++){
        for(let dx=-1; dx<=1; dx++){
          const nx = xx+dx, ny = yy+dy;
          if(inb(nx,ny) && board[ny][nx] === 1) return false;
        }
      }
    }
    return true;
  }

  function placeShip(board, x, y, len, horiz){
    for(let i=0;i<len;i++){
      const xx = x + (horiz ? i : 0);
      const yy = y + (horiz ? 0 : i);
      board[yy][xx] = 1;
    }
  }

  function countAlive(board, shots){
    // сколько клеток кораблей не подбито
    let alive = 0;
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        if(board[y][x] === 1 && shots[y][x] !== 2) alive++;
      }
    }
    return alive;
  }

  function randomPlaceFleet(board){
    for(const len of fleet){
      let ok = false;
      for(let tries=0; tries<5000 && !ok; tries++){
        const horiz = Math.random() < 0.5;
        const x = Math.floor(Math.random()*N);
        const y = Math.floor(Math.random()*N);
        if(canPlace(board, x, y, len, horiz)){
          placeShip(board, x, y, len, horiz);
          ok = true;
        }
      }
      if(!ok) return false;
    }
    return true;
  }

  // ====== Рендер ======
  function clear(ctx, canvas){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // фон
    const g = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    g.addColorStop(0, "rgba(0,0,0,.18)");
    g.addColorStop(1, "rgba(0,0,0,.06)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  function drawGrid(ctx){
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(233,237,247,.18)";
    for(let i=0;i<=N;i++){
      // вертикальные
      ctx.beginPath();
      ctx.moveTo(i*CELL + 0.5, 0);
      ctx.lineTo(i*CELL + 0.5, N*CELL);
      ctx.stroke();
      // горизонтальные
      ctx.beginPath();
      ctx.moveTo(0, i*CELL + 0.5);
      ctx.lineTo(N*CELL, i*CELL + 0.5);
      ctx.stroke();
    }
  }

  function drawShips(ctx, board, shots, showShips){
    for(let y=0;y<N;y++){
      for(let x=0;x<N;x++){
        const hasShip = board[y][x] === 1;
        const s = shots[y][x];

        // корабли (только на своём поле / если showShips)
        if(showShips && hasShip){
          ctx.fillStyle = "rgba(99,170,255,.35)";
          ctx.fillRect(x*CELL+2, y*CELL+2, CELL-4, CELL-4);
        }

        // выстрелы
        if(s === 1){ // мимо
          ctx.fillStyle = "rgba(233,237,247,.35)";
          ctx.beginPath();
          ctx.arc(x*CELL + CELL/2, y*CELL + CELL/2, CELL*0.12, 0, Math.PI*2);
          ctx.fill();
        }
        if(s === 2){ // попадание
          ctx.strokeStyle = "rgba(255,72,72,.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x*CELL+8, y*CELL+8);
          ctx.lineTo(x*CELL+CELL-8, y*CELL+CELL-8);
          ctx.moveTo(x*CELL+CELL-8, y*CELL+8);
          ctx.lineTo(x*CELL+8, y*CELL+CELL-8);
          ctx.stroke();
        }
      }
    }
  }

  function drawPlacementGhost(ctx, x, y, len, horiz){
    if(!placing) return;
    const ok = canPlace(playerBoard, x, y, len, horiz);
    ctx.fillStyle = ok ? "rgba(99,170,255,.25)" : "rgba(255,72,72,.18)";
    for(let i=0;i<len;i++){
      const xx = x + (horiz ? i : 0);
      const yy = y + (horiz ? 0 : i);
      if(inb(xx,yy)){
        ctx.fillRect(xx*CELL+2, yy*CELL+2, CELL-4, CELL-4);
      }
    }
  }

  function render(){
    // player
    clear(pCtx, pCanvas);
    drawGrid(pCtx);
    drawShips(pCtx, playerBoard, enemyShots, true);

    // enemy
    clear(eCtx, eCanvas);
    drawGrid(eCtx);
    // на поле врага НЕ показываем корабли
    drawShips(eCtx, enemyBoard, playerShots, false);

    scoreEl.textContent = String(score);

    if(placing){
      modeEl.textContent = "Расстановка";
      const len = fleet[currentShipIdx];
      hintEl.textContent =
        `Расстановка: ставим корабль ${currentShipIdx+1}/${fleet.length} (длина ${len}). ` +
        `Тапай по СВОЕМУ полю. Потом начнётся атака — стреляй по полю противника.`;
    } else {
      modeEl.textContent = "Атака";
      hintEl.textContent = "Атака: тапай по полю противника, чтобы стрелять. ИИ отвечает ходом.";
    }
  }

  // ====== Игровая логика ======
  function startNew(){
    playerBoard = newGrid(0);
    enemyBoard  = newGrid(0);
    playerShots = newGrid(0);
    enemyShots  = newGrid(0);

    placing = true;
    currentShipIdx = 0;
    horizontal = true;
    rotStateEl.textContent = "Гориз.";
    score = 0;
    aiTargets = [];

    // расставляем врага
    let ok = randomPlaceFleet(enemyBoard);
    if(!ok){
      // на всякий случай
      enemyBoard = newGrid(0);
      randomPlaceFleet(enemyBoard);
    }

    render();
  }

  function finishPlacement(){
    placing = false;
    render();
  }

  function tryPlaceAt(x,y){
    const len = fleet[currentShipIdx];
    if(canPlace(playerBoard, x, y, len, horizontal)){
      placeShip(playerBoard, x, y, len, horizontal);
      currentShipIdx++;
      if(currentShipIdx >= fleet.length){
        finishPlacement();
      }
      render();
      return true;
    }
    return false;
  }

  function isWin(board, shots){
    return countAlive(board, shots) === 0;
  }

  function pushAiNeighbors(x,y){
    const dirs = [
      [1,0],[-1,0],[0,1],[0,-1]
    ];
    for(const [dx,dy] of dirs){
      const nx = x+dx, ny = y+dy;
      if(inb(nx,ny) && enemyShots[ny][nx] === 0){
        aiTargets.push([nx,ny]);
      }
    }
  }

  function aiMove(){
    // выбираем цель: из списка добивания или случайно
    let x, y;

    while(aiTargets.length){
      const [tx,ty] = aiTargets.shift();
      if(enemyShots[ty][tx] === 0){
        x = tx; y = ty;
        break;
      }
    }

    if(x === undefined){
      // случайно
      const free = [];
      for(let yy=0; yy<N; yy++){
        for(let xx=0; xx<N; xx++){
          if(enemyShots[yy][xx] === 0) free.push([xx,yy]);
        }
      }
      if(!free.length) return;
      [x,y] = free[Math.floor(Math.random()*free.length)];
    }

    // ИИ стреляет по игроку: enemyShots хранит "выстрелы врага по игроку"
    if(playerBoard[y][x] === 1){
      enemyShots[y][x] = 2;
      // добивание
      pushAiNeighbors(x,y);
    } else {
      enemyShots[y][x] = 1;
    }
  }

  function playerShoot(x,y){
    if(placing) return;
    if(playerShots[y][x] !== 0) return; // уже стреляли

    if(enemyBoard[y][x] === 1){
      playerShots[y][x] = 2;
      score += 1;
    } else {
      playerShots[y][x] = 1;
    }

    // проверка победы
    if(isWin(enemyBoard, playerShots)){
      render();
      setTimeout(() => alert("Победа! Ты уничтожил все корабли противника."), 50);
      return;
    }

    // ход ИИ
    aiMove();

    // проверка поражения
    if(isWin(playerBoard, enemyShots)){
      render();
      setTimeout(() => alert("Поражение! Противник уничтожил твои корабли."), 50);
      return;
    }

    render();
  }

  // ====== События ======
  rotateBtn.addEventListener("click", () => {
    horizontal = !horizontal;
    rotStateEl.textContent = horizontal ? "Гориз." : "Вертик.";
    render();
  });

  restartBtn.addEventListener("click", startNew);

  // расстановка: тапы по своему полю
  pCanvas.addEventListener("pointerdown", (ev) => {
    if(!placing) return;
    const {cx, cy} = cellFromEvent(pCanvas, ev);
    tryPlaceAt(cx, cy);
  });

  // подсветка "призрака" корабля при наведении (на телефоне редко, но пусть будет)
  pCanvas.addEventListener("pointermove", (ev) => {
    if(!placing) return;
    render();
    const {cx, cy} = cellFromEvent(pCanvas, ev);
    const len = fleet[currentShipIdx];
    drawPlacementGhost(pCtx, cx, cy, len, horizontal);
  });

  pCanvas.addEventListener("pointerleave", () => {
    if(!placing) return;
    render();
  });

  // атака: тапы по полю врага
  eCanvas.addEventListener("pointerdown", (ev) => {
    if(placing) return;
    const {cx, cy} = cellFromEvent(eCanvas, ev);
    playerShoot(cx, cy);
  });

  // ====== Старт ======
  startNew();
})();
