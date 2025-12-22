/* =========================
   Морской бой — UI макет
   - отдельные экраны (home/placement/lobby/duel/settings/share/support)
   - чат открывается кнопкой сверху
   - игроки user1..user12
   - выбор игрока -> 1x1
   - без прокрутки + авто-масштаб под экран
   ========================= */

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const screens = $$(".screen");
const topTitle = $("#topTitle");
const btnBack = $("#btnBack");
const btnChat = $("#btnChat");

const chatOverlay = $("#chatOverlay");
const btnChatClose = $("#btnChatClose");
const chatBody = $("#chatBody");
const chatInput = $("#chatInput");
const btnSend = $("#btnSend");

const shareLink = $("#shareLink");
const btnCopy = $("#btnCopy");
const copyStatus = $("#copyStatus");

const myBoard = $("#myBoard");
const duelMyBoard = $("#duelMyBoard");
const duelEnemyBoard = $("#duelEnemyBoard");

const fleetEl = $("#fleet");
const btnRotate = $("#btnRotate");
const rotTxt = $("#rotTxt");
const btnStartLobby = $("#btnStartLobby");
const btnBackToPlacement = $("#btnBackToPlacement");

const playersGrid = $("#playersGrid");
const enemyNameEl = $("#enemyName");
const btnLeaveDuel = $("#btnLeaveDuel");
const btnMockShot = $("#btnMockShot");

const setHints = $("#setHints");
const themePaper = $("#themePaper");
const themeDark = $("#themeDark");

let currentScreen = "home";
let navStack = ["home"];

let rotation = "H"; // H/V
let selectedShipIdx = 0;

/**
 * Флот (как в классике):
 * 4,3,3,2,2,2,1,1,1,1
 * Для макета — достаточно.
 */
const fleet = [
  { len: 4, placed: false },
  { len: 3, placed: false },
  { len: 3, placed: false },
  { len: 2, placed: false },
  { len: 2, placed: false },
  { len: 2, placed: false },
  { len: 1, placed: false },
  { len: 1, placed: false },
  { len: 1, placed: false },
  { len: 1, placed: false },
];

const gridSize = 10;
const letters = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];

let myGrid = makeEmptyGrid();
let duelEnemyGrid = makeEmptyGrid(); // 0 empty, 2 miss, 3 hit (UI)
let duelMyGrid = makeEmptyGrid();    // копия расстановки

function makeEmptyGrid(){
  return Array.from({length:gridSize}, () => Array(gridSize).fill(0));
}

/* ============ Навигация ============ */
function showScreen(name, push=true){
  currentScreen = name;
  screens.forEach(s => s.classList.toggle("isActive", s.dataset.screen === name));

  if(push){
    navStack.push(name);
  }

  // заголовок
  const titles = {
    home: "Морской Бой — онлайн игра",
    placement: "Расстановка",
    lobby: "Игровой зал",
    duel: "Игра 1×1",
    settings: "Настройки",
    share: "Поделиться",
    support: "Поддержка",
  };
  topTitle.textContent = titles[name] ?? "Морской Бой";

  // кнопка слева: дом/назад
  btnBack.textContent = (name === "home") ? "✕" : "⌂";

  // чат доступен только в lobby/duel
  const chatEnabled = (name === "lobby" || name === "duel");
  btnChat.style.visibility = chatEnabled ? "visible" : "hidden";

  // скрыть чат при переходах
  closeChat();

  // особые действия
  if(name === "share"){
    shareLink.value = location.href;
    copyStatus.textContent = "";
  }
  if(name === "lobby"){
    // ничего
  }
  if(name === "duel"){
    // ничего
  }
}

btnBack.addEventListener("click", () => {
  if(currentScreen === "home"){
    // “закрыть” — просто остаёмся
    return;
  }
  // возвращаемся на home
  navStack = ["home"];
  showScreen("home", false);
});

/* клики по кнопкам data-nav */
$$("[data-nav]").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.nav;
    if(target) showScreen(target);
  });
});

/* ============ ЧАТ ============ */
function openChat(){
  chatOverlay.classList.add("isOpen");
  chatOverlay.setAttribute("aria-hidden","false");
}
function closeChat(){
  chatOverlay.classList.remove("isOpen");
  chatOverlay.setAttribute("aria-hidden","true");
}
btnChat.addEventListener("click", () => {
  if(chatOverlay.classList.contains("isOpen")) closeChat();
  else openChat();
});
btnChatClose.addEventListener("click", closeChat);

btnSend.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter") sendChat();
});
function sendChat(){
  const txt = chatInput.value.trim();
  if(!txt) return;
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>me:</b> ${escapeHtml(txt)}`;
  chatBody.appendChild(div);
  chatInput.value = "";
  // небольшой “ответ”
  setTimeout(() => {
    const r = document.createElement("div");
    r.className = "msg";
    r.innerHTML = `<b>user${rand(1,12)}:</b> ок 👍`;
    chatBody.appendChild(r);
  }, 300);
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/* ============ Поделиться ============ */
btnCopy?.addEventListener("click", async () => {
  try{
    await navigator.clipboard.writeText(shareLink.value);
    copyStatus.textContent = "Ссылка скопирована ✅";
  }catch{
    copyStatus.textContent = "Не удалось скопировать (в браузере нет доступа).";
  }
});

/* ============ Лейблы (А..К и 1..10) ============ */
function renderLabels(topEl, leftEl){
  if(topEl){
    topEl.innerHTML = "";
    for(let i=1;i<=10;i++){
      const d = document.createElement("div");
      d.textContent = i;
      topEl.appendChild(d);
    }
  }
  if(leftEl){
    leftEl.innerHTML = "";
    letters.forEach(l => {
      const d = document.createElement("div");
      d.textContent = l;
      leftEl.appendChild(d);
    });
  }
}
renderLabels($("#labelsTop"), $("#labelsLeft"));
renderLabels($("#labelsTop2"), $("#labelsLeft2"));
renderLabels($("#labelsTop3"), $("#labelsLeft3"));

/* ============ Поля (отрисовка клеток) ============ */
function buildBoard(el, onCellClick){
  el.innerHTML = "";
  for(let r=0;r<10;r++){
    for(let c=0;c<10;c++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.addEventListener("click", () => onCellClick?.(r,c,cell));
      el.appendChild(cell);
    }
  }
}
buildBoard(myBoard, onPlaceClick);
buildBoard(duelMyBoard, null);
buildBoard(duelEnemyBoard, onEnemyShot);

/* ============ Флот UI ============ */
function shipTitle(len){
  if(len===4) return "4-палубный";
  if(len===3) return "3-палубный";
  if(len===2) return "2-палубный";
  return "1-палубный";
}
function renderFleet(){
  fleetEl.innerHTML = "";
  fleet.forEach((s, idx) => {
    const card = document.createElement("div");
    card.className = "shipCard" + (idx===selectedShipIdx ? " isSelected":"");
    if(s.placed) card.style.opacity = "0.45";

    const dots = document.createElement("div");
    dots.className = "shipDots";
    for(let i=0;i<s.len;i++){
      const sp = document.createElement("span");
      dots.appendChild(sp);
    }

    const name = document.createElement("div");
    name.className = "shipName";
    name.textContent = shipTitle(s.len);

    card.appendChild(dots);
    card.appendChild(name);

    card.addEventListener("click", () => {
      selectedShipIdx = idx;
      renderFleet();
    });

    fleetEl.appendChild(card);
  });
}
renderFleet();

/* ============ Поворот ============ */
btnRotate.addEventListener("click", () => {
  rotation = (rotation === "H") ? "V" : "H";
  rotTxt.textContent = (rotation === "H") ? "Гориз." : "Вертик.";
});

/* ============ Расстановка (упрощённо, но выглядит) ============ */
function onPlaceClick(r,c){
  const ship = fleet[selectedShipIdx];
  if(!ship || ship.placed) return;

  const cells = [];
  for(let i=0;i<ship.len;i++){
    const rr = rotation==="H" ? r : r+i;
    const cc = rotation==="H" ? c+i : c;
    if(rr<0||rr>=10||cc<0||cc>=10) return;
    if(myGrid[rr][cc] === 1) return;
    cells.push([rr,cc]);
  }
  // ставим
  cells.forEach(([rr,cc]) => myGrid[rr][cc] = 1);
  ship.placed = true;

  renderMyBoard();
  renderFleet();
  updateStartEnabled();
}

function renderMyBoard(){
  const cells = $$(".cell", myBoard);
  cells.forEach(cell => {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    cell.classList.toggle("ship", myGrid[r][c] === 1);
  });
}

function updateStartEnabled(){
  const ok = fleet.every(s => s.placed);
  btnStartLobby.disabled = !ok;
}

btnStartLobby.addEventListener("click", () => {
  // переносим расстановку в 1x1 (твоё поле)
  duelMyGrid = myGrid.map(row => row.slice());
  renderDuelBoards();
  showScreen("lobby");
});

btnBackToPlacement?.addEventListener("click", () => showScreen("placement"));

/* ============ ЛОББИ (user1..user12) ============ */
function renderPlayers(){
  playersGrid.innerHTML = "";
  for(let i=1;i<=12;i++){
    const name = `user${i}`;
    const ping = rand(78, 99);

    const card = document.createElement("div");
    card.className = "playerCard";
    card.innerHTML = `
      <div class="playerTop">
        <div class="playerName">${name}</div>
        <div class="playerPing">${ping}%</div>
      </div>
      <div class="playerBar"><div style="width:${ping}%"></div></div>
      <div class="hintMini">нажми → 1×1</div>
    `;

    card.addEventListener("click", () => {
      enemyNameEl.textContent = name;
      showScreen("duel");
    });

    playersGrid.appendChild(card);
  }
}
renderPlayers();

/* ============ 1×1 (макет выстрела) ============ */
function renderDuelBoards(){
  // моё поле показывает корабли (из расстановки)
  const myCells = $$(".cell", duelMyBoard);
  myCells.forEach(cell => {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    cell.classList.toggle("ship", duelMyGrid[r][c] === 1);
    cell.classList.remove("hit","miss");
  });

  // поле противника (пустое, выстрелы как UI)
  const enCells = $$(".cell", duelEnemyBoard);
  enCells.forEach(cell => {
    const r = +cell.dataset.r;
    const c = +cell.dataset.c;
    cell.classList.remove("ship");
    cell.classList.toggle("hit", duelEnemyGrid[r][c] === 3);
    cell.classList.toggle("miss", duelEnemyGrid[r][c] === 2);
  });
}

function onEnemyShot(r,c){
  if(duelEnemyGrid[r][c] !== 0) return;
  // макет: случайно попал/мимо
  const hit = Math.random() < 0.28;
  duelEnemyGrid[r][c] = hit ? 3 : 2;
  renderDuelBoards();
}

btnMockShot?.addEventListener("click", () => {
  // сделать случайный выстрел
  const free = [];
  for(let r=0;r<10;r++){
    for(let c=0;c<10;c++){
      if(duelEnemyGrid[r][c] === 0) free.push([r,c]);
    }
  }
  if(!free.length) return;
  const [r,c] = free[rand(0, free.length-1)];
  onEnemyShot(r,c);
});

btnLeaveDuel?.addEventListener("click", () => showScreen("lobby"));

/* ============ Настройки темы ============ */
themePaper?.addEventListener("click", () => {
  document.body.classList.add("theme-paper");
  document.body.classList.remove("theme-dark");
  themePaper.classList.add("isOn");
  themeDark.classList.remove("isOn");
});
themeDark?.addEventListener("click", () => {
  document.body.classList.add("theme-dark");
  document.body.classList.remove("theme-paper");
  themeDark.classList.add("isOn");
  themePaper.classList.remove("isOn");
});

/* ============ Авто-масштаб под экран (ВАЖНО: без прокрутки) ============ */
function fitStage(){
  const topbarH = $(".topbar").getBoundingClientRect().height;
  const vw = window.innerWidth;
  const vh = window.innerHeight - topbarH;

  const stageW = 980;
  const stageH = 620;

  // запас под отступы
  const padding = 18;
  const availW = Math.max(200, vw - padding*2);
  const availH = Math.max(200, vh - padding*2);

  // масштаб так, чтобы всё точно влезло
  let s = Math.min(availW / stageW, availH / stageH);

  // чуть “поджимаем” на очень маленьких экранах
  s = Math.max(0.45, Math.min(1.0, s));

  document.documentElement.style.setProperty("--uiScale", s.toFixed(4));
}
window.addEventListener("resize", fitStage);
fitStage();

/* ============ Инициализация переходов с Home кнопок ============ */
$$("[data-nav='placement']").forEach(b => b.addEventListener("click", () => {
  // reset для наглядности
  resetPlacement();
  showScreen("placement");
}));

function resetPlacement(){
  rotation = "H";
  rotTxt.textContent = "Гориз.";
  selectedShipIdx = 0;

  myGrid = makeEmptyGrid();
  fleet.forEach(s => s.placed = false);
  renderMyBoard();
  renderFleet();
  updateStartEnabled();

  // очистка дуэли
  duelEnemyGrid = makeEmptyGrid();
  renderDuelBoards();
}

/* ============ helpers ============ */
function rand(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

/* стартовый экран */
showScreen("home", false);