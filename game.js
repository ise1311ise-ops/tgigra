/* Морской бой — каркас под будущий сервер (WebSocket).
   Сейчас: локальные заглушки (mock) для лобби, приглашений и боя. */

const tg = window.Telegram?.WebApp;

function $(id){ return document.getElementById(id); }

const Screens = {
  menu: $("screenMenu"),
  setup: $("screenSetup"),
  lobby: $("screenLobby"),
  battle: $("screenBattle"),
};

const UI = {
  back: $("btnBack"),

  btnOnline: $("btnOnline"),
  btnSettings: $("btnSettings"),
  btnSupport: $("btnSupport"),
  btnShare: $("btnShare"),

  myPlacementGrid: $("myPlacementGrid"),
  shipTray: $("shipTray"),
  btnNextToLobby: $("btnNextToLobby"),
  btnAutoPlace: $("btnAutoPlace"),
  btnClear: $("btnClear"),

  playersList: $("playersList"),
  btnToggleChat: $("btnToggleChat"),
  btnLeaveLobby: $("btnLeaveLobby"),
  lobbyInfo: $("lobbyInfo"),

  chatWrap: $("chatWrap"),
  chatMessages: $("chatMessages"),
  chatText: $("chatText"),
  chatSend: $("chatSend"),

  myBattleGrid: $("myBattleGrid"),
  enemyBattleGrid: $("enemyBattleGrid"),
  battleStatusLeft: $("battleStatusLeft"),
  battleStatusRight: $("battleStatusRight"),
  btnExitBattle: $("btnExitBattle"),

  modal: $("modal"),
  modalText: $("modalText"),
  modalOk: $("modalOk"),
};

const GRID = 10;

// Стандартный набор кораблей: 1×4, 2×3, 3×2, 4×1
const SHIPS = [
  { id:"s4", len:4 },
  { id:"s3a", len:3 },
  { id:"s3b", len:3 },
  { id:"s2a", len:2 },
  { id:"s2b", len:2 },
  { id:"s2c", len:2 },
  { id:"s1a", len:1 },
  { id:"s1b", len:1 },
  { id:"s1c", len:1 },
  { id:"s1d", len:1 },
];

const App = {
  screen: "menu",

  // placement
  placement: {
    occupied: new Map(), // key "x,y" -> shipId
    ships: new Map(),    // shipId -> {x,y,dir,len}
    draggingShipId: null,
  },

  // lobby
  lobby: {
    players: [],
    chatOpen: false,
  },

  // battle (заглушки)
  battle: {
    myShots: new Set(),     // key "x,y" on enemy
    enemyShots: new Set(),  // key "x,y" on me
  }
};

// ---------- helpers ----------
function keyXY(x,y){ return `${x},${y}`; }
function inside(x,y){ return x>=0 && x<GRID && y>=0 && y<GRID; }

function showModal(text){
  UI.modalText.textContent = text;
  UI.modal.classList.remove("hidden");
}
UI.modalOk.onclick = () => UI.modal.classList.add("hidden");

function setScreen(name){
  App.screen = name;
  Object.values(Screens).forEach(s => s.classList.remove("active"));
  Screens[name].classList.add("active");

  // back button logic
  if (name === "menu") {
    UI.back.classList.add("hidden");
  } else {
    UI.back.classList.remove("hidden");
  }
}

// ---------- init Telegram WebApp ----------
function initTelegram(){
  try{
    if (tg){
      tg.ready();
      tg.expand();
      // Можно выставить цвет, если надо
      // tg.setHeaderColor?.("#101a2e");
    }
  }catch(e){}
}

// ---------- grid render ----------
function buildGrid(container, opts){
  container.innerHTML = "";
  for (let y=0; y<GRID; y++){
    for (let x=0; x<GRID; x++){
      const c = document.createElement("div");
      c.className = "cell";
      c.dataset.x = String(x);
      c.dataset.y = String(y);

      if (opts?.droppable){
        c.addEventListener("dragover", (e)=> onDragOverCell(e, c));
        c.addEventListener("dragleave", ()=> { c.classList.remove("drop-ok","drop-bad"); });
        c.addEventListener("drop", (e)=> onDropOnCell(e, c));
      }

      if (opts?.shootable){
        c.addEventListener("click", ()=> onShootCell(c));
      }

      container.appendChild(c);
    }
  }
}

function cellEl(container, x, y){
  return container.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
}

// ---------- ships tray ----------
function renderShipTray(){
  UI.shipTray.innerHTML = "";
  for (const s of SHIPS){
    const placed = App.placement.ships.has(s.id);
    const el = document.createElement("div");
    el.className = `ship horizontal ${placed ? "placed":""}`;
    el.draggable = !placed;
    el.dataset.shipId = s.id;
    el.title = `Корабль ${s.len}`;

    el.addEventListener("dragstart", () => {
      if (placed) return;
      App.placement.draggingShipId = s.id;
    });

    for (let i=0;i<s.len;i++){
      const p = document.createElement("div");
      p.className = "ship-cell";
      el.appendChild(p);
    }
    UI.shipTray.appendChild(el);
  }
}

function renderPlacementShipsOnGrid(){
  // очистим визуал
  UI.myPlacementGrid.querySelectorAll(".cell").forEach(c=>{
    c.style.background = "";
    c.classList.remove("ship-on-grid");
    c.onclick = null;
  });

  // нарисуем корабли
  for (const [shipId, st] of App.placement.ships.entries()){
    const coords = shipCells(st.x, st.y, st.dir, st.len);
    for (const [x,y] of coords){
      const c = cellEl(UI.myPlacementGrid, x, y);
      if (!c) continue;
      c.style.background = "rgba(78,161,255,.38)";
      c.style.borderColor = "rgba(78,161,255,.55)";
      // клик по любой части корабля — повернуть вокруг его (x,y)
      c.onclick = ()=> rotateShip(shipId);
    }
  }
}

function shipCells(x,y,dir,len){
  const out = [];
  for (let i=0;i<len;i++){
    const xx = dir === "H" ? x+i : x;
    const yy = dir === "V" ? y+i : y;
    out.push([xx,yy]);
  }
  return out;
}

function canPlaceShip(shipId, x,y,dir,len){
  const coords = shipCells(x,y,dir,len);
  // внутри поля
  if (!coords.every(([xx,yy])=> inside(xx,yy))) return false;

  // нельзя пересекаться
  for (const [xx,yy] of coords){
    const occ = App.placement.occupied.get(keyXY(xx,yy));
    if (occ && occ !== shipId) return false;
  }

  // нельзя касаться (включая диагонали)
  const forbidden = new Set();
  for (const [xx,yy] of coords){
    for (let dy=-1; dy<=1; dy++){
      for (let dx=-1; dx<=1; dx++){
        const nx = xx+dx, ny = yy+dy;
        if (inside(nx,ny)) forbidden.add(keyXY(nx,ny));
      }
    }
  }

  for (const k of forbidden){
    const occ = App.placement.occupied.get(k);
    if (occ && occ !== shipId) {
      // если это “наш же корабль” и мы его двигаем — допустимо
      // но это сложно отличить по forbidden, поэтому разрешим только если этот occ==shipId
      if (occ !== shipId) return false;
    }
  }

  return true;
}

function placeShip(shipId, x,y,dir){
  const ship = SHIPS.find(s=>s.id===shipId);
  if (!ship) return false;

  // если корабль уже стоял — сначала уберём следы
  removeShip(shipId);

  if (!canPlaceShip(shipId, x,y,dir,ship.len)){
    return false;
  }

  const st = { x,y,dir,len:ship.len };
  App.placement.ships.set(shipId, st);

  for (const [xx,yy] of shipCells(x,y,dir,ship.len)){
    App.placement.occupied.set(keyXY(xx,yy), shipId);
  }

  renderShipTray();
  renderPlacementShipsOnGrid();
  updateNextButton();
  return true;
}

function removeShip(shipId){
  const prev = App.placement.ships.get(shipId);
  if (!prev) return;
  for (const [xx,yy] of shipCells(prev.x, prev.y, prev.dir, prev.len)){
    const k = keyXY(xx,yy);
    if (App.placement.occupied.get(k) === shipId) App.placement.occupied.delete(k);
  }
  App.placement.ships.delete(shipId);
}

function rotateShip(shipId){
  const st = App.placement.ships.get(shipId);
  if (!st) return;
  const newDir = st.dir === "H" ? "V" : "H";
  // попробуем повернуть на том же якоре (x,y)
  const ok = placeShip(shipId, st.x, st.y, newDir);
  if (!ok){
    // откат (вернём как было)
    placeShip(shipId, st.x, st.y, st.dir);
    showModal("Нельзя повернуть: мешают границы или другие корабли.");
  }
}

function updateNextButton(){
  UI.btnNextToLobby.disabled = App.placement.ships.size !== SHIPS.length;
}

// ---------- drag/drop ----------
function onDragOverCell(e, cell){
  e.preventDefault();
  const shipId = App.placement.draggingShipId;
  if (!shipId) return;

  const ship = SHIPS.find(s=>s.id===shipId);
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);

  // по умолчанию ставим горизонтально
  const ok = canPlaceShip(shipId, x,y,"H", ship.len);
  cell.classList.toggle("drop-ok", ok);
  cell.classList.toggle("drop-bad", !ok);
}

function onDropOnCell(e, cell){
  e.preventDefault();
  cell.classList.remove("drop-ok","drop-bad");

  const shipId = App.placement.draggingShipId;
  App.placement.draggingShipId = null;
  if (!shipId) return;

  const ship = SHIPS.find(s=>s.id===shipId);
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);

  const ok = placeShip(shipId, x,y,"H");
  if (!ok) showModal("Нельзя поставить сюда корабль.");
}

function clearPlacement(){
  App.placement.occupied.clear();
  App.placement.ships.clear();
  renderShipTray();
  renderPlacementShipsOnGrid();
  updateNextButton();
}

function autoPlace(){
  clearPlacement();

  for (const s of SHIPS){
    let placed = false;
    for (let tries=0; tries<800 && !placed; tries++){
      const dir = Math.random() < 0.5 ? "H":"V";
      const x = Math.floor(Math.random()*GRID);
      const y = Math.floor(Math.random()*GRID);
      if (canPlaceShip(s.id, x,y,dir,s.len)){
        placeShip(s.id, x,y,dir);
        placed = true;
      }
    }
    if (!placed){
      clearPlacement();
      showModal("Не смог расставить автоматически. Попробуй ещё раз.");
      return;
    }
  }
}

// ---------- lobby (mock) ----------
function lobbyMockPlayers(){
  // ЗАГЛУШКА: потом будет приходить с сервера
  App.lobby.players = [
    { id:"u101", name:"Капитан_Волк", rating: 1240 },
    { id:"u102", name:"SeaFox", rating: 980 },
    { id:"u103", name:"Адмирал_Синий", rating: 1435 },
    { id:"u104", name:"Torpedo", rating: 1110 },
  ];
  renderPlayers();
}

function renderPlayers(){
  UI.playersList.innerHTML = "";
  for (const p of App.lobby.players){
    const el = document.createElement("div");
    el.className = "player";
    el.innerHTML = `<strong>${escapeHtml(p.name)}</strong><small>Рейтинг: ${p.rating}</small>`;
    el.onclick = ()=> invitePlayerMock(p);
    UI.playersList.appendChild(el);
  }
}

function invitePlayerMock(player){
  // ЗАГЛУШКА: replace with server invite message
  UI.lobbyInfo.textContent = `Приглашение отправлено игроку ${player.name}...`;

  // "второй пользователь одобрил"
  setTimeout(()=>{
    const accepted = true; // можно рандом сделать
    if (!accepted){
      UI.lobbyInfo.textContent = `${player.name} отклонил приглашение.`;
      return;
    }

    UI.lobbyInfo.textContent = `${player.name} принял приглашение. Начинаем бой!`;
    startBattleMock(player);
  }, 900);
}

function toggleChat(){
  App.lobby.chatOpen = !App.lobby.chatOpen;
  UI.chatWrap.classList.toggle("hidden", !App.lobby.chatOpen);
}

function chatAddMessage(author, text){
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<div class="meta">${escapeHtml(author)}</div><div>${escapeHtml(text)}</div>`;
  UI.chatMessages.appendChild(el);
  UI.chatMessages.scrollTop = UI.chatMessages.scrollHeight;
}

function sendChat(){
  const t = UI.chatText.value.trim();
  if (!t) return;
  UI.chatText.value = "";

  // ЗАГЛУШКА: потом отправка на сервер
  chatAddMessage("Ты", t);

  // ответ-эхо
  setTimeout(()=> chatAddMessage("Система", "Сообщение доставлено (mock)."), 350);
}

// ---------- battle ----------
function startBattleMock(opponent){
  // Подготовим поля боя
  buildGrid(UI.myBattleGrid, { droppable:false, shootable:false });
  buildGrid(UI.enemyBattleGrid, { droppable:false, shootable:true });

  // Рендер своих кораблей на левом поле
  for (const [shipId, st] of App.placement.ships.entries()){
    for (const [x,y] of shipCells(st.x, st.y, st.dir, st.len)){
      const c = cellEl(UI.myBattleGrid, x,y);
      if (c){
        c.style.background = "rgba(78,161,255,.38)";
        c.style.borderColor = "rgba(78,161,255,.55)";
      }
    }
  }

  App.battle.myShots.clear();
  App.battle.enemyShots.clear();

  UI.battleStatusLeft.textContent = `Противник: ${opponent.name}`;
  UI.battleStatusRight.textContent = `Твой ход (mock).`;

  setScreen("battle");
}

function onShootCell(cell){
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  const k = keyXY(x,y);

  if (App.battle.myShots.has(k)) return;

  // ЗАГЛУШКА попадания: рандом
  const hit = Math.random() < 0.25;
  App.battle.myShots.add(k);
  cell.classList.add(hit ? "shot-hit" : "shot-miss");

  // TODO SERVER:
  // send({type:"shot", x, y}) и ждать ответа hit/miss + чей ход

  UI.battleStatusRight.textContent = hit ? "Попадание! (mock)" : "Мимо. (mock)";
}

// ---------- menu actions ----------
UI.btnOnline.onclick = () => {
  setScreen("setup");
  buildGrid(UI.myPlacementGrid, { droppable:true, shootable:false });
  renderShipTray();
  renderPlacementShipsOnGrid();
  updateNextButton();
};

UI.btnSettings.onclick = () => showModal("Настройки пока в разработке.");
UI.btnSupport.onclick = () => showModal("Поддержка: добавим позже (ссылка/форма).");
UI.btnShare.onclick = async () => {
  // В Telegram можно tg.shareMessage? Обычно шарят ссылку на бота/miniapp
  showModal("Поделиться: сюда добавим логику шаринга (Telegram/Web Share).");
};

UI.btnAutoPlace.onclick = autoPlace;
UI.btnClear.onclick = clearPlacement;

UI.btnNextToLobby.onclick = () => {
  setScreen("lobby");
  UI.lobbyInfo.textContent = "Подключение к комнате... (mock)";
  lobbyMockPlayers();

  // ЗАГЛУШКА подключения
  setTimeout(()=> UI.lobbyInfo.textContent = "В комнате. Выбирай игрока слева для приглашения 1v1.", 400);
};

UI.btnToggleChat.onclick = toggleChat;
UI.chatSend.onclick = sendChat;
UI.chatText.addEventListener("keydown", (e)=>{ if (e.key==="Enter") sendChat(); });

UI.btnLeaveLobby.onclick = () => setScreen("menu");
UI.btnExitBattle.onclick = () => setScreen("menu");

UI.back.onclick = () => {
  // простая логика “назад”
  if (App.screen === "setup") setScreen("menu");
  else if (App.screen === "lobby") setScreen("setup");
  else if (App.screen === "battle") setScreen("menu");
};

// ---------- util ----------
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ---------- start ----------
initTelegram();
setScreen("menu");