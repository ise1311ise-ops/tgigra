const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  city: "Сергиев Посад",
  method: "Umm al-Qura",
  notifyBeforeMin: 10,
  notifyMode: "Звук",
  notifySound: "Alien",
  language: "System default",

  prayers: [
    { key: "fajr",   name: "Fajr",   ar: "الفجر",   time: "06:33" },
    { key: "dhuhr",  name: "Dhuhr",  ar: "الظهر",   time: "12:27" },
    { key: "asr",    name: "Asr",    ar: "العصر",   time: "13:41" },
    { key: "maghrib",name: "Maghrib",ar: "المغرب",  time: "15:54" },
    { key: "isha",   name: "Isha",   ar: "العشاء",  time: "17:24" },
  ],

  qiblaAzimuth: 160,     // пока фикс (потом можно считать по геолокации)
  heading: null,
  arrowAngle: 0,
};

function saveSettings() {
  localStorage.setItem("miniapp_prayer_state", JSON.stringify({
    city: state.city,
    method: state.method,
    notifyBeforeMin: state.notifyBeforeMin,
    notifyMode: state.notifyMode,
    notifySound: state.notifySound,
    language: state.language,
    qiblaAzimuth: state.qiblaAzimuth,
  }));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem("miniapp_prayer_state");
    if (!raw) return;
    Object.assign(state, JSON.parse(raw));
  } catch {}
}

function renderHeaderFor(screen) {
  const title = $("#screenTitle");
  title.textContent = (screen === "prayers") ? "Время молитв" : "Кибла";
  $("#cityName").textContent = state.city;
}

function renderMethodChips() {
  $$("#methodChips .chip").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.method === state.method);
  });
}

function renderSettingsLabels() {
  $("#notifyBeforeLabel").textContent = `За ${state.notifyBeforeMin} мин`;
  $("#notifyModeLabel").textContent = state.notifyMode;
  $("#notifySoundLabel").textContent = state.notifySound;
  $("#langLabel").textContent = state.language;
}

function parseTodayTimeHHMM(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

function getNextPrayer() {
  const now = new Date();
  for (const p of state.prayers) {
    const t = parseTodayTimeHHMM(p.time);
    if (t > now) return { prayer: p, time: t };
  }
  const p0 = state.prayers[0];
  const t0 = parseTodayTimeHHMM(p0.time);
  t0.setDate(t0.getDate() + 1);
  return { prayer: p0, time: t0 };
}

function formatHHMMSS(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function renderPrayerList(activeKey) {
  const list = $("#prayerList");
  list.innerHTML = "";
  state.prayers.forEach(p => {
    const item = document.createElement("div");
    item.className = "prayer-item" + (p.key === activeKey ? " active" : "");
    item.innerHTML = `
      <div class="prayer-left">
        <div class="dot"></div>
        <div class="prayer-names">
          <div class="prayer-name">${p.name}</div>
          <div class="prayer-ar">${p.ar}</div>
        </div>
      </div>
      <div class="prayer-right">
        <div class="prayer-time">${p.time}</div>
        <button class="small-gear" aria-label="Настройки">⚙</button>
      </div>
    `;
    item.querySelector(".small-gear").addEventListener("click", openSettings);
    list.appendChild(item);
  });
}

function tickCountdown() {
  const next = getNextPrayer();
  $("#nextPrayerName").textContent = next.prayer.name;
  $("#countdown").textContent = formatHHMMSS(next.time.getTime() - Date.now());
  renderPrayerList(next.prayer.key);
}

function showScreen(name) {
  $("#screenPrayers").classList.toggle("hidden", name !== "prayers");
  $("#screenQibla").classList.toggle("hidden", name !== "qibla");
  $("#tabPrayers").classList.toggle("active", name === "prayers");
  $("#tabQibla").classList.toggle("active", name === "qibla");
  renderHeaderFor(name);
}

/* ===== Modals ===== */
function openMenu() { $("#menuModal").classList.remove("hidden"); }
function closeMenu() { $("#menuModal").classList.add("hidden"); }
function openSettings() {
  renderSettingsLabels();
  $("#settingsModal").classList.remove("hidden");
}
function closeSettings() { $("#settingsModal").classList.add("hidden"); }

/* ===== Compass / Qibla ===== */
function normalizeDeg(a) {
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}
function shortestAngleDelta(from, to) {
  let d = normalizeDeg(to) - normalizeDeg(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function updateCompassArrow(targetAngle) {
  const current = state.arrowAngle;
  const delta = shortestAngleDelta(current, targetAngle);
  state.arrowAngle = normalizeDeg(current + delta * 0.18);
  $("#arrow").style.transform = `rotate(${state.arrowAngle}deg) translateZ(0)`;
}
function renderQiblaLabels(heading) {
  $("#qiblaAzimuth").textContent = Math.round(state.qiblaAzimuth);
  $("#heading").textContent = (heading == null) ? "—" : Math.round(heading);
}

function recomputeArrow() {
  const heading = (state.heading == null) ? Number($("#demoHeading").value) : state.heading;
  const target = normalizeDeg(state.qiblaAzimuth - heading);
  updateCompassArrow(target);
  renderQiblaLabels(heading);
}

function setupDeviceOrientation() {
  $("#demoHeading").addEventListener("input", () => {
    if (state.heading == null) recomputeArrow();
  });

  async function tryEnable() {
    try {
      const DO = window.DeviceOrientationEvent;
      if (!DO) return;

      if (typeof DO.requestPermission === "function") {
        const perm = await DO.requestPermission();
        if (perm !== "granted") return;
      }

      window.addEventListener("deviceorientation", (e) => {
        if (e.alpha == null) return;
        state.heading = normalizeDeg(e.alpha);
      }, { passive: true });

    } catch {}
  }

  document.addEventListener("click", () => tryEnable(), { once: true });
}

/* ===== UI wiring ===== */
function wireUI() {
  $("#tabPrayers").addEventListener("click", () => showScreen("prayers"));
  $("#tabQibla").addEventListener("click", () => showScreen("qibla"));

  $("#btnMore").addEventListener("click", openMenu);
  $("#btnBack").addEventListener("click", () => showScreen("prayers"));

  $("#btnSearch").addEventListener("click", () => alert("Поиск/выбор города — добавим позже"));

  $("#btnCloseMenu").addEventListener("click", closeMenu);
  $$("#menuModal [data-close='menu']").forEach(el => el.addEventListener("click", closeMenu));

  $("#btnFeedback").addEventListener("click", () => alert("Обратная связь — добавим форму/чат"));
  $("#btnRate").addEventListener("click", () => alert("Оценить — добавим ссылку"));
  $("#btnShare").addEventListener("click", () => {
    navigator.clipboard?.writeText(location.href).catch(()=>{});
    alert("Ссылка скопирована");
  });
  $("#btnPrivacy").addEventListener("click", () => alert("Политика — откроем страницу"));

  $("#btnCloseSettings").addEventListener("click", () => { saveSettings(); closeSettings(); });
  $$("#settingsModal [data-close='settings']").forEach(el => el.addEventListener("click", () => { saveSettings(); closeSettings(); }));

  $("#btnNotifyBefore").addEventListener("click", () => {
    const options = [5, 10, 15, 20, 30];
    const i = options.indexOf(state.notifyBeforeMin);
    state.notifyBeforeMin = options[(i + 1) % options.length];
    renderSettingsLabels();
  });
  $("#btnNotifyMode").addEventListener("click", () => {
    const options = ["Звук", "Без звука", "Вибрация"];
    const i = options.indexOf(state.notifyMode);
    state.notifyMode = options[(i + 1) % options.length];
    renderSettingsLabels();
  });
  $("#btnNotifySound").addEventListener("click", () => {
    const options = ["Alien", "Classic", "Soft", "Beep"];
    const i = options.indexOf(state.notifySound);
    state.notifySound = options[(i + 1) % options.length];
    renderSettingsLabels();
  });
  $("#btnLanguage").addEventListener("click", () => {
    const options = ["System default", "Русский", "English", "العربية"];
    const i = options.indexOf(state.language);
    state.language = options[(i + 1) % options.length];
    renderSettingsLabels();
  });

  $$("#methodChips .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      state.method = btn.dataset.method;
      renderMethodChips();
      saveSettings();
    });
  });
}

/* ===== Boot ===== */
function boot() {
  loadSettings();

  renderMethodChips();
  tickCountdown();
  setInterval(tickCountdown, 1000);

  wireUI();
  setupDeviceOrientation();

  function loop() {
    recomputeArrow();
    requestAnimationFrame(loop);
  }
  loop();

  showScreen("prayers");
}

boot();
