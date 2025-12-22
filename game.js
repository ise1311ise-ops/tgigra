/* Морской бой — макет под Telegram WebView
   - Без прокрутки: UI масштабируется под экран (fitScale)
   - Переходы: меню -> расстановка -> лобби -> дуэль 1x1
   - Флот: 1×4, 2×3, 3×2, 4×1 (без дублей UI)
   - Чат: общая комната, открывается кнопкой сверху
   - Онлайн: мок (список user1..user12), при выборе игрока старт дуэли
*/

const $ = (id) => document.getElementById(id);

// ---- Views / Router
const views = {
  menu: $("viewMenu"),
  place: $("viewPlace"),
  lobby: $("viewLobby"),
  duel: $("viewDuel"),
};

const topTitle = $("topTitle");
const btnBack = $("btnBack");
const btnChat = $("btnChat");

function showView(name, push = true) {
  Object.values(views).forEach(v => v.classList.remove("active"));
  views[name].classList.add("active");

  // title/back behavior
  if (name === "menu") {
    topTitle.textContent = "Морской бой — онлайн игра";
    btnBack.textContent = "✕";
  } else {
    topTitle.textContent = name === "place" ? "Расстановка"
                    : name === "lobby" ? "Игровой зал"
                    : "Игра 1×1";
    btnBack.textContent = "←";
  }

  // чат включаем только в лобби/дуэли (можно и везде, но так аккуратнее)
  btnChat.style.display = (name === "lobby" || name === "duel") ? "grid" : "none";

  if (push) {
    history.pushState({ view: name }, "", "#" + name);
  }

  fitScale(); // важное: пересчитать масштаб при смене экрана
}

window.addEventListener("popstate", (e) => {
  const v = (e.state && e.state.view) ? e.state.view : "menu";
  showView(v, false);
});

// ---- Telegram-friendly fit scale
function fitScale() {
  const app = $("app");
  const stage = $("stage");
  if (!app || !stage) return;

  const baseW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--baseW")) || 390;
  const baseH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--baseH")) || 760;

  const rect = stage.getBoundingClientRect();
  const vw = rect.width;
  const vh = rect.height;

  // небольшие поля, чтобы не прилипало к краям
  const pad = 10;
  const s = Math.min((vw - pad) / baseW, (vh - pad) / baseH);

  // ограничим разумно (чтобы не раздувалось на больших экранах)
  const scale = Math.max(0.72, Math.min(1.05, s));

  document.documentElement.style.setProperty("--uiScale", String(scale));
}
window.addEventListener("resize", fitScale);
window.addEventListener("orientationchange", () => setTimeout(fitScale, 200));

// ---- Toast
const toast = $("toast");
let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1200);
}

// ---- Labels
const colNums = ["1","2","3","4","5","6","7","8","9","10"];
const rowLetters = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];

function renderLabels(topEl, leftEl) {
  topEl.innerHTML = colNums.map(n => `<span>${n}</span>`).join("");
  leftEl.innerHTML = rowLetters.map(n => `<span>${n}</span>`).join("");
}

// ---- Boards helpers
const SIZE = 10;
// cell states for duel boards:
// 0 empty, 1 ship, 2 miss, 3 hit
function makeGrid(val=0) {
  return Array.from({length: SIZE}, () => Array(SIZE).fill(val));
}

function inside(x,y){ return x>=0 && y>=0 && x<SIZE && y<SIZE; }

function neighbors8(x,y){
  const out = [];
  for(let dy=-1; dy<=1; dy++){
    for(let dx=-1; dx<=1; dx++){
      if(dx===0 && dy===0) continue;
      out.push([x+dx, y+dy]);
    }
  }
  return out.filter(([nx,ny]) => inside(nx,ny));
}

// Placement validation: no touching even diagonally
function canPlaceShip(board, x, y, len, dir) {
  const cells = [];
  for(let i=0;i<len;i++){
    const cx = x + (dir==="H" ? i : 0);
    const cy = y + (dir==="V" ? i : 0);
    if(!inside(cx,cy)) return false;
    if(board[cy][cx] !== 0) return false; // occupied
    cells.push([cx,cy]);
  }
  // check adjacency around all ship cells
  for(const [cx,cy] of cells){
    for(const [nx,ny] of neighbors8(cx,cy)){
      if(board[ny][nx] === 1) return false;
    }
  }
  return true;
}

function placeShip(board, x, y, len, dir) {
  const coords = [];
  for(let i=0;i<len;i++){
    const cx = x + (dir==="H" ? i : 0);
    const cy = y + (dir==="V" ? i : 0);
    board[cy][cx] = 1;
    coords.push([cx,cy]);
  }
  return coords;
}

// auto place for enemy (mock)
function autoPlaceFleet() {
  const b = makeGrid(0);
  const fleet = [4,3,3,2,2,2,1,1,1,1];
  for(const len of fleet){
    let placed = false;
    for(let tries=0; tries<500 && !placed; tries++){
      const dir = Math.random()<0.5 ? "H" : "V";
      const x = Math.floor(Math.random()*SIZE);
      const y = Math.floor(Math.random()*SIZE);
      if(canPlaceShip(b, x, y, len, dir)){
        placeShip(b, x, y, len, dir);
        placed = true;
      }
    }
    if(!placed){
      // fallback: restart (очень редко)
      return autoPlaceFleet();
    }
  }
  return b;
}

// ---- UI: build board DOM
function buildBoard(boardEl, onTap) {
  boardEl.innerHTML = "";
  for(let y=0; y<SIZE; y++){
    for(let x=0; x<SIZE; x++){
      const c = document.createElement("div");
      c.className = "cell";
      c.dataset.x = String(x);
      c.dataset.y = String(y);
      c.addEventListener("click", () => onTap(x,y,c));
      boardEl.appendChild(c);
    }
  }
}

function paintBoard(boardEl, grid, mode) {
  // mode: "place" | "you" | "enemy"
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach(cell => {
    const x = +cell.dataset.x;
    const y = +cell.dataset.y;
    const v = grid[y][x];

    cell.classList.remove("ship","forbidden","miss","hit");

    if(mode === "place" || mode === "you"){
      if(v === 1) cell.classList.add("ship");
    }
    if(v === 2) cell.classList.add("miss");
    if(v === 3) cell.classList.add("hit");
  });
}

// forbidden preview for placement
function paintForbidden(boardEl, forbidGrid) {
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach(cell => {
    const x = +cell.dataset.x;
    const y = +cell.dataset.y;
    cell.classList.toggle("forbidden", forbidGrid[y][x] === 1);
  });
}

// ---- State
let dir = "H";
let placeBoard = makeGrid(0);
let forbid = makeGrid(0);

const fleetDef = [
  { len:4, count:1, label:"4-палубный" },
  { len:3, count:2, label:"3-палубный" },
  { len:2, count:3, label:"2-палубный" },
  { len:1, count:4, label:"1-палубный" },
];

let fleetLeft = null;        // [{len,countLeft,label}, ...]
let selectedLen = null;      // chosen ship length
let placedShips = [];        // array of arrays coords

function resetPlacement() {
  dir = "H";
  placeBoard = makeGrid(0);
  forbid = makeGrid(0);
  placedShips = [];

  fleetLeft = fleetDef.map(x => ({...x, countLeft: x.count}));
  selectedLen = null;

  $("btnRotate").textContent = "Повернуть: Гориз.";
  $("btnStart").disabled = true;

  renderFleet();
  paintBoard($("boardPlace"), placeBoard, "place");
  paintForbidden($("boardPlace"), forbid);
  showToast("Расстановка сброшена");
}

function allPlaced() {
  return fleetLeft.every(s => s.countLeft === 0);
}

function renderFleet() {
  const list = $("fleetList");
  list.innerHTML = "";

  fleetLeft.forEach((ship, idx) => {
    const btn = document.createElement("div");
    btn.className = "shipBtn";
    if (ship.countLeft === 0) btn.classList.add("disabled");
    if (selectedLen === ship.len) btn.classList.add("selected");

    const pips = document.createElement("div");
    pips.className = "pips";
    for(let i=0;i<ship.len;i++){
      const p = document.createElement("div");
      p.className = "pip";
      pips.appendChild(p);
    }

    const right = document.createElement("div");
    right.innerHTML = `<div>${ship.label}</div><div style="font-size:12px;opacity:.8">осталось: ${ship.countLeft}</div>`;

    btn.appendChild(pips);
    btn.appendChild(right);

    btn.addEventListener("click", () => {
      if(ship.countLeft === 0) return;
      selectedLen = ship.len;
      renderFleet();
      showToast(`Выбран: ${ship.label}`);
    });

    list.appendChild(btn);
  });
}

// compute forbid grid from placed ships
function rebuildForbidden() {
  forbid = makeGrid(0);
  for(let y=0;y<SIZE;y++){
    for(let x=0;x<SIZE;x++){
      if(placeBoard[y][x] === 1){
        for(const [nx,ny] of neighbors8(x,y)){
          if(placeBoard[ny][nx] === 0) forbid[ny][nx] = 1;
        }
      }
    }
  }
}

function placeTap(x,y) {
  if(!selectedLen){
    showToast("Сначала выбери корабль справа");
    return;
  }
  if(!canPlaceShip(placeBoard, x, y, selectedLen, dir)){
    showToast("Нельзя поставить здесь");
    return;
  }

  const coords = placeShip(placeBoard, x, y, selectedLen, dir);
  placedShips.push(coords);

  // decrease count
  const ship = fleetLeft.find(s => s.len === selectedLen && s.countLeft > 0);
  if(ship) ship.countLeft -= 1;

  // auto-select next available
  if(ship && ship.countLeft === 0){
    const next = fleetLeft.find(s => s.countLeft > 0);
    selectedLen = next ? next.len : null;
  }

  rebuildForbidden();
  paintBoard($("boardPlace"), placeBoard, "place");
  paintForbidden($("boardPlace"), forbid);
  renderFleet();

  if(allPlaced()){
    $("btnStart").disabled = false;
    showToast("Все корабли расставлены!");
  }
}

// ---- Lobby (players)
function renderPlayers() {
  const list = $("playersList");
  list.innerHTML = "";
  const users = Array.from({length: 12}, (_,i)=>`user${i+1}`);

  users.forEach((name, i) => {
    const ping = 70 + Math.floor(Math.random()*30); // mock 70-99
    const card = document.createElement("div");
    card.className = "playerCard";

    card.innerHTML = `
      <div class="playerTop">
        <div class="playerName">${name}</div>
        <div class="ping">${ping}%</div>
      </div>
      <div class="playerBar"><div style="width:${ping}%;"></div></div>
    `;
    card.addEventListener("click", () => startDuel(name));
    list.appendChild(card);
  });

  $("onlinePct").textContent = `${90 + Math.floor(Math.random()*10)}%`;
}

// ---- Duel
let youBoard = null;
let enemyBoard = null;
let yourTurn = true;
let opponentName = "userX";

function cloneGrid(g){ return g.map(r => r.slice()); }

function startDuel(opponent) {
  opponentName = opponent;
  $("duelSub").textContent = `Против: ${opponentName}`;

  // you board = placed board (from placement)
  youBoard = cloneGrid(placeBoard);
  enemyBoard = autoPlaceFleet();

  yourTurn = true;
  $("turnLabel").textContent = "Твой";
  $("duelHint").textContent = "Тапай по клеткам, чтобы стрелять.";

  // paint
  paintBoard($("boardYou"), youBoard, "you");
  paintBoard($("boardEnemy"), enemyBoard, "enemy"); // ships скрыты, но paintBoard их не рисует в enemy-mode

  showView("duel");
}

function checkAllShipsDead(board) {
  for(let y=0;y<SIZE;y++){
    for(let x=0;x<SIZE;x++){
      if(board[y][x] === 1) return false;
    }
  }
  return true;
}

function shoot(board, x, y) {
  const v = board[y][x];
  if(v === 2 || v === 3) return { ok:false };

  if(v === 1){
    board[y][x] = 3;
    return { ok:true, hit:true };
  } else {
    board[y][x] = 2;
    return { ok:true, hit:false };
  }
}

function enemyAiTurn() {
  // простая рандомная стрельба по вашему полю
  let tries = 0;
  while(tries++ < 500){
    const x = Math.floor(Math.random()*SIZE);
    const y = Math.floor(Math.random()*SIZE);
    const v = youBoard[y][x];
    if(v === 2 || v === 3) continue;

    const res = shoot(youBoard, x, y);
    paintBoard($("boardYou"), youBoard, "you");

    if(res.hit){
      showToast("Противник попал!");
      if(checkAllShipsDead(youBoard)){
        showToast("Ты проиграл (мок)");
        setTimeout(() => showView("lobby"), 700);
        return;
      }
      // на попадании противник стреляет ещё раз (классика)
      setTimeout(enemyAiTurn, 250);
      return;
    } else {
      showToast("Противник мимо");
      yourTurn = true;
      $("turnLabel").textContent = "Твой";
      return;
    }
  }
  // если вдруг не нашёл
  yourTurn = true;
  $("turnLabel").textContent = "Твой";
}

// ---- Chat (modal)
const chatModal = $("chatModal");
const chatBody = $("chatBody");
const chatInput = $("chatInput");

const chatSeed = [
  {user:"user1", text:"Всем привет 👋"},
  {user:"user3", text:"Кто в 1×1?"},
  {user:"user7", text:"Я тут!"}
];

function openChat() {
  chatModal.classList.add("show");
  chatModal.setAttribute("aria-hidden","false");
  chatInput.focus();
}
function closeChat() {
  chatModal.classList.remove("show");
  chatModal.setAttribute("aria-hidden","true");
}

function addMsg(user, text) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>${user}:</b> ${escapeHtml(text)}`;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function initChat() {
  chatBody.innerHTML = "";
  chatSeed.forEach(m => addMsg(m.user, m.text));
}

// ---- Bind UI
function init() {
  // labels
  renderLabels($("labelsTopPlace"), $("labelsLeftPlace"));
  renderLabels($("labelsTopYou"), $("labelsLeftYou"));
  renderLabels($("labelsTopEnemy"), $("labelsLeftEnemy"));

  // boards
  buildBoard($("boardPlace"), (x,y)=>placeTap(x,y));
  buildBoard($("boardYou"), ()=>{}); // в дуэли по своему полю не стреляем
  buildBoard($("boardEnemy"), (x,y) => {
    if(!views.duel.classList.contains("active")) return;
    if(!yourTurn) { showToast("Жди ход противника"); return; }

    const res = shoot(enemyBoard, x, y);
    if(!res.ok) return;

    paintBoard($("boardEnemy"), enemyBoard, "enemy");

    if(res.hit){
      showToast("Попадание!");
      if(checkAllShipsDead(enemyBoard)){
        showToast("Ты победил (мок) 🎉");
        setTimeout(() => showView("lobby"), 700);
        return;
      }
      // при попадании ты ходишь ещё раз
      return;
    } else {
      showToast("Мимо");
      yourTurn = false;
      $("turnLabel").textContent = "Противник";
      setTimeout(enemyAiTurn, 350);
    }
  });

  // menu buttons
  $("goOnline").addEventListener("click", () => {
    resetPlacement();
    showView("place");
  });
  $("goSettings").addEventListener("click", () => showToast("Настройки (макет)"));
  $("goShare").addEventListener("click", async () => {
    const url = location.href.split("#")[0];
    try{
      if(navigator.share){
        await navigator.share({ title:"Морской бой", url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast("Ссылка скопирована");
      }
    }catch{
      showToast("Не удалось поделиться");
    }
  });
  $("goSupport").addEventListener("click", () => showToast("Поддержка (макет)"));

  // placement buttons
  $("btnRotate").addEventListener("click", () => {
    dir = (dir === "H") ? "V" : "H";
    $("btnRotate").textContent = (dir === "H") ? "Повернуть: Гориз." : "Повернуть: Вертик.";
  });
  $("btnResetPlace").addEventListener("click", resetPlacement);
  $("btnStart").addEventListener("click", () => {
    if(!allPlaced()){
      showToast("Сначала расставь весь флот");
      return;
    }
    renderPlayers();
    initChat();
    showView("lobby");
  });

  // duel
  $("btnDuelBack").addEventListener("click", () => showView("lobby"));

  // top back
  btnBack.addEventListener("click", () => {
    if(views.menu.classList.contains("active")){
      // на меню X — просто тост (в TG можно закрывать по системной кнопке)
      showToast("Это главный экран");
      return;
    }
    if(views.place.classList.contains("active")) return showView("menu");
    if(views.lobby.classList.contains("active")) return showView("place");
    if(views.duel.classList.contains("active")) return showView("lobby");
  });

  // chat open/close
  btnChat.addEventListener("click", openChat);
  $("chatClose").addEventListener("click", closeChat);
  $("chatBackdrop").addEventListener("click", closeChat);
  $("chatSend").addEventListener("click", () => {
    const txt = chatInput.value.trim();
    if(!txt) return;
    addMsg("you", txt);
    chatInput.value = "";
  });
  chatInput.addEventListener("keydown", (e) => {
    if(e.key === "Enter"){
      $("chatSend").click();
    }
  });

  // start default view
  const hash = (location.hash || "#menu").replace("#","");
  showView(["menu","place","lobby","duel"].includes(hash) ? hash : "menu", false);

  // important: first fit
  fitScale();
}

document.addEventListener("DOMContentLoaded", init);