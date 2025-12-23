/* Ферма для Telegram WebApp: посадка → рост → сбор → монеты.
   Сохранение: localStorage (при желании можно переключить на Telegram CloudStorage). */

const APP_KEY = "tg-farm-save-v1";
const GRID = 5; // 5x5

const CROPS = [
  { id: "wheat",  name: "Пшеница",  emoji: "🌾", cost: 2,  growSec: 20, sell: 5 },
  { id: "carrot", name: "Морковь",  emoji: "🥕", cost: 4,  growSec: 45, sell: 10 },
  { id: "tomato", name: "Помидор",  emoji: "🍅", cost: 6,  growSec: 70, sell: 16 },
];

const $ = (sel) => document.querySelector(sel);

const state = {
  coins: 20,
  selectedCropId: "wheat",
  // plots: array of { status: "empty"|"growing"|"ready", cropId, plantedAt, readyAt }
  plots: [],
};

function nowMs(){ return Date.now(); }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function fmtTimeLeft(ms){
  ms = Math.max(0, ms);
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2,"0")}` : `${r}с`;
}

function getCrop(id){ return CROPS.find(c => c.id === id); }

// ---------- Telegram WebApp интеграция ----------
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

  // тактильный отклик (если доступно)
  window.__tg = tg;
}

function haptic(type="impact", style="light"){
  const tg = window.__tg;
  try{
    tg?.HapticFeedback?.[type]?.(style);
  }catch{}
}

// ---------- Сохранение ----------
function makeDefaultPlots(){
  const total = GRID * GRID;
  state.plots = Array.from({length: total}, () => ({
    status: "empty",
    cropId: null,
    plantedAt: null,
    readyAt: null,
  }));
}

function load(){
  makeDefaultPlots();
  try{
    const raw = localStorage.getItem(APP_KEY);
    if(!raw) return;
    const saved = JSON.parse(raw);

    if (typeof saved.coins === "number") state.coins = clamp(saved.coins, 0, 1e9);
    if (typeof saved.selectedCropId === "string") state.selectedCropId = saved.selectedCropId;

    if (Array.isArray(saved.plots) && saved.plots.length === state.plots.length){
      state.plots = saved.plots.map(p => ({
        status: (p.status === "growing" || p.status === "ready") ? p.status : "empty",
        cropId: typeof p.cropId === "string" ? p.cropId : null,
        plantedAt: typeof p.plantedAt === "number" ? p.plantedAt : null,
        readyAt: typeof p.readyAt === "number" ? p.readyAt : null,
      }));
    }
  }catch{
    makeDefaultPlots();
  }

  normalizeGrowth();
}

function save(){
  const payload = {
    coins: state.coins,
    selectedCropId: state.selectedCropId,
    plots: state.plots,
    savedAt: nowMs(),
  };
  localStorage.setItem(APP_KEY, JSON.stringify(payload));
}

function normalizeGrowth(){
  const t = nowMs();
  for (const p of state.plots){
    if (p.status === "growing" && typeof p.readyAt === "number" && t >= p.readyAt){
      p.status = "ready";
    }
    if (p.status === "ready" && (!p.cropId || !p.readyAt)){
      p.status = "empty";
      p.cropId = null;
      p.plantedAt = null;
      p.readyAt = null;
    }
  }
}

// ---------- UI ----------
function renderChips(){
  const wrap = $("#cropChips");
  wrap.innerHTML = "";

  for(const crop of CROPS){
    const el = document.createElement("div");
    el.className = "chip" + (crop.id === state.selectedCropId ? " active" : "");
    el.innerHTML = `
      <span>${crop.emoji} ${crop.name}</span>
      <span class="price">🌱 ${crop.cost} → 💰 ${crop.sell}</span>
    `;
    el.addEventListener("click", () => {
      state.selectedCropId = crop.id;
      haptic("impact","light");
      save();
      renderAll();
    });
    wrap.appendChild(el);
  }
}

function renderTop(){
  $("#coins").textContent = String(state.coins);
  const crop = getCrop(state.selectedCropId);
  $("#selectedCrop").textContent = crop ? `${crop.emoji} ${crop.name}` : "—";

  $("#mainActionBtn").textContent = `Посадить (${crop?.cost ?? "?"}💰)`;
  $("#mainActionBtn").disabled = !crop || state.coins < crop.cost;
}

function renderField(){
  const field = $("#field");
  field.innerHTML = "";

  state.plots.forEach((p, idx) => {
    const el = document.createElement("div");
    el.className = "plot " + (p.status === "empty" ? "empty" : (p.status === "ready" ? "ready" : "growing"));

    let emoji = "🟫";
    let timerText = "";

    if (p.status === "empty"){
      emoji = "🟫";
      timerText = "Пусто";
    } else {
      const crop = getCrop(p.cropId);
      emoji = crop?.emoji ?? "🌱";
      if (p.status === "growing"){
        timerText = `Созреет через ${fmtTimeLeft(p.readyAt - nowMs())}`;
      } else if (p.status === "ready"){
        timerText = "Готово! Нажми собрать";
      }
    }

    // прогресс-бар для growing
    let barHtml = "";
    if (p.status === "growing" && p.plantedAt && p.readyAt) {
      const total = p.readyAt - p.plantedAt;
      const done = nowMs() - p.plantedAt;
      const pct = Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
      barHtml = `<div class="bar"><i style="width:${pct}%"></i></div>`;
    }

    el.innerHTML = `
      ${barHtml}
      <div class="emoji">${emoji}</div>
      <div class="timer">${timerText}</div>
    `;

    el.addEventListener("click", () => onPlotClick(idx));
    field.appendChild(el);
  });
}

function toast(text){
  const hint = $("#hint");
  hint.textContent = text;
  clearTimeout(window.__hintT);
  window.__hintT = setTimeout(() => {
    hint.textContent = "Нажми на клетку: пустая — посадить, созрела — собрать.";
  }, 2500);
}

function renderAll(){
  renderChips();
  renderTop();
  renderField();
}

// ---------- Игровая логика ----------
function plant(idx){
  const p = state.plots[idx];
  if (p.status !== "empty") return;

  const crop = getCrop(state.selectedCropId);
  if (!crop) return;

  if (state.coins < crop.cost){
    haptic("notification","error");
    toast("Не хватает монет на посадку 😿");
    return;
  }

  state.coins -= crop.cost;
  const t = nowMs();
  p.status = "growing";
  p.cropId = crop.id;
  p.plantedAt = t;
  p.readyAt = t + crop.growSec * 1000;

  haptic("impact","medium");
  toast(`Посадил(а) ${crop.emoji} ${crop.name}!`);
  save();
  renderAll();
}

function harvest(idx){
  const p = state.plots[idx];
  if (p.status !== "ready") return;

  const crop = getCrop(p.cropId);
  const gain = crop?.sell ?? 0;
  state.coins += gain;

  // визуальный эффект +монеты
  const plotEl = document.querySelectorAll(".plot")[idx];
  if (plotEl) {
    const fx = document.createElement("div");
    fx.className = "popFx";
    fx.textContent = `+${gain}💰`;
    plotEl.appendChild(fx);
    setTimeout(() => fx.remove(), 650);
  }

  p.status = "empty";
  p.cropId = null;
  p.plantedAt = null;
  p.readyAt = null;

  haptic("notification","success");
  toast(`Собрано! +${gain}💰`);
  save();
  renderAll();
}

function onPlotClick(idx){
  normalizeGrowth();
  const p = state.plots[idx];
  if (p.status === "empty") plant(idx);
  else if (p.status === "ready") harvest(idx);
  else {
    haptic("impact","light");
    toast("Растёт… ещё чуть-чуть 🌱");
  }
}

function onMainAction(){
  normalizeGrowth();
  const emptyIdx = state.plots.findIndex(p => p.status === "empty");
  if (emptyIdx === -1){
    haptic("notification","error");
    toast("Нет свободных клеток 😅 Собери урожай!");
    return;
  }
  plant(emptyIdx);
}

function tick(){
  // обновляем таймеры и прогресс-бар
  const before = state.plots.map(p => p.status).join(",");
  normalizeGrowth();
  const after = state.plots.map(p => p.status).join(",");
  if (before !== after){
    save();
  }
  renderField();
}

// ---------- Сброс ----------
function resetGame(){
  if (!confirm("Сбросить прогресс?")) return;
  state.coins = 20;
  state.selectedCropId = "wheat";
  makeDefaultPlots();
  save();
  renderAll();
  toast("Начали заново ✅");
}

// ---------- Старт ----------
function boot(){
  initTelegram();
  load();
  renderAll();

  $("#mainActionBtn").addEventListener("click", onMainAction);
  $("#resetBtn").addEventListener("click", resetGame);

  setInterval(tick, 400);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
}

boot();