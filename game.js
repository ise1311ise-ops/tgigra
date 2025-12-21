/* Морской бой “тетрадь + синяя ручка” */
/* 10x10, корабли: 4,3,3,2,2,2,1,1,1,1 (классика) */

const GRID = 10;
const LETTERS = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];
const FLEET = [4,3,3,2,2,2,1,1,1,1];

const CELL_STATE = {
  EMPTY: 0,
  SHIP: 1,     // только для своего поля / скрыто для врага
  MISS: 2,
  HIT: 3
};

const MODE = {
  PLACE: "Расстановка",
  BATTLE: "Бой",
  END: "Конец"
};

const myCanvas = document.getElementById("my");
const enCanvas = document.getElementById("enemy");
const myCtx = myCanvas.getContext("2d");
const enCtx = enCanvas.getContext("2d");

const modeEl = document.getElementById("mode");
const turnEl = document.getElementById("turn");
const rotateBtn = document.getElementById("rotateBtn");
const restartBtn = document.getElementById("restartBtn");
const shipsLeftEl = document.getElementById("shipsLeft");
const tipLine = document.getElementById("tipLine");
const subLine = document.getElementById("subLine");
const hintMy = document.getElementById("hintMy");
const hintEnemy = document.getElementById("hintEnemy");

let gameMode = MODE.PLACE;
let horizontal = true; // ориентация для постановки
let currentShipIdx = 0;

let myBoard = makeBoard();
let enBoardHidden = makeBoard(); // реальные корабли врага (скрыто)
let enShots = makeBoard();       // что игрок уже открыл на поле врага (MISS/HIT)

let myShotsByAI = makeBoard();   // что ИИ уже сделал по моему полю (MISS/HIT)
let aiTargets = [];              // очередь “добивания”
let playerTurn = true;

const anim = {
  pulses: [] // {x,y,t,type:'miss'|'hit'}
};

function makeBoard(){
  const b = [];
  for(let r=0;r<GRID;r++){
    b.push(new Array(GRID).fill(CELL_STATE.EMPTY));
  }
  return b;
}

/* ---------- Геометрия доски на canvas ---------- */
function boardGeom(canvas){
  const w = canvas.width;
  const h = canvas.height;

  const pad = Math.round(w * 0.12); // место под координаты
  const gridSize = Math.min(w, h) - pad - Math.round(w * 0.06);
  const cell = gridSize / GRID;

  const ox = pad;
  const oy = pad;

  return {ox, oy, cell, gridSize, pad};
}

function cellFromEvent(canvas, evt){
  const rect = canvas.getBoundingClientRect();
  const x = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
  const y = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;

  // canvas “CSS size” может отличаться от внутреннего
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  const cx = x * sx;
  const cy = y * sy;

  const {ox, oy, cell} = boardGeom(canvas);
  const col = Math.floor((cx - ox) / cell);
  const row = Math.floor((cy - oy) / cell);

  if(row < 0 || row >= GRID || col < 0 || col >= GRID) return null;
  return {row, col};
}

/* ---------- Рисование “тетрадного” фона ---------- */
function drawPaper(ctx, canvas){
  ctx.fillStyle = "rgba(247,251,255,1)";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  const step = 34 * (canvas.width / 420);
  ctx.strokeStyle = "rgba(36,50,184,0.12)";
  ctx.lineWidth = 1;

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

  ctx.fillStyle = "rgba(36,50,184,0.03)";
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawCoords(ctx, ox, oy, cell){
  ctx.save();
  ctx.fillStyle = "rgba(36,50,184,0.95)";
  ctx.font = `${Math.max(14, cell * 0.42)}px "Patrick Hand", sans-serif`;

  for (let c = 0; c < 10; c++) {
    const x = ox + c * cell + cell * 0.35;
    const y = oy - cell * 0.25;
    ctx.fillText(String(c + 1), x, y);
  }
  for (let r = 0; r < 10; r++) {
    const x = ox - cell * 0.55;
    const y = oy + r * cell + cell * 0.65;
    ctx.fillText(LETTERS[r], x, y);
  }
  ctx.restore();
}

function drawGrid(ctx, ox, oy, cell, gridSize){
  ctx.save();
  ctx.strokeStyle = "rgba(36,50,184,0.55)";
  ctx.lineWidth = Math.max(1, cell * 0.04);

  // рамка
  ctx.beginPath();
  ctx.rect(ox, oy, gridSize, gridSize);
  ctx.stroke();

  // линии
  ctx.strokeStyle = "rgba(36,50,184,0.28)";
  ctx.lineWidth = Math.max(1, cell * 0.02);

  for(let i=1;i<GRID;i++){
    const x = ox + i*cell;
    const y = oy + i*cell;

    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + gridSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + gridSize, y);
    ctx.stroke();
  }

  ctx.restore();
}

/* ---------- “Нарисованные корабли” (как на скрине) ---------- */
function drawShipDoodle(ctx, x, y, w, h, horiz, seed=0){
  // рисуем контур + пару деталей: “рубка”, “пушки”
  ctx.save();

  // лёгкая “дрожь” линии
  function jitter(v){ return v + (Math.sin(v*0.08 + seed)*0.9); }

  const r = Math.min(w,h) * 0.22;

  // корпус
  ctx.lineWidth = Math.max(2, Math.min(w,h)*0.08);
  ctx.strokeStyle = "rgba(36,50,184,0.92)";
  ctx.fillStyle = "rgba(255,255,255,0.55)";

  const bodyX = x + (horiz ? 0 : 0);
  const bodyY = y + (horiz ? 0 : 0);

  // закруглённый прямоугольник
  roundRect(ctx,
    jitter(bodyX + w*0.06),
    jitter(bodyY + h*0.10),
    w*0.88,
    h*0.80,
    r
  );
  ctx.fill();
  ctx.stroke();

  // нос (треугольник/скос)
  ctx.beginPath();
  if(horiz){
    ctx.moveTo(x + w*0.92, y + h*0.50);
    ctx.lineTo(x + w*0.80, y + h*0.18);
    ctx.lineTo(x + w*0.80, y + h*0.82);
  }else{
    ctx.moveTo(x + w*0.50, y + h*0.08);
    ctx.lineTo(x + w*0.18, y + h*0.20);
    ctx.lineTo(x + w*0.82, y + h*0.20);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // рубка
  ctx.lineWidth = Math.max(2, Math.min(w,h)*0.07);
  ctx.beginPath();
  if(horiz){
    roundRect(ctx, x + w*0.35, y + h*0.28, w*0.18, h*0.20, r*0.7);
  }else{
    roundRect(ctx, x + w*0.28, y + h*0.35, w*0.20, h*0.18, r*0.7);
  }
  ctx.stroke();

  // “иллюминаторы”
  ctx.lineWidth = Math.max(1.5, Math.min(w,h)*0.05);
  for(let i=0;i<3;i++){
    const px = horiz ? (x + w*(0.18 + i*0.15)) : (x + w*0.50);
    const py = horiz ? (y + h*0.62) : (y + h*(0.18 + i*0.15));
    ctx.beginPath();
    ctx.arc(px, py, Math.min(w,h)*0.05, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

/* ---------- Рисование меток попадания/промаха ---------- */
function drawMiss(ctx, cx, cy, s, t=1){
  ctx.save();
  ctx.globalAlpha = t;
  ctx.strokeStyle = "rgba(36,50,184,0.65)";
  ctx.lineWidth = Math.max(2, s*0.12);
  ctx.beginPath();
  ctx.arc(cx, cy, s*0.18, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

function drawHit(ctx, cx, cy, s, t=1){
  ctx.save();
  ctx.globalAlpha = t;
  ctx.strokeStyle = "rgba(36,50,184,0.95)";
  ctx.lineWidth = Math.max(2, s*0.14);
  ctx.beginPath();
  ctx.moveTo(cx - s*0.18, cy - s*0.18);
  ctx.lineTo(cx + s*0.18, cy + s*0.18);
  ctx.moveTo(cx + s*0.18, cy - s*0.18);
  ctx.lineTo(cx - s*0.18, cy + s*0.18);
  ctx.stroke();
  ctx.restore();
}

/* ---------- Основной рендер ---------- */
function drawBoard(ctx, canvas, board, opts){
  const {ox, oy, cell, gridSize} = boardGeom(canvas);

  drawPaper(ctx, canvas);
  drawCoords(ctx, ox, oy, cell);
  drawGrid(ctx, ox, oy, cell, gridSize);

  // корабли (если показывать)
  if(opts.showShips){
    drawShipsFromBoard(ctx, ox, oy, cell, board);
  }

  // клетки с промах/попадание
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      const v = board[r][c];
      const cx = ox + c*cell + cell/2;
      const cy = oy + r*cell + cell/2;

      if(v === CELL_STATE.MISS){
        drawMiss(ctx, cx, cy, cell, 1);
      }else if(v === CELL_STATE.HIT){
        drawHit(ctx, cx, cy, cell, 1);
      }
    }
  }

  // подсветка куда ставим сейчас корабль
  if(gameMode === MODE.PLACE && opts.isMy){
    const len = FLEET[currentShipIdx];
    if(len){
      // просто подсказка текстом; прям подсветку клеток можно добавить позже
    }
  }

  // анимации (пульс)
  drawPulses(ctx, ox, oy, cell, opts.pulseLayer);
}

function drawPulses(ctx, ox, oy, cell, layer){
  // layer: 'enemy'|'my' - чтобы не рисовать не на том поле
  const now = performance.now();
  for(const p of anim.pulses){
    if(p.layer !== layer) continue;
    const dt = (now - p.t) / 420;
    if(dt < 0 || dt > 1) continue;

    const r = p.row, c = p.col;
    const cx = ox + c*cell + cell/2;
    const cy = oy + r*cell + cell/2;

    const k = 1 - dt;
    ctx.save();
    ctx.globalAlpha = 0.55 * k;
    ctx.strokeStyle = "rgba(36,50,184,0.9)";
    ctx.lineWidth = Math.max(2, cell*0.06);
    ctx.beginPath();
    ctx.arc(cx, cy, cell*(0.15 + 0.45*(1-k)), 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  // чистим старые
  anim.pulses = anim.pulses.filter(p => (now - p.t) < 900);
}

/* ---------- Отрисовка кораблей по “группам” ---------- */
function drawShipsFromBoard(ctx, ox, oy, cell, board){
  // найдём все корабли как связные компоненты 4-соседями
  const seen = Array.from({length:GRID}, () => Array(GRID).fill(false));
  let seed = 0;

  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      if(seen[r][c]) continue;
      if(board[r][c] !== CELL_STATE.SHIP) continue;

      // BFS
      const q = [{r,c}];
      seen[r][c] = true;
      const cells = [];
      while(q.length){
        const cur = q.pop();
        cells.push(cur);

        const nb = [
          {r:cur.r-1,c:cur.c},
          {r:cur.r+1,c:cur.c},
          {r:cur.r,c:cur.c-1},
          {r:cur.r,c:cur.c+1},
        ];
        for(const n of nb){
          if(n.r<0||n.r>=GRID||n.c<0||n.c>=GRID) continue;
          if(seen[n.r][n.c]) continue;
          if(board[n.r][n.c] !== CELL_STATE.SHIP) continue;
          seen[n.r][n.c]=true;
          q.push(n);
        }
      }

      // bounding box
      let minR=99,maxR=-1,minC=99,maxC=-1;
      for(const cc of cells){
        minR = Math.min(minR, cc.r);
        maxR = Math.max(maxR, cc.r);
        minC = Math.min(minC, cc.c);
        maxC = Math.max(maxC, cc.c);
      }

      const wCells = maxC - minC + 1;
      const hCells = maxR - minR + 1;
      const x = ox + minC*cell;
      const y = oy + minR*cell;
      const w = wCells*cell;
      const h = hCells*cell;

      // чуть уменьшим внутрь клетки чтобы было “красивее”
      const inset = cell*0.08;
      drawShipDoodle(ctx, x+inset, y+inset, w-inset*2, h-inset*2, wCells>=hCells, seed++);
    }
  }
}

/* ---------- Правила расстановки ---------- */
function canPlace(board, row, col, len, horiz){
  const dr = horiz ? 0 : 1;
  const dc = horiz ? 1 : 0;

  const endR = row + dr*(len-1);
  const endC = col + dc*(len-1);
  if(endR<0||endR>=GRID||endC<0||endC>=GRID) return false;

  for(let i=0;i<len;i++){
    const r = row + dr*i;
    const c = col + dc*i;

    if(board[r][c] !== CELL_STATE.EMPTY) return false;

    // проверка вокруг (корабли не касаются)
    for(let rr=r-1; rr<=r+1; rr++){
      for(let cc=c-1; cc<=c+1; cc++){
        if(rr<0||rr>=GRID||cc<0||cc>=GRID) continue;
        if(board[rr][cc] === CELL_STATE.SHIP) return false;
      }
    }
  }
  return true;
}

function placeShip(board, row, col, len, horiz){
  const dr = horiz ? 0 : 1;
  const dc = horiz ? 1 : 0;
  for(let i=0;i<len;i++){
    board[row + dr*i][col + dc*i] = CELL_STATE.SHIP;
  }
}

/* ---------- Авто-расстановка врага ---------- */
function autoPlaceFleet(board){
  for(const len of FLEET){
    let placed = false;
    for(let tries=0; tries<2000 && !placed; tries++){
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random()*GRID);
      const c = Math.floor(Math.random()*GRID);
      if(canPlace(board, r, c, len, horiz)){
        placeShip(board, r, c, len, horiz);
        placed = true;
      }
    }
    if(!placed){
      // если вдруг не получилось (редко) — начнём заново
      return false;
    }
  }
  return true;
}

/* ---------- Бой: выстрелы ---------- */
function shootEnemy(row, col){
  if(enShots[row][col] === CELL_STATE.MISS || enShots[row][col] === CELL_STATE.HIT) return;

  const isHit = enBoardHidden[row][col] === CELL_STATE.SHIP;
  enShots[row][col] = isHit ? CELL_STATE.HIT : CELL_STATE.MISS;

  anim.pulses.push({row, col, t: performance.now(), layer:"enemy"});

  if(isHit){
    if(checkAllSunk(enBoardHidden, enShots)){
      endGame(true);
      return;
    }
    // попадание — игрок ходит ещё
    playerTurn = true;
    updateUI();
  }else{
    // промах — ход ИИ
    playerTurn = false;
    updateUI();
    setTimeout(aiMove, 420);
  }
}

function shootMeByAI(row, col){
  if(myShotsByAI[row][col] === CELL_STATE.MISS || myShotsByAI[row][col] === CELL_STATE.HIT) return;

  const isHit = myBoard[row][col] === CELL_STATE.SHIP;
  myShotsByAI[row][col] = isHit ? CELL_STATE.HIT : CELL_STATE.MISS;
  if(isHit) myBoard[row][col] = CELL_STATE.HIT;
  else if(myBoard[row][col] === CELL_STATE.EMPTY) myBoard[row][col] = CELL_STATE.MISS;

  anim.pulses.push({row, col, t: performance.now(), layer:"my"});

  if(isHit){
    // добавить соседей в цели
    const nb = [
      {r:row-1,c:col},{r:row+1,c:col},{r:row,c:col-1},{r:row,c:col+1}
    ];
    for(const n of nb){
      if(n.r<0||n.r>=GRID||n.c<0||n.c>=GRID) continue;
      if(myShotsByAI[n.r][n.c] !== CELL_STATE.EMPTY) continue;
      aiTargets.push(n);
    }
    if(checkAllSunkForAI(myBoard)){
      endGame(false);
      return;
    }
    // ИИ попал — ходит ещё
    setTimeout(aiMove, 420);
  }else{
    // промах — ход игрока
    playerTurn = true;
    updateUI();
  }
}

/* ---------- ИИ: простой, но норм ---------- */
function aiMove(){
  if(gameMode !== MODE.BATTLE) return;

  let pick = null;

  // если есть цели — добиваем
  while(aiTargets.length){
    const t = aiTargets.shift();
    if(myShotsByAI[t.r][t.c] === CELL_STATE.EMPTY){
      pick = t;
      break;
    }
  }

  // иначе — шахматка
  if(!pick){
    const candidates = [];
    for(let r=0;r<GRID;r++){
      for(let c=0;c<GRID;c++){
        if(myShotsByAI[r][c] !== CELL_STATE.EMPTY) continue;
        if((r+c)%2===0) candidates.push({r,c});
      }
    }
    const pool = candidates.length ? candidates : allEmptyCells(myShotsByAI);
    pick = pool[Math.floor(Math.random()*pool.length)];
  }

  shootMeByAI(pick.r, pick.c);
}

function allEmptyCells(board){
  const a = [];
  for(let r=0;r<GRID;r++) for(let c=0;c<GRID;c++)
    if(board[r][c] === CELL_STATE.EMPTY) a.push({r,c});
  return a;
}

/* ---------- Проверка победы ---------- */
function checkAllSunk(hidden, shots){
  // все клетки SHIP на hidden должны стать HIT на shots
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      if(hidden[r][c] === CELL_STATE.SHIP && shots[r][c] !== CELL_STATE.HIT) return false;
    }
  }
  return true;
}

function checkAllSunkForAI(myBoardNow){
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      if(myBoardNow[r][c] === CELL_STATE.SHIP) return false;
    }
  }
  return true;
}

/* ---------- UI ---------- */
function updateUI(){
  modeEl.textContent = gameMode;
  turnEl.textContent = (gameMode === MODE.BATTLE) ? (playerTurn ? "Игрок" : "Компьютер") : "Игрок";

  rotateBtn.textContent = `Повернуть: ${horizontal ? "Гориз." : "Вертик."}`;

  if(gameMode === MODE.PLACE){
    hintMy.textContent = "Ставь корабли сюда";
    hintEnemy.textContent = "Пока нельзя стрелять";
    subLine.textContent = "Расстановка: тапай по своему полю, чтобы ставить корабли.";
    tipLine.textContent = "Когда расставишь все корабли — начнётся бой. На поле противника будут появляться промахи (○) и попадания (✕).";
  }else if(gameMode === MODE.BATTLE){
    hintMy.textContent = "Твои корабли (попадания по тебе отмечены)";
    hintEnemy.textContent = playerTurn ? "Стреляй сюда" : "Ход противника…";
    subLine.textContent = "Бой: стреляй по полю противника. Попал — ходишь ещё.";
    tipLine.textContent = "Совет: пытайся добивать корабль рядом, если попал.";
  }else{
    hintMy.textContent = "Игра завершена";
    hintEnemy.textContent = "Игра завершена";
    subLine.textContent = "Нажми «Заново», чтобы сыграть ещё раз.";
    tipLine.textContent = "";
  }

  // корабли осталось поставить
  if(gameMode === MODE.PLACE){
    const left = FLEET.slice(currentShipIdx);
    shipsLeftEl.textContent = `Осталось поставить: ${left.map(n => "■".repeat(n)).join("  ")}`;
  }else{
    shipsLeftEl.textContent = "";
  }

  render();
}

function render(){
  // моё поле: показываем корабли
  drawBoard(myCtx, myCanvas, myBoard, {showShips:true, isMy:true, pulseLayer:"my"});

  // поле врага: показываем только выстрелы
  drawBoard(enCtx, enCanvas, enShots, {showShips:false, isMy:false, pulseLayer:"enemy"});
}

/* ---------- Управление ---------- */
function onMyTap(evt){
  evt.preventDefault();
  if(gameMode !== MODE.PLACE) return;

  const p = cellFromEvent(myCanvas, evt);
  if(!p) return;

  const len = FLEET[currentShipIdx];
  if(!len) return;

  if(canPlace(myBoard, p.row, p.col, len, horizontal)){
    placeShip(myBoard, p.row, p.col, len, horizontal);
    currentShipIdx++;

    if(currentShipIdx >= FLEET.length){
      // начинаем бой: расставляем врага
      enBoardHidden = makeBoard();
      while(!autoPlaceFleet(enBoardHidden)){
        enBoardHidden = makeBoard();
      }
      gameMode = MODE.BATTLE;
      playerTurn = true;
    }
    updateUI();
  }else{
    // маленький “пульс” чтобы было понятно что нельзя
    anim.pulses.push({row:p.row, col:p.col, t: performance.now(), layer:"my"});
    render();
  }
}

function onEnemyTap(evt){
  evt.preventDefault();
  if(gameMode !== MODE.BATTLE) return;
  if(!playerTurn) return;

  const p = cellFromEvent(enCanvas, evt);
  if(!p) return;

  shootEnemy(p.row, p.col);
  render();
}

function endGame(playerWon){
  gameMode = MODE.END;
  playerTurn = false;

  if(playerWon){
    subLine.textContent = "Ты победил! 🎉";
  }else{
    subLine.textContent = "Ты проиграл. 😅";
  }
  updateUI();
}

/* ---------- Кнопки ---------- */
rotateBtn.addEventListener("click", () => {
  horizontal = !horizontal;
  updateUI();
});

restartBtn.addEventListener("click", () => {
  gameMode = MODE.PLACE;
  horizontal = true;
  currentShipIdx = 0;

  myBoard = makeBoard();
  enBoardHidden = makeBoard();
  enShots = makeBoard();
  myShotsByAI = makeBoard();
  aiTargets = [];
  playerTurn = true;

  updateUI();
});

/* touch + mouse */
myCanvas.addEventListener("click", onMyTap);
myCanvas.addEventListener("touchstart", onMyTap, {passive:false});

enCanvas.addEventListener("click", onEnemyTap);
enCanvas.addEventListener("touchstart", onEnemyTap, {passive:false});

/* ---------- цикл анимации ---------- */
function tick(){
  // просто перерисовываем пока есть пульсы
  if(anim.pulses.length){
    render();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* старт */
updateUI();
