// Морской бой: 2 поля, расстановка + бой, красивые корабли + анимации

const GRID = 10;
const SHIPS = [4,3,3,2,2,2,1,1,1,1];

const meCanvas = document.getElementById("me");
const enemyCanvas = document.getElementById("enemy");
const meCtx = meCanvas.getContext("2d");
const enCtx = enemyCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const modeEl  = document.getElementById("mode");
const hintEl  = document.getElementById("hint");
const rotBtn  = document.getElementById("rotate");
const rotLabel= document.getElementById("rotLabel");
const restartBtn = document.getElementById("restart");

// ======= FX / Helpers =======
const FX = { t0: performance.now(), particles: [] };
function timeS(){ return (performance.now() - FX.t0)/1000; }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }

function roundRectPath(ctx, x, y, w, h, r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function shipHullPath(ctx, x, y, w, h, dir){
  const r = Math.min(w,h)*0.36;
  if (dir === 0){
    roundRectPath(ctx, x, y, w, h, r);
    ctx.moveTo(x+w, y+h*0.5);
    ctx.lineTo(x+w + h*0.60, y+h*0.20);
    ctx.lineTo(x+w + h*0.60, y+h*0.80);
    ctx.closePath();
  } else {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.moveTo(x+w*0.5, y+h);
    ctx.lineTo(x+w*0.20, y+h + w*0.60);
    ctx.lineTo(x+w*0.80, y+h + w*0.60);
    ctx.closePath();
  }
}

function spawnMiss(x,y){
  for (let i=0;i<18;i++){
    const a = Math.random()*Math.PI*2;
    const s = lerp(70, 240, Math.random());
    FX.particles.push({x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s - 70, t:0, life:0.55, kind:"water"});
  }
}
function spawnHit(x,y){
  for (let i=0;i<28;i++){
    const a = Math.random()*Math.PI*2;
    const s = lerp(90, 360, Math.random());
    FX.particles.push({x,y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, t:0, life:0.65, kind:(Math.random()<0.6?"spark":"smoke")});
  }
}
function updateAndDrawParticles(ctx, dt){
  for (let i=FX.particles.length-1;i>=0;i--){
    const p = FX.particles[i];
    p.t += dt;
    const k = p.t / p.life;
    if (k>=1){ FX.particles.splice(i,1); continue; }

    p.vy += (p.kind==="water" ? 420 : 170) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const a = 1-k;
    ctx.save();
    ctx.globalAlpha = a;

    if (p.kind==="water"){
      ctx.fillStyle = "rgba(170,230,255,0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, lerp(3.8, 1.2, k), 0, Math.PI*2);
      ctx.fill();
    } else if (p.kind==="spark"){
      ctx.strokeStyle = "rgba(255,210,100,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx*0.02, p.y - p.vy*0.02);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(255,90,120,0.35)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, lerp(6, 16, k), 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ======= Game State =======
let orientation = 0; // 0 horiz, 1 vert
let mode = "place"; // place | battle | end
let score = 0;

let meBoard, enBoard;
let meShips, enShips;

let placingIndex = 0;
let aiTargets = []; // клетки для добивания
let aiTried = new Set();

function newBoard(){
  // 0 пусто, 1 корабль, 2 промах, 3 попадание
  const b = [];
  for (let y=0;y<GRID;y++){
    const row = [];
    for (let x=0;x<GRID;x++) row.push(0);
    b.push(row);
  }
  return b;
}

function shipCells(x,y,len,dir){
  const cells = [];
  for (let i=0;i<len;i++){
    cells.push({x: x + (dir===0?i:0), y: y + (dir===1?i:0)});
  }
  return cells;
}

function inBounds(x,y){ return x>=0 && y>=0 && x<GRID && y<GRID; }

function canPlace(board, x,y,len,dir){
  const cells = shipCells(x,y,len,dir);
  for (const c of cells){
    if (!inBounds(c.x,c.y)) return false;

    // нельзя ставить рядом даже по диагонали
    for (let dy=-1; dy<=1; dy++){
      for (let dx=-1; dx<=1; dx++){
        const nx = c.x + dx, ny = c.y + dy;
        if (inBounds(nx,ny) && board[ny][nx] === 1) return false;
      }
    }
  }
  return true;
}

function placeShip(board, ships, x,y,len,dir){
  const cells = shipCells(x,y,len,dir);
  for (const c of cells) board[c.y][c.x] = 1;

  ships.push({
    x,y,len,dir,
    cells,
    hits: new Set()
  });
}

function allSunk(ships){
  return ships.every(s => s.hits.size >= s.len);
}

function randomPlaceAll(board, ships){
  for (const len of SHIPS){
    let placed = false;
    for (let tries=0; tries<5000 && !placed; tries++){
      const dir = Math.random()<0.5 ? 0 : 1;
      const x = Math.floor(Math.random()*GRID);
      const y = Math.floor(Math.random()*GRID);
      if (canPlace(board,x,y,len,dir)){
        placeShip(board, ships, x,y,len,dir);
        placed = true;
      }
    }
    if (!placed) throw new Error("Не удалось расставить корабли");
  }
}

function shipAt(ships, x,y){
  for (const s of ships){
    for (let i=0;i<s.cells.length;i++){
      const c = s.cells[i];
      if (c.x===x && c.y===y) return {ship:s, index:i};
    }
  }
  return null;
}

// ======= Layout / sizes =======
function fitCanvas(canvas){
  // подгоняем внутренний размер под реальный CSS размер
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  canvas.width  = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.width * dpr); // квадрат
}

function cellSize(canvas){
  return canvas.width / GRID;
}

// ======= Drawing =======
function drawOcean(ctx, canvas){
  const t = timeS();
  const w = canvas.width, h = canvas.height;

  // лёгкая "волна" как шум полосами
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i=0;i<18;i++){
    const y = (i/18)*h;
    const amp = 6 + i*0.15;
    ctx.beginPath();
    for (let x=0;x<=w;x+=20){
      const yy = y + Math.sin(x*0.02 + t*1.8 + i)*amp;
      if (x===0) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
    }
    ctx.strokeStyle = "rgba(120,200,255,0.20)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawGrid(ctx, canvas){
  const cs = cellSize(canvas);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = Math.max(1, cs*0.03);

  for (let i=0;i<=GRID;i++){
    const x = i*cs;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    const y = i*cs;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
  }
  ctx.restore();
}

function drawMarkers(ctx, canvas, board){
  const cs = cellSize(canvas);
  for (let y=0;y<GRID;y++){
    for (let x=0;x<GRID;x++){
      const v = board[y][x];
      const cx = (x+0.5)*cs;
      const cy = (y+0.5)*cs;

      if (v===2){
        // промах
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "rgba(170,230,255,0.75)";
        ctx.beginPath();
        ctx.arc(cx, cy, cs*0.10, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }

      if (v===3){
        // попадание
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = "rgba(255,90,120,0.95)";
        ctx.lineWidth = Math.max(2, cs*0.08);
        ctx.beginPath();
        ctx.moveTo(cx - cs*0.18, cy - cs*0.18);
        ctx.lineTo(cx + cs*0.18, cy + cs*0.18);
        ctx.moveTo(cx + cs*0.18, cy - cs*0.18);
        ctx.lineTo(cx - cs*0.18, cy + cs*0.18);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

function drawShipFancy(ctx, canvas, ship, reveal=true){
  if (!reveal) return;

  const cs = cellSize(canvas);
  const pad = cs*0.10;

  const bx = ship.x*cs + pad;
  const by = ship.y*cs + pad;
  const w = ship.dir===0 ? ship.len*cs - pad*2 : cs - pad*2;
  const h = ship.dir===1 ? ship.len*cs - pad*2 : cs - pad*2;

  const t = timeS();
  const bob = Math.sin(t*2.1 + ship.x*0.7 + ship.y*0.9) * (cs*0.02);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = cs*0.40;
  ctx.shadowOffsetY = cs*0.10;

  const grad = ctx.createLinearGradient(bx, by, bx + (ship.dir===0?w:h), by + (ship.dir===0?h:w));
  grad.addColorStop(0, "rgba(120,190,255,0.65)");
  grad.addColorStop(0.5, "rgba(130,150,255,0.33)");
  grad.addColorStop(1, "rgba(20,35,80,0.55)");

  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(240,245,255,0.22)";
  ctx.lineWidth = Math.max(1, cs*0.05);

  shipHullPath(ctx, bx, by + bob, w, h, ship.dir);
  ctx.fill();
  ctx.stroke();

  // блик
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.55;
  const shine = ctx.createLinearGradient(bx, by, bx, by + (ship.dir===0?h:w));
  shine.addColorStop(0, "rgba(255,255,255,0.28)");
  shine.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = shine;
  shipHullPath(ctx, bx + cs*0.08, by + bob + cs*0.08, w - cs*0.16, h*0.55, ship.dir);
  ctx.fill();

  // линии палубы
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = Math.max(1, cs*0.03);
  ctx.beginPath();
  if (ship.dir===0){
    const y1 = by + bob + h*0.38;
    const y2 = by + bob + h*0.62;
    ctx.moveTo(bx + w*0.10, y1); ctx.lineTo(bx + w*0.90, y1);
    ctx.moveTo(bx + w*0.10, y2); ctx.lineTo(bx + w*0.90, y2);
  } else {
    const x1 = bx + w*0.38;
    const x2 = bx + w*0.62;
    ctx.moveTo(x1, by + bob + h*0.10); ctx.lineTo(x1, by + bob + h*0.90);
    ctx.moveTo(x2, by + bob + h*0.10); ctx.lineTo(x2, by + bob + h*0.90);
  }
  ctx.stroke();

  // иллюминаторы
  ctx.fillStyle = "rgba(240,245,255,0.20)";
  const ports = Math.max(2, ship.len*2);
  for (let i=0;i<ports;i++){
    const p = (i+1)/(ports+1);
    let cx, cy;
    if (ship.dir===0){
      cx = bx + w*p;
      cy = by + bob + h*0.75;
    } else {
      cx = bx + w*0.75;
      cy = by + bob + h*p;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, cs*0.06, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPlacementGhost(ctx, canvas, x,y,len,dir, ok){
  const cs = cellSize(canvas);
  const pad = cs*0.12;
  const bx = x*cs + pad;
  const by = y*cs + pad;
  const w = dir===0 ? len*cs - pad*2 : cs - pad*2;
  const h = dir===1 ? len*cs - pad*2 : cs - pad*2;

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = ok ? "rgba(120,255,190,0.85)" : "rgba(255,110,140,0.85)";
  ctx.lineWidth = Math.max(2, cs*0.06);
  shipHullPath(ctx, bx, by, w, h, dir);
  ctx.stroke();
  ctx.restore();
}

function renderBoard(ctx, canvas, board, ships, showShips){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawOcean(ctx, canvas);
  drawGrid(ctx, canvas);

  // корабли (красиво)
  if (showShips){
    for (const s of ships) drawShipFancy(ctx, canvas, s, true);
  }

  // метки попаданий/промахов
  drawMarkers(ctx, canvas, board);
}

function setMode(m){
  mode = m;
  if (mode==="place"){
    modeEl.textContent = "Расстановка";
    hintEl.textContent =
      "Расстановка: тапай по своему полю, чтобы поставить корабли. Кнопка «Повернуть» меняет ориентацию. " +
      "Когда все корабли поставлены — начнётся бой: стреляй по полю противника.";
  } else if (mode==="battle"){
    modeEl.textContent = "Бой";
    hintEl.textContent =
      "Бой: стреляй по полю противника. Красный крестик — попадание, точка — промах. " +
      "Если попал — можешь стрелять ещё раз.";
  } else {
    modeEl.textContent = "Конец";
  }
}

// ======= Input =======
let hoverCellMe = null;

function canvasToCell(canvas, ev){
  const rect = canvas.getBoundingClientRect();
  const dpr = (canvas.width / rect.width);
  const x = (ev.clientX - rect.left) * dpr;
  const y = (ev.clientY - rect.top) * dpr;
  const cs = cellSize(canvas);
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);
  return {cx, cy, px:x, py:y};
}

meCanvas.addEventListener("pointermove", (ev)=>{
  if (mode!=="place") return;
  const {cx,cy} = canvasToCell(meCanvas, ev);
  if (inBounds(cx,cy)) hoverCellMe = {cx,cy}; else hoverCellMe=null;
});

meCanvas.addEventListener("pointerdown", (ev)=>{
  if (mode!=="place") return;
  const {cx,cy} = canvasToCell(meCanvas, ev);
  if (!inBounds(cx,cy)) return;

  const len = SHIPS[placingIndex];
  if (canPlace(meBoard, cx,cy,len,orientation)){
    placeShip(meBoard, meShips, cx,cy,len,orientation);
    placingIndex++;

    if (placingIndex >= SHIPS.length){
      setMode("battle");
    }
  }
});

enemyCanvas.addEventListener("pointerdown", (ev)=>{
  if (mode!=="battle") return;
  const {cx,cy,px,py} = canvasToCell(enemyCanvas, ev);
  if (!inBounds(cx,cy)) return;

  const v = enBoard[cy][cx];
  if (v===2 || v===3) return; // уже стреляли

  // выстрел игрока
  const hit = (enBoard[cy][cx] === 1);
  if (hit){
    enBoard[cy][cx] = 3;
    score++;
    scoreEl.textContent = String(score);
    spawnHit(px, py);

    const info = shipAt(enShips, cx,cy);
    if (info) info.ship.hits.add(info.index);

    if (allSunk(enShips)){
      setMode("end");
      hintEl.textContent = "Победа! Все корабли противника уничтожены. Нажми «Заново» 🙂";
      return;
    }

    // попал — стреляет снова (ничего не делаем)
  } else {
    enBoard[cy][cx] = 2;
    spawnMiss(px, py);
    // промах — ход ИИ
    aiTurn();
  }
});

// ======= AI =======
function key(x,y){ return `${x},${y}`; }

function aiPick(){
  // если есть цели — добиваем
  while (aiTargets.length){
    const {x,y} = aiTargets.shift();
    if (!inBounds(x,y)) continue;
    if (aiTried.has(key(x,y))) continue;
    return {x,y};
  }

  // иначе случайно
  for (let tries=0; tries<5000; tries++){
    const x = Math.floor(Math.random()*GRID);
    const y = Math.floor(Math.random()*GRID);
    if (!aiTried.has(key(x,y))) return {x,y};
  }
  return null;
}

function aiTurn(){
  const pick = aiPick();
  if (!pick) return;

  const {x,y} = pick;
  aiTried.add(key(x,y));

  const cs = cellSize(meCanvas);
  const px = (x+0.5)*cs;
  const py = (y+0.5)*cs;

  const hit = (meBoard[y][x] === 1);
  if (hit){
    meBoard[y][x] = 3;
    spawnHit(px, py);

    const info = shipAt(meShips, x,y);
    if (info) info.ship.hits.add(info.index);

    // добавляем соседей как цели
    aiTargets.push({x:x+1,y},{x:x-1,y},{x,y:y+1},{x,y:y-1});

    if (allSunk(meShips)){
      setMode("end");
      hintEl.textContent = "Поражение… Противник уничтожил все твои корабли. Нажми «Заново» 😅";
      return;
    }

    // ИИ попал — пусть стреляет ещё раз (как у игрока)
    aiTurn();
  } else {
    meBoard[y][x] = 2;
    spawnMiss(px, py);
  }
}

// ======= UI Buttons =======
rotBtn.addEventListener("click", ()=>{
  orientation = orientation===0 ? 1 : 0;
  rotLabel.textContent = orientation===0 ? "Гориз." : "Вертик.";
});

restartBtn.addEventListener("click", ()=>{
  resetGame();
});

// ======= Game init / loop =======
function resetGame(){
  score = 0;
  scoreEl.textContent = "0";
  placingIndex = 0;
  hoverCellMe = null;
  aiTargets = [];
  aiTried = new Set();
  FX.particles = [];

  meBoard = newBoard();
  enBoard = newBoard();
  meShips = [];
  enShips = [];

  // расставляем врага
  randomPlaceAll(enBoard, enShips);

  setMode("place");
}

function resizeAll(){
  fitCanvas(meCanvas);
  fitCanvas(enemyCanvas);
}

window.addEventListener("resize", ()=>{
  resizeAll();
});

let lastT = performance.now();
function loop(){
  const t = performance.now();
  const dt = (t - lastT)/1000;
  lastT = t;

  // рендер полей
  renderBoard(meCtx, meCanvas, meBoard, meShips, true);
  renderBoard(enCtx, enemyCanvas, enBoard, enShips, false);

  // призрак корабля при расстановке
  if (mode==="place" && hoverCellMe){
    const len = SHIPS[placingIndex];
    const ok = canPlace(meBoard, hoverCellMe.cx, hoverCellMe.cy, len, orientation);
    drawPlacementGhost(meCtx, meCanvas, hoverCellMe.cx, hoverCellMe.cy, len, orientation, ok);
  }

  // частицы поверх (и там и там — чтобы попадания были на нужном канвасе)
  updateAndDrawParticles(meCtx, dt);
  updateAndDrawParticles(enCtx, dt);

  requestAnimationFrame(loop);
}

// START
resizeAll();
resetGame();
loop();