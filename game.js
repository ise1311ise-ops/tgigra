(() => {
  const $ = (id) => document.getElementById(id);

  // ===== TG WebView: реальный vh и авто-масштаб “как SeaBattle” =====
  function fitTelegram() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty("--vh", `${vh}px`);

    const baseW = 1050;
    const baseH = 590;

    const vw = window.innerWidth;
    const vhpx = window.innerHeight;

    // SeaBattle на телефоне обычно “вписан по ширине”
    const scaleByW = vw / baseW;
    const scaleByH = vhpx / baseH;

    // берём минимальный, чтобы не обрезало
    const s = Math.min(scaleByW, scaleByH) * 0.995;

    document.documentElement.style.setProperty("--scale", s.toFixed(4));
  }
  window.addEventListener("resize", fitTelegram);
  window.addEventListener("orientationchange", fitTelegram);
  fitTelegram();

  // ===== Navigation screens =====
  const screens = {
    home: $("screenHome"),
    setup: $("screenSetup"),
    lobby: $("screenLobby"),
    match: $("screenMatch"),
  };

  const sheetTitle = $("sheetTitle");
  const btnChatTop = $("btnChatTop");

  const stack = [];

  function show(name, push = true) {
    Object.entries(screens).forEach(([k, el]) => {
      el.classList.toggle("active", k === name);
      el.setAttribute("aria-hidden", k === name ? "false" : "true");
    });

    if (push) stack.push(name);

    if (name === "home") sheetTitle.textContent = "Морской бой — онлайн игра";
    if (name === "setup") sheetTitle.textContent = "Морской бой — расстановка";
    if (name === "lobby") sheetTitle.textContent = "Игровой зал";
    if (name === "match") sheetTitle.textContent = "Морской бой — онлайн";

    // чат доступен только в лобби
    btnChatTop.style.display = (name === "lobby") ? "inline-block" : "none";
  }

  // ===== MODAL =====
  const modal = $("modal");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");

  function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
  $("modalOk").addEventListener("click", closeModal);
  $("modalClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // ===== CHAT =====
  const chat = $("chat");
  const chatBody = $("chatBody");
  const chatInput = $("chatInput");

  const messages = [
    { u: "user3", t: "всем привет" },
    { u: "user7", t: "кто на 1×1?" },
    { u: "user2", t: "го" },
  ];

  function esc(s){
    return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  function renderChat(){
    chatBody.innerHTML = messages.map(m => `<div class="msg"><b>${esc(m.u)}:</b> ${esc(m.t)}</div>`).join("");
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function openChat(){
    renderChat();
    chat.classList.add("show");
    chat.setAttribute("aria-hidden","false");
    setTimeout(()=>chatInput.focus(), 50);
  }
  function closeChat(){
    chat.classList.remove("show");
    chat.setAttribute("aria-hidden","true");
  }

  $("btnChatTop").addEventListener("click", openChat);
  $("chatClose").addEventListener("click", closeChat);
  chat.addEventListener("click", (e)=>{ if(e.target===chat) closeChat(); });

  function sendChat(){
    const t = chatInput.value.trim();
    if(!t) return;
    messages.push({u:"you", t});
    chatInput.value="";
    renderChat();
  }
  $("chatSend").addEventListener("click", sendChat);
  chatInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter") sendChat(); });

  // ===== HOME кнопки =====
  $("btnOnline").addEventListener("click", () => {
    resetSetup();
    show("setup");
  });
  $("btnSettings").addEventListener("click", () => openModal("Настройки", "Пока макет UI."));
  $("btnSupport").addEventListener("click", () => openModal("Поддержка", "Пока макет UI."));
  $("homeHelp").addEventListener("click", () => openModal("Подсказка", "Выбери “Онлайн игра” → расставь флот → Старт."));

  $("btnShare").addEventListener("click", async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: "SeaBattle UI", url });
      else {
        await navigator.clipboard.writeText(url);
        openModal("Поделиться", "Ссылка скопирована ✅");
      }
    } catch {
      openModal("Поделиться", "Не удалось. Скопируй ссылку вручную.");
    }
  });

  // ===== Setup screen buttons =====
  $("btnToHomeFromSetup").addEventListener("click", () => show("home"));
  $("btnShareSetup").addEventListener("click", () => openModal("Поделиться", "Здесь позже будет шаринг."));
  $("btnDots").addEventListener("click", () => openModal("Меню", "Пока макет UI."));

  // ====== GAME DATA ======
  const GRID = 10;

  function makeGrid(fill=0){
    return Array.from({length:GRID},()=>Array.from({length:GRID},()=>fill));
  }

  // setup grid: 0 empty, 1 ship
  let setupGrid = makeGrid(0);

  // корабли как в классике: 4x1, 3x2, 2x3, 1x4
  const fleet = [
    {len:4, count:1},
    {len:3, count:2},
    {len:2, count:3},
    {len:1, count:4},
  ];
  let fleetLeft = fleet.map(f => ({...f, left:f.count}));
  let selectedLen = 4;
  let horizontal = true;

  const setupCanvas = $("setupCanvas");
  const sctx = setupCanvas.getContext("2d");

  // ===== Drawing “blue pen” style =====
  function drawBoard(ctx, grid, showShips=true){
    const w = ctx.canvas.width;
    const cell = w / GRID;

    ctx.clearRect(0,0,w,w);

    // рамка толстая
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(52,50,168,.85)";
    ctx.strokeRect(3,3,w-6,w-6);

    // тонкая сетка
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(52,50,168,.22)";
    for(let i=1;i<GRID;i++){
      const p=i*cell;
      ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,w); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,p); ctx.lineTo(w,p); ctx.stroke();
    }

    // цифры сверху + буквы слева (как на скрине)
    ctx.fillStyle = "rgba(52,50,168,.85)";
    ctx.font = "900 18px system-ui";
    for(let i=0;i<GRID;i++){
      ctx.fillText(String(i+1), i*cell + cell*0.35, 22);
    }
    const letters = ["А","Б","В","Г","Д","Е","Ж","З","И","К"];
    for(let i=0;i<GRID;i++){
      ctx.fillText(letters[i], 10, i*cell + cell*0.62);
    }

    if(showShips){
      // рисуем корабли “корпусом” в синем цвете
      for(let y=0;y<GRID;y++){
        for(let x=0;x<GRID;x++){
          if(grid[y][x]!==1) continue;
          ctx.fillStyle = "rgba(52,50,168,.35)";
          ctx.fillRect(x*cell+6, y*cell+6, cell-12, cell-12);

          ctx.strokeStyle = "rgba(52,50,168,.65)";
          ctx.lineWidth = 3;
          ctx.strokeRect(x*cell+6, y*cell+6, cell-12, cell-12);
        }
      }
    }
  }

  function inBounds(x,y){ return x>=0 && y>=0 && x<GRID && y<GRID; }

  function canPlace(x,y,len,horiz){
    if(horiz){
      if(x+len>GRID) return false;
      for(let i=0;i<len;i++){
        if(setupGrid[y][x+i]===1) return false;
      }
      // нельзя касаться (8-соседей)
      for(let dy=-1; dy<=1; dy++){
        for(let dx=-1; dx<=len; dx++){
          const nx=x+dx, ny=y+dy;
          if(!inBounds(nx,ny)) continue;
          if(setupGrid[ny][nx]===1) return false;
        }
      }
      return true;
    } else {
      if(y+len>GRID) return false;
      for(let i=0;i<len;i++){
        if(setupGrid[y+i][x]===1) return false;
      }
      for(let dy=-1; dy<=len; dy++){
        for(let dx=-1; dx<=1; dx++){
          const nx=x+dx, ny=y+dy;
          if(!inBounds(nx,ny)) continue;
          if(setupGrid[ny][nx]===1) return false;
        }
      }
      return true;
    }
  }

  function placeShip(x,y,len,horiz){
    if(horiz){
      for(let i=0;i<len;i++) setupGrid[y][x+i]=1;
    } else {
      for(let i=0;i<len;i++) setupGrid[y+i][x]=1;
    }
  }

  function allPlaced(){
    return fleetLeft.every(f => f.left===0);
  }

  // fleet UI (в “как на скрине”: кораблики справа)
  const fleetRow = $("fleetRow");

  function renderFleet(){
    fleetRow.innerHTML="";
    for(const f of fleetLeft){
      const card=document.createElement("div");
      card.className="shipCard" + (selectedLen===f.len ? " selected":"");
      card.innerHTML=`
        <div>
          <div class="shipDots">${Array.from({length:f.len}).map(()=>`<span class="shipDot"></span>`).join("")}</div>
        </div>
        <div class="shipMeta">
          <div>${f.len}-палубный</div>
          <span>осталось: ${f.left}</span>
        </div>
      `;
      card.addEventListener("click",()=>{
        selectedLen=f.len;
        renderFleet();
      });
      fleetRow.appendChild(card);
    }
  }

  function resetSetup(){
    setupGrid = makeGrid(0);
    fleetLeft = fleet.map(f=>({...f,left:f.count}));
    selectedLen = 4;
    horizontal = true;
    $("btnStartLobby").disabled = true;
    drawBoard(sctx, setupGrid, true);
    renderFleet();
  }

  // rotate + auto + start
  $("btnRotate").addEventListener("click",()=>{
    horizontal=!horizontal;
    openModal("Поворот", horizontal ? "Горизонтально" : "Вертикально");
  });

  $("btnAuto").addEventListener("click",()=>{
    resetSetup();
    // простая автогенерация
    for(const f of fleetLeft){
      while(f.left>0){
        let placed=false;
        for(let tries=0; tries<800 && !placed; tries++){
          const horiz = Math.random()<0.5;
          const x = Math.floor(Math.random()*GRID);
          const y = Math.floor(Math.random()*GRID);
          if(canPlace(x,y,f.len,horiz)){
            placeShip(x,y,f.len,horiz);
            f.left--;
            placed=true;
          }
        }
        if(!placed) break;
      }
    }
    drawBoard(sctx, setupGrid, true);
    renderFleet();
    $("btnStartLobby").disabled = !allPlaced();
  });

  $("btnStartLobby").addEventListener("click",()=>{
    show("lobby");
    renderPlayers();
  });

  // клик по полю расстановки
  setupCanvas.addEventListener("pointerdown",(e)=>{
    const rect = setupCanvas.getBoundingClientRect();
    const px = (e.clientX-rect.left) * (setupCanvas.width/rect.width);
    const py = (e.clientY-rect.top) * (setupCanvas.height/rect.height);
    const cell = setupCanvas.width/GRID;
    const x = Math.floor(px/cell);
    const y = Math.floor(py/cell);

    const f = fleetLeft.find(v=>v.len===selectedLen);
    if(!f || f.left<=0) return;

    if(!canPlace(x,y,selectedLen,horizontal)) return;

    placeShip(x,y,selectedLen,horizontal);
    f.left--;

    drawBoard(sctx, setupGrid, true);
    renderFleet();
    $("btnStartLobby").disabled = !allPlaced();
  });

  // ===== Lobby =====
  $("btnToHomeFromLobby").addEventListener("click",()=>show("home"));

  const playersGrid = $("playersGrid");
  const players = Array.from({length:12},(_,i)=>`user${i+1}`);

  function renderPlayers(){
    playersGrid.innerHTML="";
    players.forEach(u=>{
      const b=document.createElement("button");
      b.className="playerBtn";
      b.textContent=u;
      b.addEventListener("click",()=>startMatch(u));
      playersGrid.appendChild(b);
    });
  }

  // ===== Match =====
  const myCanvas = $("myCanvas");
  const enemyCanvas = $("enemyCanvas");
  const myCtx = myCanvas.getContext("2d");
  const enCtx = enemyCanvas.getContext("2d");

  let myGrid = makeGrid(0);
  let enemyMarks = makeGrid(0); // 0 none, 3 hit, 4 miss

  function cloneShipsFromSetup(){
    const g=makeGrid(0);
    for(let y=0;y<GRID;y++) for(let x=0;x<GRID;x++) g[y][x]= setupGrid[y][x]===1?1:0;
    return g;
  }

  function drawMatchBoards(){
    drawBoard(myCtx, myGrid, true);
    drawBoard(enCtx, makeGrid(0), false);

    // рисуем точки выстрелов на поле врага
    const w = enemyCanvas.width;
    const cell = w/GRID;

    for(let y=0;y<GRID;y++){
      for(let x=0;x<GRID;x++){
        if(enemyMarks[y][x]===0) continue;

        if(enemyMarks[y][x]===4){
          enCtx.fillStyle="rgba(52,50,168,.45)";
          enCtx.beginPath();
          enCtx.arc(x*cell+cell/2, y*cell+cell/2, cell*0.12, 0, Math.PI*2);
          enCtx.fill();
        }
        if(enemyMarks[y][x]===3){
          enCtx.fillStyle="rgba(220,60,60,.55)";
          enCtx.beginPath();
          enCtx.arc(x*cell+cell/2, y*cell+cell/2, cell*0.14, 0, Math.PI*2);
          enCtx.fill();
        }
      }
    }
  }

  function startMatch(user){
    $("matchVs").textContent = `Бой 1×1 vs ${user}`;
    myGrid = cloneShipsFromSetup();
    enemyMarks = makeGrid(0);
    show("match");
    drawMatchBoards();
  }

  $("btnBackToLobby").addEventListener("click",()=>show("lobby"));
  $("btnRestart").addEventListener("click",()=>startMatch("user1"));

  // выстрел по полю врага (макет)
  enemyCanvas.addEventListener("pointerdown",(e)=>{
    const rect = enemyCanvas.getBoundingClientRect();
    const px = (e.clientX-rect.left) * (enemyCanvas.width/rect.width);
    const py = (e.clientY-rect.top) * (enemyCanvas.height/rect.height);
    const cell = enemyCanvas.width/GRID;
    const x = Math.floor(px/cell);
    const y = Math.floor(py/cell);
    if(x<0||y<0||x>=GRID||y>=GRID) return;
    if(enemyMarks[y][x]!==0) return;

    // просто псевдо-рандом попадания
    enemyMarks[y][x] = (Math.random()<0.28) ? 3 : 4;
    drawMatchBoards();
  });

  // ===== Init =====
  $("btnStartLobby").disabled = true;
  show("home", true);
  resetSetup();
  renderPlayers();

  // на мобильных запрещаем скролл страницы, но оставляем скролл чату
  document.addEventListener("touchmove",(e)=>{
    const inChat = e.target.closest(".chatBody");
    if(!inChat && !chat.classList.contains("show") && !modal.classList.contains("show")){
      e.preventDefault();
    }
  }, {passive:false});

})();