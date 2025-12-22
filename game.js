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

  // top title per route
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

  // close chats when switching
  closeLobbyChat();
  closeMatchChat();

  // refit after layout changes
  requestAnimationFrame(fitStage);
}

function navBack(){
  if(historyStack.length > 1) historyStack.pop();
  const route = historyStack[historyStack.length-1] || "home";
  showScreen(route, false);
}

function fitStage(){
  const stage = document.getElementById("stage");
  const stageWrap = document.getElementById("stageWrap");

  const topbarH = document.querySelector(".topbar").getBoundingClientRect().height;

  const vw = window.innerWidth;
  const vh = window.innerHeight - topbarH;

  const stageW = 980;
  const stageH = 620;

  const padding = 16;
  const availW = Math.max(200, vw - padding*2);
  const availH = Math.max(200, vh - padding*2);

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
let selectedShipLen = 4;

const fleetList = [
  {len:4, name:"4-палубный"},
  {len:3, name:"3-палубный"},
  {len:3, name:"3-палубный"},
  {len:2, name:"2-палубный"},
  {len:2, name:"2-палубный"},
  {len:2, name:"2-палубный"},
  {len:1, name:"1-палубный"},
  {len:1, name:"1-палубный"},
  {len:1, name:"1-палубный"},
  {len:1, name:"1-палубный"},
];

let myShips = []; // placed ships [{cells:[idx...], len}]
let occupied = new Set(); // idx
let blocked = new Set();  // idx (neighbors)

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
    c.addEventListener("click", () => tryPlaceShip(i));
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

function place(cells, len){
  cells.forEach(i=>occupied.add(i));
  // block neighbors
  cells.forEach(i=>neighborsOf(i).forEach(n=>blocked.add(n)));

  myShips.push({cells, len});
  renderBoard();
}

function renderBoard(){
  // clear
  $$("#myBoard .cell").forEach(el=>{
    el.classList.remove("ship","bad");
  });

  // paint blocked (red dots style)
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
    card.className = "shipCard" + (i===0 ? " active" : "");
    card.dataset.len = String(s.len);
    card.dataset.i = String(i);

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
      $$("#fleet .shipCard").forEach(x=>x.classList.remove("active"));
      card.classList.add("active");
      selectedShipLen = s.len;
    });

    wrap.appendChild(card);
  });
}

function tryPlaceShip(startIdx){
  // limit: allow placing up to fleet composition (simple, UI макет)
  // if want strict counts: we can decrement by len from fleetList
  const cells = computeShipCells(startIdx, selectedShipLen, rotateHorizontal);
  if(!cells) return;
  if(!canPlace(cells)) return;

  place(cells, selectedShipLen);

  // auto move selection to next available in list (UI)
  const next = fleetList.find(f=> f.len===selectedShipLen && false);
}

function resetSetup(){
  myShips = [];
  occupied = new Set();
  blocked = new Set();
  renderBoard();
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
      // clicking yourself? still ok in mock
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
      // random visual result
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
  // nav buttons
  $("#btnBack").addEventListener("click", ()=>{
    // home: close app style (stay home)
    const cur = historyStack[historyStack.length-1];
    if(cur==="home") return; // nothing
    navBack();
  });

  $("#btnMenu").addEventListener("click", ()=>{
    // simple: go home
    showScreen("home");
    historyStack = ["home"];
  });

  $$("[data-nav='back']").forEach(b=>b.addEventListener("click", navBack));

  // home buttons
  $("#goOnline").addEventListener("click", ()=> showScreen("setup"));
  $("#goSettings").addEventListener("click", ()=> showScreen("settings"));
  $("#goShare").addEventListener("click", ()=> showScreen("share"));
  $("#goSupport").addEventListener("click", ()=> showScreen("support"));

  // share
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

  // setup controls
  $("#btnRotate").addEventListener("click", ()=>{
    rotateHorizontal = !rotateHorizontal;
    $("#rotLabel").textContent = rotateHorizontal ? "Гориз." : "Вертик.";
  });
  $("#btnAuto").addEventListener("click", ()=>{
    // макет: просто reset + небольшая "авто-раскладка" для вида
    resetSetup();
    // very simple preset for visuals
    const presets = [
      {idx: 0, len:4, h:true},
      {idx: 20, len:3, h:false},
      {idx: 44, len:3, h:true},
      {idx: 77, len:2, h:true},
      {idx: 61, len:2, h:false},
      {idx: 13, len:2, h:true},
      {idx: 96, len:1, h:true},
      {idx: 58, len:1, h:true},
      {idx: 89, len:1, h:true},
      {idx: 35, len:1, h:true},
    ];
    presets.forEach(p=>{
      const cells = computeShipCells(p.idx,p.len,p.h);
      if(cells && canPlace(cells)) place(cells,p.len);
    });
  });

  $("#btnSetupDone").addEventListener("click", ()=>{
    // переход в зал
    buildPlayers();
    // seed chat
    const msgs = $("#chatMsgs");
    msgs.innerHTML="";
    pushChatMsg(msgs,"user3","привет всем 👋");
    pushChatMsg(msgs,"user7","кто в бой 1х1?");
    pushChatMsg(msgs,"user2","го!");
    showScreen("lobby");
  });

  // lobby chat
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

  // match controls
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

  // setup init
  buildAxes();
  buildBoard();
  buildFleet();

  // default screen
  showScreen("home", false);

  // scaling
  fitStage();
  window.addEventListener("resize", fitStage);
}

document.addEventListener("DOMContentLoaded", init);