// ===== Router / Screen switching =====
const screens = {
  menu: document.getElementById('screen-menu'),
  placement: document.getElementById('screen-placement'),
  lobby: document.getElementById('screen-lobby'),
};

function showScreen(name, push = true){
  Object.entries(screens).forEach(([k, el]) => {
    if(k === name) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  // прокрутка текущего экрана вверх (как отдельная страница)
  const active = screens[name].querySelector('.paper');
  if(active) active.scrollTop = 0;

  if(push){
    location.hash = `#${name}`;
  }
}

window.addEventListener('hashchange', () => {
  const h = (location.hash || '#menu').replace('#','');
  if(screens[h]) showScreen(h, false);
});

// ===== Modal =====
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
function closeModal(){
  modal.classList.add('hidden');
}

// ===== Share helper =====
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
    // fallback
    try{
      await navigator.clipboard.writeText(url);
      openModal('Поделиться', `Ссылка скопирована:<br><b>${url}</b>`);
    }catch(_){
      openModal('Поделиться', `Вот ссылка (скопируй вручную):<br><b>${url}</b>`);
    }
  }
}

// ===== Menu actions =====
document.getElementById('btn-online').onclick = () => {
  // переход на расстановку
  showScreen('placement');
};

document.getElementById('btn-settings').onclick = () => {
  openModal('Настройки', `
    <div>• Звук: <b>вкл</b> (макет)</div>
    <div>• Подсказки: <b>вкл</b> (макет)</div>
    <div>• Тема: <b>тетрадь</b></div>
    <br>
    <div style="opacity:.8">Сделаем по-настоящему позже: сохранение в localStorage, переключатели и т.д.</div>
  `);
};

document.getElementById('btn-share').onclick = shareLink;

document.getElementById('btn-support').onclick = () => {
  openModal('Поддержка', `
    <b>Как играть:</b><br>
    1) В «Онлайн игра» расставь корабли.<br>
    2) Нажми «Старт» → попадёшь в игровой зал.<br>
    3) Там выбирай комнату и общайся в чате.<br>
    <br>
    <div style="opacity:.85">Сейчас это UI-макет (без реального онлайна).</div>
  `);
};

document.getElementById('btn-menu-help').onclick = () => {
  openModal('Помощь', 'Нажми <b>Онлайн игра</b> → расставь корабли → <b>Старт</b> → зал.');
};
document.getElementById('btn-menu-more').onclick = () => {
  openModal('Меню', 'Здесь потом сделаем «Статистика», «Достижения», «Магазин» как на скрине.');
};

// ===== Topbar buttons =====
document.getElementById('btn-home-from-placement').onclick = () => showScreen('menu');
document.getElementById('btn-share-from-placement').onclick = shareLink;

document.getElementById('btn-home-from-lobby').onclick = () => showScreen('menu');
document.getElementById('btn-close-lobby').onclick = () => showScreen('menu');

// ===== Placement (manual + auto) =====
const axisX = document.getElementById('axis-x');
const axisY = document.getElementById('axis-y');
const boardEl = document.getElementById('player-board');
const fleetEl = document.getElementById('fleet');
const btnRotate = document.getElementById('btn-rotate');
const btnAuto = document.getElementById('btn-auto');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset-placement');
const placeStatus = document.getElementById('place-status');

const SIZE = 10;
const letters = ['А','Б','В','Г','Д','Е','Ж','З','И','К'];
const shipSet = [4,3,3,2,2,2,1,1,1,1]; // классика

let playerGrid = makeGrid();
let orientation = 'h'; // h/v
let selectedShipIndex = 0; // index in remaining list
let shipsRemaining = shipSet.map((len, idx) => ({ id: idx, len, placed: false }));
let placedShips = []; // {id,len,cells:[{r,c}]}

function makeGrid(){
  return Array.from({length: SIZE}, () => Array.from({length: SIZE}, () => 0));
  // 0 empty, 1 ship
}

function buildAxes(){
  axisX.innerHTML = '';
  for(let i=1;i<=10;i++){
    const d = document.createElement('div');
    d.textContent = String(i);
    axisX.appendChild(d);
  }
  axisY.innerHTML = '';
  for(let i=0;i<10;i++){
    const d = document.createElement('div');
    d.textContent = letters[i];
    axisY.appendChild(d);
  }
}

function buildBoard(){
  boardEl.innerHTML = '';
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      cell.addEventListener('click', () => onPlaceClick(r,c));
      boardEl.appendChild(cell);
    }
  }
}

function renderBoard(){
  const cells = boardEl.querySelectorAll('.cell');
  cells.forEach(cell => {
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    cell.classList.toggle('ship', playerGrid[r][c] === 1);
    cell.classList.remove('blocked');
  });

  // подсветка запрета вокруг кораблей (чтобы было понятнее)
  const blocked = computeBlocked(playerGrid);
  blocked.forEach(({r,c}) => {
    const q = boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(q && playerGrid[r][c] === 0) q.classList.add('blocked');
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
      placeStatus.textContent = `Выбран корабль: ${s.len} • Ориентация: ${orientation === 'h' ? 'гориз.' : 'вертик.'}`;
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

  // правило: корабли не касаются (включая диагональ)
  for(const cell of cells){
    for(let dr=-1; dr<=1; dr++){
      for(let dc=-1; dc<=1; dc++){
        const rr = cell.r+dr, cc = cell.c+dc;
        if(rr<0||cc<0||rr>=SIZE||cc>=SIZE) continue;
        // если рядом стоит корабль, но это не часть текущего
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
  const ship = shipsRemaining[selectedShipIndex];
  if(!ship || ship.placed){
    selectNextShip();
  }
  const ship2 = shipsRemaining[selectedShipIndex];
  if(!ship2 || ship2.placed) return;

  const cells = canPlaceShip(r,c, ship2.len, orientation, playerGrid);
  if(!cells){
    placeStatus.textContent = `Нельзя поставить сюда (${ship2.len})`;
    return;
  }

  placeShip(cells, ship2);
  renderBoard();
  renderFleet();

  if(allPlaced()){
    placeStatus.textContent = 'Все корабли расставлены! Нажми «Старт».';
    btnStart.disabled = false;
  }else{
    selectNextShip();
    renderFleet();
    placeStatus.textContent = `Поставь следующий корабль: ${shipsRemaining[selectedShipIndex].len}`;
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
  renderBoard();
  renderFleet();
}

btnAuto.onclick = () => {
  autoPlaceAll();
};

function autoPlaceAll(){
  resetPlacement();
  // авто-расстановка с попытками
  for(const ship of shipsRemaining){
    let ok = false;
    for(let t=0;t<500;t++){
      const ori = Math.random() < 0.5 ? 'h' : 'v';
      const r = Math.floor(Math.random()*SIZE);
      const c = Math.floor(Math.random()*SIZE);
      const cells = canPlaceShip(r,c, ship.len, ori, playerGrid);
      if(cells){
        placeShip(cells, ship);
        ok = true;
        break;
      }
    }
    if(!ok){
      // если не получилось — начнем заново (редко)
      resetPlacement();
      return autoPlaceAll();
    }
  }
  btnStart.disabled = false;
  renderBoard();
  renderFleet();
  placeStatus.textContent = 'Авто-расстановка готова! Нажми «Старт».';
}

btnStart.onclick = () => {
  if(!allPlaced()){
    placeStatus.textContent = 'Сначала расставь все корабли.';
    return;
  }
  // Переход в зал после расстановки
  initLobbyOnce();
  showScreen('lobby');
};

// ===== Lobby (rooms + chat) =====
const roomsEl = document.getElementById('rooms');
const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const btnSend = document.getElementById('btn-send');
const btnEmoji = document.getElementById('btn-emoji');
const lobbyCount = document.getElementById('lobby-count');
const onlinePercent = document.getElementById('online-percent');

let lobbyInited = false;
let activeRoomId = null;

const fakeRooms = [
  { id: 'r1', name: 'Дезире', ping: 98 },
  { id: 'r2', name: 'крым1962россия', ping: 93 },
  { id: 'r3', name: 'Брюнетка', ping: 92 },
  { id: 'r4', name: '*Васяня64*', ping: 98 },
  { id: 'r5', name: 'Даниил Семенюк', ping: 81 },
  { id: 'r6', name: 'Джей Доу', ping: 98 },
  { id: 'r7', name: 'Малая07 Б/А', ping: 98 },
  { id: 'r8', name: 'Лекарь', ping: 94 },
  { id: 'r9', name: 'ИНТЕРСТЕЛЛАР Б/А', ping: 89 },
];

const fakeMsgs = [
  { who: 'penelope', text: 'у меня новая тактика — принятие 😂😂😂' },
  { who: 'ЕНОТИК*', text: 'СИНИЙ НОС, НИЧЕГО' },
  { who: 'СИНИЙ НОС', text: 'свернуть? да ок!' },
  { who: 'penelope', text: '0:1' },
];

function initLobbyOnce(){
  if(lobbyInited) return;
  lobbyInited = true;

  lobbyCount.textContent = '119';
  onlinePercent.textContent = '96%';

  // rooms
  roomsEl.innerHTML = '';
  fakeRooms.forEach(r => {
    const card = document.createElement('div');
    card.className = 'roomCard';
    card.dataset.id = r.id;
    card.innerHTML = `
      <div class="roomName">${escapeHtml(r.name)}</div>
      <div class="roomSub">${r.ping}% • ждёт соперника</div>
    `;
    card.onclick = () => selectRoom(r.id);
    roomsEl.appendChild(card);
  });

  selectRoom(fakeRooms[0].id);

  // chat
  chatBox.innerHTML = '';
  fakeMsgs.forEach(m => addMsg(m.who, m.text));

  btnSend.onclick = sendMsg;
  chatInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') sendMsg();
  });

  btnEmoji.onclick = () => {
    chatInput.value += '🙂';
    chatInput.focus();
  };
}

function selectRoom(id){
  activeRoomId = id;
  [...roomsEl.querySelectorAll('.roomCard')].forEach(c => {
    c.classList.toggle('active', c.dataset.id === id);
  });
  addSys(`Вы выбрали комнату: ${roomName(id)} (макет)`);
}

function roomName(id){
  const r = fakeRooms.find(x => x.id === id);
  return r ? r.name : id;
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

function sendMsg(){
  const t = chatInput.value.trim();
  if(!t) return;
  addMsg('ты', t);
  chatInput.value = '';
  // фейковый ответ
  setTimeout(() => addMsg('penelope', 'ок 🙂'), 450);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// ===== Init =====
(function init(){
  buildAxes();
  buildBoard();
  renderBoard();
  renderFleet();

  // открыть экран по hash, иначе меню
  const h = (location.hash || '#menu').replace('#','');
  if(screens[h]) showScreen(h, false);
  else showScreen('menu', false);
})();