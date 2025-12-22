/* Морской бой: игрок vs ИИ
   - 10x10
   - Флот: 4,3,3,2,2,2,1,1,1,1
   - ИИ: hunt/target (ищет попадание и добивает)
*/

const SIZE = 10;
const FLEET = [4,3,3,2,2,2,1,1,1,1];

const elMy = document.getElementById("myGrid");
const elEnemy = document.getElementById("enemyGrid");
const elLog = document.getElementById("log");
const elTurn = document.getElementById("turnBadge");
const elMyLeft = document.getElementById("myLeft");
const elEnemyLeft = document.getElementById("enemyLeft");

const btnNew = document.getElementById("btnNew");
const btnRandom = document.getElementById("btnRandom");
const btnClose = document.getElementById("btnClose");

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
  tg.setHeaderColor?.("#0b1220");
  tg.setBackgroundColor?.("#0b1220");
}

function key(x,y){ return `${x},${y}`; }
function inb(x,y){ return x>=0 && y>=0 && x<SIZE && y<SIZE; }
function rnd(n){ return Math.floor(Math.random()*n); }

function makeBoard(){
  return {
    ships: [],              // [{cells:Set, hits:Set}]
    occupied: new Set(),    // cells with ship
    blocked: new Set(),     // cells where нельзя ставить (вокруг кораблей)
    shots: new Map(),       // key-> "hit"|"miss"|"sunk"
  };
}

function neighbors8(x,y){
  const res = [];
  for (let dx=-1; dx<=1; dx++){
    for (let dy=-1; dy<=1; dy++){
      if (dx===0 && dy===0) continue;
      const nx=x+dx, ny=y+dy;
      if (inb(nx,ny)) res.push([nx,ny]);
    }
  }
  return res;
}

function canPlace(board, cells){
  for (const [x,y] of cells){
    const k = key(x,y);
    if (!inb(x,y)) return false;
    if (board.occupied.has(k)) return false;
    if (board.blocked.has(k)) return false;
  }
  return true;
}

function placeShip(board, cells){
  const ship = { cells: new Set(), hits: new Set() };
  for (const [x,y] of cells){
    const k = key(x,y);
    ship.cells.add(k);
    board.occupied.add(k);
  }
  // заблокировать вокруг
  for (const [x,y] of cells){
    for (const [nx,ny] of neighbors8(x,y)){
      board.blocked.add(key(nx,ny));
    }
  }
  board.ships.push(ship);
}

function randomPlaceFleet(board){
  board.ships = [];
  board.occupied = new Set();
  board.blocked = new Set();
  board.shots = new Map();

  for (const len of FLEET){
    let placed = false;
    for (let tries=0; tries<2000 && !placed; tries++){
      const horiz = Math.random() < 0.5;
      const x = rnd(SIZE);
      const y = rnd(SIZE);
      const cells = [];
      for (let i=0; i<len; i++){
        const cx = x + (horiz ? i : 0);
        const cy = y + (horiz ? 0 : i);
        cells.push([cx,cy]);
      }
      if (canPlace(board, cells)){
        placeShip(board, cells);
        placed = true;
      }
    }
    if (!placed) throw new Error("Не удалось разместить флот");
  }
}

function shipByCell(board, k){
  for (const s of board.ships){
    if (s.cells.has(k)) return s;
  }
  return null;
}

function isSunk(ship){
  return ship.hits.size === ship.cells.size;
}

function markSunkAround(board, ship){
  // классика: вокруг потопленного — пусто (для удобства игрока)
  for (const cell of ship.cells){
    const [x,y] = cell.split(",").map(Number);
    for (const [nx,ny] of neighbors8(x,y)){
      const nk = key(nx,ny);
      if (!board.shots.has(nk)) board.shots.set(nk, "miss");
    }
  }
  // сами клетки корабля в sunk
  for (const cell of ship.cells){
    board.shots.set(cell, "sunk");
  }
}

function shot(board, x, y){
  const k = key(x,y);
  if (board.shots.has(k)) return { ok:false, reason:"already" };

  const ship = shipByCell(board, k);
  if (!ship){
    board.shots.set(k, "miss");
    return { ok:true, result:"miss" };
  }

  ship.hits.add(k);
  if (isSunk(ship)){
    markSunkAround(board, ship);
    return { ok:true, result:"sunk" };
  } else {
    board.shots.set(k, "hit");
    return { ok:true, result:"hit" };
  }
}

function shipsLeft(board){
  let left = 0;
  for (const s of board.ships){
    if (!isSunk(s)) left++;
  }
  return left;
}

function logRow(type, text){
  const div = document.createElement("div");
  div.className = `row ${type}`;
  div.textContent = text;
  elLog.prepend(div);
}

// --- UI ---
function buildGrid(el, onClick){
  el.innerHTML = "";
  for (let y=0; y<SIZE; y++){
    for (let x=0; x<SIZE; x++){
      const c = document.createElement("button");
      c.className = "cell";
      c.dataset.x = x;
      c.dataset.y = y;
      c.addEventListener("click", () => onClick(x,y,c));
      el.appendChild(c);
    }
  }
}

function cellEl(el, x, y){
  return el.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

function render(board, el, showShips){
  for (let y=0; y<SIZE; y++){
    for (let x=0; x<SIZE; x++){
      const k = key(x,y);
      const c = cellEl(el, x, y);
      c.classList.remove("ship","hit","miss","sunk","disabled");

      const st = board.shots.get(k);
      if (st){
        c.classList.add(st);
        c.classList.add("disabled");
      }

      if (showShips && board.occupied.has(k) && !st){
        c.classList.add("ship");
      }
    }
  }
}

function setTurn(isMy){
  elTurn.textContent = isMy ? "Твой ход" : "Ход ИИ";
  elTurn.classList.toggle("enemy", !isMy);
}

// --- AI (hunt/target) ---
const AI = {
  mode: "hunt",         // hunt | target
  targets: [],          // candidate cells around hits
  hitStack: [],         // consecutive hits to infer direction
  tried: new Set(),
};

function aiReset(){
  AI.mode = "hunt";
  AI.targets = [];
  AI.hitStack = [];
  AI.tried = new Set();
}

function aiPickHunt(){
  // шахматный паттерн + случайность (эффективнее)
  const candidates = [];
  for (let y=0; y<SIZE; y++){
    for (let x=0; x<SIZE; x++){
      const k = key(x,y);
      if (AI.tried.has(k)) continue;
      if ((x+y) % 2 === 0) candidates.push([x,y]);
    }
  }
  if (candidates.length) return candidates[rnd(candidates.length)];

  // если шахматка кончилась
  const all = [];
  for (let y=0; y<SIZE; y++){
    for (let x=0; x<SIZE; x++){
      const k = key(x,y);
      if (!AI.tried.has(k)) all.push([x,y]);
    }
  }
  return all[rnd(all.length)];
}

function pushTargetsFromHit(x,y){
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx,dy] of dirs){
    const nx=x+dx, ny=y+dy;
    if (!inb(nx,ny)) continue;
    const k = key(nx,ny);
    if (!AI.tried.has(k)) AI.targets.push([nx,ny]);
  }
}

function aiPickTarget(){
  while (AI.targets.length){
    const [x,y] = AI.targets.shift();
    const k = key(x,y);
    if (!AI.tried.has(k)) return [x,y];
  }
  AI.mode = "hunt";
  AI.hitStack = [];
  return aiPickHunt();
}

function coordName(x,y){
  const letters = "ABCDEFGHIJ";
  return `${letters[x]}${y+1}`;
}

// --- Game state ---
let my = makeBoard();
let enemy = makeBoard();
let myTurn = true;
let gameOver = false;

function updateCounters(){
  elMyLeft.textContent = shipsLeft(my);
  elEnemyLeft.textContent = shipsLeft(enemy);
}

function endGame(win){
  gameOver = true;
  setTurn(false);
  logRow("sys", win ? "🏆 Победа! Ты разгромил флот ИИ." : "💥 Поражение… ИИ оказался жестче.");
  if (tg){
    tg.HapticFeedback?.notificationOccurred?.(win ? "success" : "error");
  }
}

function newGame(keepMyPlacement=false){
  myTurn = true;
  gameOver = false;
  aiReset();
  elLog.innerHTML = "";

  if (!keepMyPlacement){
    my = makeBoard();
    randomPlaceFleet(my);
  } else {
    // сбросить только выстрелы по моему полю
    my.shots = new Map();
    for (const s of my.ships) s.hits = new Set();
  }

  enemy = makeBoard();
  randomPlaceFleet(enemy);

  buildGrid(elMy, () => {});
  buildGrid(elEnemy, onEnemyClick);

  render(my, elMy, true);
  render(enemy, elEnemy, false);

  setTurn(true);
  updateCounters();
  logRow("sys", "Новая игра! Стреляй по полю противника.");
}

function onEnemyClick(x,y,cell){
  if (gameOver) return;
  if (!myTurn) return;

  const res = shot(enemy, x, y);
  if (!res.ok) return;

  if (tg) tg.HapticFeedback?.impactOccurred?.("light");

  render(enemy, elEnemy, false);

  const cn = coordName(x,y);
  if (res.result === "miss"){
    logRow("me", `Ты: ${cn} — мимо 🌊`);
    myTurn = false;
    setTurn(false);
    updateCounters();
    setTimeout(aiStep, 450);
  }
  if (res.result === "hit"){
    logRow("me", `Ты: ${cn} — попадание 🎯`);
    updateCounters();
    if (shipsLeft(enemy) === 0) return endGame(true);
  }
  if (res.result === "sunk"){
    logRow("me", `Ты: ${cn} — потопил корабль 💥`);
    updateCounters();
    if (shipsLeft(enemy) === 0) return endGame(true);
  }
}

function aiStep(){
  if (gameOver) return;

  let again = true;
  while (again && !gameOver){
    const [x,y] = (AI.mode === "target") ? aiPickTarget() : aiPickHunt();
    const k = key(x,y);
    AI.tried.add(k);

    const res = shot(my, x, y);
    render(my, elMy, true);

    const cn = coordName(x,y);

    if (res.result === "miss"){
      logRow("ai", `ИИ: ${cn} — мимо 🌫️`);
      myTurn = true;
      setTurn(true);
      again = false;
      updateCounters();
      if (tg) tg.HapticFeedback?.impactOccurred?.("light");
    }

    if (res.result === "hit"){
      logRow("ai", `ИИ: ${cn} — попадание 🔥`);
      if (tg) tg.HapticFeedback?.impactOccurred?.("medium");

      AI.mode = "target";
      AI.hitStack.push([x,y]);
      pushTargetsFromHit(x,y);

      updateCounters();
      if (shipsLeft(my) === 0) return endGame(false);

      // ИИ стреляет ещё раз после попадания
      again = true;
    }

    if (res.result === "sunk"){
      logRow("ai", `ИИ: ${cn} — потопил корабль ☠️`);
      if (tg) tg.HapticFeedback?.impactOccurred?.("heavy");

      // после потопления — сброс target режима
      AI.mode = "hunt";
      AI.targets = [];
      AI.hitStack = [];

      updateCounters();
      if (shipsLeft(my) === 0) return endGame(false);

      again = true; // классика: за потопление ещё ход
    }
  }
}

btnNew.addEventListener("click", () => newGame(false));
btnRandom.addEventListener("click", () => newGame(false));
btnClose.addEventListener("click", () => {
  if (tg) tg.close();
  else alert("Открой через Telegram WebApp кнопку у бота 🙂");
});

// старт
newGame(false);