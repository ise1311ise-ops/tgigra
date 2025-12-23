/* FARM GAME v2 (Telegram WebApp)
   - рост по стадиям
   - энергия
   - ежедневный бонус
   - магазин улучшений
   - квесты
   - CloudStorage (если доступно) + localStorage fallback
*/

const SAVE_KEY = "farm_save_v2";
const GRID = 5; // 5x5

// Стадии роста: seed -> sprout -> grown(ready)
const CROPS = [
  { id:"wheat",  name:"Пшеница", emoji:["🌱","🌿","🌾"], cost:2,  growSec:22, sell:5,  xp:2 },
  { id:"carrot", name:"Морковь", emoji:["🌱","🌿","🥕"], cost:4,  growSec:46, sell:10, xp:4 },
  { id:"tomato", name:"Помидор", emoji:["🌱","🌿","🍅"], cost:6,  growSec:72, sell:16, xp:6 },
];

const UPGRADES = [
  {
    id: "watering",
    name: "Полив",
    desc: "Растёт быстрее (−10% время роста за уровень)",
    basePrice: 50,
    max: 5
  },
  {
    id: "barn",
    name: "Сарай",
    desc: "Больше прибыль (+10% цена продажи за уровень)",
    basePrice: 60,
    max: 5
  },
  {
    id: "stamina",
    name: "Выносливость",
    desc: "Больше энергии (+5 к максимуму за уровень)",
    basePrice: 40,
    max: 6
  },
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function nowMs(){ return Date.now(); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function fmtTimeLeft(ms){
  ms = Math.max(0, ms);
  const s = Math.ceil(ms/1000);
  const m = Math.floor(s/60);
  const r = s%60;
  return m>0 ? `${m}:${String(r).padStart(2,"0")}` : `${r}с`;
}

function dayKey(t = new Date()){
  const y = t.getFullYear();
  const m = String(t.getMonth()+1).padStart(2,"0");
  const d = String(t.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function getCrop(id){ return CROPS.find(c => c.id === id); }

// ---------- Telegram ----------
function initTelegram(){
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  if (user) {
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    $("#userLine").textContent = `Игрок: ${name}`;
  } else {
    $("#userLine").textContent = "Игрок: Telegram";
  }

  window.__tg = tg;
}

function haptic(type="impact", style="light"){
  const tg = window.__tg;
  try { tg?.HapticFeedback?.[type]?.(style); } catch {}
}

// ---------- Storage (CloudStorage + fallback) ----------
function hasCloud(){
  const tg = window.__tg;
  return !!tg?.CloudStorage?.getItem && !!tg?.CloudStorage?.setItem;
}

function cloudGet(key){
  return new Promise((resolve) => {
    if (!hasCloud()) return resolve(null);
    window.__tg.CloudStorage.getItem(key, (err, value) => {
      if (err) return resolve(null);
      resolve(value ?? null);
    });
  });
}

function cloudSet(key, value){
  return new Promise((resolve) => {
    if (!hasCloud()) return resolve(false);
    window.__tg.CloudStorage.setItem(key, value, (err, ok) => {
      if (err) return resolve(false);
      resolve(!!ok);
    });
  });
}

async function storageLoad(){
  // 1) CloudStorage
  const cloud = await cloudGet(SAVE_KEY);
  if (cloud) return cloud;

  // 2) localStorage
  return localStorage.getItem(SAVE_KEY);
}

async function storageSave(raw){
  // try cloud first
  const ok = await cloudSet(SAVE_KEY, raw);
  if (!ok) localStorage.setItem(SAVE_KEY, raw);
}

// ---------- State ----------
const state = {
  coins: 20,

  energy: 20,
  energyMax: 20,
  energyRegenMs: 20_000, // +1 энергия раз в 20 сек
  lastEnergyTick: nowMs(),

  selectedCropId: "wheat",

  upgrades: { watering: 0, barn: 0, stamina: 0 },

  stats: { planted: 0, harvested: 0, xp: 0, level: 1 },

  daily: { lastClaimDay: null },

  // plots: { status, cropId, stage, plantedAt, nextStageAt, readyAt }
  plots: [],
};

function makeDefaultPlots(){
  state.plots = Array.from({length: GRID*GRID}, () => ({
    status: "empty", // empty | growing | ready
    cropId: null,
    stage: 0, // 0..2
    plantedAt: null,
    nextStageAt: null,
    readyAt: null,
  }));
}

function growthMultiplier(){
  // watering: -10% per level => time * (1 - 0.1*lvl), min 50%
  const lvl = state.upgrades.watering || 0;
  return Math.max(0.5, 1 - 0.10 * lvl);
}

function sellMultiplier(){
  // barn: +10% per level
  const lvl = state.upgrades.barn || 0;
  return 1 + 0.10 * lvl;
}

function applyStaminaUpgrade(){
  const lvl = state.upgrades.stamina || 0;
  const base = 20;
  state.energyMax = base + 5 * lvl;
  state.energy = clamp(state.energy, 0, state.energyMax);
}

function upgradePrice(u){
  const lvl = state.upgrades[u.id] || 0;
  // лёгкая прогрессия цены
  return Math.floor(u.basePrice * (1 + lvl * 0.65));
}

function xpForNextLevel(level){
  // мягкая прогрессия
  return Math.floor(25 + (level-1) * 18);
}

function addXp(x){
  state.stats.xp += x;
  while (true){
    const need = xpForNextLevel(state.stats.level);
    if (state.stats.xp < need) break;
    state.stats.xp -= need;
    state.stats.level += 1;
    // небольшой бонус за уровень
    state.coins += 10 + state.stats.level * 2;
    haptic("notification","success");
    toast(`Уровень повышен! 🎉 Теперь ${state.stats.level} (бонус монет получен)`);
  }
}

// ---------- Save/Load ----------
function normalizeGrowth(){
  const t = nowMs();
  for (const p of state.plots){
    if (p.status === "growing"){
      // перескок стадий, если долго был офлайн
      while (p.nextStageAt && t >= p.nextStageAt && p.stage < 2){
        p.stage += 1;
        if (p.stage >= 2){
          p.status = "ready";
          p.nextStageAt = null;
          p.readyAt = t;
          break;
        } else {
          // следующая стадия
          const crop = getCrop(p.cropId);
          const total = (crop?.growSec ?? 30) * 1000 * growthMultiplier();
          // 2 перехода: 0->1, 1->2
          p.nextStageAt = p.plantedAt + Math.floor(total * ((p.stage+1)/2));
        }
      }
      if (p.status === "growing" && p.stage >= 2){
        p.status = "ready";
        p.nextStageAt = null;
      }
    }

    // защита от битых данных
    if (p.status === "ready" && (!p.cropId)){
      p.status = "empty";
      p.cropId = null;
      p.stage = 0;
      p.plantedAt = null;
      p.nextStageAt = null;
      p.readyAt = null;
    }
  }
}

function normalizeEnergy(){
  const t = nowMs();
  if (!state.lastEnergyTick) state.lastEnergyTick = t;

  let gained = 0;
  while (state.energy < state.energyMax && (t - state.lastEnergyTick) >= state.energyRegenMs){
    state.energy += 1;
    state.lastEnergyTick += state.energyRegenMs;
    gained += 1;
  }
  if (gained > 0) renderTop();
}

function serialize(){
  return JSON.stringify({
    coins: state.coins,
    energy: state.energy,
    energyMax: state.energyMax,
    lastEnergyTick: state.lastEnergyTick,
    energyRegenMs: state.energyRegenMs,

    selectedCropId: state.selectedCropId,

    upgrades: state.upgrades,
    stats: state.stats,
    daily: state.daily,

    plots: state.plots,
    savedAt: nowMs(),
  });
}

async function save(){
  const raw = serialize();
  await storageSave(raw);
}

async function load(){
  makeDefaultPlots();
  const raw = await storageLoad();
  if (!raw) {
    applyStaminaUpgrade();
    return;
  }

  try{
    const s = JSON.parse(raw);

    if (typeof s.coins === "number") state.coins = clamp(s.coins, 0, 1e9);
    if (typeof s.energy === "number") state.energy = clamp(s.energy, 0, 1e9);
    if (typeof s.energyMax === "number") state.energyMax = clamp(s.energyMax, 1, 1e9);
    if (typeof s.lastEnergyTick === "number") state.lastEnergyTick = s.lastEnergyTick;
    if (typeof s.energyRegenMs === "number") state.energyRegenMs = clamp(s.energyRegenMs, 5000, 120000);

    if (typeof s.selectedCropId === "string") state.selectedCropId = s.selectedCropId;

    if (s.upgrades && typeof s.upgrades === "object") state.upgrades = {
      watering: clamp(Number(s.upgrades.watering||0), 0, 99),
      barn: clamp(Number(s.upgrades.barn||0), 0, 99),
      stamina: clamp(Number(s.upgrades.stamina||0), 0, 99),
    };

    if (s.stats && typeof s.stats === "object") state.stats = {
      planted: clamp(Number(s.stats.planted||0), 0, 1e9),
      harvested: clamp(Number(s.stats.harvested||0), 0, 1e9),
      xp: clamp(Number(s.stats.xp||0), 0, 1e9),
      level: clamp(Number(s.stats.level||1), 1, 1e6),
    };

    if (s.daily && typeof s.daily === "object") state.daily = {
      lastClaimDay: (typeof s.daily.lastClaimDay === "string") ? s.daily.lastClaimDay : null
    };

    if (Array.isArray(s.plots) && s.plots.length === GRID*GRID){
      state.plots = s.plots.map(p => ({
        status: (p.status==="growing"||p.status==="ready") ? p.status : "empty",
        cropId: typeof p.cropId === "string" ? p.cropId : null,
        stage: clamp(Number(p.stage||0), 0, 2),
        plantedAt: typeof p.plantedAt === "number" ? p.plantedAt : null,
        nextStageAt: typeof p.nextStageAt === "number" ? p.nextStageAt : null,
        readyAt: typeof p.readyAt === "number" ? p.readyAt : null,
      }));
    }
  }catch{
    makeDefaultPlots();
  }

  applyStaminaUpgrade();
  normalizeGrowth();
  normalizeEnergy();
}

// ---------- UI helpers ----------
function toast(text){
  const hint = $("#hint");
  hint.textContent = text;
  clearTimeout(window.__hintT);
  window.__hintT = setTimeout(() => {
    hint.textContent = "Нажми на клетку: пустая — посадить, созрела — собрать.";
  }, 2600);
}

function setTab(tab){
  $$("#tabs .chip").forEach(c => c.classList.toggle("active", c.dataset.tab === tab));
  $("#screenFarm").style.display = (tab === "farm") ? "" : "none";
  $("#screenShop").style.display = (tab === "shop") ? "" : "none";
  $("#screenQuests").style.display = (tab === "quests") ? "" : "none";

  if (tab === "farm"){
    $("#bottomMini").textContent = "Выбрано:";
    renderFarmBottom();
  }
  if (tab === "shop"){
    $("#bottomMini").textContent = "Улучшай ферму:";
    $("#selectedCrop").textContent = `Уровень: ${state.stats.level}`;
    $("#mainActionBtn").textContent = "Назад на ферму";
    $("#mainActionBtn").onclick = () => setTab("farm");
    renderShop();
  }
  if (tab === "quests"){
    $("#bottomMini").textContent = "Прогресс:";
    $("#selectedCrop").textContent = `Посажено: ${state.stats.planted} • Собрано: ${state.stats.harvested}`;
    $("#mainActionBtn").textContent = "Назад на ферму";
    $("#mainActionBtn").onclick = () => setTab("farm");
    renderQuests();
  }
}

function renderTop(){
  $("#coins").textContent = String(state.coins);
  $("#energy").textContent = String(state.energy);
  $("#energyMax").textContent = String(state.energyMax);

  // daily button state
  const today = dayKey(new Date());
  const canClaim = state.daily.lastClaimDay !== today;
  $("#dailyBtn").style.opacity = canClaim ? "1" : "0.55";
  $("#dailyBtn").disabled = !canClaim;
}

function renderChips(){
  const wrap = $("#cropChips");
  wrap.innerHTML = "";

  for (const crop of CROPS){
    const el = document.createElement("div");
    el.className = "chip" + (crop.id === state.selectedCropId ? " active" : "");
    const sell = Math.floor(crop.sell * sellMultiplier());
    el.innerHTML = `
      <span>${crop.emoji[2]} ${crop.name}</span>
      <span class="price">🌱 ${crop.cost} • 💰 ${sell} • ⚡1</span>
    `;
    el.addEventListener("click", async () => {
      state.selectedCropId = crop.id;
      haptic("impact","light");
      await save();
      renderFarmBottom();
      renderChips();
    });
    wrap.appendChild(el);
  }
}

function renderFarmBottom(){
  const crop = getCrop(state.selectedCropId);
  $("#selectedCrop").textContent = crop ? `${crop.emoji[2]} ${crop.name}` : "—";
  $("#mainActionBtn").textContent = `Посадить (${crop?.cost ?? "?"}💰 / ⚡1)`;
  $("#mainActionBtn").disabled = !crop || state.coins < crop.cost || state.energy < 1;

  $("#mainActionBtn").onclick = () => onMainAction();
}

function plotEmoji(p){
  if (p.status === "empty") return "🟫";
  const crop = getCrop(p.cropId);
  if (!crop) return "🌱";
  return crop.emoji[clamp(p.stage,0,2)];
}

function plotTimerText(p){
  if (p.status === "empty") return "Пусто";
  const crop = getCrop(p.cropId);
  if (!crop) return "…";

  if (p.status === "ready") return "Готово! Нажми собрать";
  // growing
  if (p.nextStageAt){
    return `До следующей стадии: ${fmtTimeLeft(p.nextStageAt - nowMs())}`;
  }
  // fallback
  return "Растёт…";
}

function plotProgressPct(p){
  if (p.status !== "growing") return null;
  const crop = getCrop(p.cropId);
  if (!crop || !p.plantedAt) return null;

  const total = crop.growSec * 1000 * growthMultiplier();
  const done = nowMs() - p.plantedAt;
  return clamp(Math.floor((done / total) * 100), 0, 100);
}

function renderField(){
  const field = $("#field");
  field.innerHTML = "";

  state.plots.forEach((p, idx) => {
    const el = document.createElement("div");
    el.className = "plot " + (p.status === "empty" ? "empty" : (p.status === "ready" ? "ready" : "growing"));

    const emoji = plotEmoji(p);
    const timerText = plotTimerText(p);

    const pct = plotProgressPct(p);
    const barHtml = (pct !== null)
      ? `<div class="bar"><i style="width:${pct}%"></i></div>`
      : "";

    el.innerHTML = `
      ${barHtml}
      <div class="emoji">${emoji}</div>
      <div class="timer">${timerText}</div>
    `;

    el.addEventListener("click", () => onPlotClick(idx));
    field.appendChild(el);
  });
}

function questPack(){
  // ежедневный набор целей (привязан к дню)
  const today = dayKey(new Date());
  // фиксированно, но можно сделать рандомом по today
  const targets = {
    day: today,
    plant: 8,
    harvest: 8,
  };
  return targets;
}

function renderQuests(){
  const q = questPack();
  const list = $("#questList");
  list.innerHTML = "";

  const pProg = clamp(state.stats.planted, 0, 1e9);
  const hProg = clamp(state.stats.harvested, 0, 1e9);

  const items = [
    {
      title: "Посади культуры",
      icon: "🌱",
      desc: `Цель: ${q.plant}`,
      prog: Math.min(q.plant, pProg),
      goal: q.plant,
      reward: 20
    },
    {
      title: "Собери урожай",
      icon: "🌾",
      desc: `Цель: ${q.harvest}`,
      prog: Math.min(q.harvest, hProg),
      goal: q.harvest,
      reward: 25
    }
  ];

  for (const it of items){
    const done = it.prog >= it.goal;
    const card = document.createElement("div");
    card.className = "plot ready"; // используем красивую “карточку”
    card.style.aspectRatio = "auto";
    card.style.padding = "14px";
    card.style.cursor = "default";

    const pct = Math.floor((it.prog / it.goal) * 100);

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <div style="font-weight:900; font-size:14px;">${it.icon} ${it.title}</div>
          <div style="opacity:.85; font-size:12px;">${it.desc} • Награда: +${it.reward}💰</div>
        </div>
        <div style="font-weight:900; opacity:.9;">${it.prog}/${it.goal}</div>
      </div>
      <div class="bar" style="margin-top:10px;">
        <i style="width:${clamp(pct,0,100)}%"></i>
      </div>
      <div style="margin-top:10px; display:flex; gap:10px; justify-content:flex-end;">
        <button class="btn small" ${done ? "" : "disabled"} data-reward="${it.reward}">
          ${done ? "Забрать" : "Не готово"}
        </button>
      </div>
    `;

    const btn = card.querySelector("button");
    btn.addEventListener("click", async () => {
      if (!done) return;
      // защита от многократного забора: просто “съедаем” прогресс (как пример)
      // делаем это аккуратно: уменьшаем счётчики на goal (чтобы квесты можно было повторять в тот же день)
      if (it.title.includes("Посади")) state.stats.planted = Math.max(0, state.stats.planted - it.goal);
      if (it.title.includes("Собери")) state.stats.harvested = Math.max(0, state.stats.harvested - it.goal);

      state.coins += it.reward;
      haptic("notification","success");
      toast(`Награда получена: +${it.reward}💰`);
      await save();
      renderTop();
      renderQuests();
    });

    list.appendChild(card);
  }
}

function renderShop(){
  const list = $("#shopList");
  list.innerHTML = "";

  for (const u of UPGRADES){
    const lvl = state.upgrades[u.id] || 0;
    const max = u.max;
    const price = upgradePrice(u);
    const canBuy = lvl < max && state.coins >= price;

    const card = document.createElement("div");
    card.className = "plot ready";
    card.style.aspectRatio = "auto";
    card.style.padding = "14px";
    card.style.cursor = "default";

    const pct = Math.floor((lvl / max) * 100);

    card.innerHTML = `
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
        <div style="display:flex; flex-direction:column; gap:5px;">
          <div style="font-weight:900; font-size:14px;">🧰 ${u.name} <span style="opacity:.75;">(ур. ${lvl}/${max})</span></div>
          <div style="opacity:.85; font-size:12px; line-height:1.25;">${u.desc}</div>
          <div style="opacity:.9; font-size:12px;">Цена: <b>${price}💰</b></div>
        </div>
        <button class="btn small" ${canBuy ? "" : "disabled"}>
          ${lvl >= max ? "MAX" : (canBuy ? "Купить" : "Мало 💰")}
        </button>
      </div>
      <div class="bar" style="margin-top:12px;">
        <i style="width:${pct}%"></i>
      </div>
    `;

    const btn = card.querySelector("button");
    btn.addEventListener("click", async () => {
      if (lvl >= max) return;
      const price2 = upgradePrice(u);
      if (state.coins < price2) return;

      state.coins -= price2;
      state.upgrades[u.id] = lvl + 1;

      if (u.id === "stamina") applyStaminaUpgrade();

      haptic("impact","medium");
      toast(`Улучшение куплено: ${u.name} (ур. ${state.upgrades[u.id]})`);
      await save();
      renderTop();
      renderShop();
      // обновим ферму, т.к. влияет на скорость/прибыль
      normalizeGrowth();
      renderChips();
      renderField();
      renderFarmBottom();
    });

    list.appendChild(card);
  }

  // мини-инфо
  const info = document.createElement("div");
  info.className = "plot growing";
  info.style.aspectRatio = "auto";
  info.style.padding = "14px";
  info.style.cursor = "default";
  info.innerHTML = `
    <div style="font-weight:900; font-size:14px;">📈 Твои бонусы</div>
    <div style="opacity:.88; font-size:12px; line-height:1.3; margin-top:6px;">
      Скорость роста: <b>${Math.round(100 * growthMultiplier())}%</b> от базовой<br/>
      Продажа: <b>${Math.round(100 * sellMultiplier())}%</b> от базовой<br/>
      Энергия максимум: <b>${state.energyMax}</b>
    </div>
  `;
  list.appendChild(info);
}

// ---------- Gameplay ----------
function startGrowingPlot(p, crop){
  const t = nowMs();
  const total = crop.growSec * 1000 * growthMultiplier();

  p.status = "growing";
  p.cropId = crop.id;
  p.stage = 0;
  p.plantedAt = t;

  // стадии 0->1 (50%), 1->2 (100%)
  p.nextStageAt = t + Math.floor(total * 0.5);
  p.readyAt = t + Math.floor(total);
}

async function plant(idx){
  const p = state.plots[idx];
  if (p.status !== "empty") return;

  const crop = getCrop(state.selectedCropId);
  if (!crop) return;

  if (state.energy < 1){
    haptic("notification","error");
    toast("Не хватает энергии ⚡ (она восстановится сама)");
    return;
  }
  if (state.coins < crop.cost){
    haptic("notification","error");
    toast("Не хватает монет 😿");
    return;
  }

  state.coins -= crop.cost;
  state.energy -= 1;

  startGrowingPlot(p, crop);

  state.stats.planted += 1;
  addXp(1);

  haptic("impact","medium");
  toast(`Посадил(а) ${crop.emoji[2]} ${crop.name}!`);
  await save();
  renderTop();
  renderFarmBottom();
  renderField();
}

async function harvest(idx){
  const p = state.plots[idx];
  if (p.status !== "ready") return;

  if (state.energy < 1){
    haptic("notification","error");
    toast("Нужна энергия ⚡ чтобы собрать урожай");
    return;
  }

  const crop = getCrop(p.cropId);
  const baseGain = crop?.sell ?? 0;
  const gain = Math.floor(baseGain * sellMultiplier());
  const xp = crop?.xp ?? 2;

  state.coins += gain;
  state.energy -= 1;

  state.stats.harvested += 1;
  addXp(xp);

  // +монеты эффект
  const plotEl = document.querySelectorAll(".plot")[idx];
  if (plotEl) {
    const fx = document.createElement("div");
    fx.className = "popFx";
    fx.textContent = `+${gain}💰`;
    plotEl.appendChild(fx);
    setTimeout(() => fx.remove(), 650);
  }

  // очистка
  p.status = "empty";
  p.cropId = null;
  p.stage = 0;
  p.plantedAt = null;
  p.nextStageAt = null;
  p.readyAt = null;

  haptic("notification","success");
  toast(`Собрано! +${gain}💰 (+${xp}XP)`);
  await save();
  renderTop();
  renderFarmBottom();
  renderField();
}

function onPlotClick(idx){
  normalizeEnergy();
  normalizeGrowth();

  const p = state.plots[idx];
  if (p.status === "empty") plant(idx);
  else if (p.status === "ready") harvest(idx);
  else {
    haptic("impact","light");
    toast(`Растёт… стадия ${p.stage+1}/3 🌱`);
  }
}

function firstEmptyPlot(){
  return state.plots.findIndex(p => p.status === "empty");
}

async function onMainAction(){
  normalizeEnergy();
  normalizeGrowth();

  const emptyIdx = firstEmptyPlot();
  if (emptyIdx === -1){
    haptic("notification","error");
    toast("Нет свободных клеток 😅 Собери урожай!");
    return;
  }
  await plant(emptyIdx);
}

// ---------- Daily bonus ----------
async function claimDaily(){
  const today = dayKey(new Date());
  if (state.daily.lastClaimDay === today) return;

  // бонус растёт от уровня
  const reward = 30 + state.stats.level * 6;
  state.coins += reward;
  state.energy = clamp(state.energy + 5, 0, state.energyMax);
  state.daily.lastClaimDay = today;

  haptic("notification","success");
  toast(`Ежедневный бонус: +${reward}💰 и +5⚡`);
  await save();
  renderTop();
}

// ---------- Tick ----------
async function tick(){
  const beforeReady = state.plots.filter(p => p.status === "ready").length;

  normalizeEnergy();
  normalizeGrowth();

  const afterReady = state.plots.filter(p => p.status === "ready").length;

  // если что-то дозрело — подсейвим
  if (afterReady !== beforeReady){
    await save();
  }

  // обновление UI: чаще — поле и верх
  renderTop();

  // перерисовка поля только если на ферме
  if ($("#screenFarm").style.display !== "none"){
    renderField();
    renderFarmBottom();
  }
}

// ---------- Reset ----------
async function resetGame(){
  if (!confirm("Сбросить прогресс?")) return;

  state.coins = 20;
  state.energy = 20;
  state.energyMax = 20;
  state.lastEnergyTick = nowMs();

  state.selectedCropId = "wheat";
  state.upgrades = { watering:0, barn:0, stamina:0 };
  state.stats = { planted:0, harvested:0, xp:0, level:1 };
  state.daily = { lastClaimDay: null };

  makeDefaultPlots();
  applyStaminaUpgrade();

  await save();
  toast("Начали заново ✅");
  renderAll();
}

// ---------- Render All ----------
function renderAll(){
  renderTop();
  renderChips();
  renderFarmBottom();
  renderField();
}

// ---------- Boot ----------
async function boot(){
  initTelegram();
  await load();

  // tabs
  $$("#tabs .chip").forEach(ch => {
    ch.addEventListener("click", () => {
      haptic("impact","light");
      setTab(ch.dataset.tab);
    });
  });

  // daily bonus
  $("#dailyBtn").addEventListener("click", () => claimDaily());

  // reset
  $("#resetBtn").addEventListener("click", () => resetGame());

  // default tab
  setTab("farm");

  renderAll();

  // авто-сейв при скрытии
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "hidden") await save();
  });

  // game loop
  setInterval(() => { tick(); }, 450);
}

boot();
