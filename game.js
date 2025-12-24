/* ============
   Minimal Mini App (no backend)
   - Tabs
   - Prayer list + countdown
   - Menu + Settings modals
   - Qibla compass (DeviceOrientation if available)
   - Fallback slider
   ============ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** ====== State ====== */
const state = {
  city: "Сергиев Посад",
  method: "Umm al-Qura",
  notifyBeforeMin: 10,
  notifyMode: "Звук",
  notifySound: "Alien",
  language: "System default",

  // demo prayers (you can replace later with real calc)
  prayers: [
    { key: "fajr",   name: "Fajr",   ar: "الفجر",   time: "06:33" },
    { key: "dhuhr",  name: "Dhuhr",  ar: "الظهر",   time: "12:27" },
    { key: "asr",    name: "Asr",    ar: "العصر",   time: "13:41" },
    { key: "maghrib",name: "Maghrib",ar: "المغرب",  time: "15:54" },
    { key: "isha",   name: "Isha",   ar: "العشاء",  time: "17:24" },
  ],

  // qibla
  qiblaAzimuth: 0,     // degrees to Kaaba from location (placeholder)
  heading: null,       // device heading
  arrowAngle: 0,       // smooth angle
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
    const s = JSON.parse(raw);
    Object.assign(state, s);
  } catch {}
}

/** ====== UI render ====== */
function renderHeaderFor(screen) {
  const title = $("#screenTitle");
  const subtitle = $("#screenSubtitle");

  if (screen === "prayers") {
    title.textContent = "Время молитв";
    subtitle.classList.remove("hidden");
    $("#cityName").textContent = state.city;
  } else {
    title.textContent = "Кибла";
    subtitle.classList.remove("hidden");
    $("#cityName").textContent = state.city;
  }
}

function renderMethodChips() {
  $$("#methodChips .chip").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.method === state.method);
  });
}

function renderPrayerList(activeKey = null) {
  const list = $("#prayerList");
  list.innerHTML = "";

  const active = activeKey ?? getCurrentOrNextPrayerKey();
  state.prayers.forEach(p => {
    const item = document.createElement("div");
    item.className = "prayer-item" + (p.key === active ? " active" : "");

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
        <button class="small-gear" data-prayer="${p.key}" aria-label="Настройки молитвы">⚙</button>
      </div>
    `;
    list.appendChild(item);
  });

  // gear click: just open settings
  $$("#prayerList .small-gear").forEach(btn => {
    btn.addEventListener("click", () => openSettings());
  });
}

function renderSettingsLabels() {
  $("#notifyBeforeLabel").textContent = `За ${state.notifyBeforeMin} мин`;
  $("#notifyModeLabel").textContent = state.notifyMode;
  $("#notifySoundLabel").textContent = state.notifySound;
  $("#langLabel").textContent = state.language;
}

function renderQiblaLabels() {
  $("#qiblaAzimuth").textContent = isFinite(state.qiblaAzimuth) ? Math.round(state.qiblaAzimuth) : "—";
  $("#heading").textContent = (state.heading === null) ? "—" : Math.round(state.heading);
}

/** ====== Tabs/screens ====== */
function showScreen(name) {
  $("#screenPrayers").classList.toggle("hidden", name !== "prayers");
  $("#screenQibla").classList.toggle("hidden", name !== "qibla");

  $("#tabPrayers").classList.toggle("active", name === "prayers");
  $("#tabQibla").classList.toggle("active", name === "qibla");

  renderHeaderFor(name);
}

/** ====== Modals ====== */
function openMenu() { $("#menuModal").classList.remove("hidden"); }
function closeMenu() { $("#menuModal").classList.add("hidden"); }

function openSettings() {
  renderSettingsLabels();
  $("#settingsModal").classList.remove("hidden");
}
function closeSettings() { $("#settingsModal").classList.add("hidden"); }

/** ====== Prayer time helpers ====== */
function parseTodayTimeHHMM(hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
}

function getCurrentOrNextPrayerKey() {
  const now = new Date();
  for (const p of state.prayers) {
    const t = parseTodayTimeHHMM(p.time);
    if (t > now) return p.key;
  }
  // if day ended -> next is fajr
  return state.prayers[0].key;
}

function getNextPrayer() {
  const now = new Date();
  for (const p of state.prayers) {
    const t = parseTodayTimeHHMM(p.time);
    if (t > now) return { prayer: p, time: t };
  }
  // tomorrow fajr
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

function tickCountdown() {
  const next = getNextPrayer();
  $("#nextPrayerName").textContent = next.prayer.name;
  const delta = next.time.getTime() - Date.now();
  $("#countdown").textContent = formatHHMMSS(delta);

  // highlight
  renderPrayerList(next.prayer.key);
}

/** ====== Qibla math ======
  We'll set a placeholder azimuth; later you can compute from geolocation.
  For now:
    qiblaAzimuth = 160 (пример)
  arrow rotation should point: (qiblaAzimuth - heading)
*/
function setQiblaAzimuthPlaceholder() {
  // Пример: Сергиев Посад -> примерно юго-восток; поставим 160°
  if (!isFinite(state.qiblaAzimuth) || state.qiblaAzimuth === 0) {
    state.qiblaAzimuth = 160;
  }
}

function normalizeDeg(a) {
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}

function shortestAngleDelta(from, to) {
  // returns delta in [-180..180]
  let d = normalizeDeg(to) - normalizeDeg(from);
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function updateCompassArrow(targetAngle) {
  // smooth interpolation
  const current = state.arrowAngle;
  const delta = shortestAngleDelta(current, targetAngle);
  state.arrowAngle = normalizeDeg(current + delta * 0.18); // smoothing factor
  $("#arrow").style.transform = `rotate(${state.arrowAngle}deg) translateZ(0)`;
}

function recomputeArrow() {
  const heading = (state.heading === null) ? Number($("#demoHeading").value) : state.heading;
  const target = normalizeDeg(state.qiblaAzimuth - heading);
  updateCompassArrow(target);

  // UI labels
  $("#demoHeading").value = String(Math.round(heading));
  renderQiblaLabels();
}

/** ====== Device orientation ====== */
function setupDeviceOrientation() {
  // Fallback always works:
  $("#demoHeading").addEventListener("input", () => {
    if (state.heading === null) recomputeArrow();
  });

  // Try request permission on iOS-like environments
  async function tryEnable() {
    try {
      const DO = window.DeviceOrientationEvent;
      if (!DO) return;

      if (typeof DO.requestPermission === "function") {
        // iOS: needs user gesture
        const perm = await DO.requestPermission();
        if (perm !== "granted") return;
      }

      window.addEventListener("deviceorientation", (e) => {
        // Some browsers provide alpha as compass heading (not always true).
        // We'll treat it as heading to show effect; can be refined later.
        if (e.alpha == null) return;
        state.heading = normalizeDeg(e.alpha);
      }, { passive: true });

      // If we start getting heading, we hide note visually? leave as-is.
    } catch {
      // ignore
    }
  }

  // Try enabling after any tap (user gesture)
  document.addEventListener("click", () => {
    tryEnable();
  }, { once: true });
}

/** ====== Events ====== */
function wireUI() {
  // tabs
  $("#tabPrayers").addEventListener("click", () => showScreen("prayers"));
  $("#tabQibla").addEventListener("click", () => showScreen("qibla"));

  // top actions
  $("#btnMore").addEventListener("click", openMenu);

  // back/search: placeholders
  $("#btnBack").addEventListener("click", () => {
    // In Telegram you might call WebApp.close(); here just show prayers
    showScreen("prayers");
  });
  $("#btnSearch").addEventListener("click", () => {
    // placeholder
    alert("Поиск/выбор города — добавим дальше.");
  });

  // menu close/backdrop
  $("#btnCloseMenu").addEventListener("click", closeMenu);
  $$("#menuModal [data-close='menu']").forEach(el => el.addEventListener("click", closeMenu));

  // menu actions placeholders
  $("#btnFeedback").addEventListener("click", () => alert("Обратная связь — здесь можно открыть форму/чат."));
  $("#btnRate").addEventListener("click", () => alert("Оценка — ссылка на маркет/страницу."));
  $("#btnShare").addEventListener("click", () => {
    navigator.clipboard?.writeText(location.href).catch(()=>{});
    alert("Ссылка скопирована (или добавьте Telegram Share).");
  });
  $("#btnPrivacy").addEventListener("click", () => alert("Политика конфиденциальности — откройте страницу."));

  // settings open from gear icon in header? (у вас справа шестерёнка в дизайне)
  // Здесь используем long press? Просто откроем настройки по двойному клику на заголовке:
  $("#screenTitle").addEventListener("dblclick", openSettings);

  // settings close/backdrop
  $("#btnCloseSettings").addEventListener("click", () => { saveSettings(); closeSettings(); });
  $$("#settingsModal [data-close='settings']").forEach(el => el.addEventListener("click", () => { saveSettings(); closeSettings(); }));

  // Settings interactions (simple cycling)
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

  // chips
  $$("#methodChips .chip").forEach(btn => {
    btn.addEventListener("click", () => {
      state.method = btn.dataset.method;
      renderMethodChips();
      saveSettings();
    });
  });
}

/** ====== Boot ====== */
function boot() {
  loadSettings();

  $("#cityName").textContent = state.city;
  renderMethodChips();
  renderPrayerList();
  renderSettingsLabels();

  setQiblaAzimuthPlaceholder();
  renderQiblaLabels();

  wireUI();
  setupDeviceOrientation();

  // countdown loop
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // compass animation loop
  function loop() {
    recomputeArrow();
    requestAnimationFrame(loop);
  }
  loop();

  showScreen("prayers");
}

boot();
