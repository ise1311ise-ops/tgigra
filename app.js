const tg = window.Telegram.WebApp;
tg.ready();

const KAABA = { lat: 21.4225, lon: 39.8262 };

const screens = {
  start: document.getElementById("start"),
  compass: document.getElementById("compass"),
  map: document.getElementById("map"),
};

function show(name) {
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
}

document.getElementById("startBtn").onclick = () => {
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    const bearing = getBearing(lat, lon, KAABA.lat, KAABA.lon);
    updateCompass(bearing);

    show("compass");
  });
};

document.getElementById("mapBtn").onclick = () => {
  show("map");
};

function getBearing(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function updateCompass(deg) {
  document.getElementById("arrow").style.transform =
    `rotate(${deg}deg) translateX(-50%)`;

  document.getElementById("degree").innerText =
    Math.round(deg) + "°";
}
