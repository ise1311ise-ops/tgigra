
/* ====== Simple Prayer Times + Qibla Compass (no libs) ====== */

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

/* ---------- Storage ---------- */
const LS_KEY = "prayer_app_v1";

const defaultState = {
  method: "Umm al-Qura",
  offsets: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
  settings: {
    notifBeforeMin: 10,
    notifMode: "Звук",       // "Звук" | "Без звука" | "Вибрация"
    notifSound: "Alien",
    lang: "System default"
  },
  geo: { lat: null, lon: null, city: null },
  sensors: { enabled: false }
};

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    // merge shallow
    return {
      ...structuredClone(defaultState),
      ...parsed,
      offsets: { ...defaultState.offsets, ...(parsed.offsets || {}) },
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      geo: { ...defaultState.geo, ...(parsed.geo || {}) },
      sensors: { ...defaultState.sensors, ...(parsed.sensors || {}) },
    };
  } catch {
    return structuredClone(defaultState);
  }
}
function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------- Prayer times "engine" (lightweight mock) ---------- */
/**
 * Базовые времена — как на твоих скринах.
 * Дальше применяем:
 * - смещение конкретной молитвы (offsets)
 * - небольшую коррекцию по методу (условно)
 */
const PRAYERS = [
  { key: "Fajr",    ar: "الفجر",   base: "06:33" },
  { key: "Dhuhr",   ar: "الظهر",   base: "12:27" },
  { key: "Asr",     ar: "العصر",   base: "13:41" },
  { key: "Maghrib", ar: "المغرب",  base: "15:54" },
  { key: "Isha",    ar: "العشاء",  base: "17:24" },
];

const METHOD_SHIFT = {
  "ISNA": 0,
  "MWL": -1,
  "Umm al-Qura": 0,
  "Egypt": +1,
  "Moonsighting": 0
};

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function fromMinutes(min) {
  let m = min % (24*60);
  if (m < 0) m += 24*60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

function getAdjustedPrayerTimes() {
  const methodShift = METHOD_SHIFT[state.method] ?? 0;
  return PRAYERS.map(p => {
    const baseMin = toMinutes(p.base);
    const off = state.offsets[p.key] ?? 0;
    const finalMin = baseMin + methodShift + off;
    return { ...p, time: fromMinutes(finalMin), timeMin: finalMin };
  });
}

/* ---------- UI: render prayers ---------- */
const prayerListEl = $("#prayerList");
const countdownEl = $("#countdown");
const nextPrayerNameEl = $("#nextPrayerName");

function renderMethods() {
  $$("#methods .chip").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.method === state.method);
  });
}

function renderPrayerList() {
  const times = getAdjustedPrayerTimes();

  // determine next prayer vs now
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  let next = times.find(t => t.timeMin > nowMin);
  if (!next) next = times[0]; // wrap to tomorrow

  prayerListEl.innerHTML = "";

  times.forEach(t => {
    const isNext = (t.key === next.key);

    const item = document.createElement("div");
    item.className = "prayer-item";
    item.innerHTML = `
      <div class="prayer-left">
        <div class="dot ${isNext ? "active" : ""}"></div>
        <div class="prayer-names">
          <div class="prayer-en">${t.key}</div>
          <div class="prayer-ar">${t.ar}</div>
        </div>
      </div>

      <div class="prayer-right">
        <div class="prayer-time">${t.time}</div>
        <button class="icon-btn small gear-mini" data-action="offset" data-prayer="${t.key}" aria-label="Настроить ${t.key}">
          <span class="icon icon-gear"></span>
        </button>
      </div>
    `;
    prayerListEl.appendChild(item);
  });

  nextPrayerNameEl.textContent = next.key;
}

function renderAll() {
  $("#notifBeforeLabel").textContent = `За ${state.settings.notifBeforeMin} мин`;
  $("#notifModeLabel").textContent = state.settings.notifMode;
  $("#notifSoundLabel").textContent = state.settings.notifSound;
  $("#langLabel").textContent = state.settings.lang;

  renderMethods();
  renderPrayerList();
  updateCountdown();
  updateQiblaUI();
}

/* ---------- Countdown ---------- */
function updateCountdown() {
  const times = getAdjustedPrayerTimes();
  const now = new Date();
  const nowSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  const nowMin = Math.floor(nowSec/60);

  let next = times.find(t => t.timeMin > nowMin);
  let targetMin = next ? next.timeMin : times[0].timeMin + 24*60;
  let diffSec = targetMin*60 - nowSec;
  if (diffSec < 0) diffSec += 24*3600;

  const hh = Math.floor(diffSec / 3600);
  const mm = Math.floor((diffSec % 3600) / 60);
  const ss = diffSec % 60;

  countdownEl.textContent = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
setInterval(updateCountdown, 1000);

/* ---------- Modals ---------- */
function openModal(id) {
  const el = $("#" + id);
  if (!el) return;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
}
function closeModal(id) {
  const el = $("#" + id);
  if (!el) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

document.addEventListener("click", (e) => {
  const closeId = e.target?.dataset?.close;
  if (closeId) closeModal(closeId);
});

/* ---------- Menu / Settings ---------- */
$("#btnMenu").addEventListener("click", () => openModal("menuModal"));
$("#btnSettings").addEventListener("click", () => openModal("settingsModal"));

$("#btnFeedback").addEventListener("click", () => {
  alert("Обратная связь: добавь сюда mailto или ссылку на форму.");
});
$("#btnRate").addEventListener("click", () => {
  alert("Оценить нас: добавь ссылку на стор/страницу.");
});
$("#btnShare").addEventListener("click", async () => {
  const text = "Моё приложение времени молитв и киблы";
  try {
    if (navigator.share) await navigator.share({ text });
    else {
      await navigator.clipboard.writeText(text);
      alert("Текст для шаринга скопирован в буфер обмена.");
    }
  } catch { /* ignore */ }
});
$("#btnPrivacy").addEventListener("click", () => {
  alert("Политика конфиденциальности: добавь ссылку/страницу.");
});

/* ---------- Methods ---------- */
$("#methods").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  state.method = btn.dataset.method;
  saveState();
  renderAll();
});

/* ---------- Offset modal logic ---------- */
let currentOffsetPrayer = null;

function openOffsetModal(prayerKey) {
  currentOffsetPrayer = prayerKey;
  const times = getAdjustedPrayerTimes();
  const row = times.find(t => t.key === prayerKey);
  $("#offsetPrayerName").textContent = prayerKey;
  $("#offsetValue").textContent = String(state.offsets[prayerKey] ?? 0);
  $("#offsetFinalTime").textContent = row?.time ?? "--:--";
  openModal("offsetModal");
}

prayerListEl.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="offset"]');
  if (!btn) return;
  openOffsetModal(btn.dataset.prayer);
});

// Optional: hero gear opens settings as in your UI (can be changed)
$("#btnHeroGear").addEventListener("click", () => openModal("settingsModal"));

function bumpOffset(delta) {
  if (!currentOffsetPrayer) return;
  const cur = state.offsets[currentOffsetPrayer] ?? 0;
  state.offsets[currentOffsetPrayer] = cur + delta;
  saveState();
  renderPrayerList();
  // update modal labels
  $("#offsetValue").textContent = String(state.offsets[currentOffsetPrayer]);
  const times = getAdjustedPrayerTimes();
  const row = times.find(t => t.key === currentOffsetPrayer);
  $("#offsetFinalTime").textContent = row?.time ?? "--:--";
}

$("#btnMinus5").addEventListener("click", () => bumpOffset(-5));
$("#btnPlus5").addEventListener("click", () => bumpOffset(+5));
$("#btnOffsetReset").addEventListener("click", () => {
  if (!currentOffsetPrayer) return;
  state.offsets[currentOffsetPrayer] = 0;
  saveState();
  renderAll();
  openOffsetModal(currentOffsetPrayer);
});

/* ---------- Settings pickers (simple) ---------- */
function openPicker(title, items, activeValue, onPick) {
  $("#pickerTitle").textContent = title;
  const list = $("#pickerList");
  list.innerHTML = "";
  items.forEach(it => {
    const btn = document.createElement("button");
    btn.className = "pick" + (it.value === activeValue ? " active" : "");
    btn.innerHTML = `
      <span>${it.label}</span>
      ${it.sub ? `<span class="small">${it.sub}</span>` : `<span></span>`}
    `;
    btn.addEventListener("click", () => {
      onPick(it.value);
      closeModal("pickerModal");
      renderAll();
    });
    list.appendChild(btn);
  });
  openModal("pickerModal");
}

$("#optNotif").addEventListener("click", () => {
  openPicker(
    "Уведомления до молитвы",
    [0,5,10,15,20,30].map(v => ({ value: v, label: `За ${v} мин`, sub: v===0 ? "Выключено" : "" })),
    state.settings.notifBeforeMin,
    (v) => { state.settings.notifBeforeMin = v; saveState(); }
  );
});

$("#optMode").addEventListener("click", () => {
  const modes = ["Звук", "Без звука", "Вибрация"].map(v => ({ value: v, label: v }));
  openPicker("Режим уведомлений", modes, state.settings.notifMode, (v) => {
    state.settings.notifMode = v; saveState();
  });
});

$("#optSound").addEventListener("click", () => {
  const sounds = ["Alien","Azan","Classic","Soft"].map(v => ({ value: v, label: v }));
  openPicker("Звук уведомления", sounds, state.settings.notifSound, (v) => {
    state.settings.notifSound = v; saveState();
  });
});

$("#optLang").addEventListener("click", () => {
  const langs = [
    { value: "System default", label: "System default" },
    { value: "Русский", label: "Русский" },
    { value: "English", label: "English" }
  ];
  openPicker("Язык приложения", langs, state.settings.lang, (v) => {
    state.settings.lang = v; saveState();
  });
});

/* ---------- Tabs / screens ---------- */
const screenPrayers = $("#screenPrayers");
const screenQibla = $("#screenQibla");
const tabPrayers = $("#tabPrayers");
const tabQibla = $("#tabQibla");
const screenTitle = $("#screenTitle");

function showScreen(which) {
  const prayers = which === "prayers";
  screenPrayers.classList.toggle("active", prayers);
  screenQibla.classList.toggle("active", !prayers);
  tabPrayers.classList.toggle("active", prayers);
  tabQibla.classList.toggle("active", !prayers);
  screenTitle.textContent = prayers ? "Время молитв" : "Кибла";
}
tabPrayers.addEventListener("click", () => showScreen("prayers"));
tabQibla.addEventListener("click", () => showScreen("qibla"));

/* ---------- Qibla math ---------- */
const KAABA = { lat: 21.4225, lon: 39.8262 };

function deg2rad(d){ return d * Math.PI/180; }
function rad2deg(r){ return r * 180/Math.PI; }

// initial bearing from (lat1,lon1) to (lat2,lon2)
function bearing(lat1, lon1, lat2, lon2){
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δλ = deg2rad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (rad2deg(θ) + 360) % 360;
}

let qiblaBearing = null;   // to Kaaba
let deviceHeading = null;  // 0..360
let usingSensors = false;

function setArrowRotation() {
  // Rotate arrow relative to device heading:
  // if deviceHeading is 0 (north), arrow should point at qiblaBearing.
  // So rotation = qiblaBearing - deviceHeading
  const arrow = $("#qiblaArrow");
  const bh = (qiblaBearing ?? 0);
  const dh = (deviceHeading ?? 0);
  const rot = (bh - dh + 360) % 360;
  arrow.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
}

function updateQiblaUI(){
  $("#qiblaBearing").textContent = qiblaBearing == null ? "—" : String(Math.round(qiblaBearing));
  $("#deviceHeading").textContent = deviceHeading == null ? "—" : String(Math.round(deviceHeading));
  $("#qiblaCity").textContent = state.geo.city ? `📍 ${state.geo.city}` : "📍 —";
  setArrowRotation();
}

/* ---------- Geolocation ---------- */
$("#btnGeo").addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Геолокация не поддерживается в этом браузере.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      state.geo.lat = latitude;
      state.geo.lon = longitude;
      state.geo.city = state.geo.city || "Текущее место";
      qiblaBearing = bearing(latitude, longitude, KAABA.lat, KAABA.lon);
      saveState();
      updateQiblaUI();
      alert("Локация получена. Стрелка обновлена.");
    },
    () => alert("Не удалось получить геолокацию. Проверь разрешения."),
    { enableHighAccuracy: true, timeout: 15000 }
  );
});

/* ---------- Sensors ---------- */
// Works on many Android browsers. iOS Safari требует user gesture + requestPermission.
async function enableSensors() {
  // iOS permission request (if available)
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted") throw new Error("denied");
    }
  } catch {
    alert("Нет доступа к датчикам (или отказано). Используй ползунок.");
    usingSensors = false;
    return;
  }

  usingSensors = true;
  $("#sensorHint").textContent = "Датчики включены. Если стрелка ведёт себя странно — откалибруй компас телефона.";
}

function handleOrientation(e) {
  // On Android Chrome: alpha is compass heading (0..360) relative to north (approx).
  // On some devices: we can use e.webkitCompassHeading (iOS).
  let heading = null;

  if (typeof e.webkitCompassHeading === "number") {
    heading = e.webkitCompassHeading; // iOS
  } else if (typeof e.alpha === "number") {
    // e.alpha is rotation around z-axis
    heading = (360 - e.alpha) % 360;
  }

  if (heading == null) return;
  deviceHeading = heading;
  updateQiblaUI();
}

$("#btnSensors").addEventListener("click", async () => {
  await enableSensors();
});

window.addEventListener("deviceorientationabsolute", (e) => {
  if (!usingSensors) return;
  handleOrientation(e);
}, true);

window.addEventListener("deviceorientation", (e) => {
  if (!usingSensors) return;
  handleOrientation(e);
}, true);

/* ---------- Manual slider fallback ---------- */
$("#headingSlider").addEventListener("input", (e) => {
  if (usingSensors) return; // ignore if sensors active
  deviceHeading = Number(e.target.value);
  updateQiblaUI();
});

/* ---------- Init ---------- */
(function init() {
  // restore method chips
  renderAll();

  // If we have stored geo coordinates, compute bearing
  if (typeof state.geo.lat === "number" && typeof state.geo.lon === "number") {
    qiblaBearing = bearing(state.geo.lat, state.geo.lon, KAABA.lat, KAABA.lon);
  } else {
    // default: Sergiev Posad (from your screenshot) if you want
    // uncomment if нужно:
    // const sp = { lat: 56.3083, lon: 38.1320 };
    // state.geo.city = "Сергиев Посад";
    // state.geo.lat = sp.lat; state.geo.lon = sp.lon;
    // qiblaBearing = bearing(sp.lat, sp.lon, KAABA.lat, KAABA.lon);
  }

  // close modal on backdrop click
  $$(".modal-backdrop").forEach(b => {
    b.addEventListener("click", () => closeModal(b.dataset.close));
  });

  // allow closing by ESC
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["menuModal","settingsModal","offsetModal","pickerModal"].forEach(closeModal);
  });

  updateQiblaUI();
})();
