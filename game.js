/* Дирижабль: Экспедиция
   - Тап: качает давление => даёт эфир (тягу) + иногда металл
   - Давление конвертится в скорость (влияет на длительность рейсов)
   - Рейсы (узлы на карте): время + риск + награды
   - Шторм дня: больше риск, больше награда
   - Апгрейды: корпус/баки/насос/винт/слоты экипажа
   - Экипаж: даёт бонусы к риску/наградам/скорости/ремонту
   - Автосейв localStorage
*/

const KEY = "airship_expedition_v1";

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const now = () => Date.now();
const fmt = (n) => Math.floor(n).toLocaleString("ru-RU");

function hashStr(str){
  let h = 2166136261;
  for (let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h>>>0);
}
function rngInt(n){ return Math.floor(Math.random()*n); }
function pick(arr){ return arr[rngInt(arr.length)]; }

function weightedPick(items){
  const sum = items.reduce((s,x)=>s+x.w,0);
  let r = Math.random()*sum;
  for (const it of items){
    r -= it.w;
    if (r<=0) return it;
  }
  return items[items.length-1];
}

// ===== Content =====
const ZONES = [
  {
    id: 0,
    name: "Нижние облака",
    desc: "Тихие течения и лёгкая добыча. Идеально для старта.",
    nodes: [
      { id:"0-0", name:"Почтовый коридор", baseTime: 60, risk: 0.08, fuel: 6, rewards:{ scrap:[8,14], fuel:[1,3], artifact:0.02 } },
      { id:"0-1", name:"Старая мачта",      baseTime: 75, risk: 0.11, fuel: 7, rewards:{ scrap:[12,18], fuel:[0,2], artifact:0.03 } },
      { id:"0-2", name:"Туманный клапан",   baseTime: 95, risk: 0.14, fuel: 8, rewards:{ scrap:[16,24], fuel:[1,2], artifact:0.04 } },
      { id:"0-3", name:"Плато ветров",      baseTime: 120, risk:0.16, fuel: 9, rewards:{ scrap:[18,28], fuel:[0,3], artifact:0.05 } },
    ],
  },
  {
    id: 1,
    name: "Ржавые грозы",
    desc: "Сильные порывы. Добыча жирнее, но корпус страдает.",
    nodes: [
      { id:"1-0", name:"Грозовая арка",     baseTime: 120, risk:0.20, fuel: 10, rewards:{ scrap:[28,40], fuel:[0,3], artifact:0.06 } },
      { id:"1-1", name:"Разлом дирижаблей", baseTime: 150, risk:0.23, fuel: 12, rewards:{ scrap:[34,50], fuel:[1,4], artifact:0.08 } },
      { id:"1-2", name:"Шквал-воронка",     baseTime: 175, risk:0.26, fuel: 13, rewards:{ scrap:[40,60], fuel:[0,4], artifact:0.10 } },
      { id:"1-3", name:"Станция молний",    baseTime: 210, risk:0.29, fuel: 14, rewards:{ scrap:[48,72], fuel:[1,5], artifact:0.12 } },
    ],
  },
  {
    id: 2,
    name: "Высокий эфир",
    desc: "Редкие артефакты и бешеные риски. Нужны апгрейды и экипаж.",
    nodes: [
      { id:"2-0", name:"Белая струя",       baseTime: 190, risk:0.32, fuel: 15, rewards:{ scrap:[70,95],  fuel:[1,5], artifact:0.16 } },
      { id:"2-1", name:"Зеркальный поток",  baseTime: 220, risk:0.35, fuel: 16, rewards:{ scrap:[82,110], fuel:[0,6], artifact:0.18 } },
      { id:"2-2", name:"Сердце циклона",    baseTime: 260, risk:0.38, fuel: 18, rewards:{ scrap:[95,130], fuel:[1,7], artifact:0.22 } },
      { id:"2-3", name:"Ступень небес",     baseTime: 300, risk:0.41, fuel: 19, rewards:{ scrap:[110,150],fuel:[0,8], artifact:0.26 } },
    ],
  }
];

const ARTIFACTS = [
  { key:"Компас Эфира", w: 40, bonus:{ speed:+0.05 } },
  { key:"Кристалл Тяги", w: 28, bonus:{ aetherTap:+0.15 } },
  { key:"Клёпки Титана", w: 18, bonus:{ hullMax:+8 } },
  { key:"Магнит Шторма", w: 10, bonus:{ stormProfit:+0.10 } },
  { key:"Стабилизатор",  w: 4,  bonus:{ riskDown:+0.04 } },
];

const CREW_POOL = [
  { id:"eng",  name:"Инженер",   emoji:"🧰", desc:"+10% к ремонту, -2% риск", bonus:{ repair:+0.10, riskDown:+0.02 } },
  { id:"nav",  name:"Штурман",   emoji:"🧭", desc:"+8% скорость, -1% риск",   bonus:{ speed:+0.08, riskDown:+0.01 } },
  { id:"scav", name:"Сборщик",   emoji:"🧲", desc:"+12% металл с рейсов",     bonus:{ scrapUp:+0.12 } },
  { id:"chem", name:"Алхимик",   emoji:"⚗️", desc:"+10% топлива с рейсов",    bonus:{ fuelUp:+0.10 } },
  { id:"spark",name:"Грозник",   emoji:"⚡", desc:"Шторм: +10% профит, +2% риск", bonus:{ stormProfit:+0.10, stormRisk:+0.02 } },
  { id:"doc",  name:"Доктор",    emoji:"🩹", desc:"Урон корпуса -10%",        bonus:{ dmgDown:+0.10 } },
];

const UPGRADES = [
  { id:"pump", name:"Насос давления", max: 8, baseCost: 30, costMul: 1.45,
    desc:(lvl)=>`Тапы дают больше давления. Сейчас: +${(lvl*8)}%`,
    apply:(s)=>{} },
  { id:"prop", name:"Винт и редуктор", max: 8, baseCost: 40, costMul: 1.5,
    desc:(lvl)=>`Скорость рейсов выше. Сейчас: +${(lvl*6)}%`,
    apply:(s)=>{} },
  { id:"tank", name:"Топливные баки", max: 6, baseCost: 55, costMul: 1.55,
    desc:(lvl)=>`Макс. топливо выше. Сейчас: +${(lvl*10)}`,
    apply:(s)=>{} },
  { id:"hull", name:"Панцирь корпуса", max: 7, baseCost: 60, costMul: 1.55,
    desc:(lvl)=>`Макс. корпус выше. Сейчас: +${(lvl*12)}`,
    apply:(s)=>{} },
  { id:"crew", name:"Каюта экипажа", max: 4, baseCost: 75, costMul: 1.6,
    desc:(lvl)=>`Слоты экипажа. Сейчас: ${1+lvl}`,
    apply:(s)=>{} },
];

// ===== State =====
function defaultState(){
  return {
    version: 1,
    createdAt: now(),
    lastTick: now(),

    aether: 0,
    fuel: 25,
    fuelMax: 25,
    scrap: 0,

    pressure: 0,
    pressureMax: 100,

    hull: 60,
    hullMax: 60,

    zoneId: 0,
    unlockedZone: 0,
    unlockedNodes: { "0-0": true }, // прогресс по узлам

    upgrades: { pump:0, prop:0, tank:0, hull:0, crew:0 },

    crewOwned: ["eng","nav"], // доступные
    crewActive: ["eng"],      // активные
    crewSlots: 1,

    artifacts: [],

    flight: {
      active: false,
      startedAt: null,
      endsAt: null,
      nodeId: null,
      baseTime: null,
      risk: null,
      fuelCost: null,
      storm: false,
    },

    log: [],

    daily: makeDaily(),
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return defaultState();
    const s = JSON.parse(raw);
    if(!s || s.version !== 1) return defaultState();
    return s;
  } catch {
    return defaultState();
  }
}
function persist(){ localStorage.setItem(KEY, JSON.stringify(state)); }

// ===== Daily storm =====
function makeDaily(){
  const iso = new Date().toISOString().slice(0,10);
  const h = hashStr(iso);

  const storms = [
    { name:"Спокойно",  risk:+0.00, profit:+0.00 },
    { name:"Порывы",    risk:+0.03, profit:+0.06 },
    { name:"Гроза",     risk:+0.06, profit:+0.12 },
    { name:"Шторм",     risk:+0.09, profit:+0.18 },
  ];
  const st = storms[h % storms.length];

  return { iso, storm: st };
}
function ensureDailyFresh(){
  const iso = new Date().toISOString().slice(0,10);
  if (!state.daily || state.daily.iso !== iso){
    state.daily = makeDaily();
    log(`Новый день: шторм дня — ${state.daily.storm.name}`);
  }
}

// ===== Bonuses =====
function activeCrewBonuses(){
  const b = {
    speed:0,
    riskDown:0,
    scrapUp:0,
    fuelUp:0,
    stormProfit:0,
    stormRisk:0,
    repair:0,
    dmgDown:0,
    aetherTap:0,
    hullMax:0,
    stormProfitGlobal:0,
  };
  for (const id of state.crewActive){
    const c = CREW_POOL.find(x=>x.id===id);
    if(!c) continue;
    for (const k of Object.keys(c.bonus)){
      b[k] = (b[k]||0) + c.bonus[k];
    }
  }
  // артефакты
  for (const a of state.artifacts){
    if (a.bonus.speed) b.speed += a.bonus.speed;
    if (a.bonus.aetherTap) b.aetherTap += a.bonus.aetherTap;
    if (a.bonus.hullMax) b.hullMax += a.bonus.hullMax;
    if (a.bonus.stormProfit) b.stormProfit += a.bonus.stormProfit;
    if (a.bonus.riskDown) b.riskDown += a.bonus.riskDown;
  }
  return b;
}

function recomputeDerived(){
  const u = state.upgrades;

  state.fuelMax = 25 + u.tank*10;
  state.hullMax = 60 + u.hull*12;

  const bonuses = activeCrewBonuses();
  state.hullMax += Math.floor(bonuses.hullMax || 0);

  state.crewSlots = 1 + u.crew;

  state.fuel = clamp(state.fuel, 0, state.fuelMax);
  state.hull = clamp(state.hull, 0, state.hullMax);

  state.pressureMax = 100; // пока фикс, но можно апгрейдом расширить позже
  state.pressure = clamp(state.pressure, 0, state.pressureMax);
}

function speedMultiplier(){
  const u = state.upgrades;
  const bonuses = activeCrewBonuses();

  const prop = 1 + (u.prop * 0.06);       // до ~ +48%
  const crew = 1 + (bonuses.speed || 0);  // например +8%
  const pressure = 1 + (state.pressure / state.pressureMax) * 0.25; // до +25%

  return prop * crew * pressure;
}

function pumpMultiplier(){
  const u = state.upgrades;
  const base = 1 + (u.pump * 0.08); // до +64%
  const b = activeCrewBonuses();
  return base * (1 + (b.aetherTap || 0));
}

// ===== Logging / Toast =====
const el = (id)=>document.getElementById(id);

function log(line){
  const t = new Date().toTimeString().slice(0,8);
  state.log.push(`[${t}] ${line}`);
  if(state.log.length>240) state.log.shift();
}
function toast(msg){
  el("dayHint").textContent = `День: ${state.daily.iso} • ${msg}`;
  setTimeout(()=>renderDayHint(), 1400);
}
function renderDayHint(){
  el("dayHint").textContent = `День: ${state.daily.iso} • Шторм дня: ${state.daily.storm.name}`;
}

// ===== Core actions =====
function pump(){
  ensureDailyFresh();
  recomputeDerived();

  // давление растёт, чуть-чуть падает если переполнено
  const pGain = Math.ceil(6 * pumpMultiplier());
  state.pressure = clamp(state.pressure + pGain, 0, state.pressureMax);

  // эфир — “энергия ускорения”
  const aGain = 1 + (Math.random() < 0.25 ? 1 : 0);
  state.aether += aGain;

  // металл иногда
  if (Math.random() < 0.18) state.scrap += 1;

  renderTop();
}

function repair(){
  ensureDailyFresh();
  recomputeDerived();

  if (state.hull >= state.hullMax){
    toast("Корпус уже целый ✅");
    return;
  }
  const bonuses = activeCrewBonuses();
  const efficiency = 1 + (bonuses.repair || 0);

  const need = state.hullMax - state.hull;
  const baseFix = 10;
  const fix = Math.min(need, Math.floor(baseFix * efficiency));

  // стоимость: металл + эфир (чуть)
  const scrapCost = Math.max(2, Math.ceil(fix / 6));
  const aCost = Math.max(1, Math.ceil(fix / 12));

  if (state.scrap < scrapCost){ toast("Не хватает металла 🧱"); return; }
  if (state.aether < aCost){ toast("Не хватает эфира ✨"); return; }

  state.scrap -= scrapCost;
  state.aether -= aCost;
  state.hull = clamp(state.hull + fix, 0, state.hullMax);

  log(`Ремонт: +${fix} корпус (-${scrapCost} металл, -${aCost} эфир)`);
  toast("Починили корпус 🧰");
  renderAll();
}

function startFlight(nodeId){
  ensureDailyFresh();
  recomputeDerived();

  const node = findNode(nodeId);
  if (!node) return;

  if (state.flight.active){
    toast("Ты уже в полёте ✈️");
    return;
  }
  if (state.hull <= 0){
    toast("Корпус разрушен. Нужен ремонт.");
    return;
  }
  if (state.fuel < node.fuel){
    toast("Не хватает топлива ⛽");
    return;
  }

  // длительность зависит от скорости
  const sp = speedMultiplier();
  const duration = Math.max(20, Math.floor(node.baseTime / sp));

  state.fuel -= node.fuel;

  const storm = state.daily.storm.name !== "Спокойно";
  state.flight = {
    active: true,
    startedAt: now(),
    endsAt: now() + duration*1000,
    nodeId: node.id,
    baseTime: duration,
    risk: node.risk,
    fuelCost: node.fuel,
    storm,
  };

  log(`Вылет: ${node.name} (-${node.fuel} топлива), ETA ~${duration}s`);
  toast("Курс задан 🗺️");
  renderAll();
}

function boostFlight(){
  ensureDailyFresh();
  recomputeDerived();
  if (!state.flight.active) return;

  // ускорение сжигает эфир и сокращает время
  const cost = 6;
  if (state.aether < cost){
    toast("Не хватает эфира ✨");
    return;
  }
  state.aether -= cost;

  const cut = 7 + Math.floor(state.pressure / 40); // больше давления — лучше буст
  state.flight.endsAt -= cut*1000;

  // небольшой риск перегрева корпуса
  if (Math.random() < 0.08){
    const dmg = 1 + (rngInt(3));
    state.hull = clamp(state.hull - dmg, 0, state.hullMax);
    log(`Перегрев от буста: -${dmg} корпус`);
  }

  toast(`Ускорение: -${cut}s`);
  renderAll();
}

function finishFlight(){
  const f = state.flight;
  if(!f.active) return;

  const node = findNode(f.nodeId);
  if(!node){
    state.flight.active = false;
    return;
  }

  const bonuses = activeCrewBonuses();
  const storm = state.daily.storm;

  // риск и урон
  let risk = node.risk;
  risk -= (bonuses.riskDown || 0);
  if (f.storm) risk += storm.risk + (bonuses.stormRisk || 0);
  risk = clamp(risk, 0.02, 0.75);

  const hit = Math.random() < risk;

  let dmg = 0;
  if (hit){
    dmg = 4 + rngInt(9); // 4..12
    // доктор уменьшает урон
    if (bonuses.dmgDown) dmg = Math.max(1, Math.floor(dmg * (1 - bonuses.dmgDown)));
    state.hull = clamp(state.hull - dmg, 0, state.hullMax);
  }

  // награды
  const profitMult =
    1
    + (f.storm ? storm.profit : 0)
    + (bonuses.stormProfit || 0);

  const scrapBase = randRange(node.rewards.scrap[0], node.rewards.scrap[1]);
  const fuelBase  = randRange(node.rewards.fuel[0],  node.rewards.fuel[1]);

  let scrapGain = Math.floor(scrapBase * (1 + (bonuses.scrapUp || 0)) * profitMult);
  let fuelGain  = Math.floor(fuelBase  * (1 + (bonuses.fuelUp  || 0)) * profitMult);

  // немного эфира за “выгрузку”
  const aetherGain = 2 + rngInt(4);

  state.scrap += scrapGain;
  state.fuel  = clamp(state.fuel + fuelGain, 0, state.fuelMax);
  state.aether += aetherGain;

  // шанс артефакта
  const artChance = clamp(node.rewards.artifact * profitMult, 0, 0.65);
  let gotArtifact = null;
  if (Math.random() < artChance){
    const a = weightedPick(ARTIFACTS);
    gotArtifact = a.key;
    state.artifacts.push(a);
  }

  // прогресс узлов/зон
  unlockProgress(node.id);

  // завершение рейса
  state.flight.active = false;

  const dmgText = hit ? `, -${dmg} корпус` : "";
  const artText = gotArtifact ? `, артефакт: ${gotArtifact} ✨` : "";

  log(`Прибытие: ${node.name} (+${scrapGain} металл, +${fuelGain} топливо, +${aetherGain} эфир${dmgText}${artText})`);
  toast("Рейс завершён ✅");

  // если корпус умер — подсказка
  if (state.hull <= 0){
    log("⚠️ Корпус разрушен! Ремонт обязателен, иначе рейсы недоступны.");
    toast("Корпус в ноль! 🧨");
  }

  renderAll();
}

function unlockProgress(nodeId){
  // простая логика: открываем следующий узел в зоне, а если зона пройдена — следующую зону
  const [zStr, nStr] = nodeId.split("-");
  const z = Number(zStr), n = Number(nStr);
  const zone = ZONES[z];
  if(!zone) return;

  state.unlockedNodes[nodeId] = true;

  const nextN = n + 1;
  if (zone.nodes[nextN]){
    state.unlockedNodes[`${z}-${nextN}`] = true;
  } else {
    // зона закрыта, открываем следующую
    state.unlockedZone = Math.max(state.unlockedZone, z + 1);
    if (ZONES[z+1]){
      state.unlockedNodes[`${z+1}-0`] = true;
      log(`Открыта новая зона: ${ZONES[z+1].name} 🗺️`);
    }
  }
}

function randRange(a,b){
  return a + rngInt((b-a)+1);
}

function findNode(nodeId){
  for (const z of ZONES){
    const n = z.nodes.find(x=>x.id===nodeId);
    if (n) return n;
  }
  return null;
}

// ===== Upgrades =====
function upgradeCost(up){
  const lvl = state.upgrades[up.id] || 0;
  const cost = Math.floor(up.baseCost * Math.pow(up.costMul, lvl));
  return cost;
}
function buyUpgrade(id){
  recomputeDerived();
  const up = UPGRADES.find(x=>x.id===id);
  if(!up) return;

  const lvl = state.upgrades[id] || 0;
  if(lvl >= up.max){ toast("Уже максимум ✅"); return; }

  const cost = upgradeCost(up);
  if(state.scrap < cost){ toast("Не хватает металла 🧱"); return; }

  state.scrap -= cost;
  state.upgrades[id] = lvl + 1;

  recomputeDerived();
  log(`Улучшение: ${up.name} → ур.${state.upgrades[id]} (-${cost} металл)`);
  toast("Апгрейд куплен 🛠️");
  renderAll();
}

// ===== Crew =====
function addCrewIfMissing(){
  // иногда получаем нового члена экипажа за рейсы по зоне
  // (простая механика: при открытии зоны — шанс)
  const want = Math.min(CREW_POOL.length, 2 + state.unlockedZone);
  while (state.crewOwned.length < want){
    const candidates = CREW_POOL.map(x=>x.id).filter(id=>!state.crewOwned.includes(id));
    if(!candidates.length) break;
    const id = pick(candidates);
    state.crewOwned.push(id);
    log(`Найден специалист: ${CREW_POOL.find(x=>x.id===id).name} (${id})`);
  }
}

function toggleActiveCrew(id){
  recomputeDerived();
  const active = state.crewActive.includes(id);

  if (active){
    state.crewActive = state.crewActive.filter(x=>x!==id);
    toast("Снято с места");
  } else {
    if (state.crewActive.length >= state.crewSlots){
      toast("Нет свободных мест 👥");
      return;
    }
    state.crewActive.push(id);
    toast("Назначено в экипаж ✅");
  }
  recomputeDerived();
  renderAll();
}

// ===== UI render =====
function renderTop(){
  recomputeDerived();
  el("aether").textContent = fmt(state.aether);
  el("fuel").textContent = fmt(state.fuel);
  el("fuelMax").textContent = fmt(state.fuelMax);
  el("scrap").textContent = fmt(state.scrap);
  el("hull").textContent = fmt(state.hull);
  el("hullMax").textContent = fmt(state.hullMax);

  el("pressure").textContent = fmt(state.pressure);
  el("pressureMax").textContent = fmt(state.pressureMax);

  const sp = speedMultiplier();
  el("speedHint").textContent = `x${sp.toFixed(2)}`;

  el("stormHint").textContent = `${state.daily.storm.name} (риск +${Math.round(state.daily.storm.risk*100)}%, профит +${Math.round(state.daily.storm.profit*100)}%)`;

  el("crewHint").textContent = `${state.crewActive.length}/${state.crewSlots}`;
  renderDayHint();
}

function renderMap(){
  const zone = ZONES[state.zoneId];
  el("routeTitle").textContent = `Зона: ${zone.name}`;
  el("routeSub").textContent = zone.desc;

  const root = el("map");
  root.innerHTML = "";

  for (const n of zone.nodes){
    const locked = !state.unlockedNodes[n.id] || state.zoneId > state.unlockedZone;
    const card = document.createElement("div");
    card.className = `node ${locked ? "locked" : ""}`;

    const riskPct = Math.round(n.risk*100);
    card.innerHTML = `
      <div class="tag">${locked ? "🔒" : "Узел"}</div>
      <div class="name">${n.name}</div>
      <div class="meta">Время: ~${n.baseTime}s • Топливо: ${n.fuel} • Риск: ${riskPct}%</div>
      <div>
        <span class="badge">Металл: ${n.rewards.scrap[0]}–${n.rewards.scrap[1]}</span>
        <span class="badge">Артефакт: ${Math.round(n.rewards.artifact*100)}%</span>
      </div>
    `;
    if (!locked){
      card.addEventListener("click", ()=>startFlight(n.id));
    }
    root.appendChild(card);
  }
}

function renderFlight(){
  const f = state.flight;
  if (!f.active){
    el("missionText").textContent = "Нет активного рейса. Выбери узел на карте.";
    el("eta").textContent = "—";
    el("missionMeta").textContent = `Давление влияет на скорость. Эфир — на ускорение и ремонт.`;
    el("missionFill").style.width = "0%";
    el("btnBoost").disabled = true;
    return;
  }

  const node = findNode(f.nodeId);
  const total = f.baseTime;
  const left = Math.max(0, Math.ceil((f.endsAt - now())/1000));
  const done = clamp(((total - left) / total) * 100, 0, 100);

  el("missionText").textContent =
    `${node?.name || "Узел"} • ${f.storm ? "в штормовых условиях ⚡" : "обычный рейс"}`;

  el("eta").textContent = `${left}s`;
  el("missionFill").style.width = `${done}%`;

  const bonuses = activeCrewBonuses();
  let risk = (node?.risk || 0);
  risk -= (bonuses.riskDown || 0);
  if (f.storm) risk += state.daily.storm.risk + (bonuses.stormRisk || 0);
  risk = clamp(risk, 0.02, 0.75);

  el("missionMeta").textContent =
    `Риск сейчас: ${Math.round(risk*100)}% • Ускорение стоит 6 эфира • Топлива списано: ${f.fuelCost}`;

  el("btnBoost").disabled = (state.aether < 6);
}

function renderMapModal(){
  const list = el("mapList");
  list.innerHTML = "";

  // зоны доступны до unlockedZone
  for (const z of ZONES){
    const zAvail = z.id <= state.unlockedZone;
    const header = document.createElement("div");
    header.className = "item";
    header.style.cursor = zAvail ? "pointer" : "not-allowed";
    header.style.opacity = zAvail ? "1" : ".45";
    header.innerHTML = `
      <div class="left">
        <div class="emoji">🗺️</div>
        <div>
          <div class="title">${z.name}</div>
          <div class="desc">${z.desc}</div>
        </div>
      </div>
      <div class="count">${zAvail ? (z.id===state.zoneId ? "Выбрано" : "Открыто") : "🔒"}</div>
    `;
    if (zAvail){
      header.addEventListener("click", ()=>{
        state.zoneId = z.id;
        renderMap();
        renderMapModal();
        renderZoneInfo();
        persist();
      });
    }
    list.appendChild(header);

    // узлы зоны
    if (z.id === state.zoneId){
      for (const n of z.nodes){
        const locked = !state.unlockedNodes[n.id];
        const it = document.createElement("div");
        it.className = "item";
        it.style.opacity = locked ? ".45" : "1";
        it.style.cursor = locked ? "not-allowed" : "pointer";
        it.innerHTML = `
          <div class="left">
            <div class="emoji">${locked ? "🔒" : "📍"}</div>
            <div>
              <div class="title">${n.name}</div>
              <div class="desc">Время: ~${n.baseTime}s • Топливо: ${n.fuel} • Риск: ${Math.round(n.risk*100)}%</div>
            </div>
          </div>
          <div class="count">${locked ? "Закрыто" : "Лететь"}</div>
        `;
        if (!locked){
          it.addEventListener("click", ()=>{
            startFlight(n.id);
            openModal("modalMap"); // просто обновим
          });
        }
        list.appendChild(it);
      }
    }
  }

  el("mapHint").textContent = state.flight.active ? "Ты в полёте: можешь ускорять эфиром." : "Выбирай узел — и полетели.";
  renderZoneInfo();
}

function renderZoneInfo(){
  const z = ZONES[state.zoneId];
  const prog = zoneProgress(z.id);
  el("zoneInfo").innerHTML = `
    <b>${z.name}</b><br>
    <span class="muted">${z.desc}</span><br><br>
    Прогресс узлов: <b>${prog.done}/${prog.total}</b><br>
    Открыто зон: <b>${state.unlockedZone + 1}</b><br>
    Артефактов: <b>${state.artifacts.length}</b>
  `;
}

function zoneProgress(zoneId){
  const z = ZONES[zoneId];
  const total = z.nodes.length;
  let done = 0;
  for (const n of z.nodes){
    if (state.unlockedNodes[n.id] && n.id.endsWith(`-${z.nodes.length-1}`)) {
      // не считаем так, лучше просто если узел открыт?
    }
  }
  // проще: считаем сколько узлов зоны открыто
  done = z.nodes.filter(n=>state.unlockedNodes[n.id]).length;
  return { done, total };
}

function renderHangar(){
  const root = el("upgradeList");
  root.innerHTML = "";

  for (const up of UPGRADES){
    const lvl = state.upgrades[up.id] || 0;
    const cost = upgradeCost(up);

    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `
      <div class="left">
        <div class="emoji">🛠️</div>
        <div>
          <div class="title">${up.name} <span class="muted">ур.${lvl}/${up.max}</span></div>
          <div class="desc">${up.desc(lvl)}</div>
        </div>
      </div>
      <div class="count">${lvl>=up.max ? "MAX" : `-${cost} 🧱`}</div>
    `;
    if (lvl < up.max){
      it.addEventListener("click", ()=>buyUpgrade(up.id));
    } else {
      it.style.opacity = ".7";
      it.style.cursor = "default";
    }
    root.appendChild(it);
  }

  el("hangarHint").textContent = "Апгрейды покупаются за металл. Дальние зоны требуют корпуса и скорости.";
}

function renderCrew(){
  addCrewIfMissing();

  const owned = el("crewList");
  const active = el("activeCrewList");
  owned.innerHTML = "";
  active.innerHTML = "";

  const slots = state.crewSlots;
  el("crewHintModal").textContent = `Места: ${state.crewActive.length}/${slots}.`;

  // owned list
  for (const id of state.crewOwned){
    const c = CREW_POOL.find(x=>x.id===id);
    const isActive = state.crewActive.includes(id);

    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `
      <div class="left">
        <div class="emoji">${c.emoji}</div>
        <div>
          <div class="title">${c.name} ${isActive ? "✅" : ""}</div>
          <div class="desc">${c.desc}</div>
        </div>
      </div>
      <div class="count">${isActive ? "Актив" : "Назначить"}</div>
    `;
    it.addEventListener("click", ()=>toggleActiveCrew(id));
    owned.appendChild(it);
  }

  // active list
  for (const id of state.crewActive){
    const c = CREW_POOL.find(x=>x.id===id);
    const it = document.createElement("div");
    it.className = "item";
    it.innerHTML = `
      <div class="left">
        <div class="emoji">${c.emoji}</div>
        <div>
          <div class="title">${c.name}</div>
          <div class="desc">${c.desc}</div>
        </div>
      </div>
      <div class="count">Снять</div>
    `;
    it.addEventListener("click", ()=>toggleActiveCrew(id));
    active.appendChild(it);
  }
}

function renderLog(){
  el("log").textContent = state.log.length ? state.log.join("\n") : "Лог пуст.";
}

function renderAll(){
  ensureDailyFresh();
  recomputeDerived();
  renderTop();
  renderMap();
  renderFlight();
  persist();
}

// ===== Modals =====
function openModal(id){
  const m = el(id);
  m.setAttribute("aria-hidden","false");
  if (id==="modalMap") renderMapModal();
  if (id==="modalHangar") renderHangar();
  if (id==="modalCrew") renderCrew();
  if (id==="modalLog") renderLog();
}
function closeModal(id){
  el(id).setAttribute("aria-hidden","true");
}

// ===== Tick =====
function tick(){
  ensureDailyFresh();
  recomputeDerived();

  const dt = (now() - state.lastTick)/1000;
  state.lastTick = now();

  // пассив: давление чуть “стравливается”, эфир капает медленно
  const leak = 2.2 * dt;
  state.pressure = clamp(state.pressure - leak, 0, state.pressureMax);

  state.aether += 0.18 * dt; // медленный приток

  // если летим и время вышло — финиш
  if (state.flight.active && now() >= state.flight.endsAt){
    finishFlight();
  } else {
    renderTop();
    renderFlight();
  }

  persist();
}

// ===== Wire events =====
let state = loadState();
ensureDailyFresh();
recomputeDerived();

document.addEventListener("click", (e)=>{
  const btn = e.target.closest("[data-close]");
  if (btn) closeModal(btn.getAttribute("data-close"));
});

el("btnPump").addEventListener("click", pump);
el("btnBoost").addEventListener("click", boostFlight);
el("btnRepair").addEventListener("click", repair);

el("btnOpenMap").addEventListener("click", ()=>openModal("modalMap"));
el("btnOpenHangar").addEventListener("click", ()=>openModal("modalHangar"));
el("btnOpenCrew").addEventListener("click", ()=>openModal("modalCrew"));
el("btnOpenLog").addEventListener("click", ()=>openModal("modalLog"));

el("btnSave").addEventListener("click", ()=>{
  persist();
  toast("Сохранено 💾");
});

el("btnReset").addEventListener("click", ()=>{
  const ok = confirm("Сбросить прогресс? Это удалит сохранение в браузере.");
  if (!ok) return;
  localStorage.removeItem(KEY);
  state = defaultState();
  log("Сброс прогресса ↺");
  renderAll();
  toast("Сброшено ↺");
});

el("btnClearLog").addEventListener("click", ()=>{
  state.log = [];
  renderLog();
  persist();
});

log("Добро пожаловать на борт 🛩️");
log(`Шторм дня: ${state.daily.storm.name}`);
renderAll();

setInterval(tick, 300);
setInterval(persist, 5000);