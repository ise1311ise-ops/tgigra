/* ===========================
   Prayer Times App (GitHub Pages)
   - Times via API (AlAdhan)
   - 5 calc methods
   - Per-prayer offsets
   - Notifications before prayer
   - Qibla compass (device orientation) + fallback slider
   =========================== */

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const LS_KEY = "prayer_app_v2";

const PRAYERS = [
  { key:"Fajr",    ar:"الفجر" },
  { key:"Dhuhr",   ar:"الظهر" },
  { key:"Asr",     ar:"العصر" },
  { key:"Maghrib", ar:"المغرب" },
  { key:"Isha",    ar:"العشاء" }
];

// AlAdhan method mapping (numeric)
const METHOD_TO_ID = {
  "ISNA": 2,
  "MWL": 3,
  "Umm al-Qura": 4,
  "Egypt": 5,
  "Moonsighting": 15
};

const DEFAULT_STATE = {
  method: "Umm al-Qura",
  geo: { lat:null, lon:null, city:null },
  // offsets in minutes
  offsets: { Fajr:0, Dhuhr:0, Asr:0, Maghrib:0, Isha:0 },
  // settings
  settings: {
    notifBefore: 10,           // minutes
    notifMode: "Звук",         // "Звук" | "Без звука" | "Вибрация"
    notifSound: "Alien"        // placeholder label
  },
  // cached timings for today
  timings: null,
  timingsDate: null
};

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return structuredClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...p,
      geo: { ...DEFAULT_STATE.geo, ...(p.geo||{}) },
      offsets: { ...DEFAULT_STATE.offsets, ...(p.offsets||{}) },
      settings: { ...DEFAULT_STATE.settings, ...(p.settings||{}) },
    };
  }catch{
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

let state = loadState();

/* ------------------ Helpers time ------------------ */
function toMinutes(hhmm){
  const [h,m] = hhmm.split(":").map(n=>parseInt(n,10));
  return h*60 + m;
}
function fromMinutes(min){
  let m = min % (24*60);
  if(m<0) m += 24*60;
  const hh = Math.floor(m/60);
  const mm = m%60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}
function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ------------------ UI references ------------------ */
const prayerListEl = $("#prayerList");
const countdownEl = $("#countdown");
const nextNameEl = $("#nextPrayerName");
const topTitleEl = $("#topTitle");

const qArrow = $("#qArrow");
const qCity = $("#qCity");
const qBearingEl = $("#qBearing");
const qHeadingEl = $("#qHeading");
const headingSlider = $("#headingSlider");
const qNote = $("#qNote");

/* ------------------ Modals ------------------ */
function openModal(id){ const el = $("#"+id); if(!el) return; el.classList.add("open"); el.setAttribute("aria-hidden","false"); }
function closeModal(id){ const el = $("#"+id); if(!el) return; el.classList.remove("open"); el.setAttribute("aria-hidden","true"); }

document.addEventListener("click",(e)=>{
  const id = e.target?.dataset?.close;
  if(id) closeModal(id);
});

/* ------------------ Tabs ------------------ */
const screenPrayers = $("#screenPrayers");
const screenQibla = $("#screenQibla");
const tabPrayers = $("#tabPrayers");
const tabQibla = $("#tabQibla");

function showScreen(name){
  const prayers = name==="prayers";
  screenPrayers.classList.toggle("active", prayers);
  screenQibla.classList.toggle("active", !prayers);
  tabPrayers.classList.toggle("active", prayers);
  tabQibla.classList.toggle("active", !prayers);
  topTitleEl.textContent = prayers ? "Время молитв" : "Кибла";
}
tabPrayers.addEventListener("click", ()=>showScreen("prayers"));
tabQibla.addEventListener("click", ()=>showScreen("qibla"));

/* ------------------ Menu / settings buttons ------------------ */
$("#btnMenu").addEventListener("click", ()=>openModal("menuModal"));
$("#btnSettings").addEventListener("click", ()=>openModal("settingsModal"));
$("#btnHeroGear").addEventListener("click", ()=>openModal("settingsModal"));

$("#mFeedback").addEventListener("click", ()=>alert("Обратная связь: добавь ссылку / mailto."));
$("#mRate").addEventListener("click", ()=>alert("Оценить: добавь ссылку на магазин/страницу."));
$("#mPrivacy").addEventListener("click", ()=>alert("Политика: добавь ссылку на страницу."));
$("#mShare").addEventListener("click", async ()=>{
  const text = "Время молитв и Кибла (Web App)";
  try{
    if(navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); alert("Скопировано в буфер обмена"); }
  }catch{}
});

/* ------------------ API: fetch prayer timings ------------------ */
async function fetchTimings(){
  if(typeof state.geo.lat !== "number" || typeof state.geo.lon !== "number"){
    throw new Error("NO_GEO");
  }

  const methodId = METHOD_TO_ID[state.method] ?? 4;
  const url = `https://api.aladhan.com/v1/timings?latitude=${encodeURIComponent(state.geo.lat)}&longitude=${encodeURIComponent(state.geo.lon)}&method=${methodId}`;

  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error("API_FAIL");
  const json = await res.json();

  const t = json?.data?.timings;
  if(!t) throw new Error("BAD_DATA");

  // Keep only needed fields (strip timezone suffix if any)
  const timings = {
    Fajr: (t.Fajr||"").slice(0,5),
    Dhuhr: (t.Dhuhr||"").slice(0,5),
    Asr: (t.Asr||"").slice(0,5),
    Maghrib: (t.Maghrib||"").slice(0,5),
    Isha: (t.Isha||"").slice(0,5),
  };

  state.timings = timings;
  state.timingsDate = todayKey();

  // city hint
  const meta = json?.data?.meta;
  const tz = meta?.timezone || null;
  if(!state.geo.city){
    state.geo.city = tz ? tz.split("/").pop().replaceAll("_"," ") : "Текущее место";
  }

  saveState();
}

/* ------------------ Times + offsets ------------------ */
function getTimesWithOffsets(){
  // fallback (если API ещё не пришёл)
  const fallback = { Fajr:"06:33", Dhuhr:"12:27", Asr:"13:41", Maghrib:"15:54", Isha:"17:24" };
  const base = state.timings && state.timingsDate===todayKey() ? state.timings : fallback;

  return PRAYERS.map(p=>{
    const baseMin = toMinutes(base[p.key]);
    const off = state.offsets[p.key] ?? 0;
    const finalMin = baseMin + off;
    return { ...p, base: base[p.key], time: fromMinutes(finalMin), timeMin: finalMin, offset: off };
  });
}

/* ------------------ Render prayer list ------------------ */
function renderPrayerList(){
  const times = getTimesWithOffsets();
  const now = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();

  let next = times.find(x=>x.timeMin > nowMin);
  if(!next) next = times[0];

  prayerListEl.innerHTML = "";
  times.forEach(t=>{
    const active = t.key === next.key;
    const row = document.createElement("div");
    row.className = "prayer" + (active ? " active" : "");
    row.innerHTML = `
      <div class="left">
        <div class="dot"></div>
        <div class="names">
          <div class="en">${t.key}</div>
          <div class="ar">${t.ar}</div>
        </div>
      </div>
      <div class="right">
        <div class="time">${t.time}</div>
        <button class="iconbtn small gearmini" data-action="offset" data-prayer="${t.key}" aria-label="Настроить ${t.key}">
          <span class="ico ico-gear"></span>
        </button>
      </div>
    `;
    prayerListEl.appendChild(row);
  });

  nextNameEl.textContent = next.key;
}

/* ------------------ Countdown ------------------ */
function updateCountdown(){
  const times = getTimesWithOffsets();
  const now = new Date();
  const nowSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();
  const nowMin = Math.floor(nowSec/60);

  let next = times.find(t=>t.timeMin > nowMin);
  let targetMin = next ? next.timeMin : (times[0].timeMin + 24*60);
  let diffSec = targetMin*60 - nowSec;
  if(diffSec < 0) diffSec += 24*3600;

  const hh = Math.floor(diffSec/3600);
  const mm = Math.floor((diffSec%3600)/60);
  const ss = diffSec%60;
  countdownEl.textContent = `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
setInterval(updateCountdown, 1000);

/* ------------------ Method chips ------------------ */
function renderChips(){
  $$("#chips .chip").forEach(b=>{
    b.classList.toggle("active", b.dataset.method===state.method);
  });
}
$("#chips").addEventListener("click", async (e)=>{
  const btn = e.target.closest(".chip");
  if(!btn) return;
  state.method = btn.dataset.method;
  saveState();
  renderChips();

  // refresh timings for current geo
  try{
    await ensureTimingsFresh();
    renderAll();
    schedulePrayerNotifications();
  }catch{
    renderAll();
  }
});

/* ------------------ Geo ------------------ */
function setGeo(lat, lon, city=null){
  state.geo.lat = lat;
  state.geo.lon = lon;
  if(city) state.geo.city = city;
  saveState();
}

function getGeolocation(){
  return new Promise((resolve, reject)=>{
    if(!navigator.geolocation) return reject(new Error("NO_GEO_API"));
    navigator.geolocation.getCurrentPosition(
      (pos)=>resolve(pos),
      (err)=>reject(err),
      { enableHighAccuracy:true, timeout:15000, maximumAge:60000 }
    );
  });
}

$("#btnGeo").addEventListener("click", async ()=>{
  try{
    const pos = await getGeolocation();
    setGeo(pos.coords.latitude, pos.coords.longitude, state.geo.city || "Текущее место");
    await ensureTimingsFresh();
    renderAll();
    schedulePrayerNotifications();
    alert("Локация получена. Времена обновлены.");
  }catch{
    alert("Не удалось получить локацию. Проверь разрешения браузера.");
  }
});
$("#btnGeo2").addEventListener("click", ()=>$("#btnGeo").click());

$("#btnRefresh").addEventListener("click", async ()=>{
  try{
    await ensureTimingsFresh(true);
    renderAll();
    schedulePrayerNotifications();
    alert("Обновлено.");
  }catch{
    alert("Не удалось обновить. Сначала определи локацию.");
  }
});

async function ensureTimingsFresh(force=false){
  const fresh = state.timings && state.timingsDate===todayKey();
  if(!force && fresh) return;
  await fetchTimings();
}

/* ------------------ Offsets modal ------------------ */
let currentPrayerKey = null;

function openOffset(prayerKey){
  currentPrayerKey = prayerKey;
  const times = getTimesWithOffsets();
  const t = times.find(x=>x.key===prayerKey);
  $("#offName").textContent = prayerKey;
  $("#offVal").textContent = String(state.offsets[prayerKey] ?? 0);
  $("#offFinal").textContent = t?.time ?? "--:--";
  openModal("offsetModal");
}

prayerListEl.addEventListener("click",(e)=>{
  const b = e.target.closest("[data-action='offset']");
  if(!b) return;
  openOffset(b.dataset.prayer);
});

function bumpOffset(delta){
  if(!currentPrayerKey) return;
  const cur = state.offsets[currentPrayerKey] ?? 0;
  state.offsets[currentPrayerKey] = cur + delta;
  saveState();
  renderPrayerList();
  schedulePrayerNotifications();

  const times = getTimesWithOffsets();
  const t = times.find(x=>x.key===currentPrayerKey);
  $("#offVal").textContent = String(state.offsets[currentPrayerKey]);
  $("#offFinal").textContent = t?.time ?? "--:--";
}
$("#offMinus").addEventListener("click", ()=>bumpOffset(-5));
$("#offPlus").addEventListener("click", ()=>bumpOffset(+5));
$("#offReset").addEventListener("click", ()=>{
  if(!currentPrayerKey) return;
  state.offsets[currentPrayerKey] = 0;
  saveState();
  renderAll();
  schedulePrayerNotifications();
  openOffset(currentPrayerKey);
});

/* ------------------ Settings + pickers ------------------ */
function setPermLabel(){
  const p = Notification?.permission;
  const map = { granted:"Разрешено", denied:"Запрещено", default:"Не запрошено" };
  $("#sPermVal").textContent = map[p] || "Не поддерживается";
}
function renderSettings(){
  $("#sNotifVal").textContent = `За ${state.settings.notifBefore} мин`;
  $("#sModeVal").textContent = state.settings.notifMode;
  $("#sSoundVal").textContent = state.settings.notifSound;
  setPermLabel();
}

function openPicker(title, items, active, onPick){
  $("#pickerTitle").textContent = title;
  const list = $("#pickerList");
  list.innerHTML = "";
  items.forEach(it=>{
    const b = document.createElement("button");
    b.className = "pick" + (it.value===active ? " active" : "");
    b.textContent = it.label;
    b.addEventListener("click", ()=>{
      onPick(it.value);
      saveState();
      renderSettings();
      closeModal("pickerModal");
      schedulePrayerNotifications();
    });
    list.appendChild(b);
  });
  openModal("pickerModal");
}

$("#sNotif").addEventListener("click", ()=>{
  const opts = [0,5,10,15,20,30].map(v=>({ value:v, label: v===0 ? "Выключить" : `За ${v} мин` }));
  openPicker("Уведомления до молитвы", opts, state.settings.notifBefore, (v)=> state.settings.notifBefore = v);
});

$("#sMode").addEventListener("click", ()=>{
  const opts = ["Звук","Без звука","Вибрация"].map(v=>({ value:v, label:v }));
  openPicker("Режим уведомлений", opts, state.settings.notifMode, (v)=> state.settings.notifMode = v);
});

$("#sSound").addEventListener("click", ()=>{
  const opts = ["Alien","Classic","Soft","Azan"].map(v=>({ value:v, label:v }));
  openPicker("Звук уведомления", opts, state.settings.notifSound, (v)=> state.settings.notifSound = v);
});

$("#sPerm").addEventListener("click", async ()=>{
  try{
    if(!("Notification" in window)) return alert("Уведомления не поддерживаются этим браузером.");
    const perm = await Notification.requestPermission();
    setPermLabel();
    if(perm==="granted"){
      schedulePrayerNotifications();
      alert("Разрешение выдано. Уведомления будут приходить (когда страница открыта).");
    }else{
      alert("Разрешение не выдано.");
    }
  }catch{
    alert("Не удалось запросить разрешение.");
  }
});

/* ------------------ Notifications scheduling ------------------ */
/*
  Ограничение Web: setTimeout работает, пока вкладка/приложение активно.
  Для настоящих фоновых будильников нужен нативный APK.
*/
let notifTimers = [];

function clearNotifTimers(){
  notifTimers.forEach(id=>clearTimeout(id));
  notifTimers = [];
}

function canNotify(){
  return ("Notification" in window) && Notification.permission === "granted";
}

function showLocalNotification(title, body){
  // Prefer SW notification if available
  if(navigator.serviceWorker?.controller){
    navigator.serviceWorker.controller.postMessage({ type:"notify", title, body });
    return;
  }
  new Notification(title, { body });
}

function schedulePrayerNotifications(){
  clearNotifTimers();
  if(state.settings.notifBefore <= 0) return;
  if(!canNotify()) return;

  const now = new Date();
  const nowMs = now.getTime();
  const times = getTimesWithOffsets();

  // schedule for remaining prayers today (+ tomorrow's Fajr if needed)
  const today = new Date();
  for(const t of times){
    const [hh, mm] = t.time.split(":").map(Number);
    const fire = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hh, mm, 0, 0);
    const fireMs = fire.getTime() - state.settings.notifBefore*60*1000;

    if(fireMs > nowMs){
      const id = setTimeout(()=>{
        const body = `${t.key} через ${state.settings.notifBefore} мин (${t.time})`;
        showLocalNotification("Время молитвы", body);
        if(state.settings.notifMode === "Вибрация" && navigator.vibrate) navigator.vibrate([200,100,200]);
        // звук в вебе без жеста пользователя не гарантирован — не навязываем
      }, fireMs - nowMs);
      notifTimers.push(id);
    }
  }

  // reschedule at midnight
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()+1, 0,0,5);
  const idMid = setTimeout(async ()=>{
    try{
      await ensureTimingsFresh(true);
    }catch{}
    renderAll();
    schedulePrayerNotifications();
  }, midnight.getTime() - nowMs);
  notifTimers.push(idMid);
}

/* ------------------ Qibla compass ------------------ */
const KAABA = { lat: 21.4225, lon: 39.8262 };
function deg2rad(d){ return d*Math.PI/180; }
function rad2deg(r){ return r*180/Math.PI; }
function bearing(lat1, lon1, lat2, lon2){
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δλ = deg2rad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  const θ = Math.atan2(y,x);
  return (rad2deg(θ)+360)%360;
}

let qiblaBearing = null;
let deviceHeading = null;
let sensorsOn = false;

function updateQibla(){
  qCity.textContent = state.geo.city ? `📍 ${state.geo.city}` : "📍 —";

  if(typeof state.geo.lat === "number" && typeof state.geo.lon === "number"){
    qiblaBearing = bearing(state.geo.lat, state.geo.lon, KAABA.lat, KAABA.lon);
  }

  qBearingEl.textContent = qiblaBearing==null ? "—" : String(Math.round(qiblaBearing));
  qHeadingEl.textContent = deviceHeading==null ? "—" : String(Math.round(deviceHeading));

  const b = qiblaBearing ?? 0;
  const h = deviceHeading ?? 0;
  const rot = (b - h + 360) % 360;
  qArrow.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
}

headingSlider.addEventListener("input",(e)=>{
  if(sensorsOn) return;
  deviceHeading = Number(e.target.value);
  updateQibla();
});

async function enableSensors(){
  if(typeof DeviceOrientationEvent === "undefined"){
    qNote.textContent = "Датчики не поддерживаются. Используй ползунок.";
    sensorsOn = false;
    return;
  }

  // iOS permission
  try{
    if(typeof DeviceOrientationEvent.requestPermission === "function"){
      const r = await DeviceOrientationEvent.requestPermission();
      if(r !== "granted") throw new Error("denied");
    }
  }catch{
    qNote.textContent = "Нет доступа к датчикам. Используй ползунок.";
    sensorsOn = false;
    return;
  }

  sensorsOn = true;
  qNote.textContent = "Датчики включены. Если стрелка скачет — откалибруй компас телефона (восьмёркой).";
}

function handleOrientation(e){
  let heading = null;

  // iOS
  if(typeof e.webkitCompassHeading === "number"){
    heading = e.webkitCompassHeading;
  } else if(typeof e.alpha === "number"){
    // Android / generic: alpha -> convert
    heading = (360 - e.alpha) % 360;
  }

  if(heading == null) return;
  deviceHeading = heading;
  updateQibla();
}

$("#btnSensors").addEventListener("click", async ()=>{
  await enableSensors();
});

window.addEventListener("deviceorientationabsolute",(e)=>{
  if(!sensorsOn) return;
  handleOrientation(e);
}, true);

window.addEventListener("deviceorientation",(e)=>{
  if(!sensorsOn) return;
  handleOrientation(e);
}, true);

/* ------------------ Render all ------------------ */
function renderAll(){
  renderChips();
  renderPrayerList();
  renderSettings();
  updateQibla();
}

/* ------------------ Init ------------------ */
(function init(){
  // close on ESC
  window.addEventListener("keydown",(e)=>{
    if(e.key !== "Escape") return;
    ["menuModal","settingsModal","offsetModal","pickerModal"].forEach(closeModal);
  });

  // show modals by backdrop click
  $$(".backdrop").forEach(b=>b.addEventListener("click", ()=>closeModal(b.dataset.close)));

  // initial
  renderAll();
  setPermLabel();

  // try auto-refresh timings once if geo already exists
  (async ()=>{
    try{
      if(typeof state.geo.lat === "number" && typeof state.geo.lon === "number"){
        await ensureTimingsFresh(false);
        renderAll();
      }
    }catch{}
  })();

  // schedule notifications if allowed
  schedulePrayerNotifications();
})();
