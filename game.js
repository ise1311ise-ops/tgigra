(() => {
  // ====== Утилиты ======
  const $ = (id) => document.getElementById(id);

  const Screens = {
    home: $("screenHome"),
    setup: $("screenSetup"),
    lobby: $("screenLobby"),
    match: $("screenMatch"),
  };

  const topTitle = $("topTitle");
  const btnBack = $("btnBack");
  const btnTopChat = $("btnTopChat");

  const modal = $("modal");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalOk = $("modalOk");

  const chatModal = $("chatModal");
  const chatBody = $("chatBody");
  const chatInput = $("chatInput");
  const chatSend = $("chatSend");
  const chatClose = $("chatClose");

  const navStack = [];

  function showScreen(name, push = true) {
    Object.values(Screens).forEach(s => {
      s.classList.remove("active");
      s.setAttribute("aria-hidden", "true");
    });
    Screens[name].classList.add("active");
    Screens[name].setAttribute("aria-hidden", "false");

    if (push) navStack.push(name);

    if (name === "home") topTitle.textContent = "Морской бой — онлайн игра";
    if (name === "setup") topTitle.textContent = "Расстановка";
    if (name === "lobby") topTitle.textContent = "Игровой зал";
    if (name === "match") topTitle.textContent = "Бой 1×1";

    btnBack.style.visibility = (name === "home") ? "hidden" : "visible";
    btnTopChat.style.visibility = (name === "lobby") ? "visible" : "hidden";
  }

  function goBack() {
    if (navStack.length <= 1) return;
    navStack.pop();
    const prev = navStack[navStack.length - 1];
    showScreen(prev, false);
  }

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add("show");
  }
  function closeModal() {
    modal.classList.remove("show");
  }

  // ====== ЧАТ ======
  const chatMessages = [
    { user: "user3", text: "всем привет 👋" },
    { user: "user7", text: "кто на 1×1?" },
    { user: "user2", text: "я готов" },
  ];

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderChat() {
    chatBody.innerHTML = chatMessages.map(m =>
      `<div class="msg"><b>${escapeHtml(m.user)}:</b> ${escapeHtml(m.text)}</div>`
    ).join("");
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function openChat() {
    renderChat();
    chatModal.classList.add("show");
    setTimeout(() => chatInput.focus(), 50);
  }
  function closeChat() {
    chatModal.classList.remove("show");
  }

  function sendChat() {
    const t = chatInput.value.trim();
    if (!t) return;
    chatMessages.push({ user: "you", text: t });
    chatInput.value = "";
    renderChat();
  }

  // ====== Верхние кнопки ======
  btnBack.addEventListener("click", goBack);
  btnTopChat.addEventListener("click", openChat);
  $("btnLobbyChat").addEventListener("click", openChat);

  chatClose.addEventListener("click", closeChat);
  chatModal.addEventListener("click", (e) => { if (e.target === chatModal) closeChat(); });
  chatSend.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

  modalOk.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // ====== HOME ======
  $("goOnline").addEventListener("click", () => {
    resetSetup();
    showScreen("setup");
  });

  $("goSettings").addEventListener("click", () => openModal("Настройки", "Пока макет UI. Здесь будут настройки."));
  $("goShare").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Морской бой", url });
      } else {
        await navigator.clipboard.writeText(url);
        openModal("Поделиться", "Ссылка скопирована ✅");
      }
    } catch {
      openModal("Поделиться", "Не удалось. Скопируй ссылку вручную.");
    }
  });
  $("goSupport").addEventListener("click", () => openModal("Поддержка", "Пока макет UI. Здесь будет помощь."));

  // ====== Общие параметры ======
  const GRID = 10;

  function makeGrid(n, fill) {
    return Array.from({ length: n }, () => Array.from({ length: n }, () => fill));
  }

  // ====== КРАСИВАЯ ОТРИСОВКА КОРАБЛЕЙ (одним корпусом) ======
  function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Вытаскиваем корабли как группы клеток (BFS). Дальше рисуем единым корпусом.
  function extractShipsFromGrid(grid) {
    const n = grid.length;
    const seen = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
    const ships = [];

    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (grid[y][x] !== 1 || seen[y][x]) continue;

        const q = [[x, y]];
        seen[y][x] = true;
        const cells = [];

        while (q.length) {
          const [cx, cy] = q.shift();
          cells.push([cx, cy]);
          for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
            if (seen[ny][nx]) continue;
            if (grid[ny][nx] !== 1) continue;
            seen[ny][nx] = true;
            q.push([nx, ny]);
          }
        }

        // ориентация по bbox
        let minX = 999, minY = 999, maxX = -1, maxY = -1;
        for (const [cx, cy] of cells) {
          minX = Math.min(minX, cx);
          minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx);
          maxY = Math.max(maxY, cy);
        }
        const horiz = (maxX - minX) >= (maxY - minY);

        ships.push({ cells, minX, minY, maxX, maxY, horiz, len: cells.length });
      }
    }

    return ships;
  }

  function drawGridBase(ctx, n, cellSize) {
    const size = ctx.canvas.width;
    ctx.clearRect(0, 0, size, size);

    // мягкий фон
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, size, size);

    // линии сетки
    ctx.strokeStyle = "rgba(140,170,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) {
      const p = i * cellSize;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
  }

  function drawShip(ctx, ship, cellSize) {
    // bbox в пикселях
    const x = ship.minX * cellSize;
    const y = ship.minY * cellSize;
    const w = (ship.maxX - ship.minX + 1) * cellSize;
    const h = (ship.maxY - ship.minY + 1) * cellSize;

    // чуть меньше, чтобы выглядело аккуратно
    const pad = Math.max(3, cellSize * 0.10);
    const rx = x + pad;
    const ry = y + pad;
    const rw = w - pad * 2;
    const rh = h - pad * 2;

    // тень
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundedRect(ctx, rx + 2, ry + 3, rw, rh, Math.min(rh, rw) * 0.28);
    ctx.fill();
    ctx.restore();

    // корпус
    const grad = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
    grad.addColorStop(0, "rgba(140,170,255,0.55)");
    grad.addColorStop(1, "rgba(90,120,230,0.30)");

    ctx.fillStyle = grad;
    ctx.strokeStyle = "rgba(180,210,255,0.50)";
    ctx.lineWidth = 2;

    roundedRect(ctx, rx, ry, rw, rh, Math.min(rh, rw) * 0.28);
    ctx.fill();
    ctx.stroke();

    // “палубные точки” (иллюминаторы) по числу палуб
    const len = ship.len;
    const centers = [];
    if (ship.horiz) {
      for (let i = 0; i < len; i++) {
        const cx = (ship.minX + i + 0.5) * cellSize;
        const cy = (ship.minY + 0.5) * cellSize;
        centers.push([cx, cy]);
      }
    } else {
      for (let i = 0; i < len; i++) {
        const cx = (ship.minX + 0.5) * cellSize;
        const cy = (ship.minY + i + 0.5) * cellSize;
        centers.push([cx, cy]);
      }
    }

    ctx.fillStyle = "rgba(15,25,60,0.55)";
    for (const [cx, cy] of centers) {
      ctx.beginPath();
      ctx.arc(cx, cy, cellSize * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ====== РАССТАНОВКА ======
  const setupCanvas = $("setupCanvas");
  const sctx = setupCanvas.getContext("2d");

  // 0 пусто, 1 корабль, 2 запрет
  let setupGrid = makeGrid(GRID, 0);

  // классика флота
  const fleetConfig = [
    { len: 4, count: 1 },
    { len: 3, count: 2 },
    { len: 2, count: 3 },
    { len: 1, count: 4 },
  ];

  let fleetState = fleetConfig.map(x => ({ ...x, left: x.count }));
  let selectedLen = 4;
  let horizontal = true;

  const fleetList = $("fleetList");
  const btnRotate = $("btnRotate");
  const btnClearSetup = $("btnClearSetup");
  const btnToLobby = $("btnToLobby");

  btnRotate.addEventListener("click", () => {
    horizontal = !horizontal;
    btnRotate.textContent = horizontal ? "Повернуть: Гориз." : "Повернуть: Вертик.";
  });

  btnClearSetup.addEventListener("click", () => resetSetup());

  btnToLobby.addEventListener("click", () => {
    showScreen("lobby");
  });

  function resetSetup() {
    setupGrid = makeGrid(GRID, 0);
    fleetState = fleetConfig.map(x => ({ ...x, left: x.count }));
    selectedLen = 4;
    horizontal = true;
    btnRotate.textContent = "Повернуть: Гориз.";
    renderFleet();
    drawSetup();
    btnToLobby.disabled = true;
  }

  function renderFleet() {
    fleetList.innerHTML = "";
    const unique = fleetState.map(f => f.len);
    unique.forEach((len) => {
      const left = fleetState.find(f => f.len === len).left;
      const item = document.createElement("div");
      item.className = "fleetItem" + (selectedLen === len ? " selected" : "");
      item.innerHTML = `
        <div class="fleetLeft">
          ${Array.from({length: len}).map(()=>`<span class="deckDot"></span>`).join("")}
          <span class="fleetName">${len}-палубный</span>
        </div>
        <div class="fleetRemain">осталось: <b>${left}</b></div>
      `;
      item.addEventListener("click", () => {
        selectedLen = len;
        renderFleet();
        drawSetup();
      });
      fleetList.appendChild(item);
    });
  }

  function allPlaced() {
    return fleetState.every(f => f.left === 0);
  }

  function canPlace(x, y, len, horiz) {
    if (horiz) {
      if (x + len > GRID) return false;
      for (let i = 0; i < len; i++) if (setupGrid[y][x + i] !== 0) return false;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= len; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
          if (setupGrid[ny][nx] === 1) return false;
        }
      }
      return true;
    } else {
      if (y + len > GRID) return false;
      for (let i = 0; i < len; i++) if (setupGrid[y + i][x] !== 0) return false;

      for (let dy = -1; dy <= len; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
          if (setupGrid[ny][nx] === 1) return false;
        }
      }
      return true;
    }
  }

  function placeShip(x, y, len, horiz) {
    if (horiz) for (let i = 0; i < len; i++) setupGrid[y][x + i] = 1;
    else for (let i = 0; i < len; i++) setupGrid[y + i][x] = 1;
    markForbidden();
  }

  function markForbidden() {
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (setupGrid[y][x] === 2) setupGrid[y][x] = 0;
      }
    }
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (setupGrid[y][x] !== 1) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
            if (setupGrid[ny][nx] === 0) setupGrid[ny][nx] = 2;
          }
        }
      }
    }
  }

  // подсветка "превью" куда поставится корабль
  let hoverCell = null;
  setupCanvas.addEventListener("pointermove", (e) => {
    const rect = setupCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (setupCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (setupCanvas.height / rect.height);
    const cellSize = setupCanvas.width / GRID;
    const x = Math.floor(px / cellSize);
    const y = Math.floor(py / cellSize);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID) {
      hoverCell = null;
      drawSetup();
      return;
    }
    hoverCell = { x, y };
    drawSetup();
  });
  setupCanvas.addEventListener("pointerleave", () => {
    hoverCell = null;
    drawSetup();
  });

  setupCanvas.addEventListener("pointerdown", (e) => {
    const rect = setupCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (setupCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (setupCanvas.height / rect.height);
    const cellSize = setupCanvas.width / GRID;
    const x = Math.floor(px / cellSize);
    const y = Math.floor(py / cellSize);

    const fleetItem = fleetState.find(f => f.len === selectedLen);
    if (!fleetItem || fleetItem.left <= 0) return;

    if (!canPlace(x, y, selectedLen, horizontal)) return;

    placeShip(x, y, selectedLen, horizontal);
    fleetItem.left -= 1;

    renderFleet();
    drawSetup();
    btnToLobby.disabled = !allPlaced();
  });

  function drawSetup() {
    const cellSize = setupCanvas.width / GRID;

    // база
    drawGridBase(sctx, GRID, cellSize);

    // запрет (делаем намного мягче)
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (setupGrid[y][x] === 2) {
          sctx.fillStyle = "rgba(255,120,140,0.06)";
          sctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
        }
      }
    }

    // корабли (единым корпусом)
    const ships = extractShipsFromGrid(setupGrid);
    for (const ship of ships) drawShip(sctx, ship, cellSize);

    // превью выбранного корабля
    if (hoverCell) {
      const { x, y } = hoverCell;
      const ok = canPlace(x, y, selectedLen, horizontal);
      sctx.save();
      sctx.globalAlpha = 0.35;
      sctx.fillStyle = ok ? "rgba(120,160,255,0.35)" : "rgba(255,120,140,0.28)";
      if (horizontal) {
        sctx.fillRect(x * cellSize, y * cellSize, selectedLen * cellSize, cellSize);
      } else {
        sctx.fillRect(x * cellSize, y * cellSize, cellSize, selectedLen * cellSize);
      }
      sctx.restore();
    }
  }

  // ====== ЛОББИ ======
  const playersList = $("playersList");
  const onlineCount = $("onlineCount");
  const statusBox = $("statusBox");

  const onlinePlayers = Array.from({ length: 12 }, (_, i) => `user${i + 1}`);

  function renderPlayers() {
    playersList.innerHTML = "";
    onlineCount.textContent = String(onlinePlayers.length);
    onlinePlayers.forEach((u) => {
      const b = document.createElement("button");
      b.className = "playerBtn";
      b.textContent = u;
      b.addEventListener("click", () => startMatchWith(u));
      playersList.appendChild(b);
    });
  }

  // ====== МАТЧ 1×1 ======
  const myCanvas = $("myCanvas");
  const enemyCanvas = $("enemyCanvas");
  const myCtx = myCanvas.getContext("2d");
  const enCtx = enemyCanvas.getContext("2d");
  const matchTitle = $("matchTitle");
  const turnHint = $("turnHint");

  let myGrid = makeGrid(GRID, 0);      // 0 пусто, 1 корабль, 3 попадание, 4 промах
  let enemyGrid = makeGrid(GRID, 0);   // 0 неизвестно, 3 попадание, 4 промах
  let enemyShips = []; // для проверки попаданий

  $("btnMatchRestart").addEventListener("click", () => {
    showScreen("lobby");
    statusBox.textContent = "Выбери игрока слева, чтобы начать 1×1.";
  });

  function cloneGrid(g) { return g.map(r => r.slice()); }

  function setupGridToMatch(g) {
    const out = makeGrid(GRID, 0);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) out[y][x] = (g[y][x] === 1) ? 1 : 0;
    }
    return out;
  }

  function generateEnemyShipsSimple() {
    const grid = makeGrid(GRID, 0);
    const ships = [];

    const fleet = [
      { len: 4, count: 1 },
      { len: 3, count: 2 },
      { len: 2, count: 3 },
      { len: 1, count: 4 },
    ];

    function canPlaceLocal(x, y, len, horiz) {
      if (horiz) {
        if (x + len > GRID) return false;
        for (let i = 0; i < len; i++) if (grid[y][x+i] !== 0) return false;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=len; dx++){
            const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=GRID||ny>=GRID) continue;
            if(grid[ny][nx] === 1) return false;
          }
        }
        return true;
      } else {
        if (y + len > GRID) return false;
        for (let i = 0; i < len; i++) if (grid[y+i][x] !== 0) return false;
        for (let dy=-1; dy<=len; dy++){
          for (let dx=-1; dx<=1; dx++){
            const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=GRID||ny>=GRID) continue;
            if(grid[ny][nx] === 1) return false;
          }
        }
        return true;
      }
    }

    function placeLocal(x,y,len,horiz){
      const cells=[];
      if(horiz){
        for(let i=0;i<len;i++){ grid[y][x+i]=1; cells.push([x+i,y]); }
      } else {
        for(let i=0;i<len;i++){ grid[y+i][x]=1; cells.push([x,y+i]); }
      }
      ships.push({ len, cells });
    }

    for (const f of fleet) {
      for (let c = 0; c < f.count; c++) {
        let placed = false;
        for (let tries=0; tries<800 && !placed; tries++){
          const horiz = Math.random() < 0.5;
          const x = Math.floor(Math.random()*GRID);
          const y = Math.floor(Math.random()*GRID);
          if(canPlaceLocal(x,y,f.len,horiz)){
            placeLocal(x,y,f.len,horiz);
            placed = true;
          }
        }
      }
    }

    ships.__grid = grid;
    return ships;
  }

  // анимация попаданий
  let lastHitAnim = null; // {x,y,t0,hit:true/false}
  function animPulse(ctx, x, y, cellSize, hit) {
    const now = performance.now();
    const dt = Math.min(1, (now - lastHitAnim.t0) / 320);
    const r = (0.10 + 0.18 * dt) * cellSize;
    ctx.save();
    ctx.globalAlpha = (1 - dt) * 0.65;
    ctx.fillStyle = hit ? "rgba(255,120,140,0.85)" : "rgba(220,230,255,0.70)";
    ctx.beginPath();
    ctx.arc((x+0.5)*cellSize, (y+0.5)*cellSize, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    if (dt < 1) requestAnimationFrame(drawMatch);
    else lastHitAnim = null;
  }

  function drawMarks(ctx, grid, cellSize) {
    for (let y=0;y<GRID;y++){
      for (let x=0;x<GRID;x++){
        const v = grid[y][x];
        if (v === 3) { // hit
          ctx.fillStyle = "rgba(255,120,140,0.55)";
          ctx.beginPath();
          ctx.arc((x+0.5)*cellSize, (y+0.5)*cellSize, cellSize*0.14, 0, Math.PI*2);
          ctx.fill();
        }
        if (v === 4) { // miss
          ctx.fillStyle = "rgba(220,230,255,0.45)";
          ctx.beginPath();
          ctx.arc((x+0.5)*cellSize, (y+0.5)*cellSize, cellSize*0.09, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }

  function drawMatch() {
    const myCell = myCanvas.width / GRID;
    const enCell = enemyCanvas.width / GRID;

    // MY поле
    drawGridBase(myCtx, GRID, myCell);
    const myShips = extractShipsFromGrid(myGrid);
    for (const ship of myShips) drawShip(myCtx, ship, myCell);
    drawMarks(myCtx, myGrid, myCell);

    // ENEMY поле
    drawGridBase(enCtx, GRID, enCell);
    drawMarks(enCtx, enemyGrid, enCell);

    // пульс попадания/промаха
    if (lastHitAnim) {
      animPulse(enCtx, lastHitAnim.x, lastHitAnim.y, enCell, lastHitAnim.hit);
    }
  }

  function startMatchWith(user) {
    matchTitle.textContent = `Бой 1×1 vs ${user}`;
    statusBox.textContent = `Выбран игрок: ${user}. Переходим в бой…`;

    myGrid = cloneGrid(setupGridToMatch(setupGrid));
    enemyGrid = makeGrid(GRID, 0);
    enemyShips = generateEnemyShipsSimple();

    drawMatch();
    showScreen("match");
    turnHint.textContent = "Тапай по полю противника, чтобы стрелять";
  }

  enemyCanvas.addEventListener("pointerdown", (e) => {
    const rect = enemyCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (enemyCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (enemyCanvas.height / rect.height);
    const cellSize = enemyCanvas.width / GRID;
    const x = Math.floor(px / cellSize);
    const y = Math.floor(py / cellSize);

    if (x<0||y<0||x>=GRID||y>=GRID) return;
    if (enemyGrid[y][x] === 3 || enemyGrid[y][x] === 4) return;

    const enemyShipGrid = enemyShips.__grid;
    const hit = enemyShipGrid[y][x] === 1;
    enemyGrid[y][x] = hit ? 3 : 4;

    lastHitAnim = { x, y, t0: performance.now(), hit };
    drawMatch();
  });

  // ====== Инициализация ======
  showScreen("home", true);
  renderPlayers();
  resetSetup();

  // Telegram WebView: не даём странице скроллиться
  document.addEventListener("touchmove", (e) => {
    if (!chatModal.classList.contains("show") && !modal.classList.contains("show")) {
      e.preventDefault();
    }
  }, { passive: false });

})();