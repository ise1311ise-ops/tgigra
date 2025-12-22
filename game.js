(() => {
  const ROWS = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];
  const COLS = [1,2,3,4,5,6,7,8,9,10];
  const FLEET = [4,3,3,2,2,2,1,1,1,1];

  // screens
  const screens = {
    menu: document.getElementById("screenMenu"),
    top: document.getElementById("screenTop"),
    placement: document.getElementById("screenPlacement"),
    battle: document.getElementById("screenBattle"),
    result: document.getElementById("screenResult"),
  };

  // global nav buttons
  const btnHome = document.getElementById("btnHome");

  // menu buttons
  const btnGoPlacement = document.getElementById("btnGoPlacement");
  const btnGoTop = document.getElementById("btnGoTop");
  const btnMenuHelp = document.getElementById("btnMenuHelp");

  // top screen
  const btnBackFromTop = document.getElementById("btnBackFromTop");

  // placement screen elements
  const playerBoardEl = document.getElementById("playerBoard");
  const btnRotate = document.getElementById("btnRotate");
  const btnAuto = document.getElementById("btnAuto");
  const btnStartBattle = document.getElementById("btnStartBattle");
  const statusPlacement = document.getElementById("statusPlacement");
  const btnBackFromPlacement = document.getElementById("btnBackFromPlacement");

  // battle screen elements
  const playerBoardBattleEl = document.getElementById("playerBoardBattle");
  const enemyBoardEl = document.getElementById("enemyBoard");
  const statusBattle = document.getElementById("statusBattle");
  const btnRestart = document.getElementById("btnRestart");
  const btnBackFromBattle = document.getElementById("btnBackFromBattle");

  // result screen
  const resultTitle = document.getElementById("resultTitle");
  const resultText = document.getElementById("resultText");
  const btnPlayAgain = document.getElementById("btnPlayAgain");
  const btnResultHome = document.getElementById("btnResultHome");

  // help
  const btnHelp = document.getElementById("btnHelp");
  const helpModal = document.getElementById("helpModal");
  const btnCloseHelp = document.getElementById("btnCloseHelp");

  // --- state ---
  let orientation = "h";
  let nextShipIndex = 0;
  let phase = "placement"; // placement | battle | gameover

  const player = createGameState();
  const enemy = createGameState();

  const ai = {
    targets: [],
    tried: new Set()
  };

  // build boards
  buildBoard(playerBoardEl);
  buildBoard(playerBoardBattleEl);
  buildBoard(enemyBoardEl);

  // initial render
  resetToMenu();

  // --- navigation helpers ---
  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove("screen--active"));
    screens[name].classList.add("screen--active");
  }

  // --- events ---
  btnHome.addEventListener("click", () => resetToMenu());

  btnGoPlacement.addEventListener("click", () => {
    startPlacementFlow();
  });

  btnGoTop.addEventListener("click", () => showScreen("top"));
  btnBackFromTop.addEventListener("click", () => showScreen("menu"));

  btnMenuHelp.addEventListener("click", () => helpModal.showModal());
  btnHelp.addEventListener("click", () => helpModal.showModal());
  btnCloseHelp.addEventListener("click", () => helpModal.close());

  btnBackFromPlacement.addEventListener("click", () => showScreen("menu"));

  btnRotate.addEventListener("click", () => {
    orientation = (orientation === "h" ? "v" : "h");
    setPlacementStatus(`Ориентация: ${orientation === "h" ? "горизонтально" : "вертикально"}.`);
  });

  btnAuto.addEventListener("click", () => {
    if (phase !== "placement") return;
    clearGrid(player);
    nextShipIndex = 0;
    autoPlaceFleet(player);
    nextShipIndex = FLEET.length;
    renderPlacement();
    setPlacementStatus("Флот расставлен автоматически. Нажми «Старт».");
  });

  btnStartBattle.addEventListener("click", () => {
    if (!isFleetComplete(player)) {
      setPlacementStatus("Сначала расставь весь флот (или нажми «Авто»).");
      return;
    }
    startBattleFlow();
  });

  btnRestart.addEventListener("click", () => {
    startPlacementFlow();
  });

  btnBackFromBattle.addEventListener("click", () => {
    // "Сдаться" -> результат
    finishGame(false, true);
  });

  btnPlayAgain.addEventListener("click", () => startPlacementFlow());
  btnResultHome.addEventListener("click", () => resetToMenu());

  // placement clicks
  playerBoardEl.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-cell]");
    if (!cell) return;
    if (phase !== "placement") return;

    if (nextShipIndex >= FLEET.length) {
      setPlacementStatus("Флот уже расставлен. Нажми «Старт».");
      return;
    }

    const x = +cell.dataset.x;
    const y = +cell.dataset.y;
    const len = FLEET[nextShipIndex];

    if (placeShip(player, x, y, len, orientation)) {
      nextShipIndex++;
      renderPlacement();

      if (nextShipIndex >= FLEET.length) {
        setPlacementStatus("Флот расставлен. Нажми «Старт».");
      } else {
        setPlacementStatus(`Поставь корабль длиной ${FLEET[nextShipIndex]}. (${nextShipIndex+1}/${FLEET.length})`);
      }
    } else {
      setPlacementStatus("Нельзя поставить сюда: пересечение/касание/выход за поле.");
    }
  });

  // battle clicks (enemy shots)
  enemyBoardEl.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-cell]");
    if (!cell) return;
    if (phase !== "battle") return;

    const x = +cell.dataset.x;
    const y = +cell.dataset.y;

    // already shot
    if (enemy.grid[y][x] === 2 || enemy.grid[y][x] === 3) return;

    const hit = shoot(enemy, x, y);
    renderBattle();

    if (isAllSunk(enemy)) {
      finishGame(true, false);
      return;
    }

    if (!hit) {
      setBattleStatus("Мимо. Ход противника...");
      setTimeout(aiTurn, 380);
    } else {
      setBattleStatus("Попадание! Стреляй ещё.");
    }
  });

  // --- flow ---
  function resetToMenu(){
    showScreen("menu");
  }

  function startPlacementFlow(){
    phase = "placement";
    orientation = "h";
    nextShipIndex = 0;

    clearGrid(player);
    clearGrid(enemy);

    ai.targets = [];
    ai.tried = new Set();

    renderPlacement();
    setPlacementStatus(`Поставь корабль длиной ${FLEET[nextShipIndex]}. (1/${FLEET.length})`);
    showScreen("placement");
  }

  function startBattleFlow(){
    phase = "battle";

    clearGrid(enemy);
    autoPlaceFleet(enemy);

    // сброс AI
    ai.targets = [];
    ai.tried = new Set();

    renderBattle();
    setBattleStatus("Бой начался! Стреляй по полю противника.");
    showScreen("battle");
  }

  function finishGame(playerWon, surrendered){
    phase = "gameover";
    showScreen("result");

    if (surrendered) {
      resultTitle.textContent = "Сдался 😅";
      resultText.textContent = "Игра остановлена. Хочешь попробовать ещё раз?";
      return;
    }

    if (playerWon) {
      resultTitle.textContent = "Победа! 🏆";
      resultText.textContent = "Ты потопил весь флот противника.";
    } else {
      resultTitle.textContent = "Поражение";
      resultText.textContent = "Твой флот потоплен. Попробуем ещё раз?";
    }
  }

  // --- rendering ---
  function renderPlacement(){
    renderBoard(playerBoardEl, player, { showShips: true, disable: false });
  }

  function renderBattle(){
    renderBoard(playerBoardBattleEl, player, { showShips: true, disable: true });
    renderBoard(enemyBoardEl, enemy, { showShips: false, disable: false });
  }

  function setPlacementStatus(text){ statusPlacement.textContent = text; }
  function setBattleStatus(text){ statusBattle.textContent = text; }

  // --- board builder ---
  function buildBoard(container) {
    container.innerHTML = "";
    const gridEl = document.createElement("div");
    gridEl.className = "grid";

    gridEl.appendChild(makeHdr(""));

    COLS.forEach(n => gridEl.appendChild(makeHdr(String(n))));

    for (let y = 0; y < 10; y++) {
      gridEl.appendChild(makeHdr(ROWS[y]));
      for (let x = 0; x < 10; x++) {
        const btn = document.createElement("button");
        btn.className = "cell";
        btn.type = "button";
        btn.setAttribute("data-cell", "1");
        btn.dataset.x = String(x);
        btn.dataset.y = String(y);
        btn.setAttribute("aria-label", `${ROWS[y]}${x+1}`);
        gridEl.appendChild(btn);
      }
    }

    container.appendChild(gridEl);
  }

  function makeHdr(text) {
    const d = document.createElement("div");
    d.className = "hdr";
    d.textContent = text;
    return d;
  }

  function renderBoard(container, state, opts) {
    const cells = container.querySelectorAll(".cell");
    cells.forEach((c) => {
      const x = +c.dataset.x;
      const y = +c.dataset.y;

      c.classList.remove("ship","hit","miss","cell--disabled");
      c.innerHTML = "";

      if (opts.disable) c.classList.add("cell--disabled");

      const v = state.grid[y][x];
      if (opts.showShips && v === 1) c.classList.add("ship");

      if (v === 2) {
        c.classList.add("miss");
        c.innerHTML = `<span class="mark">•</span>`;
      }
      if (v === 3) {
        c.classList.add("hit");
        c.innerHTML = `<span class="mark">✕</span>`;
      }
    });
  }

  // --- game state helpers ---
  function createGameState() {
    return {
      grid: Array.from({ length: 10 }, () => Array(10).fill(0)),
      ships: []
    };
  }

  function clearGrid(state) {
    state.grid = Array.from({ length: 10 }, () => Array(10).fill(0));
    state.ships = [];
  }

  // placement rules (без касаний)
  function canPlace(state, x, y, len, orient) {
    const dx = orient === "h" ? 1 : 0;
    const dy = orient === "v" ? 1 : 0;

    const endX = x + dx * (len - 1);
    const endY = y + dy * (len - 1);
    if (endX < 0 || endX > 9 || endY < 0 || endY > 9) return false;

    for (let i = 0; i < len; i++) {
      const cx = x + dx*i;
      const cy = y + dy*i;

      if (state.grid[cy][cx] !== 0) return false;

      for (let ny = cy-1; ny <= cy+1; ny++) {
        for (let nx = cx-1; nx <= cx+1; nx++) {
          if (nx < 0 || nx > 9 || ny < 0 || ny > 9) continue;
          if (state.grid[ny][nx] === 1) return false;
        }
      }
    }
    return true;
  }

  function placeShip(state, x, y, len, orient) {
    if (!canPlace(state, x, y, len, orient)) return false;

    const dx = orient === "h" ? 1 : 0;
    const dy = orient === "v" ? 1 : 0;

    const cells = [];
    for (let i = 0; i < len; i++) {
      const cx = x + dx*i;
      const cy = y + dy*i;
      state.grid[cy][cx] = 1;
      cells.push({ x: cx, y: cy });
    }
    state.ships.push({ cells, hits: new Set() });
    return true;
  }

  function autoPlaceFleet(state) {
    for (const len of FLEET) {
      let placed = false;
      let guard = 0;

      while (!placed && guard++ < 5000) {
        const orient = Math.random() < 0.5 ? "h" : "v";
        const x = Math.floor(Math.random()*10);
        const y = Math.floor(Math.random()*10);
        if (placeShip(state, x, y, len, orient)) placed = true;
      }

      if (!placed) {
        clearGrid(state);
        return autoPlaceFleet(state);
      }
    }
  }

  function isFleetComplete(state) {
    return state.ships.length === FLEET.length;
  }

  function shoot(state, x, y) {
    const v = state.grid[y][x];
    if (v === 2 || v === 3) return false;

    if (v === 1) {
      state.grid[y][x] = 3;
      const ship = findShipByCell(state, x, y);
      if (ship) ship.hits.add(`${x},${y}`);
      return true;
    }
    state.grid[y][x] = 2;
    return false;
  }

  function findShipByCell(state, x, y) {
    for (const s of state.ships) {
      if (s.cells.some(c => c.x === x && c.y === y)) return s;
    }
    return null;
  }

  function isAllSunk(state) {
    return state.ships.every(s => s.hits.size === s.cells.length);
  }

  // --- AI (hunt/target) ---
  function aiTurn() {
    if (phase !== "battle") return;

    let shot = null;

    while (ai.targets.length) {
      const t = ai.targets.pop();
      if (!inBounds(t.x,t.y)) continue;
      const key = `${t.x},${t.y}`;
      if (ai.tried.has(key)) continue;
      shot = t; break;
    }

    if (!shot) shot = pickRandomUntried();

    ai.tried.add(`${shot.x},${shot.y}`);

    const hit = shoot(player, shot.x, shot.y);
    renderBattle();

    if (isAllSunk(player)) {
      finishGame(false, false);
      return;
    }

    if (hit) {
      setBattleStatus("Противник попал! Его ход продолжается...");
      ai.targets.push(
        {x: shot.x+1, y: shot.y},
        {x: shot.x-1, y: shot.y},
        {x: shot.x, y: shot.y+1},
        {x: shot.x, y: shot.y-1},
      );
      setTimeout(aiTurn, 380);
    } else {
      setBattleStatus("Ход твой.");
    }
  }

  function pickRandomUntried() {
    let guard = 0;
    while (guard++ < 5000) {
      const x = Math.floor(Math.random()*10);
      const y = Math.floor(Math.random()*10);
      const key = `${x},${y}`;
      if (!ai.tried.has(key) && player.grid[y][x] !== 2 && player.grid[y][x] !== 3) {
        return {x,y};
      }
    }
    for (let y=0;y<10;y++){
      for (let x=0;x<10;x++){
        const key = `${x},${y}`;
        if (!ai.tried.has(key)) return {x,y};
      }
    }
    return {x:0,y:0};
  }

  function inBounds(x,y){ return x>=0 && x<=9 && y>=0 && y<=9; }
})();