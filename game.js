/* ========= helpers ========= */
const $ = (id) => document.getElementById(id);

function showToast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.remove("hidden");
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => t.classList.add("hidden"), 1800);
}

function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").classList.remove("hidden");
}
function closeModal() {
  $("modal").classList.add("hidden");
}

/* ========= screens ========= */
const screenMenu = $("screenMenu");
const screenPlacement = $("screenPlacement");
const screenLobby = $("screenLobby");

function goScreen(name) {
  screenMenu.classList.toggle("hidden", name !== "menu");
  screenPlacement.classList.toggle("hidden", name !== "placement");
  screenLobby.classList.toggle("hidden", name !== "lobby");
}

/* ========= placement state ========= */
const SIZE = 10;
const LETTERS = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];
const SHIP_SET = [4,3,3,2,2,2,1,1,1,1];

let orientation = "H"; // H / V
let selectedTokenId = null;
let board = []; // 10x10 {shipId|null}
let placedShips = new Map(); // shipId -> {len, cells:[{r,c}]}

function resetPlacement() {
  orientation = "H";
  selectedTokenId = null;
  placedShips.clear();
  board = Array.from({length: SIZE}, () => Array.from({length: SIZE}, () => null));

  renderAxis();
  buildGrid();
  buildFleet();
  updateRotateBtn();
  updateStartBtn();
}

function renderAxis() {
  const top = $("axisTop");
  const left = $("axisLeft");
  top.innerHTML = "";
  left.innerHTML = "";
  for (let i=1;i<=10;i++){
    const d = document.createElement("div");
    d.textContent = String(i);
    top.appendChild(d);
  }
  for (let i=0;i<10;i++){
    const d = document.createElement("div");
    d.textContent = LETTERS[i];
    left.appendChild(d);
  }
}

function buildGrid() {
  const grid = $("playerGrid");
  grid.innerHTML = "";
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.addEventListener("click", onGridTap);
      grid.appendChild(cell);
    }
  }
  redrawBoard();
}

function buildFleet() {
  const fleet = $("fleet");
  fleet.innerHTML = "";

  SHIP_SET.forEach((len, idx) => {
    const shipId = `ship_${idx}_${len}`;
    const token = document.createElement("div");
    token.className = "shipToken";
    token.dataset.shipId = shipId;
    token.dataset.len = String(len);

    const mini = document.createElement("div");
    mini.className = "shipMini";
    for (let i=0;i<len;i++){
      const s = document.createElement("div");
      s.className = "shipSeg";
      mini.appendChild(s);
    }

    const label = document.createElement("div");
    label.className = "shipLabel";
    label.textContent = `${len}`;

    token.appendChild(mini);
    token.appendChild(label);

    token.addEventListener("click", () => {
      if (token.classList.contains("placed")) return;
      document.querySelectorAll(".shipToken").forEach(x => x.classList.remove("active"));
      token.classList.add("active");
      selectedTokenId = shipId;
      showToast(`Выбран корабль: ${len}`);
    });

    fleet.appendChild(token);
  });
}

function updateRotateBtn() {
  $("btnRotate").textContent = `Повернуть (${orientation === "H" ? "гориз." : "верт."})`;
}
function updateStartBtn() {
  const allPlaced = placedShips.size === SHIP_SET.length;
  $("btnStart").disabled = !allPlaced;
}

/* ===== placement rules (no touch) ===== */
function inBounds(r,c){return r>=0 && r<SIZE && c>=0 && c<SIZE;}

function canPlace(len, r, c, orient) {
  const cells = [];
  for (let i=0;i<len;i++){
    const rr = orient==="H" ? r : r+i;
    const cc = orient==="H" ? c+i : c;
    if (!inBounds(rr,cc)) return {ok:false, cells:[]};
    if (board[rr][cc] !== null) return {ok:false, cells:[]};
    cells.push({r:rr,c:cc});
  }

  // check adjacency including diagonals
  for (const p of cells){
    for (let dr=-1; dr<=1; dr++){
      for (let dc=-1; dc<=1; dc++){
        const rr = p.r + dr;
        const cc = p.c + dc;
        if (!inBounds(rr,cc)) continue;
        if (board[rr][cc] !== null) {
          // allow if it's one of cells (shouldn't happen because empty check above)
          return {ok:false, cells:[]};
        }
      }
    }
  }

  return {ok:true, cells};
}

function onGridTap(e) {
  const cell = e.currentTarget;
  const r = Number(cell.dataset.r);
  const c = Number(cell.dataset.c);

  if (!selectedTokenId) {
    showToast("Сначала выбери корабль справа");
    return;
  }

  const token = document.querySelector(`.shipToken[data-ship-id="${selectedTokenId}"]`);
  if (!token || token.classList.contains("placed")) return;

  const len = Number(token.dataset.len);
  const res = canPlace(len, r, c, orientation);
  if (!res.ok) {
    flashInvalid(res.cells.length ? res.cells : [{r,c}]);
    showToast("Нельзя поставить сюда");
    return;
  }

  // place
  for (const p of res.cells) board[p.r][p.c] = selectedTokenId;
  placedShips.set(selectedTokenId, {len, cells: res.cells});

  token.classList.add("placed");
  token.classList.remove("active");
  selectedTokenId = null;

  redrawBoard();
  updateStartBtn();
  showToast("Корабль поставлен");
}

function flashInvalid(cells) {
  const grid = $("playerGrid");
  for (const p of cells){
    const idx = p.r*SIZE + p.c;
    const el = grid.children[idx];
    if (!el) continue;
    el.classList.add("invalid");
    setTimeout(() => el.classList.remove("invalid"), 260);
  }
}

function redrawBoard() {
  const grid = $("playerGrid");
  // reset classes
  for (let i=0;i<grid.children.length;i++){
    const el = grid.children[i];
    el.className = "cell";
  }

  // draw ships with rounded ends
  for (const [shipId, ship] of placedShips.entries()){
    const {len, cells} = ship;
    const orient = (len === 1) ? "H" : (cells[0].r === cells[1]?.r ? "H" : "V");
    cells.forEach((p, i) => {
      const idx = p.r*SIZE + p.c;
      const el = grid.children[idx];
      el.classList.add("ship");
      el.classList.add("shipDot");

      if (len === 1) return;

      if (orient === "H") {
        if (i === 0) el.classList.add("shipStartH");
        if (i === len-1) el.classList.add("shipEndH");
      } else {
        if (i === 0) el.classList.add("shipStartV");
        if (i === len-1) el.classList.add("shipEndV");
      }
    });
  }
}

/* ========= lobby mock ========= */
const roomData = [
  {name:"Дезире", ping:"98%", plane:true},
  {name:"крым1962россия", ping:"93%", plane:true},
  {name:"Брюнетка", ping:"92%", plane:true},
  {name:"*Васяня64*", ping:"98%", plane:false},
  {name:"Даниил Семенюк", ping:"81%", plane:false},
  {name:"Джейн Доу", ping:"98%", plane:false},
  {name:"Малая07 Б/А", ping:"98%", plane:true},
  {name:"Лекарь", ping:"94%", plane:false},
  {name:"ИНТЕРСТЕЛЛАР Б/А", ping:"89%", plane:true},
];

let chat = [
  {nick:"penelope", avatar:"🏴‍☠️", text:"у меня новая тактика — принятие 😂😂😂"},
  {nick:"ЕНОТИК*", avatar:"🦔", text:"СИНИЙ НОС, НИЧЕГО"},
  {nick:"СИНИЙ НОС", avatar:"🎩", text:"свернуть? да ок!"},
  {nick:"penelope", avatar:"🏴‍☠️", text:"0:1"},
];

function buildLobby() {
  $("onlineCount").textContent = "онлайн: 96%";

  const list = $("roomList");
  list.innerHTML = "";
  roomData.forEach((r) => {
    const card = document.createElement("div");
    card.className = "roomCard";
    card.innerHTML = `
      <div class="roomName">${escapeHtml(r.name)}</div>
      <div class="roomMeta">
        <div>${escapeHtml(r.ping)}</div>
        <div class="roomFlag" aria-hidden="true"></div>
      </div>
      ${r.plane ? `<div class="roomAir">✈</div>` : ``}
    `;
    card.addEventListener("click", () => {
      showToast(`Комната «${r.name}» (онлайн подключим позже)`);
    });
    list.appendChild(card);
  });

  renderChat();
}

function renderChat() {
  const body = $("chatBody");
  body.innerHTML = "";
  chat.forEach((m) => {
    const el = document.createElement("div");
    el.className = "msg";
    el.innerHTML = `
      <div class="avatar">${escapeHtml(m.avatar)}</div>
      <div class="msgBody">
        <div class="msgTop">
          <div class="nick">${escapeHtml(m.nick)}</div>
          <div class="time">${nowTime()}</div>
        </div>
        <div class="text">${escapeHtml(m.text)}</div>
      </div>
    `;
    body.appendChild(el);
  });
  body.scrollTop = body.scrollHeight;
}

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,"0");
  const mm = String(d.getMinutes()).padStart(2,"0");
  return `${hh}:${mm}`;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ========= wiring ========= */
window.addEventListener("load", () => {
  // menu
  $("btnOnline").addEventListener("click", () => {
    resetPlacement();
    goScreen("placement");
    showToast("Расставь флот");
  });

  $("btnSettings").addEventListener("click", () => {
    openModal("Настройки", `
      <div style="display:grid;gap:10px">
        <label><input type="checkbox" checked> Звук</label>
        <label><input type="checkbox" checked> Подсказки</label>
        <label><input type="checkbox"> Тёмный режим (потом)</label>
        <div style="opacity:.7;font-size:12px">Сами настройки применим позже — сейчас это экран.</div>
      </div>
    `);
  });

  $("btnShare").addEventListener("click", async () => {
    const url = location.href;
    try{
      await navigator.clipboard.writeText(url);
      showToast("Ссылка скопирована");
    }catch{
      openModal("Поделиться", `Скопируй ссылку вручную:<br><br><b>${escapeHtml(url)}</b>`);
    }
  });

  $("btnSupport").addEventListener("click", () => {
    openModal("Поддержка", `
      <b>Как играть:</b><br>
      1) Выбери корабль справа<br>
      2) Поставь на поле (корабли не касаются даже по диагонали)<br>
      3) Нажми «Старт» → попадёшь в игровой зал<br><br>
      <span style="opacity:.75">Онлайн-часть подключим позже (сервер/WS).</span>
    `);
  });

  // placement controls
  $("btnPlacementBack").addEventListener("click", () => goScreen("menu"));
  $("btnHome").addEventListener("click", () => goScreen("menu"));
  $("btnHelp").addEventListener("click", () => $("btnSupport").click());
  $("btnTrophy").addEventListener("click", () => openModal("Рейтинг", "Сделаем позже 🙂"));
  $("btnShareMini").addEventListener("click", () => $("btnShare").click());

  $("btnRotate").addEventListener("click", () => {
    orientation = (orientation === "H") ? "V" : "H";
    updateRotateBtn();
    showToast(`Ориентация: ${orientation === "H" ? "горизонтально" : "вертикально"}`);
  });

  $("btnStart").addEventListener("click", () => {
    if (placedShips.size !== SHIP_SET.length) {
      showToast("Сначала расставь весь флот");
      return;
    }
    buildLobby();
    goScreen("lobby");
    showToast("Добро пожаловать в игровой зал");
  });

  // lobby controls
  $("btnLobbyHome").addEventListener("click", () => goScreen("menu"));
  $("lobbyClose").addEventListener("click", () => goScreen("menu"));
  $("roomsHelp").addEventListener("click", () => $("btnSupport").click());
  $("roomsTrophy").addEventListener("click", () => openModal("Рейтинг", "Сделаем позже 🙂"));

  $("chatClear").addEventListener("click", () => {
    chat = [];
    renderChat();
    showToast("Чат очищен");
  });

  $("chatSend").addEventListener("click", sendChat);
  $("chatText").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  // modal
  $("modalClose").addEventListener("click", closeModal);
  $("modalOk").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });

  // initial
  goScreen("menu");
});

function sendChat() {
  const inp = $("chatText");
  const text = inp.value.trim();
  if (!text) return;
  chat.push({nick:"Ты", avatar:"🙂", text});
  inp.value = "";
  renderChat();
}