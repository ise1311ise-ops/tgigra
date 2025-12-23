// --- Telegram Mini App init ---
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// --- State (localStorage) ---
const STORAGE_KEY = "zikr_app_v1";

const defaultState = {
  zikr: "SubhanAllah",
  target: 33,
  count: 0
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const s = JSON.parse(raw);

    // защита от мусора
    return {
      zikr: typeof s.zikr === "string" ? s.zikr : defaultState.zikr,
      target: Number.isFinite(Number(s.target)) ? Number(s.target) : defaultState.target,
      count: Number.isFinite(Number(s.count)) ? Number(s.count) : defaultState.count,
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// --- Elements ---
const zikrNameEl = document.getElementById("zikrName");
const progressTextEl = document.getElementById("progressText");
const countTextEl = document.getElementById("countText");

const tapBtn = document.getElementById("tapBtn");
const btnReset = document.getElementById("btnReset");
const btnChoose = document.getElementById("btnChoose");

const modalBackdrop = document.getElementById("modalBackdrop");
const zikrSelect = document.getElementById("zikrSelect");
const customTarget = document.getElementById("customTarget");
const btnClose = document.getElementById("btnClose");
const btnSave = document.getElementById("btnSave");

const chips = Array.from(document.querySelectorAll(".chip"));

function render() {
  zikrNameEl.textContent = state.zikr;
  progressTextEl.textContent = `${state.count} / ${state.target}`;
  countTextEl.textContent = String(state.count);

  // подсветка чипов по цели
  chips.forEach(c => {
    const t = Number(c.dataset.target);
    c.classList.toggle("active", t === state.target);
  });
}

function haptic(type = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred?.(type);
  } catch {}
}

function inc() {
  state.count += 1;

  // если дошли до цели — можно “мягко” дать сигнал
  if (state.count === state.target) {
    haptic("heavy");
  } else {
    haptic("light");
  }

  saveState();
  render();
}

function reset() {
  state.count = 0;
  haptic("medium");
  saveState();
  render();
}

// --- Modal ---
function openModal() {
  zikrSelect.value = state.zikr;
  customTarget.value = "";
  modalBackdrop.hidden = false;
}

function closeModal() {
  modalBackdrop.hidden = true;
}

chips.forEach(chip => {
  chip.addEventListener("click", () => {
    const t = Number(chip.dataset.target);
    if (Number.isFinite(t)) {
      state.target = t;
      chips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
    }
  });
});

btnSave.addEventListener("click", () => {
  const z = zikrSelect.value;
  const custom = customTarget.value.trim();

  state.zikr = z;

  if (custom) {
    const t = Number(custom);
    if (Number.isFinite(t) && t > 0 && t <= 1000000) {
      state.target = Math.floor(t);
    }
  }

  // Если счётчик больше цели — не режем, оставляем как есть,
  // но прогресс покажет count/target. Если хочешь — можно обнулить.
  saveState();
  render();
  closeModal();
});

btnClose.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

// --- Buttons ---
tapBtn.addEventListener("click", inc);
btnReset.addEventListener("click", reset);
btnChoose.addEventListener("click", openModal);

// старт
render();