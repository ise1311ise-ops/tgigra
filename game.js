/* ========= helpers ========= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ROUTES = {
  home: "screen-home",
  setup: "screen-setup",
  lobby: "screen-lobby",
  match: "screen-match",
  settings: "screen-settings",
  share: "screen-share",
  support: "screen-support",
};

let historyStack = ["home"];

function setTopTitle(txt){
  $("#topTitle").textContent = txt;
}

function showScreen(route, push=true){
  const id = ROUTES[route];
  if(!id) return;

  $$(".screen").forEach(s => s.classList.remove("active"));
  $("#"+id).classList.add("active");

  if(route === "home") setTopTitle("Морской Бой — онлайн игра");
  if(route === "setup") setTopTitle("Расстановка");
  if(route === "lobby") setTopTitle("Игровой зал");
  if(route === "match") setTopTitle("Бой 1x1");
  if(route === "settings") setTopTitle("Настройки");
  if(route === "share") setTopTitle("Поделиться");
  if(route === "support") setTopTitle("Поддержка");

  if(push){
    const last = historyStack[historyStack.length-1];
    if(last !== route) historyStack.push(route);
  }

  closeLobbyChat();
  closeMatchChat();

  requestAnimationFrame(fitStage);
}

function navBack(){
  if(historyStack.length > 1) historyStack.pop();
  const route = historyStack[historyStack.length-1] || "home";
  showScreen(route, false);
}

/* ========= FIX: stage fit under topbar (no overlap) ========= */
function fitStage(){
  const stage = document.getElementById("stage");
  const stageWrap = document.getElementById("stageWrap");

  const topbar = document.querySelector(".topbar");
  const topbarRect = topbar.getBoundingClientRect();
  const topbarH = topbarRect.height;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // safe area (iOS etc)
  const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("env(safe-area-inset-top)") || "0") || 0;

  const availW = Math.max(200, vw - 32);
  // IMPORTANT: remove topbar height + small margin so nothing gets covered
  const availH = Math.max(200, (vh - topbarH) - 28);

  const stageW = 980;
  const stageH = 620;

  let s = Math.min(availW / stageW, availH / stageH);
  s = Math.max(0.45, Math.min(1.0, s));

  stage.style.transform = `scale(${s})`;
  stage.style.transformOrigin = "top left";

  stageWrap.style.width = `${Math.round(stageW * s)}px`;
  stageWrap.style.height = `${Math.round(stageH * s)}px`;
}

/* ========= Setup board ========= */
const letters = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];

let rotateHorizontal = true;

// ВАЖНО: теперь выбран не “длина”, а конкретный корабль из списка (уникальный)
let selectedShipId = null;

const fleetList = [
  {id:"s4",  len:4, name:"4-палубный"},
  {id:"s3a", len:3, name:"3-палубный"},
  {id:"s3b", len:3, name:"3-палубный"},
  {id:"s2a", len:2, name:"2-палубный"},
  {id:"s2b", len:2, name:"2-палубный"},
  {id:"s2c", len:2, name:"2-палубный"},
  {id:"s1a", len:1, name:"1-палубный"},
  {id:"s1b", len:1, name:"1-палубный"},
  {id:"s1c", len:1, name:"1-палубный"},
  {id:"s1d", len:1, name:"1-палубный"},
];

// placedShips: shipId -> {cells, len}
let placedShips = new Map();

// occupied cell set
let occupied = new Set();
// blocked (neighbors)
let blocked = new Set();

function buildAxes(){
  const top = $("#axisTop");
  const left = $("#axisLeft");
  top.innerHTML = "";
  left.innerHTML = "";
  for(let i=1;i<=10;i++){
    const d=document.createElement("div");
    d.textContent = i;
    top.appendChild(d);
  }
  for(let i=0;i<10;i++){
    const d=document.createElement("div");
    d.textContent = letters[i];
    left.appendChild(d);
  }
}

function buildBoard(){
  const b = $("#myBoard");
  b.innerHTML = "";
  for(let i=0;i<100;i++){
    const c = document.createElement("div");
    c.className = "cell";
    c.dataset.idx = String(i);
    c.addEventListener("click", () => tryPlaceSelected(i));
    b.appendChild(c);
  }
}

function idxToRC(idx){ return [Math.floor(idx/10), idx%10]; }
function rcToIdx(r,c){ return r*10+c; }
function inBounds(r,c){ return r>=0 && r<10 && c>=0 && c<10; }

function neighborsOf(idx){
  const [r,c] = idxToRC(idx);
  const n = [];
  for(let dr=-1; dr<=1; dr++){
    for(let dc=-1; dc<=1; dc++){
      const rr=r+dr, cc=c+dc;
      if(inBounds(rr,cc)) n.push(rcToIdx(rr,cc));
    }
  }
  return n;
}

function computeShipCells(startIdx, len, horiz){
  const [r,c]=idxToRC(startIdx);
  const cells=[];
  for(let k=0;k<len;k++){
    const rr = r + (horiz?0:k);
    const cc = c + (horiz?k:0);
    if(!inBounds(rr,cc)) return null;
    cells.push(rcToIdx(rr,cc));
  }
  return cells;
}

function canPlace(cells){
  for(const idx of cells){
    if(occupied.has(idx)) return false;
    if(blocked.has(idx)) return false;
  }
  return true;
}

function recomputeBlocked(){
  blocked = new Set();
  // block neighbors around ALL occupied
  occupied.forEach(i=>{
    neighborsOf(i).forEach(n=>blocked.add(n));
  });
}

function renderBoard(){
  $$("#myBoard .cell").forEach(el=>{
    el.classList.remove("ship","bad");
  });

  // paint blocked
  blocked.forEach(idx=>{
    const el = $(`#myBoard .cell[data-idx="${idx}"]`);
    if(el && !occupied.has(idx)) el.classList.add("bad");
  });

  // paint ships
  occupied.forEach(idx=>{
    const el = $(`#myBoard .cell[data-idx="${idx}"]`);
    if(el) el.classList.add("ship");
  });
}

function buildFleet(){
  const wrap = $("#fleet");
  wrap.innerHTML = "";

  fleetList.forEach((s, i)=>{
    const card = document.createElement("div");
    card.className = "shipCard";
    card.dataset.id = s.id;

    const dots = document.createElement("div");
    dots.className = "shipDots";
    for(let k=0;k<s.len;k++){
      const d=document.createElement("span");
      dots.appendChild(d);
    }

    const name = document.createElement("div");
    name.className = "shipName";
    name.textContent = s.name;

    card.appendChild(dots);
    card.appendChild(name);

    card.addEventListener("click", ()=>{
      if(card.classList.contains("disabled")) return;
      selectShipCard(s.id);
    });

    wrap.appendChild(card);
  });

  // default select first available
  selectFirstAvailableShip();
  updateFleetDisabled();
}

function selectShipCard(id){
  selectedShipId = id;
  $$("#fleet .shipCard").forEach(x=>x.classList.remove("active"));
  const el = $(`#fleet .shipCard[data-id="${id}"]`);
  if(el) el.classList.add("active");
}

function selectFirstAvailableShip(){
  const next = fleetList.find(s => !placedShips.has(s.id));
  if(next) selectShipCard(next.id);
  else selectedShipId = null;
}

function updateFleetDisabled(){
  $$("#fleet .shipCard").forEach(el=>{
    const id = el.dataset.id;
    if(placedShips.has(id)) el.classList.add("disabled");
    else el.classList.remove("disabled");
  });

  // if selected is now placed, move selection
  if(selectedShipId && placedShips.has(selectedShipId)){
    selectFirstAvailableShip();
  }
}

function tryPlaceSelected(startIdx){
  if(!selectedShipId) return;

  // if already placed, ignore
  if(placedShips.has(selectedShipId)) {
    selectFirstAvailableShip();
    return;
  }

  const ship = fleetList.find(s=>s.id===selectedShipId);
  if(!ship) return;

  const cells = computeShipCells(startIdx, ship.len, rotateHorizontal);
  if(!cells) return;
  if(!canPlace(cells)) return;

  // place: mark occupied
  cells.forEach(i=>occupied.add(i));
  placedShips.set(selectedShipId, {cells, len: ship.len});

  recomputeBlocked();
  renderBoard();

  // disable used ship + auto select next
  updateFleetDisabled();
  selectFirstAvailableShip();
}

function resetSetup(){
  placedShips = new Map();
  occupied = new Set();
  blocked = new Set();
  renderBoard();
  updateFleetDisabled();
  selectFirstAvailableShip();
}

// simple “auto” (respect rules & counts)
function autoSetup(){
  resetSetup();

  // random placement attempts
  const allIds = fleetList.map(s=>s.id);

  for(const id of allIds){
    const ship = fleetList.find(s=>s.id===id);
    let placed = false;

    for(let tries=0; tries<400 && !placed; tries++){
      const horiz = Math.random() < 0.5;
      const idx = Math.floor(Math.random()*100);
      const cells = computeShipCells(idx, ship.len, horiz);
      if(!cells) continue;
      if(!canPlace(cells)) continue;

      cells.forEach(i=>occupied.add(i));
      placedShips.set(id, {cells, len: ship.len});
      recomputeBlocked();
      placed = true;
    }
  }

  renderBoard();
  updateFleetDisabled();
  selectFirstAvailableShip();
}

/* ========= Lobby / chat ========= */
const onlineUsers = Array.from({length: 12}, (_,i)=>`user${i+1}`);

function buildPlayers(){
  const p = $("#players");
  p.innerHTML = "";
  onlineUsers.forEach((nick, i)=>{
    const card = document.createElement("div");
    card.className = "playerCard";
    card.innerHTML = `
      <div class="playerNick">${nick}</div>
      <div class="playerPing">${92 + (i%7)}%</div>
    `;
    card.addEventListener("click", ()=>{
      startMatch(nick);
    });
    p.appendChild(card);
  });

  $("#onlineCount").textContent = String(onlineUsers.length);
}

function pushChatMsg(box, who, text){
  const m = document.createElement("div");
  m.className = "msg";
  m.innerHTML = `<span class="who">${who}</span>${escapeHtml(text)}`;
  box.appendChild(m);
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function openLobbyChat(){
  $("#chat").classList.add("open");
  $("#btnChat").style.display="none";
  $("#btnHideChat").style.display="";
}
function closeLobbyChat(){
  $("#chat").classList.remove("open");
  $("#btnChat").style.display="";
  $("#btnHideChat").style.display="none";
}

/* ========= Match ========= */
function buildMiniBoards(){
  const b1=$("#p1Board"), b2=$("#p2Board");
  b1.innerHTML=""; b2.innerHTML="";
  for(let i=0;i<100;i++){
    const c1=document.createElement("div");
    c1.className="mcell";
    b1.appendChild(c1);

    const c2=document.createElement("div");
    c2.className="mcell";
    c2.addEventListener("click", ()=>{
      if(c2.classList.contains("hit") || c2.classList.contains("miss")) return;
      Math.random() < 0.25 ? c2.classList.add("hit") : c2.classList.add("miss");
    });
    b2.appendChild(c2);
  }
}

function startMatch(enemy){
  $("#enemyNick").textContent = enemy;
  buildMiniBoards();
  showScreen("match");
}

function openMatchChat(){
  $("#matchChat").classList.add("open");
}
function closeMatchChat(){
  $("#matchChat").classList.remove("open");
}

/* ========= wiring ========= */
function init(){
  $("#btnBack").addEventListener("click", ()=>{
    const cur = historyStack[historyStack.length-1];
    if(cur==="home") return;
    navBack();
  });

  $("#btnMenu").addEventListener("click", ()=>{
    showScreen("home");
    historyStack = ["home"];
  });

  $$("[data-nav='back']").forEach(b=>b.addEventListener("click", navBack));

  $("#goOnline").addEventListener("click", ()=> showScreen("setup"));
  $("#goSettings").addEventListener("click", ()=> showScreen("settings"));
  $("#goShare").addEventListener("click", ()=> showScreen("share"));
  $("#goSupport").addEventListener("click", ()=> showScreen("support"));

  $("#shareLink").value = location.href;
  $("#copyLink").addEventListener("click", async ()=>{
    $("#copyStatus").textContent = "";
    try{
      await navigator.clipboard.writeText(location.href);
      $("#copyStatus").textContent = "Скопировано!";
    }catch(e){
      $("#copyStatus").textContent = "Не удалось скопировать (разрешения браузера).";
    }
  });

  $("#btnRotate").addEventListener("click", ()=>{
    rotateHorizontal = !rotateHorizontal;
    $("#rotLabel").textContent = rotateHorizontal ? "Гориз." : "Вертик.";
  });

  $("#btnAuto").addEventListener("click", autoSetup);

  $("#btnSetupDone").addEventListener("click", ()=>{
    // можно запретить переход, пока не все корабли стоят
    if(placedShips.size !== fleetList.length){
      // мягко: просто не пускаем
      alert("Поставь все корабли, чтобы начать.");
      return;
    }

    buildPlayers();
    const msgs = $("#chatMsgs");
    msgs.innerHTML="";
    pushChatMsg(msgs,"user3","привет всем 👋");
    pushChatMsg(msgs,"user7","кто в бой 1х1?");
    pushChatMsg(msgs,"user2","го!");
    showScreen("lobby");
  });

  $("#btnChat").addEventListener("click", openLobbyChat);
  $("#btnHideChat").addEventListener("click", closeLobbyChat);
  $("#btnChatClose").addEventListener("click", closeLobbyChat);

  $("#chatSend").addEventListener("click", ()=>{
    const t=$("#chatText");
    if(!t.value.trim()) return;
    pushChatMsg($("#chatMsgs"), "you", t.value.trim());
    t.value="";
  });
  $("#chatText").addEventListener("keydown", (e)=>{
    if(e.key==="Enter") $("#chatSend").click();
  });

  $("#btnSurrender").addEventListener("click", ()=> showScreen("lobby"));
  $("#btnMatchChat").addEventListener("click", openMatchChat);
  $("#btnMatchChatClose").addEventListener("click", closeMatchChat);

  $("#matchChatSend").addEventListener("click", ()=>{
    const t=$("#matchChatText");
    if(!t.value.trim()) return;
    pushChatMsg($("#matchChatMsgs"), "you", t.value.trim());
    t.value="";
  });
  $("#matchChatText").addEventListener("keydown", (e)=>{
    if(e.key==="Enter") $("#matchChatSend").click();
  });

  buildAxes();
  buildBoard();
  buildFleet();

  showScreen("home", false);

  fitStage();
  window.addEventListener("resize", fitStage);
}

document.addEventListener("DOMContentLoaded", init);