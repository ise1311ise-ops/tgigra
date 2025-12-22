/* SeaBattle UI (Telegram-friendly)
   Structure:
   Home -> Placement -> Lobby -> Match 1v1
*/

(() => {
  // -------------------------
  // Telegram / scaling
  // -------------------------
  const viewport = document.getElementById('viewport');
  const app = document.getElementById('app');

  function getVV() {
    // Telegram WebView often changes the real height due to top bars
    const vv = window.visualViewport;
    if (vv) return { w: vv.width, h: vv.height };
    return { w: window.innerWidth, h: window.innerHeight };
  }

  function fitTelegram() {
    const { w, h } = getVV();
    const portrait = h >= w;
    document.body.classList.toggle('portrait', portrait);

    // base sizes (IMPORTANT for "no scroll" + fit)
    const baseW = portrait ? 420 : 1050;
    const baseH = portrait ? 860 : 600;

    const scale = Math.min(w / baseW, h / baseH);
    app.style.transform = `scale(${scale})`;

    // center in viewport
    const left = Math.max(0, (w - baseW * scale) / 2);
    const top = Math.max(0, (h - baseH * scale) / 2);
    app.style.left = `${left}px`;
    app.style.top = `${top}px`;
  }

  window.addEventListener('resize', fitTelegram);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitTelegram);
  fitTelegram();

  // -------------------------
  // UI helpers
  // -------------------------
  const screens = {
    home: document.getElementById('screenHome'),
    placement: document.getElementById('screenPlacement'),
    lobby: document.getElementById('screenLobby'),
    match: document.getElementById('screenMatch'),
  };

  const topTitle = document.getElementById('topTitle');
  const btnBack = document.getElementById('btnBack');
  const btnChat = document.getElementById('btnChat');

  let navStack = ['home'];

  function showScreen(name) {
    Object.keys(screens).forEach(k => screens[k].classList.remove('active'));
    screens[name].classList.add('active');

    // title per screen
    const titles = {
      home: 'Морской бой — онлайн игра',
      placement: 'Расстановка',
      lobby: 'Общая комната',
      match: 'Бой 1×1',
    };
    topTitle.textContent = titles[name] || 'SeaBattle UI';

    // back button visibility
    btnBack.style.visibility = (name === 'home') ? 'hidden' : 'visible';

    fitTelegram(); // re-fit on screen change (Telegram sometimes changes vv)
  }

  function push(name) {
    navStack.push(name);
    showScreen(name);
  }

  function pop() {
    if (navStack.length <= 1) return;
    navStack.pop();
    showScreen(navStack[navStack.length - 1]);
  }

  btnBack.addEventListener('click', () => pop());

  // -------------------------
  // Modal (simple)
  // -------------------------
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');
  const modalOk = document.getElementById('modalOk');

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.remove('hidden');
  }
  function closeModal() {
    modal.classList.add('hidden');
  }
  modalClose.addEventListener('click', closeModal);
  modalOk.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // -------------------------
  // Chat modal
  // -------------------------
  const chatModal = document.getElementById('chatModal');
  const chatClose = document.getElementById('chatClose');
  const chatBody = document.getElementById('chatBody');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');

  const chatMessages = [
    { nick: 'user3', text: 'Всем привет 👋' },
    { nick: 'user7', text: 'Кто в бой 1×1?' },
    { nick: 'user2', text: 'Я готов 😄' },
  ];

  function renderChat() {
    chatBody.innerHTML = '';
    chatMessages.slice(-30).forEach(m => {
      const div = document.createElement('div');
      div.className = 'chatMsg';
      div.innerHTML = `<div class="chatNick">${m.nick}</div><div>${escapeHtml(m.text)}</div>`;
      chatBody.appendChild(div);
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function openChat() {
    renderChat();
    chatModal.classList.remove('hidden');
    setTimeout(() => chatInput.focus(), 50);
  }
  function closeChat() {
    chatModal.classList.add('hidden');
  }

  btnChat.addEventListener('click', openChat);
  chatClose.addEventListener('click', closeChat);
  chatModal.addEventListener('click', (e) => { if (e.target === chatModal) closeChat(); });

  function sendChat() {
    const text = (chatInput.value || '').trim();
    if (!text) return;
    chatMessages.push({ nick: 'you', text });
    chatInput.value = '';
    renderChat();
  }
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });

  function escapeHtml(s){
    return s.replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // -------------------------
  // Home buttons
  // -------------------------
  document.getElementById('goOnline').addEventListener('click', () => {
    resetPlacement();
    push('placement');
  });

  document.getElementById('goSettings').addEventListener('click', () => {
    openModal('Настройки', `
      <b>Макет настроек</b><br><br>
      • Звук: Вкл<br>
      • Подсказки: Вкл<br>
      • Тема: Бумага/Синяя<br><br>
      (Позже сделаем реальными)
    `);
  });

  document.getElementById('goShare').addEventListener('click', async () => {
    const url = location.href;
    try{
      if (navigator.share) {
        await navigator.share({ title: 'SeaBattle UI', url });
      } else {
        await navigator.clipboard.writeText(url);
        openModal('Поделиться', 'Ссылка скопирована в буфер обмена ✅');
      }
    }catch(_){
      openModal('Поделиться', 'Не получилось открыть системное меню. Скопируй ссылку вручную: <br><br><code>' + escapeHtml(url) + '</code>');
    }
  });

  document.getElementById('goHelp').addEventListener('click', () => {
    openModal('Поддержка', `
      <b>Как играть (макет):</b><br><br>
      1) Нажми «Онлайн игра»<br>
      2) Расставь флот (по правилам — корабли не соприкасаются)<br>
      3) Нажми «Далее» → попадёшь в общую комнату<br>
      4) Выбери игрока → бой 1×1<br>
    `);
  });

  // -------------------------
  // Placement logic (10x10)
  // -------------------------
  const placeCanvas = document.getElementById('placeCanvas');
  const placeCtx = placeCanvas.getContext('2d');

  const GRID = 10;
  const cellPx = 36; // internal canvas units, drawing scale is handled by canvas size
  const pad = 18;
  const labelPad = 22;

  // Fleet counts (classic)
  const FLEET = [
    { size: 4, count: 1 },
    { size: 3, count: 2 },
    { size: 2, count: 3 },
    { size: 1, count: 4 },
  ];

  let orientation = 'H'; // H or V
  let selectedSize = 4;

  // board state: 0 empty, 1 ship
  let myShips = []; // list of placed ships {x,y,size,ori,cells:[{x,y}]}
  let myGrid = makeGrid(0);

  function makeGrid(val){
    return Array.from({length:GRID}, () => Array.from({length:GRID}, () => val));
  }

  function placedCountBySize(size){
    return myShips.filter(s => s.size === size).length;
  }
  function maxCountBySize(size){
    const f = FLEET.find(x => x.size === size);
    return f ? f.count : 0;
  }

  // Fleet UI
  const fleetList = document.getElementById('fleetList');

  function buildFleetUI(){
    fleetList.innerHTML = '';
    FLEET.forEach(item => {
      for (let i=0;i<item.count;i++){
        // we render one row per size only (cleaner) + show remaining
      }
    });

    FLEET.forEach(item => {
      const row = document.createElement('div');
      row.className = 'fleetItem' + (selectedSize === item.size ? ' active':'');
      row.dataset.size = String(item.size);

      const dots = document.createElement('div');
      dots.className = 'dots';
      for(let i=0;i<item.size;i++){
        const d = document.createElement('span');
        d.className = 'dotMini';
        dots.appendChild(d);
      }

      const left = document.createElement('div');
      left.className = 'fleetLeft';
      left.appendChild(dots);

      const label = document.createElement('div');
      label.textContent = `${item.size}-палубный`;
      left.appendChild(label);

      const right = document.createElement('div');
      right.className = 'fleetRight';
      const remaining = item.count - placedCountBySize(item.size);
      right.textContent = `осталось: ${remaining}`;

      row.appendChild(left);
      row.appendChild(right);

      row.addEventListener('click', () => {
        selectedSize = item.size;
        buildFleetUI();
      });

      fleetList.appendChild(row);
    });
  }

  // Buttons placement
  const btnRotate = document.getElementById('btnRotate');
  const btnResetPlace = document.getElementById('btnResetPlace');
  const btnDonePlace = document.getElementById('btnDonePlace');

  btnRotate.addEventListener('click', () => {
    orientation = (orientation === 'H') ? 'V' : 'H';
    btnRotate.textContent = (orientation === 'H') ? 'Повернуть: Гориз.' : 'Повернуть: Вертик.';
    drawPlacement();
  });

  btnResetPlace.addEventListener('click', () => {
    resetPlacement();
    drawPlacement();
  });

  btnDonePlace.addEventListener('click', () => {
    if (!isFleetComplete()) {
      openModal('Расстановка', 'Сначала расставь весь флот ✅');
      return;
    }
    buildLobby();
    push('lobby');
  });

  function isFleetComplete(){
    return FLEET.every(f => placedCountBySize(f.size) >= f.count);
  }

  function resetPlacement(){
    orientation = 'H';
    btnRotate.textContent = 'Повернуть: Гориз.';
    selectedSize = 4;
    myShips = [];
    myGrid = makeGrid(0);
    buildFleetUI();
    drawPlacement();
  }

  // Click placement
  placeCanvas.addEventListener('pointerdown', (e) => {
    const p = canvasToCell(placeCanvas, e);
    if (!p) return;

    // if size already fully placed, auto-pick next available
    if (placedCountBySize(selectedSize) >= maxCountBySize(selectedSize)) {
      const next = FLEET.find(f => placedCountBySize(f.size) < f.count);
      if (next) selectedSize = next.size;
      buildFleetUI();
    }

    const size = selectedSize;
    if (placedCountBySize(size) >= maxCountBySize(size)) {
      openModal('Флот', 'Этот тип корабля уже расставлен полностью.');
      return;
    }

    const ship = proposeShip(p.x, p.y, size, orientation);
    if (!ship) return;

    if (!canPlaceShip(ship)) {
      // little feedback
      flashBlock();
      return;
    }

    placeShip(ship);
    buildFleetUI();
    drawPlacement();
  });

  function proposeShip(x, y, size, ori){
    const cells = [];
    for (let i=0;i<size;i++){
      const cx = (ori === 'H') ? x + i : x;
      const cy = (ori === 'V') ? y + i : y;
      if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return null;
      cells.push({x:cx,y:cy});
    }
    return { x, y, size, ori, cells };
  }

  function canPlaceShip(ship){
    // no overlap, and no touching even diagonally
    for (const c of ship.cells){
      if (myGrid[c.y][c.x] === 1) return false;

      for (let dy=-1; dy<=1; dy++){
        for (let dx=-1; dx<=1; dx++){
          const nx = c.x + dx, ny = c.y + dy;
          if (nx<0||ny<0||nx>=GRID||ny>=GRID) continue;
          if (myGrid[ny][nx] === 1) return false;
        }
      }
    }
    return true;
  }

  function placeShip(ship){
    myShips.push(ship);
    for (const c of ship.cells){
      myGrid[c.y][c.x] = 1;
    }
  }

  // draw placement
  function drawPlacement(){
    const W = placeCanvas.width, H = placeCanvas.height;
    placeCtx.clearRect(0,0,W,H);

    drawBoard(placeCtx, placeCanvas, {
      showLabels: true,
      shipsGrid: myGrid,
      hits: null,
      misses: null,
      overlayBlocked: true
    });

    // ghost preview at current selected cell is too heavy for mobile; skip
  }

  // red flash if cannot place
  let blockFlash = 0;
  function flashBlock(){
    blockFlash = 10;
    const t = setInterval(() => {
      blockFlash--;
      drawPlacement();
      if (blockFlash <= 0) clearInterval(t);
    }, 16);
  }

  // -------------------------
  // Lobby
  // -------------------------
  const playerList = document.getElementById('playerList');

  const onlinePlayers = Array.from({length:12}, (_,i)=>`user${i+1}`);

  let opponent = 'user1';

  function buildLobby(){
    playerList.innerHTML = '';
    onlinePlayers.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'playerBtn';
      btn.textContent = name;
      btn.addEventListener('click', () => {
        opponent = name;
        startMatchVs(opponent);
        push('match');
      });
      playerList.appendChild(btn);
    });
  }

  // -------------------------
  // Match 1v1 (UI + simple taps)
  // -------------------------
  const myCanvas = document.getElementById('myCanvas');
  const enemyCanvas = document.getElementById('enemyCanvas');
  const myCtx = myCanvas.getContext('2d');
  const enemyCtx = enemyCanvas.getContext('2d');
  const matchSub = document.getElementById('matchSub');

  const enemyHits = makeGrid(0);   // 0 none, 1 hit
  const enemyMiss = makeGrid(0);   // 0 none, 1 miss

  // We generate an enemy ship map just for UI (not real online)
  let enemyGrid = makeGrid(0);

  document.getElementById('btnRestartMatch').addEventListener('click', () => {
    // re-generate enemy and clear shots
    for(let y=0;y<GRID;y++){
      for(let x=0;x<GRID;x++){
        enemyHits[y][x]=0;
        enemyMiss[y][x]=0;
      }
    }
    enemyGrid = generateEnemyGrid();
    drawMatch();
  });

  function startMatchVs(name){
    matchSub.textContent = `Бой 1×1 vs ${name}`;

    // generate enemy ships & clear shots
    for(let y=0;y<GRID;y++){
      for(let x=0;x<GRID;x++){
        enemyHits[y][x]=0;
        enemyMiss[y][x]=0;
      }
    }
    enemyGrid = generateEnemyGrid();

    drawMatch();
  }

  enemyCanvas.addEventListener('pointerdown', (e) => {
    const p = canvasToCell(enemyCanvas, e);
    if (!p) return;

    // already shot
    if (enemyHits[p.y][p.x] || enemyMiss[p.y][p.x]) return;

    if (enemyGrid[p.y][p.x] === 1) enemyHits[p.y][p.x] = 1;
    else enemyMiss[p.y][p.x] = 1;

    drawMatch();
  });

  function drawMatch(){
    // My board shows my placed ships
    drawBoard(myCtx, myCanvas, {
      showLabels: true,
      shipsGrid: myGrid,
      hits: null,
      misses: null,
      overlayBlocked: false
    });

    // Enemy board hides ships, shows hits/misses
    drawBoard(enemyCtx, enemyCanvas, {
      showLabels: true,
      shipsGrid: null,
      hits: enemyHits,
      misses: enemyMiss,
      overlayBlocked: false
    });
  }

  // -------------------------
  // Board draw (paper style)
  // -------------------------
  function drawBoard(ctx, canvas, opts){
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);

    // background paper grid inside canvas
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillRect(0,0,W,H);

    // compute layout
    const gSize = Math.min(W,H) - pad*2 - labelPad;
    const cell = gSize / GRID;
    const ox = pad + labelPad;
    const oy = pad;

    // grid lines
    ctx.strokeStyle = 'rgba(36,58,122,0.18)';
    ctx.lineWidth = 1;

    for(let i=0;i<=GRID;i++){
      const x = ox + i*cell;
      const y = oy + i*cell;

      ctx.beginPath(); ctx.moveTo(ox, y); ctx.lineTo(ox + GRID*cell, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, oy); ctx.lineTo(x, oy + GRID*cell); ctx.stroke();
    }

    // thick border
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(36,58,122,0.55)';
    roundRect(ctx, ox-2, oy-2, GRID*cell+4, GRID*cell+4, 14);
    ctx.stroke();

    // labels
    if (opts.showLabels){
      ctx.fillStyle = 'rgba(36,58,122,0.90)';
      ctx.font = '700 14px system-ui';
      // top numbers
      for(let x=0;x<GRID;x++){
        const tx = ox + x*cell + cell*0.35;
        ctx.fillText(String(x+1), tx, oy - 6);
      }
      // left letters (АБВГДЕЖЗИК)
      const letters = ['А','Б','В','Г','Д','Е','Ж','З','И','К'];
      for(let y=0;y<GRID;y++){
        const ty = oy + y*cell + cell*0.65;
        ctx.fillText(letters[y], ox - 18, ty);
      }
    }

    // ships
    if (opts.shipsGrid){
      for(let y=0;y<GRID;y++){
        for(let x=0;x<GRID;x++){
          if (opts.shipsGrid[y][x] === 1){
            drawCellFill(ctx, ox, oy, cell, x, y, 'rgba(36,58,122,0.40)', 'rgba(36,58,122,0.75)');
          }
        }
      }
    }

    // misses/hits
    if (opts.misses){
      for(let y=0;y<GRID;y++){
        for(let x=0;x<GRID;x++){
          if (opts.misses[y][x] === 1){
            const cx = ox + x*cell + cell/2;
            const cy = oy + y*cell + cell/2;
            ctx.fillStyle = 'rgba(40,50,80,0.40)';
            ctx.beginPath(); ctx.arc(cx, cy, cell*0.10, 0, Math.PI*2); ctx.fill();
          }
        }
      }
    }

    if (opts.hits){
      for(let y=0;y<GRID;y++){
        for(let x=0;x<GRID;x++){
          if (opts.hits[y][x] === 1){
            const cx = ox + x*cell + cell/2;
            const cy = oy + y*cell + cell/2;
            ctx.fillStyle = 'rgba(180,40,40,0.55)';
            ctx.beginPath(); ctx.arc(cx, cy, cell*0.16, 0, Math.PI*2); ctx.fill();
          }
        }
      }
    }

    // blocked overlay for placement when flash
    if (opts.overlayBlocked && blockFlash > 0){
      ctx.fillStyle = `rgba(180,40,40,${0.06 + 0.02*(blockFlash%2)})`;
      ctx.fillRect(ox, oy, GRID*cell, GRID*cell);
    }

    ctx.restore();
  }

  function drawCellFill(ctx, ox, oy, cell, x, y, fill, stroke){
    const rx = ox + x*cell + cell*0.10;
    const ry = oy + y*cell + cell*0.10;
    const rw = cell*0.80;
    const rh = cell*0.80;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRect(ctx, rx, ry, rw, rh, Math.max(8, cell*0.18));
    ctx.fill();
    ctx.stroke();
  }

  function roundRect(ctx, x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }

  function canvasToCell(canvas, e){
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);

    const gSize = Math.min(canvas.width, canvas.height) - pad*2 - labelPad;
    const cell = gSize / GRID;
    const ox = pad + labelPad;
    const oy = pad;

    const x = Math.floor((px - ox) / cell);
    const y = Math.floor((py - oy) / cell);
    if (x<0 || y<0 || x>=GRID || y>=GRID) return null;
    return { x, y };
  }

  // -------------------------
  // Enemy generator (UI only)
  // -------------------------
  function generateEnemyGrid(){
    // classic placement random (simple)
    const grid = makeGrid(0);
    const ships = [];

    function canPlace(cells){
      for (const c of cells){
        if (grid[c.y][c.x] === 1) return false;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=1; dx++){
            const nx=c.x+dx, ny=c.y+dy;
            if(nx<0||ny<0||nx>=GRID||ny>=GRID) continue;
            if (grid[ny][nx] === 1) return false;
          }
        }
      }
      return true;
    }

    function put(size){
      for(let tries=0; tries<500; tries++){
        const ori = Math.random() < 0.5 ? 'H' : 'V';
        const x = Math.floor(Math.random()*GRID);
        const y = Math.floor(Math.random()*GRID);
        const cells = [];
        for(let i=0;i<size;i++){
          const cx = ori==='H' ? x+i : x;
          const cy = ori==='V' ? y+i : y;
          if(cx<0||cy<0||cx>=GRID||cy>=GRID) { cells.length=0; break; }
          cells.push({x:cx,y:cy});
        }
        if(!cells.length) continue;
        if(!canPlace(cells)) continue;
        cells.forEach(c => grid[c.y][c.x] = 1);
        ships.push({size,ori,x,y});
        return true;
      }
      return false;
    }

    for(const f of FLEET){
      for(let i=0;i<f.count;i++){
        put(f.size);
      }
    }
    return grid;
  }

  // -------------------------
  // Init
  // -------------------------
  // set default state
  showScreen('home');
  resetPlacement();

  // ensure lobby is ready when needed
  buildLobby();

  // when going back from match to lobby, keep opponent selection
  // draw match when opened
})();
