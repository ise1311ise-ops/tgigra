const prayersData = [
  { name: "Fajr", ar: "الفجر", time: "06:33" },
  { name: "Dhuhr", ar: "الظهر", time: "12:27" },
  { name: "Asr", ar: "العصر", time: "13:41" },
  { name: "Maghrib", ar: "المغرب", time: "15:54" },
  { name: "Isha", ar: "العشاء", time: "17:24" }
];

const prayersEl = document.getElementById("prayers");
const countdownEl = document.getElementById("countdown");
const nextNameEl = document.getElementById("nextName");

/* ---------- PRAYERS RENDER ---------- */
function renderPrayers() {
  prayersEl.innerHTML = "";
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let nextIndex = prayersData.findIndex(p => {
    const [h,m] = p.time.split(":").map(Number);
    return h*60 + m > nowMin;
  });
  if (nextIndex === -1) nextIndex = 0;

  prayersData.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "prayer" + (i === nextIndex ? " active" : "");
    div.innerHTML = `
      <div class="dot"></div>
      <div class="names">
        <div class="en">${p.name}</div>
        <div class="ar">${p.ar}</div>
      </div>
      <div class="time">${p.time}</div>
    `;
    prayersEl.appendChild(div);
  });

  nextNameEl.textContent = prayersData[nextIndex].name;
}

/* ---------- COUNTDOWN ---------- */
function updateCountdown() {
  const now = new Date();
  const nowSec = now.getHours()*3600 + now.getMinutes()*60 + now.getSeconds();

  let target;
  for (const p of prayersData) {
    const [h,m] = p.time.split(":").map(Number);
    const sec = h*3600 + m*60;
    if (sec > nowSec) {
      target = sec;
      break;
    }
  }
  if (!target) {
    const [h,m] = prayersData[0].time.split(":").map(Number);
    target = h*3600 + m*60 + 86400;
  }

  let diff = target - nowSec;
  const h = Math.floor(diff/3600);
  const m = Math.floor((diff%3600)/60);
  const s = diff%60;

  countdownEl.textContent =
    `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

setInterval(updateCountdown, 1000);

/* ---------- QIBLA ROTATION ---------- */
const arrow = document.getElementById("arrow");
let angle = 0;

setInterval(() => {
  angle += 0.15; // имитация датчика
  arrow.style.transform = `rotate(${angle}deg)`;
}, 30);

/* ---------- TABS ---------- */
const tabPrayers = document.getElementById("tabPrayers");
const tabQibla = document.getElementById("tabQibla");
const screenPrayers = document.getElementById("screenPrayers");
const screenQibla = document.getElementById("screenQibla");
const title = document.getElementById("title");

tabPrayers.onclick = () => {
  tabPrayers.classList.add("active");
  tabQibla.classList.remove("active");
  screenPrayers.classList.add("active");
  screenQibla.classList.remove("active");
  title.textContent = "Время молитв";
};

tabQibla.onclick = () => {
  tabQibla.classList.add("active");
  tabPrayers.classList.remove("active");
  screenQibla.classList.add("active");
  screenPrayers.classList.remove("active");
  title.textContent = "Кибла";
};

/* ---------- INIT ---------- */
renderPrayers();
updateCountdown();
