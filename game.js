(() => {
  // Русские буквы как на скрине (10 строк)
  const ROWS = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];
  const COLS = [1,2,3,4,5,6,7,8,9,10];

  // флот: длины кораблей
  const FLEET = [4,3,3,2,2,2,1,1,1,1];

  const playerBoardEl = document.getElementById("playerBoard");
  const enemyBoardEl  = document.getElementById("enemyBoard");
  const statusEl      = document.getElementById("status");

  const btnRotate = document.getElementById("btnRotate");
  const btnAuto   = document.getElementById("btnAuto");
  const btnStart  = document.getElementById("btnStart");
  const btnRestart= document.getElementById("btnRestart");
  const btnHelp   = document.getElementById("btnHelp");
  const helpModal = document.getElementById("helpModal");
  const btnCloseHelp = document.getElementById("btnCloseHelp");

  // state
  let phase = "placement"; // placement | battle | gameover
  let orientation = "h";   // h | v
  let nextShipIndex = 0;

  // grids store:
  // 0 empty
  // 1 ship
  // 2 miss
  // 3 hit
  const player = createGameState();
  const enemy  = createGameState();

  // --- init UI ---
  buildBoard(playerBoardEl, "player");
  buildBoard(enemyBoardEl, "enemy");

  renderAll();

  // --- events ---
  btnRotate.addEventListener("click", () => {
    orientation = (orientation === "h" ? "v" : "h");
    setStatus(`Ориентация: ${orientation === "h" ? "горизонтально" : "вертикально"}.`);
  });

  btnAuto.addEventListener("click", () => {
    if (phase !== "placement") return;
    clearGrid(player);
    nextShipIndex = 0;
    autoPlaceFleet(player);
    nextShipIndex = FLEET.length;
    renderAll();
    setStatus("Флот расставлен автоматически. Нажми «Старт».");
  });

  btnStart.addEventListener("click", () => {
    if (phase === "placement") {
      if (!isFleetComplete(player)) {
        setStatus("Сначала расставь весь флот (или нажми «Авто»).");
        return;
      }
      // prepare enemy
      clearGrid(enemy);
      autoPlaceFleet(enemy);
      phase = "battle";
      lockPlacementUI();
      setStatus("Бой начался! Стреляй по полю противника.");
      renderAll();
      return;
    }

    if (phase === "gameover") {
      resetGame();
    }
  });

  btnRestart.addEventListener("click", () => resetGame());

  btnHelp.addEventListener("click", () => helpModal.showModal());
  btnCloseHelp.addEventListener("click", () => helpModal.close());

  // cell clicks delegated
  playerBoardEl.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-cell]");
    if (!cell) return;
    const x = +cell.dataset.x;
    const y = +cell.dataset.y;

    if (phase !== "placement") return;

    // manual placement
    if (nextShipIndex >= FLEET.length) {
      setStatus("Флот уже расставлен. Нажми «Старт».");
      return;
    }

    const len = FLEET[nextShipIndex];
    if (placeShip(player, x, y, len, orientation)) {
      nextShipIndex++;
      renderAll();

      if (nextShipIndex >= FLEET.length) {
        setStatus("Флот расставлен. Нажми «Старт».");
      } else {
        setStatus(`Поставь корабль длиной ${FLEET[nextShipIndex]}. (${nextShipIndex+1}/${FLEET.length})`);
      }
    } else {
      setStatus("Нельзя поставить сюда: пересечение/касание/выход за поле.");
    }
  });

  enemyBoardEl.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-cell]");
    if (!cell) return;

    if (phase !== "battle") return;

    const x = +cell.dataset.x;
    const y = +cell.dataset.y;

    // already shot
    if (enemy.grid[y][x] === 2 || enemy.grid[y][x] === 3) return;

    const hit = shoot(enemy, x, y);
    renderAll();

    if (isAllSunk(enemy)) {
      phase = "gameover";
      setStatus("Победа! Нажми «Старт», чтобы сыграть ещё раз.");
      btnStart.textContent = "Ещё раз";
      return;
    }

    if (!hit) {
      // AI turn
      setStatus("Мимо. Ход противника...");
      setTimeout(() => {
        aiTurn();
      }, 450);
    } else {
      setStatus("Попадание! Стреляй ещё.");
    }
  });

  // --- functions ---
  function createGameState() {
    return {
      grid: Array.from({ length: 10 }, () => Array(10).fill(0)),
      ships: [] // {cells:[{x,y}], hits:Set("x,y")}
    };
  }

  function clearGrid(state) {
    state.grid = Array.from({ length: 10 }, () => Array(10).fill(0));
    state.ships = [];
  }

  function buildBoard(container, type) {
    container.innerHTML = "";
    const gridEl = document.createElement("div");
    gridEl.className = "grid";

    // corner
    gridEl.appendChild(makeHdr(""));

    // top headers 1..10
    COLS.forEach(n => gridEl.appendChild(makeHdr(String(n))));

    // rows
    for (let y = 0; y < 10; y++) {
      // left header
      gridEl.appendChild(makeHdr(ROWS[y]));

      for (let x = 0; x < 10; x++) {
        const btn = document.createElement("button");
        btn.className = "cell";
        btn.type = "button";
        btn.setAttribute("data-cell", "1");
        btn.dataset.x = String(x);
        btn.dataset.y = String(y);
        btn.setAttribute("aria-label", `${ROWS[y]}${x+1}`);

        // enemy cells should be focusable too
        gridEl.appendChild(btn);
      }
    }

    container.appendChild(gridEl);

    // hint text
    if (type === "enemy") {
      container.title = "Стреляй по клеткам";
    } else {
      container.title = "Расстановка флота";
    }
  }

  function makeHdr(text) {
    const d = document.createElement("div");
    d.className = "hdr";
    d.textContent = text;
    return d;
  }

  function renderAll() {
    renderBoard(playerBoardEl, player, { showShips: true, disableShots: true });
    renderBoard(enemyBoardEl, enemy, { showShips: false, disableShots: (phase !== "battle") });
  }

  function renderBoard(container, state, opts) {
    const cells = container.querySelectorAll(".cell");
    cells.forEach((c) => {
      const x = +c.dataset.x;
      const y = +c.dataset.y;

      c.classList.remove("ship","hit","miss","cell--disabled");
      c.innerHTML = "";

      const v = state.grid[y][x];
      const isShip = (v === 1);
      const isMiss = (v === 2);
      const isHit  = (v === 3);

      if (opts.disableShots) c.classList.add("cell--disabled");

      if (opts.showShips && isShip) c.classList.add("ship");

      if (isMiss) {
        c.classList.add("miss");
        c.innerHTML = `<span class="mark">•</span>`;
      }
      if (isHit) {
        c.classList.add("hit");
        c.innerHTML = `<span class="mark">✕</span>`;
      }
    });
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function lockPlacementUI() {
    btnAuto.disabled = true;
    btnRotate.disabled = true;
    btnStart.textContent = "Игра...";
  }

  function unlockPlacementUI() {
    btnAuto.disabled = false;
    btnRotate.disabled = false;
    btnStart.textContent = "Старт";
  }

  function resetGame() {
    phase = "placement";
    orientation = "h";
    nextShipIndex = 0;

    clearGrid(player);
    clearGrid(enemy);

    unlockPlacementUI();
    btnStart.textContent = "Старт";
    setStatus("Расстановка: нажми «Авто» или ставь вручную.");
    renderAll();
  }

  // --- placement rules ---
  // Запрещаем не только пересечение, но и касание по диагонали/стороне (классика)
  function canPlace(state, x, y, len, orient) {
    const dx = orient === "h" ? 1 : 0;
    const dy = orient === "v" ? 1 : 0;

    const endX = x + dx * (len - 1);
    const endY = y + dy * (len - 1);
    if (endX < 0 || endX > 9 || endY < 0 || endY > 9) return false;

    // check each cell and its neighbors
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
        // редкий фейл — перегенерим всё
        clearGrid(state);
        return autoPlaceFleet(state);
      }
    }
  }

  function isFleetComplete(state) {
    return state.ships.length === FLEET.length;
  }

  // --- shooting ---
  function shoot(state, x, y) {
    const v = state.grid[y][x];
    if (v === 2 || v === 3) return false;

    if (v === 1) {
      state.grid[y][x] = 3;
      const ship = findShipByCell(state, x, y);
      if (ship) ship.hits.add(`${x},${y}`);
      return true;
    } else {
      state.grid[y][x] = 2;
      return false;
    }
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

  // --- AI ---
  // Простой "hunt/target": если попал — добивает вокруг
  const ai = {
    mode: "hunt",
    targets: [], // stack of {x,y}
    tried: new Set()
  };

  function aiTurn() {
    if (phase !== "battle") return;

    let shotCell = null;

    // target mode
    while (ai.targets.length) {
      const t = ai.targets.pop();
      const key = `${t.x},${t.y}`;
      if (t.x<0 || t.x>9 || t.y<0 || t.y>9) continue;
      if (ai.tried.has(key)) continue;
      shotCell = t;
      break;
    }

    // hunt mode
    if (!shotCell) {
      ai.mode = "hunt";
      shotCell = pickRandomUntried();
    }

    const key = `${shotCell.x},${shotCell.y}`;
    ai.tried.add(key);

    const hit = shoot(player, shotCell.x, shotCell.y);
    renderAll();

    if (isAllSunk(player)) {
      phase = "gameover";
      btnStart.textContent = "Ещё раз";
      setStatus("Поражение. Нажми «Старт», чтобы сыграть ещё раз.");
      return;
    }

    if (hit) {
      setStatus("Противник попал! Его ход продолжается...");
      // add neighbors for targeting
      ai.mode = "target";
      ai.targets.push(
        {x: shotCell.x+1, y: shotCell.y},
        {x: shotCell.x-1, y: shotCell.y},
        {x: shotCell.x, y: shotCell.y+1},
        {x: shotCell.x, y: shotCell.y-1},
      );
      // противник стреляет ещё раз
      setTimeout(aiTurn, 450);
    } else {
      setStatus("Ход твой.");
    }
  }

  function pickRandomUntried() {
    // немного лучше — случай по "шахматке" для эффективности, но оставим простым
    let guard = 0;
    while (guard++ < 5000) {
      const x = Math.floor(Math.random()*10);
      const y = Math.floor(Math.random()*10);
      const key = `${x},${y}`;
      if (!ai.tried.has(key) && player.grid[y][x] !== 2 && player.grid[y][x] !== 3) {
        return {x,y};
      }
    }
    // fallback
    for (let y=0;y<10;y++){
      for (let x=0;x<10;x++){
        const key = `${x},${y}`;
        if (!ai.tried.has(key)) return {x,y};
      }
    }
    return {x:0,y:0};
  }

  // init manual placement hint
  setStatus(`Поставь корабль длиной ${FLEET[nextShipIndex]}. (1/${FLEET.length})`);
})();