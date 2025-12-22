/* Город Микро-Бизнеса (Tap & Build)
   - Тап → деньги
   - Бизнесы → пассивка
   - Энергия → восстановление
   - Ежедневки + стрик
   - Сохранение localStorage
   - Буст x2 на 30 сек
   - Базовая интеграция Telegram WebApp
*/

(() => {
  "use strict";

  // -----------------------------
  // Telegram WebApp integration
  // -----------------------------
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const tgStatusEl = document.getElementById("tgStatus");
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tgStatusEl.textContent = "Telegram Mini App";
      // Тема (по желанию)
      // tg.setHeaderColor?.("bg_color");
    } catch {
      tgStatusEl.textContent = "Telegram (ошибка init)";
    }
  } else {
    tgStatusEl.textContent = "Web (не Telegram)";
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function format(n) {
    // компактный формат: 1 234 / 1.2K / 3.4M
    if (n < 1000) return Math.floor(n).toString();
    if (n < 1_000_000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
    if (n < 1_000_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "") + "M";
    return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  }

  function now() { return Date.now(); }

  function showNotice(text, ms = 1500) {
    const el = $("notice");
    el.textContent = text;
    if (!text) return;
    window.clearTimeout(showNotice._t);
    showNotice._t = window.setTimeout(() => {
      el.textContent = "";
    }, ms);
  }

  // -----------------------------
  // Game content (businesses)
  // -----------------------------
  const BUSINESSES = [
    { id: "coffee", name: "Кофейня", icon: "☕", rarity: "common", baseCost: 50, basePps: 0.25 },
    { id: "bakery", name: "Пекарня", icon: "🥐", rarity: "common", baseCost: 120, basePps: 0.6 },
    { id: "flowers", name: "Цветочный", icon: "💐", rarity: "common", baseCost: 220, basePps: 1.2 },
    { id: "repair", name: "Ремонт телефонов", icon: "📱", rarity: "common", baseCost: 420, basePps: 2.2 },

    { id: "foodtruck", name: "Фудтрак", icon: "🚚", rarity: "rare", baseCost: 900, basePps: 5.5 },
    { id: "gym", name: "Зал", icon: "🏋️", rarity: "rare", baseCost: 1600, basePps: 9.5 },
    { id: "delivery", name: "Доставка", icon: "🛵", rarity: "rare", baseCost: 2600, basePps: 14.0 },

    { id: "mall", name: "Мини-ТЦ", icon: "🏬", rarity: "legendary", baseCost: 6000, basePps: 38.0 },
    { id: "hotel", name: "Отель", icon: "🏨", rarity: "legendary", baseCost: 9800, basePps: 62.0 },
  ];

  const RARITY_LABEL = {
    common: "Обычный",
    rare: "Редкий",
    legendary: "Легендарный",
  };

  // Стоимость апгрейда (уровни): cost = baseCost * (1.15 ^ level)
  const COST_GROWTH = 1.15;
  // Рост pps: pps = basePps * (1.12 ^ level)
  const PPS_GROWTH = 1.12;

  // -----------------------------
  // State
  // -----------------------------
  const STORAGE_KEY = "microcity_save_v1";

  const defaultState = () => ({
    version: 1,
    money: 0,
    earnedTotal: 0,
    tapsTotal: 0,

    tapValue: 1,           // сколько даёт один тап (до буста)
    energy: 40,
    energyMax: 40,
    energyRegenSec: 6,     // +1 энергия каждые N секунд
    lastEnergyTick: now(),

    lastActive: now(),     // для оффлайн-пассивки
    boostUntil: 0,         // таймер буста

    businesses: Object.fromEntries(BUSINESSES.map(b => [b.id, { level: 0 }])),
    district: 1,

    // ежедневки
    streak: 0,
    lastDailyDate: "", // YYYY-MM-DD
    daily: {
      didTap: false,
      didBuy: false,
      didCollect: false,
    },

    // сезон (простая метка)
    season: 1,
    seasonStart: now(),
  });

  let state = loadState();

  // -----------------------------
  // Save/Load
  // -----------------------------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);

      // Мягкий merge с дефолтом на случай новых полей
      const base = defaultState();
      const merged = {
        ...base,
        ...parsed,
        daily: { ...base.daily, ...(parsed.daily || {}) },
        businesses: { ...base.businesses, ...(parsed.businesses || {}) },
      };

      // Важно: наличие всех бизнесов
      for (const b of BUSINESSES) {
        if (!merged.businesses[b.id]) merged.businesses[b.id] = { level: 0 };
        if (typeof merged.businesses[b.id].level !== "number") merged.businesses[b.id].level = 0;
      }

      return merged;
    } catch {
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // игнор
    }
  }

  // -----------------------------
  // Economy calculations
  // -----------------------------
  function businessCost(bizId) {
    const b = BUSINESSES.find(x => x.id === bizId);
    const lvl = state.businesses[bizId].level;
    return Math.floor(b.baseCost * Math.pow(COST_GROWTH, lvl));
  }

  function businessPps(bizId) {
    const b = BUSINESSES.find(x => x.id === bizId);
    const lvl = state.businesses[bizId].level;
    // pps на 0 уровне = 0 (бизнес не куплен). На 1 уровне = basePps
    if (lvl <= 0) return 0;
    return b.basePps * Math.pow(PPS_GROWTH, (lvl - 1));
  }

  function totalPps() {
    let sum = 0;
    for (const b of BUSINESSES) sum += businessPps(b.id);
    // бонус района (простая мета): +5% pps за каждый район после 1
    const districtBonus = 1 + (state.district - 1) * 0.05;
    return sum * districtBonus;
  }

  function ownedCount() {
    let c = 0;
    for (const b of BUSINESSES) if (state.businesses[b.id].level > 0) c++;
    return c;
  }

  // -----------------------------
  // Offline progress
  // -----------------------------
  function applyOfflineEarnings() {
    const t = now();
    const dtMs = Math.max(0, t - (state.lastActive || t));
    const dtSec = dtMs / 1000;
    const pps = totalPps();
    const gained = pps * dtSec;

    if (gained >= 1) {
      state.money += gained;
      state.earnedTotal += gained;
      showNotice(`Оффлайн доход: +${format(gained)} 💸`, 2200);
    }

    // Энергия оффлайн (восстановление)
    // Сколько тиков энергии прошло:
    const tickMs = (state.energyRegenSec || 6) * 1000;
    const lastTick = state.lastEnergyTick || t;
    const ticks = Math.floor((t - lastTick) / tickMs);
    if (ticks > 0) {
      state.energy = clamp(state.energy + ticks, 0, state.energyMax);
      state.lastEnergyTick = lastTick + ticks * tickMs;
    }

    state.lastActive = t;
    saveState();
  }

  // -----------------------------
  // Daily reset / streak
  // -----------------------------
  function dateKey(ts = now()) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function ensureDaily() {
    const today = dateKey();
    if (!state.lastDailyDate) {
      state.lastDailyDate = today;
      return;
    }
    if (state.lastDailyDate === today) return;

    // Проверим, был ли пропуск дня (упрощенно: если не вчера → стрик сброс)
    const last = new Date(state.lastDailyDate + "T00:00:00");
    const cur = new Date(today + "T00:00:00");
    const diffDays = Math.round((cur - last) / (24 * 3600 * 1000));

    if (diffDays === 1) state.streak += 1;
    else state.streak = 0;

    state.lastDailyDate = today;
    state.daily = { didTap: false, didBuy: false, didCollect: false };
    saveState();
  }

  // -----------------------------
  // UI Rendering
  // -----------------------------
  const moneyEl = $("money");
  const ppsEl = $("pps");
  const energyEl = $("energy");
  const energyMaxEl = $("energyMax");
  const energyFillEl = $("energyFill");
  const seasonLineEl = $("seasonLine");
  const streakLineEl = $("streakLine");

  const gridEl = $("businessGrid");
  const dailyListEl = $("dailyList");

  let filter = "all";

  function renderTop() {
    moneyEl.textContent = format(state.money);
    ppsEl.textContent = format(totalPps());
    energyEl.textContent = Math.floor(state.energy);
    energyMaxEl.textContent = state.energyMax;

    const pct = state.energyMax > 0 ? (state.energy / state.energyMax) * 100 : 0;
    energyFillEl.style.width = `${clamp(pct, 0, 100)}%`;

    // сезон/день (очень упрощенно: день = сколько суток прошло от seasonStart)
    const days = Math.floor((now() - state.seasonStart) / (24 * 3600 * 1000)) + 1;
    seasonLineEl.textContent = `Сезон: ${state.season} • День: ${days}`;

    streakLineEl.textContent = `Стрик: ${state.streak}`;
  }

  function renderBusinesses() {
    gridEl.innerHTML = "";
    const list = BUSINESSES.filter(b => filter === "all" ? true : b.rarity === filter);

    for (const b of list) {
      const lvl = state.businesses[b.id].level;
      const cost = businessCost(b.id);
      const pps = businessPps(b.id);

      const wrap = document.createElement("div");
      wrap.className = "biz";

      const icon = document.createElement("div");
      icon.className = "bizIcon";
      icon.textContent = b.icon;

      const mid = document.createElement("div");

      const name = document.createElement("div");
      name.className = "bizName";
      name.textContent = b.name;

      const meta = document.createElement("div");
      meta.className = "bizMeta";

      const badge = document.createElement("span");
      badge.className = `badge ${b.rarity}`;
      badge.textContent = RARITY_LABEL[b.rarity];

      const badge2 = document.createElement("span");
      badge2.className = "badge common";
      badge2.textContent = lvl > 0 ? `Доход: ${format(pps)}/с` : `Доход: +${format(b.basePps)}/с`;

      meta.appendChild(badge);
      meta.appendChild(badge2);

      mid.appendChild(name);
      mid.appendChild(meta);

      const right = document.createElement("div");
      right.className = "bizRight";

      const lvlEl = document.createElement("div");
      lvlEl.className = "bizLvl";
      lvlEl.textContent = `Уровень: ${lvl}`;

      const btn = document.createElement("button");
      btn.className = "bizBtn";
      btn.textContent = lvl === 0 ? `Купить за ${format(cost)}` : `Апгрейд за ${format(cost)}`;
      btn.disabled = state.money < cost;

      btn.addEventListener("click", () => openBusinessModal(b.id));

      right.appendChild(lvlEl);
      right.appendChild(btn);

      wrap.appendChild(icon);
      wrap.appendChild(mid);
      wrap.appendChild(right);

      gridEl.appendChild(wrap);
    }
  }

  function renderDaily() {
    const quests = [
      {
        key: "didTap",
        title: "Сделай 50 тапов",
        desc: "Заработай активом и прокачай темп.",
        done: state.daily.didTap,
        reward: 120,
        action: () => showNotice("Тапай — прогресс засчитывается автоматически 🙂"),
      },
      {
        key: "didBuy",
        title: "Купи или улучшай бизнес",
        desc: "Сделай одну покупку/апгрейд.",
        done: state.daily.didBuy,
        reward: 180,
        action: () => showNotice("Открой вкладку бизнесов и купи/улучши 🏗️"),
      },
      {
        key: "didCollect",
        title: "Собери пассивку 1 раз",
        desc: "Нажми «Собрать пассивку».",
        done: state.daily.didCollect,
        reward: 90,
        action: () => showNotice("Нажми «Собрать пассивку» 💸"),
      },
    ];

    dailyListEl.innerHTML = "";
    for (const q of quests) {
      const row = document.createElement("div");
      row.className = "quest";

      const left = document.createElement("div");
      left.className = "questLeft";

      const t = document.createElement("div");
      t.className = "questTitle";
      t.textContent = q.title;

      const d = document.createElement("div");
      d.className = "questDesc";
      d.textContent = `${q.desc} • Награда: +${format(q.reward)}💰`;

      left.appendChild(t);
      left.appendChild(d);

      const btn = document.createElement("button");
      btn.className = "btn questBtn";
      btn.textContent = q.done ? "Получено" : "К заданию";
      btn.disabled = q.done;
      btn.addEventListener("click", q.action);

      row.appendChild(left);
      row.appendChild(btn);

      dailyListEl.appendChild(row);
    }
  }

  // -----------------------------
  // Tabs (bottom bar)
  // -----------------------------
  const panelStats = $("panel-stats");
  const panelSettings = $("panel-settings");

  function setTab(tab) {
    // Panels
    panelStats.classList.toggle("hidden", tab !== "stats");
    panelSettings.classList.toggle("hidden", tab !== "settings");

    // Main layout hidden when in panel?
    const layout = document.querySelector(".layout");
    const showMain = tab === "home";
    layout.querySelectorAll(".card").forEach(card => card.classList.toggle("hidden", !showMain));
    // Keep bottom bar always visible

    document.querySelectorAll(".navBtn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    if (tab === "stats") renderStatsPanel();
  }

  document.querySelectorAll(".navBtn").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // -----------------------------
  // Modal helpers
  // -----------------------------
  const backdrop = $("modalBackdrop");
  const modalTitle = $("modalTitle");
  const modalBody = $("modalBody");
  const modalFooter = $("modalFooter");

  function openModal(title, bodyHtml, footerButtons = []) {
    modalTitle.textContent = title;
    modalBody.innerHTML = bodyHtml;
    modalFooter.innerHTML = "";

    for (const b of footerButtons) {
      const btn = document.createElement("button");
      btn.className = b.className || "btn";
      btn.textContent = b.text;
      btn.addEventListener("click", b.onClick);
      modalFooter.appendChild(btn);
    }

    backdrop.classList.remove("hidden");
  }

  function closeModal() {
    backdrop.classList.add("hidden");
  }

  $("modalClose").addEventListener("click", closeModal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal();
  });

  // -----------------------------
  // Business modal
  // -----------------------------
  function openBusinessModal(bizId) {
    const b = BUSINESSES.find(x => x.id === bizId);
    const lvl = state.businesses[bizId].level;
    const cost = businessCost(bizId);

    const currentPps = businessPps(bizId);
    const nextPps = (() => {
      const tmpLvl = lvl + 1;
      if (tmpLvl <= 0) return 0;
      // на следующем уровне доход считается как basePps * (PPS_GROWTH^(tmpLvl-1))
      return b.basePps * Math.pow(PPS_GROWTH, (tmpLvl - 1));
    })();

    const canBuy = state.money >= cost;

    const body = `
      <div style="display:flex; gap:12px; align-items:center; margin-bottom:10px;">
        <div style="font-size:32px;">${b.icon}</div>
        <div>
          <div style="font-weight:950; font-size:16px;">${b.name}</div>
          <div class="small">Редкость: ${RARITY_LABEL[b.rarity]}</div>
        </div>
      </div>

      <div style="display:grid; gap:8px;">
        <div class="small">Текущий уровень: <b>${lvl}</b></div>
        <div class="small">Текущий доход: <b>${format(currentPps)}</b> / сек</div>
        <div class="small">Следующий доход: <b>${format(nextPps)}</b> / сек</div>
        <div class="small">Цена ${lvl === 0 ? "покупки" : "апгрейда"}: <b>${format(cost)}</b> 💰</div>
      </div>
    `;

    openModal(
      lvl === 0 ? "Купить бизнес" : "Улучшить бизнес",
      body,
      [
        { text: "Закрыть", className: "btn ghost", onClick: closeModal },
        {
          text: canBuy ? (lvl === 0 ? "Купить" : "Апгрейд") : "Не хватает 💰",
          className: canBuy ? "btn" : "btn ghost",
          onClick: () => {
            if (!canBuy) return;
            buyOrUpgradeBusiness(bizId);
            closeModal();
          }
        }
      ]
    );
  }

  function buyOrUpgradeBusiness(bizId) {
    const cost = businessCost(bizId);
    if (state.money < cost) return;

    state.money -= cost;
    state.businesses[bizId].level += 1;

    state.daily.didBuy = true;

    // Мета: апгрейд может увеличивать max энергии чуть-чуть
    // Каждые 5 покупок/апов +1 max энергии (простая “приятная” прогрессия)
    const totalLevels = BUSINESSES.reduce((s, b) => s + (state.businesses[b.id].level || 0), 0);
    const bonusMax = Math.floor(totalLevels / 5);
    const baseMax = 40;
    state.energyMax = baseMax + bonusMax;
    state.energy = clamp(state.energy, 0, state.energyMax);

    saveState();
    renderAll();
    checkDistrictProgress();

    showNotice("✅ Успешно!");
  }

  // -----------------------------
  // Tap + energy + boost
  // -----------------------------
  const tapBtn = $("tapBtn");
  tapBtn.addEventListener("click", () => {
    tickEnergy(); // чтобы энергия была актуальна
    if (state.energy < 1) {
      showNotice("Нет энергии 😴");
      if (tg) tg.HapticFeedback?.notificationOccurred?.("error");
      return;
    }

    state.energy -= 1;

    const isBoost = now() < state.boostUntil;
    const value = state.tapValue * (isBoost ? 2 : 1);

    state.money += value;
    state.earnedTotal += value;
    state.tapsTotal += 1;

    // Ежедневка: 50 тапов
    if (!state.daily.didTap && state.tapsTotal % 50 === 0) {
      state.daily.didTap = true;
      state.money += 120;
      state.earnedTotal += 120;
      showNotice("🎁 Ежедневка выполнена: +120 💰");
    }

    if (tg) tg.HapticFeedback?.impactOccurred?.("light");

    saveState();
    renderTop();
    renderBusinesses();
    renderStatsPanel();
  });

  $("collectBtn").addEventListener("click", () => {
    // Собрать пассивку за последние 30 секунд как “ручной сбор” (чтобы был смысл нажимать)
    const pps = totalPps();
    const amount = pps * 30;
    if (amount < 1) {
      showNotice("Пока нечего собирать — купи бизнес 🙂");
      return;
    }
    state.money += amount;
    state.earnedTotal += amount;

    if (!state.daily.didCollect) {
      state.daily.didCollect = true;
      state.money += 90;
      state.earnedTotal += 90;
      showNotice(`💸 Собрано: +${format(amount)} и бонус +90`);
    } else {
      showNotice(`💸 Собрано: +${format(amount)}`);
    }

    saveState();
    renderAll();
  });

  $("boostBtn").addEventListener("click", () => {
    // MVP: буст бесплатно раз в 90 секунд (чтобы имитировать rewarded-рекламу)
    const cd = 90_000;
    const key = "microcity_last_boost";
    const last = Number(localStorage.getItem(key) || "0");
    const t = now();
    if (t - last < cd) {
      const left = Math.ceil((cd - (t - last)) / 1000);
      showNotice(`Буст будет доступен через ${left} сек`);
      return;
    }

    localStorage.setItem(key, String(t));
    state.boostUntil = t + 30_000;
    saveState();

    showNotice("⚡ Буст активирован: x2 на 30 сек!");
    if (tg) tg.HapticFeedback?.notificationOccurred?.("success");
  });

  // -----------------------------
  // Energy tick
  // -----------------------------
  function tickEnergy() {
    const t = now();
    const tickMs = (state.energyRegenSec || 6) * 1000;
    const last = state.lastEnergyTick || t;

    if (t < last) {
      state.lastEnergyTick = t;
      return;
    }

    const ticks = Math.floor((t - last) / tickMs);
    if (ticks <= 0) return;

    state.energy = clamp(state.energy + ticks, 0, state.energyMax);
    state.lastEnergyTick = last + ticks * tickMs;
  }

  // -----------------------------
  // District progression
  // -----------------------------
  function districtGoal(d) {
    // Требование: в 1 районе 3 бизнеса, во 2 — 5, в 3 — 7, потом +2
    return 3 + (d - 1) * 2;
  }

  function checkDistrictProgress() {
    const owned = ownedCount();
    const goal = districtGoal(state.district);
    if (owned >= goal) {
      state.district += 1;
      // награда за новый район
      const reward = 250 * state.district;
      state.money += reward;
      state.earnedTotal += reward;
      saveState();
      renderAll();
      showNotice(`🏁 Новый район открыт! Район ${state.district} • Бонус +${format(reward)} 💰`, 2400);
    }
  }

  $("districtBtn").addEventListener("click", () => {
    const owned = ownedCount();
    const goal = districtGoal(state.district);
    if (owned >= goal) {
      checkDistrictProgress();
    } else {
      showNotice(`Нужно бизнесов: ${owned}/${goal}`);
    }
    renderStatsPanel();
  });

  function renderStatsPanel() {
    $("statTaps").textContent = format(state.tapsTotal);
    $("statEarned").textContent = format(state.earnedTotal);
    $("statOwned").textContent = String(ownedCount());
    $("statDistrict").textContent = String(state.district);

    const goal = districtGoal(state.district);
    const owned = ownedCount();
    $("districtTitle").textContent = `Район ${state.district}`;
    $("districtHint").textContent = `Открой ${goal} бизнесов, чтобы перейти дальше. Сейчас: ${owned}/${goal}`;
  }

  // -----------------------------
  // Filters
  // -----------------------------
  document.querySelectorAll(".pill").forEach(p => {
    p.addEventListener("click", () => {
      document.querySelectorAll(".pill").forEach(x => x.classList.remove("active"));
      p.classList.add("active");
      filter = p.dataset.filter;
      renderBusinesses();
    });
  });

  // -----------------------------
  // Settings: export/import/reset
  // -----------------------------
  $("exportBtn").addEventListener("click", () => {
    const json = JSON.stringify(state, null, 2);
    openModal(
      "Экспорт сохранения",
      `<textarea style="width:100%;height:220px;border-radius:16px;padding:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.92);font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(json)}</textarea>
       <div class="small" style="margin-top:8px;">Скопируй текст и сохрани.</div>`,
      [
        { text: "Закрыть", className: "btn", onClick: closeModal }
      ]
    );
  });

  $("importBtn").addEventListener("click", () => {
    openModal(
      "Импорт сохранения",
      `<textarea id="importArea" placeholder="Вставь сюда JSON..." style="width:100%;height:220px;border-radius:16px;padding:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.92);font-family:ui-monospace, SFMono-Regular, Menlo, monospace;"></textarea>
       <div class="small" style="margin-top:8px;">Внимание: текущий прогресс будет перезаписан.</div>`,
      [
        { text: "Отмена", className: "btn ghost", onClick: closeModal },
        {
          text: "Импорт",
          className: "btn",
          onClick: () => {
            const area = document.getElementById("importArea");
            const txt = (area.value || "").trim();
            if (!txt) return;
            try {
              const parsed = JSON.parse(txt);
              // простая проверка
              if (typeof parsed !== "object" || parsed === null) throw new Error("bad");
              state = {
                ...defaultState(),
                ...parsed,
                daily: { ...defaultState().daily, ...(parsed.daily || {}) },
                businesses: { ...defaultState().businesses, ...(parsed.businesses || {}) },
              };
              saveState();
              closeModal();
              renderAll();
              showNotice("✅ Импорт выполнен");
            } catch {
              showNotice("Ошибка импорта: неверный JSON");
            }
          }
        }
      ]
    );
  });

  $("resetBtn").addEventListener("click", () => {
    openModal(
      "Сброс прогресса",
      `<div>Точно сбросить всё? Это удалит сохранение на этом устройстве.</div>`,
      [
        { text: "Отмена", className: "btn ghost", onClick: closeModal },
        {
          text: "Сброс",
          className: "btn danger",
          onClick: () => {
            localStorage.removeItem(STORAGE_KEY);
            state = defaultState();
            saveState();
            closeModal();
            renderAll();
            showNotice("Сброшено.");
          }
        }
      ]
    );
  });

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  // -----------------------------
  // Main loop timers
  // -----------------------------
  function renderAll() {
    ensureDaily();
    renderTop();
    renderDaily();
    renderBusinesses();
    renderStatsPanel();
  }

  // Пассивный доход начисляем “в фоне” раз в секунду
  setInterval(() => {
    tickEnergy();

    const pps = totalPps();
    if (pps > 0) {
      state.money += pps;
      state.earnedTotal += pps;
    }

    // Автовыполнение ежедневки “купил/собрал” делается в соответствующих местах.
    // Тут просто обновим UI.
    state.lastActive = now();
    saveState();
    renderTop();
    renderBusinesses();
  }, 1000);

  // Ещё один UI-таймер, чтобы подсказки/проверки были плавнее
  setInterval(() => {
    ensureDaily();
    renderDaily();
  }, 3000);

  // -----------------------------
  // Init
  // -----------------------------
  applyOfflineEarnings();
  renderAll();
  setTab("home");

})();