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

  // История переходов (для кнопки Назад)
  const navStack = [];

  function showScreen(name, push = true) {
    Object.values(Screens).forEach(s => {
      s.classList.remove("active");
      s.setAttribute("aria-hidden", "true");
    });
    Screens[name].classList.add("active");
    Screens[name].setAttribute("aria-hidden", "false");

    if (push) navStack.push(name);

    // Заголовки и кнопки
    if (name === "home") topTitle.textContent = "Морской бой — онлайн игра";
    if (name === "setup") topTitle.textContent = "Расстановка";
    if (name === "lobby") topTitle.textContent = "Игровой зал";
    if (name === "match") topTitle.textContent = "Бой 1×1";

    // Back: скрываем на главной
    btnBack.style.visibility = (name === "home") ? "hidden" : "visible";

    // Чат: доступен только в лобби (и можно оставить в матче по желанию)
    btnTopChat.style.visibility = (name === "lobby") ? "visible" : "hidden";
  }

  function goBack() {
    if (navStack.length <= 1) return;
    navStack.pop();
    const prev = navStack[navStack.length - 1];
    showScreen(prev, false);
  }

  // Модалка
  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add("show");
  }
  function closeModal() {
    modal.classList.remove("show");
  }

  // Чат
  const chatMessages = [
    { user: "user3", text: "всем привет 👋" },
    { user: "user7", text: "кто на 1×1?" },
    { user: "user2", text: "я готов" },
  ];

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

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  // ====== Экран HOME ======
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
        openModal("Поделиться", "Ссылка скопирована в буфер обмена ✅");
      }
    } catch {
      openModal("Поделиться", "Не удалось поделиться. Скопируй ссылку вручную.");
    }
  });
  $("goSupport").addEventListener("click", () => openModal("Поддержка", "Пока макет UI. Здесь будет помощь/как играть."));

  // ====== Верхние кнопки ======
  btnBack.addEventListener("click", goBack);
  btnTopChat.addEventListener("click", openChat);
  $("btnLobbyChat").addEventListener("click", openChat);
  chatClose.addEventListener("click", closeChat);
  chatModal.addEventListener("click", (e) => { if (e.target === chatModal) closeChat(); });
  chatSend.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

  function sendChat() {
    const t = chatInput.value.trim();
    if (!t) return;
    chatMessages.push({ user: "you", text: t });
    chatInput.value = "";
    renderChat();
  }

  modalOk.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // ====== Расстановка (логика упрощённая, но корректная по флоту) ======
  const setupCanvas = $("setupCanvas");
  const sctx = setupCanvas.getContext("2d");

  const GRID = 10;
  const cell = 36; // canvas 360 = 10*36

  // 0 пусто, 1 корабль, 2 запрет (рядом)
  let setupGrid = makeGrid(GRID, 0);

  // Флот классика: 1x4, 2x3, 3x2, 4x1
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

  btnClearSetup.addEventListener("click", () => {
    resetSetup();
  });

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

  function makeGrid(n, fill) {
    return Array.from({ length: n }, () => Array.from({ length: n }, () => fill));
  }

  function renderFleet() {
    fleetList.innerHTML = "";
    fleetState.forEach((f) => {
      for (let i = 0; i < f.count; i++) {
        // рисуем карточки по длинам, но кликабельна только длина (не “двойной выбор”)
        // делаем 1 кнопку на длину
      }
    });

    const unique = fleetState.map(f => f.len);
    unique.forEach((len) => {
      const left = fleetState.find(f => f.len === len).left;
      const item = document.createElement("div");
      item.className = "fleetItem" + (selectedLen === len ? " selected" : "");
      item.dataset.len = String(len);
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
      for (let i = 0; i < len; i++) {
        if (setupGrid[y][x + i] !== 0) return false;
      }
      // проверка соседей (включая диагонали)
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
      for (let i = 0; i < len; i++) {
        if (setupGrid[y + i][x] !== 0) return false;
      }
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
    if (horiz) {
      for (let i = 0; i < len; i++) setupGrid[y][x + i] = 1;
    } else {
      for (let i = 0; i < len; i++) setupGrid[y + i][x] = 1;
    }
    // пометим "запрет" вокруг (для визуала), но не мешаем логике (0/1 достаточно)
    markForbidden();
  }

  function markForbidden() {
    // очистить запреты
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (setupGrid[y][x] === 2) setupGrid[y][x] = 0;
      }
    }
    // поставить 2 вокруг 1
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
    // сами корабли обратно в 1 (важно)
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        // ничего
      }
    }
  }

  setupCanvas.addEventListener("pointerdown", (e) => {
    const rect = setupCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (setupCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (setupCanvas.height / rect.height);
    const x = Math.floor(px / cell);
    const y = Math.floor(py / cell);

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
    sctx.clearRect(0, 0, setupCanvas.width, setupCanvas.height);

    // сетка + клетки
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const v = setupGrid[y][x];
        const rx = x * cell;
        const ry = y * cell;

        // фон клетки
        sctx.fillStyle = "rgba(255,255,255,0.03)";
        sctx.fillRect(rx, ry, cell, cell);

        // запрет
        if (v === 2) {
          sctx.fillStyle = "rgba(255,120,140,0.10)";
          sctx.fillRect(rx, ry, cell, cell);
        }

        // корабль
        if (v === 1) {
          sctx.fillStyle = "rgba(120,160,255,0.35)";
          sctx.fillRect(rx + 3, ry + 3, cell - 6, cell - 6);
        }

        // рамка
        sctx.strokeStyle = "rgba(140,170,255,0.20)";
        sctx.strokeRect(rx, ry, cell, cell);
      }
    }

    // подсветка превью выбранного корабля (в центре, просто визуал)
    // (можно не делать, чтобы не путать)
  }

  // ====== Лобби: игроки user1..user12, чат отдельной кнопкой ======
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

  // ====== Матч 1vs1 (макет) ======
  const myCanvas = $("myCanvas");
  const enemyCanvas = $("enemyCanvas");
  const myCtx = myCanvas.getContext("2d");
  const enCtx = enemyCanvas.getContext("2d");
  const matchTitle = $("matchTitle");
  const turnHint = $("turnHint");

  const MGRID = 10;
  let myGrid = makeGrid(MGRID, 0);      // 0 пусто, 1 корабль, 3 попадание, 4 промах
  let enemyGrid = makeGrid(MGRID, 0);   // 0 неизвестно, 3 попадание, 4 промах
  let enemyShips = []; // для проверки попаданий в макете

  $("btnMatchRestart").addEventListener("click", () => {
    // вернёмся в лобби
    showScreen("lobby");
    statusBox.textContent = "Выбери игрока слева, чтобы начать 1×1.";
  });

  function startMatchWith(user) {
    matchTitle.textContent = `Бой 1×1 vs ${user}`;
    statusBox.textContent = `Вызов отправлен: ${user}. Переходим в бой…`;

    // подготовим поля
    myGrid = cloneGrid(setupGridToMatch(setupGrid)); // перенесём твой флот
    enemyGrid = makeGrid(MGRID, 0);
    enemyShips = generateEnemyShipsSimple(); // автоген врага для макета

    drawMatch();
    showScreen("match");
    turnHint.textContent = "Тапай по полю противника, чтобы стрелять";
  }

  function setupGridToMatch(g) {
    // setupGrid: 0/1/2 -> match: 0/1
    const out = makeGrid(MGRID, 0);
    for (let y = 0; y < MGRID; y++) {
      for (let x = 0; x < MGRID; x++) {
        out[y][x] = (g[y][x] === 1) ? 1 : 0;
      }
    }
    return out;
  }

  function cloneGrid(g) {
    return g.map(row => row.slice());
  }

  function generateEnemyShipsSimple() {
    // Простой автоген строго по классическому флоту и правилам "не рядом"
    const grid = makeGrid(MGRID, 0);
    const ships = [];

    const fleet = [
      { len: 4, count: 1 },
      { len: 3, count: 2 },
      { len: 2, count: 3 },
      { len: 1, count: 4 },
    ];

    function canPlaceLocal(x, y, len, horiz) {
      if (horiz) {
        if (x + len > MGRID) return false;
        for (let i = 0; i < len; i++) if (grid[y][x+i] !== 0) return false;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=len; dx++){
            const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=MGRID||ny>=MGRID) continue;
            if(grid[ny][nx] === 1) return false;
          }
        }
        return true;
      } else {
        if (y + len > MGRID) return false;
        for (let i = 0; i < len; i++) if (grid[y+i][x] !== 0) return false;
        for (let dy=-1; dy<=len; dy++){
          for (let dx=-1; dx<=1; dx++){
            const nx=x+dx, ny=y+dy;
            if(nx<0||ny<0||nx>=MGRID||ny>=MGRID) continue;
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
      ships.push({ len, cells, hits: new Set() });
    }

    for (const f of fleet) {
      for (let c = 0; c < f.count; c++) {
        let placed = false;
        for (let tries=0; tries<500 && !placed; tries++){
          const horiz = Math.random() < 0.5;
          const x = Math.floor(Math.random()*MGRID);
          const y = Math.floor(Math.random()*MGRID);
          if(canPlaceLocal(x,y,f.len,horiz)){
            placeLocal(x,y,f.len,horiz);
            placed = true;
          }
        }
      }
    }

    // сохраним grid внутрь ships (для проверки попаданий)
    enemyShips.__grid = grid;
    return enemyShips;
  }

  function drawGrid(ctx, grid, showShips) {
    const size = ctx.canvas.width;
    const c = size / MGRID;

    ctx.clearRect(0,0,size,size);

    for (let y=0;y<MGRID;y++){
      for (let x=0;x<MGRID;x++){
        const rx=x*c, ry=y*c;

        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(rx,ry,c,c);

        const v = grid[y][x];

        if (showShips && v === 1) {
          ctx.fillStyle = "rgba(120,160,255,0.35)";
          ctx.fillRect(rx+3, ry+3, c-6, c-6);
        }
        if (v === 3) { // hit
          ctx.fillStyle = "rgba(255,120,140,0.40)";
          ctx.beginPath();
          ctx.arc(rx+c/2, ry+c/2, c*0.18, 0, Math.PI*2);
          ctx.fill();
        }
        if (v === 4) { // miss
          ctx.fillStyle = "rgba(220,230,255,0.40)";
          ctx.beginPath();
          ctx.arc(rx+c/2, ry+c/2, c*0.12, 0, Math.PI*2);
          ctx.fill();
        }

        ctx.strokeStyle = "rgba(140,170,255,0.20)";
        ctx.strokeRect(rx,ry,c,c);
      }
    }
  }

  function drawMatch() {
    drawGrid(myCtx, myGrid, true);
    drawGrid(enCtx, enemyGrid, false);
  }

  enemyCanvas.addEventListener("pointerdown", (e) => {
    const rect = enemyCanvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (enemyCanvas.width / rect.width);
    const py = (e.clientY - rect.top) * (enemyCanvas.height / rect.height);
    const c = enemyCanvas.width / MGRID;
    const x = Math.floor(px / c);
    const y = Math.floor(py / c);

    if (x<0||y<0||x>=MGRID||y>=MGRID) return;
    if (enemyGrid[y][x] === 3 || enemyGrid[y][x] === 4) return;

    const enemyShipGrid = enemyShips.__grid;
    const hit = enemyShipGrid[y][x] === 1;
    enemyGrid[y][x] = hit ? 3 : 4;

    drawMatch();
  });

  // ====== Инициализация ======
  // Важно: навигация стартует с home
  showScreen("home", true);
  renderPlayers();
  resetSetup();

  // Чтобы Telegram WebView не “подкручивал” скролл
  document.addEventListener("touchmove", (e) => {
    // запрещаем общий скролл
    if (!chatModal.classList.contains("show") && !modal.classList.contains("show")) {
      e.preventDefault();
    }
  }, { passive: false });

})();