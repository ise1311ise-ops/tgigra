// ================= Router / Screen switching =================
const screens = {
  menu: document.getElementById('screen-menu'),
  placement: document.getElementById('screen-placement'),
  lobby: document.getElementById('screen-lobby'),
  battle: document.getElementById('screen-battle'),
};

function showScreen(name, push = true){
  Object.entries(screens).forEach(([k, el]) => {
    if(k === name) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
  if(push) location.hash = `#${name}`;
}

window.addEventListener('hashchange', () => {
  const h = (location.hash || '#menu').replace('#','');
  if(screens[h]) showScreen(h, false);
});

// ================= Modal =================
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
document.getElementById('modalClose').onclick = closeModal;
document.getElementById('modalOk').onclick = closeModal;

function openModal(title, html){
  modalTitle.textContent = title;
  modalBody.innerHTML = html;
  modal.classList.remove('hidden');
}
function closeModal(){ modal.classList.add('hidden'); }

// ================= Share helper =================
async function shareLink(){
  const url = location.href.split('#')[0] + '#menu';
  try{
    if(navigator.share){
      await navigator.share({ title: 'Морской Бой', text: 'Заходи играть!', url });
    }else{
      await navigator.clipboard.writeText(url);
      openModal('Поделиться', `Ссылка скопирована:<br><b>${url}</b>`);
    }
  }catch(e){
    try{
      await navigator.clipboard.writeText(url);
      openModal('Поделиться', `Ссылка скопирована:<br><b>${url}</b>`);
    }catch(_){
      openModal('Поделиться', `Вот ссылка (скопируй вручную):<br><b>${url}</b>`);
    }
  }
}

// ================= Chat Drawer =================
const chatDrawer = document.getElementById('chatDrawer');
const btnOpenChat = document.getElementById('btn-open-chat');
const btnBattleChat = document.getElementById('btn-battle-chat');
const btnCloseChat = document.getElementById('btn-close-chat');

function openChat(){ chatDrawer.classList.remove('hidden'); }
function closeChat(){ chatDrawer.classList.add('hidden'); }

btnCloseChat.onclick = closeChat;
btnOpenChat.onclick = openChat;
btnBattleChat.onclick = openChat;

chatDrawer.addEventListener('click', (e) => {
  if(e.target === chatDrawer) closeChat();
});

// ================= Menu actions =================
document.getElementById('btn-online').onclick = () => showScreen('placement');
document.getElementById('btn-settings').onclick = () => {
  openModal('Настройки', `
    <div>• Звук: <b>вкл</b> (макет)</div>
    <div>• Подсказки: <b>вкл</b> (макет)</div>
    <div>• Тема: <b>тетрадь</b></div>
  `);
};
document.getElementById('btn-share').onclick = shareLink;
document.getElementById('btn-support').onclick = () => {
  openModal('Поддержка', `
    <b>Как играть:</b><br>
    1) «Онлайн игра» → расставь корабли.<br>
    2) «Дальше» → Игровой зал.<br>
    3) Выбери игрока → начнётся бой 1×1.<br>
    <br><div style="opacity:.85">Сейчас это локальный макет.</div>
  `);
};
document.getElementById('btn-menu-help').onclick = () => {
  openModal('Помощь', 'Нажми <b>Онлайн игра</b> → расставь корабли → <b>Дальше</b>.');
};
document.getElementById('btn-menu-more').onclick = () => {
  openModal('Меню', 'Позже добавим: статистика / достижения / магазин.');
};

document.getElementById('btn-home-from-placement').onclick = () => showScreen('menu');
document.getElementById('btn-share-from-placement').onclick = shareLink;

document.getElementById('btn-home-from-lobby').onclick = () => showScreen('menu');
document.getElementById('btn-back-to-placement').onclick = () => showScreen('placement');

// ================= Placement (manual + auto) =================
const grid11El = document.getElementById('player-grid11');
const fleetEl = document.getElementById('fleet');
const btnRotate = document.getElementById('btn-rotate');
const btnAuto = document.getElementById('btn-auto');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset-placement');
const placeStatus = document.getElementById('place-status');

const SIZE = 10;
const letters = ['А','Б','В','Г','Д','Е','Ж','З','И','К'];
const shipSet = [4,3,3,2,2,2,1,1,1,1];

let playerGrid = makeGrid();
let orientation = 'h';
let selectedShipIndex = 0;
let shipsRemaining = shipSet.map((len, idx) => ({ id: idx, len, placed: false }));
let placedShips = [];

function makeGrid(){
  return Array.from({length: SIZE}, () => Array.from({length: SIZE}, () => 0));
}

/**
 * Build one single 11x11 grid:
 * (0,0) corner
 * top row: numbers 1..10
 * left col: letters
 * rest: playable cells with dataset r/c
 */
function buildGrid11(){
  grid11El.innerHTML = '';
  for(let r=0;r<11;r++){
    for(let c=0;c<11;c++){
      if(r===0 && c===0){
        const d = document.createElement('div');
        d.className = 'axisCell cornerCell';
        grid11El.appendChild(d);
        continue;
      }
      if(r===0 && c>0){
        const d = document.createElement('div');
        d.className = 'axisCell';
        d.textContent = String(c);
        grid11El.appendChild(d);
        continue;
      }
      if(c===0 && r>0){
        const d = document.createElement('div');
        d.className = 'axisCell';
        d.textContent = letters[r-1];
        grid11El.appendChild(d);
        continue;
      }

      // playable cell
      const cell = document.createElement('div');
      cell.className = 'playCell';
      cell.dataset.r = String(r-1);
      cell.dataset.c = String(c-1);
      cell.addEventListener('click', () => onPlaceClick(r-1, c-1));
      grid11El.appendChild(cell);
    }
  }
}

function renderGrid11(){
  const blocked = computeBlocked(playerGrid);
  const blockedSet = new Set(blocked.map(x => `${x.r},${x.c}`));

  grid11El.querySelectorAll('.playCell').forEach(cell => {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const hasShip = playerGrid[r][c] === 1;

    cell.classList.toggle('ship', hasShip);
    cell.classList.toggle('blocked', !hasShip && blockedSet.has(`${r},${c}`));
  });
}

function computeBlocked(grid){
  const out = [];
  const seen = new Set();
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(grid[r][c] !== 1) continue;
      for(let dr=-1; dr<=1; dr++){
        for(let dc=-1; dc<=1; dc++){
          const rr = r+dr, cc = c+dc;
          if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) continue;
          const key = rr+','+cc;
          if(!seen.has(key)){
            seen.add(key);
            out.push({r:rr,c:cc});
          }
        }
      }
    }
  }
  return out;
}

function renderFleet(){
  fleetEl.innerHTML = '';
  shipsRemaining.forEach((s, idx) => {
    const item = document.createElement('div');
    item.className = 'shipPick' + (!s.placed && idx === selectedShipIndex ? ' active' : '');
    item.style.opacity = s.placed ? '0.35' : '1';

    const preview = document.createElement('div');
    preview.className = 'shipPreview';
    for(let i=0;i<s.len;i++){
      const p = document.createElement('div');
      p.className = 'pip';
      preview.appendChild(p);
    }

    const meta = document.createElement('div');
    meta.className = 'shipMeta';
    meta.textContent = `${s.len}-палубный`;

    item.appendChild(preview);
    item.appendChild(meta);

    item.onclick = () => {
      if(s.placed) return;
      selectedShipIndex = idx;
      renderFleet();
      placeStatus.textContent = `Выбран: ${s.len} • ${orientation === 'h' ? 'гориз.' : 'вертик.'}`;
    };

    fleetEl.appendChild(item);
  });
}

function canPlaceShip(r,c,len,ori, grid){
  const cells = [];
  for(let i=0;i<len;i++){
    const rr = r + (ori === 'v' ? i : 0);
    const cc = c + (ori === 'h' ? i : 0);
    if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) return null;
    if(grid[rr][cc] === 1) return null;
    cells.push({r:rr,c:cc});
  }

  // no touching
  for(const cell of cells){
    for(let dr=-1; dr<=1; dr++){
      for(let dc=-1; dc<=1; dc++){
        const rr = cell.r+dr, cc = cell.c+dc;
        if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) continue;
        const isPart = cells.some(x => x.r===rr && x.c===cc);
        if(!isPart && grid[rr][cc] === 1) return null;
      }
    }
  }

  return cells;
}

function placeShip(cells, ship){
  cells.forEach(({r,c}) => playerGrid[r][c] = 1);
  ship.placed = true;
  placedShips.push({ id: ship.id, len: ship.len, cells });
}

function allPlaced(){
  return shipsRemaining.every(s => s.placed);
}

function selectNextShip(){
  const idx = shipsRemaining.findIndex(s => !s.placed);
  if(idx >= 0) selectedShipIndex = idx;
}

function onPlaceClick(r,c){
  let ship = shipsRemaining[selectedShipIndex];
  if(!ship || ship.placed) selectNextShip();
  ship = shipsRemaining[selectedShipIndex];
  if(!ship || ship.placed) return;

  const cells = canPlaceShip(r,c, ship.len, orientation, playerGrid);
  if(!cells){
    placeStatus.textContent = `Нельзя поставить сюда (${ship.len})`;
    return;
  }

  placeShip(cells, ship);
  renderGrid11();
  renderFleet();

  if(allPlaced()){
    placeStatus.textContent = 'Готово! Нажми «Дальше».';
    btnStart.disabled = false;
  }else{
    selectNextShip();
    renderFleet();
    placeStatus.textContent = `Следующий: ${shipsRemaining[selectedShipIndex].len}`;
  }
}

btnRotate.onclick = () => {
  orientation = (orientation === 'h') ? 'v' : 'h';
  placeStatus.textContent = `Ориентация: ${orientation === 'h' ? 'гориз.' : 'вертик.'}`;
};

btnReset.onclick = resetPlacement;

function resetPlacement(){
  playerGrid = makeGrid();
  orientation = 'h';
  shipsRemaining = shipSet.map((len, idx) => ({ id: idx, len, placed: false }));
  placedShips = [];
  selectedShipIndex = 0;
  btnStart.disabled = true;
  placeStatus.textContent = 'Тапни корабль справа → тапни по клетке';
  renderGrid11();
  renderFleet();
}

btnAuto.onclick = () => autoPlaceAll();

function autoPlaceAll(){
  resetPlacement();
  for(const ship of shipsRemaining){
    let ok = false;
    for(let t=0;t<800;t++){
      const ori = Math.random() < 0.5 ? 'h' : 'v';
      const r = Math.floor(Math.random()*SIZE);
      const c = Math.floor(Math.random()*SIZE);
      const cells = canPlaceShip(r,c, ship.len, ori, playerGrid);
      if(cells){ placeShip(cells, ship); ok = true; break; }
    }
    if(!ok){ resetPlacement(); return autoPlaceAll(); }
  }
  btnStart.disabled = false;
  renderGrid11();
  renderFleet();
  placeStatus.textContent = 'Авто-расстановка готова! Нажми «Дальше».';
}

btnStart.onclick = () => {
  if(!allPlaced()){
    placeStatus.textContent = 'Сначала расставь все корабли.';
    return;
  }
  initLobbyOnce();
  showScreen('lobby');
};

// ================= Lobby: Online Players (NOT rooms) =================
const playersEl = document.getElementById('players');
const onlinePercent = document.getElementById('online-percent');
const youNickEl = document.getElementById('youNick');

const YOU = 'user0';
const ONLINE_USERS = Array.from({length: 12}, (_, i) => `user${i+1}`);

youNickEl.textContent = YOU;
onlinePercent.textContent = '96%';
document.getElementById('badge-online').textContent = String(ONLINE_USERS.length);

let lobbyInited = false;

function initLobbyOnce(){
  if(lobbyInited) return;
  lobbyInited = true;

  playersEl.innerHTML = '';
  ONLINE_USERS.forEach((name, i) => {
    const card = document.createElement('div');
    card.className = 'playerCard';
    card.innerHTML = `
      <div class="playerName">${escapeHtml(name)}</div>
      <div class="playerSub">${95 - (i%7)}% • готов</div>
    `;
    card.onclick = () => startBattle(name);
    playersEl.appendChild(card);
  });

  initChatOnce();
}

document.getElementById('btn-back-to-placement').onclick = () => showScreen('placement');

// ================= Chat: common room =================
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btn-send');
const btnEmoji = document.getElementById('btn-emoji');

let chatInited = false;

function initChatOnce(){
  if(chatInited) return;
  chatInited = true;

  chatBox.innerHTML = '';
  addMsg('user1', 'привет!');
  addMsg('user2', 'кто в бой?');
  addMsg('user3', 'я готов 🙂');

  btnSend.onclick = sendMsg;
  chatInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') sendMsg();
  });

  btnEmoji.onclick = () => {
    chatInput.value += '🙂';
    chatInput.focus();
  };
}

function addMsg(who, text){
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.innerHTML = `
    <div class="avatar">${escapeHtml(who.slice(0,2).toUpperCase())}</div>
    <div class="msgBody">
      <div class="msgName">${escapeHtml(who)}</div>
      <div class="msgText">${escapeHtml(text)}</div>
    </div>
  `;
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function addSys(text){
  const wrap = document.createElement('div');
  wrap.className = 'msg';
  wrap.innerHTML = `
    <div class="avatar">i</div>
    <div class="msgBody">
      <div class="msgName">система</div>
      <div class="msgText">${escapeHtml(text)}</div>
    </div>
  `;
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function sendMsg(){
  const t = chatInput.value.trim();
  if(!t) return;
  addMsg(YOU, t);
  chatInput.value = '';

  const responders = ['user1','user2','user3','user4'];
  const who = responders[Math.floor(Math.random()*responders.length)];
  setTimeout(() => addMsg(who, 'ок 🙂'), 400);
}

// ================= Battle 1x1 (local mock) =================
const battleOppEl = document.getElementById('battle-opponent');
const myBattleEl = document.getElementById('battle-my');
const enemyBattleEl = document.getElementById('battle-enemy');
const battleStatusL = document.getElementById('battle-status-left');
const battleStatusR = document.getElementById('battle-status-right');
const btnBackToLobby = document.getElementById('btn-back-to-lobby');
const btnBattleExit = document.getElementById('btn-battle-exit');
const btnBattleRestart = document.getElementById('btn-battle-restart');

btnBackToLobby.onclick = () => showScreen('lobby');
btnBattleExit.onclick = () => showScreen('lobby');
btnBattleRestart.onclick = () => {
  if(currentOpponent) startBattle(currentOpponent);
};

let currentOpponent = null;

let myShipsGrid = null;
let myShotsGrid = null;
let enemyShipsGrid = null;
let enemyShotsGrid = null;

let myTurn = true;

function startBattle(opponent){
  currentOpponent = opponent;
  battleOppEl.textContent = opponent;

  myShipsGrid = playerGrid.map(row => row.slice());
  myShotsGrid = makeGrid();

  enemyShipsGrid = generateEnemyShips();
  enemyShotsGrid = makeGrid();

  myTurn = true;
  battleStatusL.textContent = 'защищайся';
  battleStatusR.textContent = 'твой ход';

  buildBattleBoards();
  renderBattleBoards();

  addSys(`Матч 1×1: ${YOU} vs ${opponent} (локальный макет)`);
  showScreen('battle');
}

function buildBattleBoards(){
  myBattleEl.innerHTML = '';
  enemyBattleEl.innerHTML = '';

  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const a = document.createElement('div');
      a.className = 'cell';
      a.dataset.r = String(r);
      a.dataset.c = String(c);
      myBattleEl.appendChild(a);

      const b = document.createElement('div');
      b.className = 'cell';
      b.dataset.r = String(r);
      b.dataset.c = String(c);
      b.addEventListener('click', () => onShootEnemy(r,c));
      enemyBattleEl.appendChild(b);
    }
  }
}

function renderBattleBoards(){
  myBattleEl.querySelectorAll('.cell').forEach(cell => {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    cell.classList.toggle('ship', myShipsGrid[r][c] === 1);
    cell.classList.toggle('hit', myShotsGrid[r][c] === 2);
    cell.classList.toggle('miss', myShotsGrid[r][c] === 3);
  });

  enemyBattleEl.querySelectorAll('.cell').forEach(cell => {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    cell.classList.toggle('hit', enemyShotsGrid[r][c] === 2);
    cell.classList.toggle('miss', enemyShotsGrid[r][c] === 3);
  });
}

function onShootEnemy(r,c){
  if(!myTurn) return;
  if(enemyShotsGrid[r][c] === 2 || enemyShotsGrid[r][c] === 3) return;

  if(enemyShipsGrid[r][c] === 1){
    enemyShotsGrid[r][c] = 2;
  }else{
    enemyShotsGrid[r][c] = 3;
    myTurn = false;
    battleStatusR.textContent = 'ход противника...';
  }

  renderBattleBoards();

  if(isAllSunk(enemyShipsGrid, enemyShotsGrid)){
    openModal('Победа!', `Ты выиграл у <b>${escapeHtml(currentOpponent)}</b> ✅`);
    showScreen('lobby');
    return;
  }

  if(!myTurn){
    setTimeout(enemyMove, 550);
  }
}

function enemyMove(){
  const candidates = [];
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(myShotsGrid[r][c] === 0) candidates.push({r,c});
    }
  }
  if(candidates.length === 0) return;

  const pick = candidates[Math.floor(Math.random()*candidates.length)];
  const {r,c} = pick;

  if(myShipsGrid[r][c] === 1){
    myShotsGrid[r][c] = 2;
    battleStatusR.textContent = 'противник попал!';
    renderBattleBoards();
    if(isAllSunk(myShipsGrid, myShotsGrid)){
      openModal('Поражение', `Ты проиграл игроку <b>${escapeHtml(currentOpponent)}</b> ❌`);
      showScreen('lobby');
      return;
    }
    setTimeout(enemyMove, 500);
    return;
  }else{
    myShotsGrid[r][c] = 3;
    renderBattleBoards();
    myTurn = true;
    battleStatusR.textContent = 'твой ход';
  }
}

function isAllSunk(ships, shots){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(ships[r][c] === 1 && shots[r][c] !== 2) return false;
    }
  }
  return true;
}

function generateEnemyShips(){
  const grid = makeGrid();
  const lens = shipSet.slice();

  function canPlace(r,c,len,ori){
    const cells = [];
    for(let i=0;i<len;i++){
      const rr = r + (ori === 'v' ? i : 0);
      const cc = c + (ori === 'h' ? i : 0);
      if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) return null;
      if(grid[rr][cc] === 1) return null;
      cells.push({r:rr,c:cc});
    }
    for(const cell of cells){
      for(let dr=-1; dr<=1; dr++){
        for(let dc=-1; dc<=1; dc++){
          const rr = cell.r+dr, cc = cell.c+dc;
          if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) continue;
          const isPart = cells.some(x => x.r===rr && x.c===cc);
          if(!isPart && grid[rr][cc] === 1) return null;
        }
      }
    }
    return cells;
  }

  for(const len of lens){
    let placed = false;
    for(let t=0;t<1200;t++){
      const ori = Math.random()<0.5 ? 'h' : 'v';
      const r = Math.floor(Math.random()*SIZE);
      const c = Math.floor(Math.random()*SIZE);
      const cells = canPlace(r,c,len,ori);
      if(cells){
        cells.forEach(({r,c}) => grid[r][c]=1);
        placed = true;
        break;
      }
    }
    if(!placed) return generateEnemyShips();
  }

  return grid;
}

// ================= Utils =================
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// ================= Init =================
(function init(){
  buildGrid11();
  renderGrid11();
  renderFleet();

  const h = (location.hash || '#menu').replace('#','');
  if(screens[h]) showScreen(h, false);
  else showScreen('menu', false);
})();