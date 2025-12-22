/*  Сад Мутаций — простой кликер/коллекционка
    - Тапы: дают энергию + немного пыльцы
    - Грядки: посадка семени -> рост во времени -> сбор (пыльца + семена)
    - Скрещивание: выбираешь 2 растения из коллекции -> получаешь семя с шансом мутации
    - Дейлик: задание дня (генерится по дате)
    - Сохранение: localStorage
*/

const KEY = "mutation_garden_v1";

const GENES = {
  color: ["Лайм", "Сапфир", "Аметист", "Янтарь", "Рубин", "Мята"],
  shape: ["Шипастая", "Лепестковая", "Кристальная", "Пушистая", "Капельная", "Спиральная"],
  aroma: ["Мёд", "Ментол", "Какао", "Озон", "Смола", "Цитрус"],
};

const RARITY = [
  { key: "Обычное", w: 60, emoji: "🌿" },
  { key: "Редкое", w: 28, emoji: "🌸" },
  { key: "Эпик", w: 10, emoji: "🌺" },
  { key: "Легендарное", w: 2, emoji: "🌷" },
];

const STAGES = [
  { key: "Семя", t: 0 },
  { key: "Росток", t: 10 },
  { key: "Молодое", t: 35 },
  { key: "Созрело", t: 70 },
];

const PLOTS = 6;

// ===== Utils =====
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const now = () => Date.now();

function rngInt(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rngInt(arr.length)]; }

function weightedPick(items, weightKey = "w") {
  const sum = items.reduce((s, it) => s + it[weightKey], 0);
  let r = Math.random() * sum;
  for (const it of items) {
    r -= it[weightKey];
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function hashStr(str) {
  // простенький детерминированный хеш для дейлика
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function formatPlant(p) {
  return `${p.emoji} ${p.rarity} • ${p.color}/${p.shape}/${p.aroma}`;
}

function plantIdFromGenes(g) {
  return `${g.rarity}|${g.color}|${g.shape}|${g.aroma}`;
}

// ===== Game State =====
function defaultState() {
  const seed = makeSeed(null, null, { forceBasic: true });

  return {
    version: 1,
    createdAt: now(),
    lastTick: now(),

    pollen: 0,
    energy: 0,
    energyMax: 40,

    selectedSeedKey: seed.key,

    seeds: {
      [seed.key]: { ...seed, count: 3 },
    },

    plots: Array.from({ length: PLOTS }, () => ({
      plantedAt: null,
      seedKey: null,
      plant: null,  // если уже выросло
      boosted: 0,   // сколько раз ускоряли
    })),

    collection: {
      // plantId: { plant, countHarvested }
    },

    log: [],

    daily: makeDaily(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!s || s.version !== 1) return defaultState();
    // миграции если надо — здесь
    return s;
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(KEY, JSON.stringify(state));
  toast("Сохранено 💾");
}

function hardReset() {
  localStorage.removeItem(KEY);
  state = defaultState();
  renderAll();
  toast("Сброшено ↺");
}

// ===== Daily Quest / Mutation of the day =====
function makeDaily() {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC, но для простоты ок)
  const h = hashStr(iso);

  const targets = [
    { type: "tap", goal: 80, text: "Сделай 80 поливов (тапов)" },
    { type: "plant", goal: 6, text: "Посади 6 семян" },
    { type: "harvest", goal: 4, text: "Собери урожай 4 раза" },
    { type: "breed", goal: 2, text: "Скрести растения 2 раза" },
    { type: "discover", goal: 2, text: "Открой 2 новых комбинации в коллекции" },
  ];
  const t = targets[h % targets.length];

  const rewardPollen = 80 + (h % 120);
  const rewardSeeds = 1 + (h % 2);

  // “Мутация дня” — один ген повышает шанс мутации
  const geneKind = ["color", "shape", "aroma"][ (h >>> 3) % 3 ];
  const geneVal = pick(GENES[geneKind]);

  return {
    iso,
    quest: { ...t, progress: 0, claimed: false },
    reward: { pollen: rewardPollen, seeds: rewardSeeds },
    mutationOfDay: { kind: geneKind, value: geneVal },
  };
}

function ensureDailyFresh() {
  const iso = new Date().toISOString().slice(0,10);
  if (!state.daily || state.daily.iso !== iso) {
    state.daily = makeDaily();
    log(`Новый день: мутация дня — ${state.daily.mutationOfDay.kind} = ${state.daily.mutationOfDay.value}`);
  }
}

// ===== Seeds / Plants =====
function makeSeed(parentA, parentB, opts = {}) {
  // seed.key — уникальный ключ семени (может повторяться как тип)
  // seed.genes — будущая генетика растения
  const baseGenes = () => ({
    color: pick(GENES.color),
    shape: pick(GENES.shape),
    aroma: pick(GENES.aroma),
    rarity: weightedPick(RARITY).key,
  });

  let genes;

  if (opts.forceBasic) {
    genes = { color: "Лайм", shape: "Лепестковая", aroma: "Мёд", rarity: "Обычное" };
  } else if (parentA && parentB) {
    genes = breedGenes(parentA, parentB);
  } else {
    genes = baseGenes();
  }

  const id = plantIdFromGenes(genes);
  return {
    key: `seed:${id}`,
    genes,
    name: `Семя: ${genes.color} / ${genes.shape} / ${genes.aroma}`,
  };
}

function rarityToEmoji(r) {
  return (RARITY.find(x => x.key === r) || RARITY[0]).emoji;
}

function growPlantFromSeed(seed) {
  const g = seed.genes;
  return {
    color: g.color,
    shape: g.shape,
    aroma: g.aroma,
    rarity: g.rarity,
    emoji: rarityToEmoji(g.rarity),
  };
}

function mutationChance(genes) {
  // базовый шанс мутации: зависит от редкости
  const base =
    genes.rarity === "Легендарное" ? 0.14 :
    genes.rarity === "Эпик" ? 0.11 :
    genes.rarity === "Редкое" ? 0.08 : 0.05;

  // усиление от мутации дня, если совпал один из генов
  const { kind, value } = state.daily.mutationOfDay;
  const bonus = (genes[kind] === value) ? 0.06 : 0.0;

  return clamp(base + bonus, 0, 0.25);
}

function maybeMutate(genes) {
  const p = mutationChance(genes);
  if (Math.random() > p) return genes;

  // мутируем один случайный ген (color/shape/aroma) или редкость
  const roll = Math.random();
  const g = { ...genes };

  if (roll < 0.75) {
    const kind = pick(["color", "shape", "aroma"]);
    g[kind] = pick(GENES[kind]);
    log(`Мутация! ${kind} → ${g[kind]}`);
  } else {
    // шанс апнуть редкость
    const order = ["Обычное", "Редкое", "Эпик", "Легендарное"];
    const idx = order.indexOf(g.rarity);
    if (idx >= 0 && idx < order.length - 1) {
      g.rarity = order[idx + 1];
      log(`Мутация! Редкость ↑ → ${g.rarity}`);
    }
  }
  return g;
}

function breedGenes(parentA, parentB) {
  // берём каждый ген от одного из родителей, потом возможная мутация
  const genes = {
    color: Math.random() < 0.5 ? parentA.color : parentB.color,
    shape: Math.random() < 0.5 ? parentA.shape : parentB.shape,
    aroma: Math.random() < 0.5 ? parentA.aroma : parentB.aroma,
    rarity: betterRarity(parentA.rarity, parentB.rarity),
  };

  return maybeMutate(genes);
}

function betterRarity(a, b) {
  const order = ["Обычное", "Редкое", "Эпик", "Легендарное"];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  const best = order[Math.max(ia, ib)] || "Обычное";
  // маленький шанс “скатиться” чтобы было не всегда строго вверх
  if (Math.random() < 0.08) return order[Math.min(ia, ib)] || best;
  return best;
}

// ===== Economy =====
function tap() {
  ensureDailyFresh();

  // энергия + пыльца по мелочи
  const eGain = 1;
  const pGain = (Math.random() < 0.22) ? 1 : 0;

  state.energy = clamp(state.energy + eGain, 0, state.energyMax);
  state.pollen += pGain;

  bumpQuest("tap", 1);
  renderTop();
}

function seedCount(seedKey) {
  return state.seeds[seedKey]?.count || 0;
}

function spendEnergy(x) {
  if (state.energy < x) return false;
  state.energy -= x;
  return true;
}
function spendPollen(x) {
  if (state.pollen < x) return false;
  state.pollen -= x;
  return true;
}

function plantOnPlot(i) {
  ensureDailyFresh();

  const plot = state.plots[i];
  if (plot.plantedAt) return;

  const sk = state.selectedSeedKey;
  if (!sk || seedCount(sk) <= 0) {
    toast("Нет выбранных семян 😿");
    return;
  }

  const costE = 8;
  if (!spendEnergy(costE)) {
    toast("Не хватает энергии ⚡");
    return;
  }

  state.seeds[sk].count -= 1;
  plot.plantedAt = now();
  plot.seedKey = sk;
  plot.plant = null;
  plot.boosted = 0;

  bumpQuest("plant", 1);
  log(`Посадка: ${state.seeds[sk].name} (-${costE}⚡)`);
  renderAll();
}

function plotStage(plot) {
  if (!plot.plantedAt) return { stage: "Пусто", pct: 0 };
  const elapsed = (now() - plot.plantedAt) / 1000;

  // ускорение: каждое ускорение даёт -8 секунд к "таймеру"
  const effective = Math.max(0, elapsed + plot.boosted * 8);

  let stage = STAGES[0].key;
  for (let s = 0; s < STAGES.length; s++) {
    if (effective >= STAGES[s].t) stage = STAGES[s].key;
  }
  const pct = clamp((effective / STAGES[STAGES.length - 1].t) * 100, 0, 100);
  return { stage, pct, effective };
}

function acceleratePlot(i) {
  ensureDailyFresh();

  const plot = state.plots[i];
  if (!plot.plantedAt) return;
  const st = plotStage(plot);
  if (st.stage === "Созрело") return;

  const costE = 6 + plot.boosted * 2;
  if (!spendEnergy(costE)) {
    toast("Не хватает энергии ⚡");
    return;
  }
  plot.boosted += 1;
  log(`Ускорение роста на грядке ${i + 1} (-${costE}⚡)`);
  renderAll();
}

function harvestPlot(i) {
  ensureDailyFresh();

  const plot = state.plots[i];
  if (!plot.plantedAt) return;

  const st = plotStage(plot);
  if (st.stage !== "Созрело") {
    // если ещё не созрело — предложим ускорить
    acceleratePlot(i);
    return;
  }

  // вырастим растение (если ещё не создано)
  if (!plot.plant) {
    const seed = state.seeds[plot.seedKey];
    plot.plant = growPlantFromSeed(seed);
  }

  const p = plot.plant;

  // награды: пыльца + шанс семени такого же типа
  const pollenGain =
    p.rarity === "Легендарное" ? 70 :
    p.rarity === "Эпик" ? 42 :
    p.rarity === "Редкое" ? 24 : 14;

  state.pollen += pollenGain;

  // семена: базово 1, иногда 2
  const seedGain = Math.random() < 0.18 ? 2 : 1;
  const newSeed = makeSeed(p, p, { }); // “самоопыление”: тот же генотип, но возможна мутация внутри makeSeed? (нет, так что просто тип)
  // чтобы не мутачило тут — оставляем ровно этот генотип:
  const id = plantIdFromGenes({ rarity: p.rarity, color: p.color, shape: p.shape, aroma: p.aroma });
  const fixedSeedKey = `seed:${id}`;
  if (!state.seeds[fixedSeedKey]) {
    state.seeds[fixedSeedKey] = {
      key: fixedSeedKey,
      genes: { rarity: p.rarity, color: p.color, shape: p.shape, aroma: p.aroma },
      name: `Семя: ${p.color} / ${p.shape} / ${p.aroma}`,
      count: 0,
    };
  }
  state.seeds[fixedSeedKey].count += seedGain;

  // коллекция
  const pid = plantIdFromGenes(p);
  const isNew = !state.collection[pid];
  if (!state.collection[pid]) state.collection[pid] = { plant: p, harvested: 0 };
  state.collection[pid].harvested += 1;

  bumpQuest("harvest", 1);
  if (isNew) bumpQuest("discover", 1);

  log(`Сбор: ${formatPlant(p)} (+${pollenGain} пыльцы, +${seedGain} сем.)${isNew ? " ✨ НОВОЕ!" : ""}`);

  // очистить грядку
  plot.plantedAt = null;
  plot.seedKey = null;
  plot.plant = null;
  plot.boosted = 0;

  renderAll();
}

function bumpQuest(type, n) {
  const q = state.daily.quest;
  if (q.claimed) return;
  if (q.type !== type) return;
  q.progress = clamp(q.progress + n, 0, q.goal);
}

// ===== Breeding =====
let breedPickMode = "A"; // A then B

function breedingCosts() {
  // стоимость зависит от качества родителей
  const a = selectedParents.A;
  const b = selectedParents.B;
  if (!a || !b) return { energy: 14, pollen: 25 };

  const order = { "Обычное": 1, "Редкое": 2, "Эпик": 3, "Легендарное": 4 };
  const tier = Math.max(order[a.rarity] || 1, order[b.rarity] || 1);

  return {
    energy: 10 + tier * 3,
    pollen: 18 + tier * 10,
  };
}

const selectedParents = { A: null, B: null };

function selectParent(plant) {
  if (breedPickMode === "A") {
    selectedParents.A = plant;
    breedPickMode = "B";
  } else {
    selectedParents.B = plant;
    breedPickMode = "A";
  }
  renderBreeding();
}

function doBreed() {
  ensureDailyFresh();

  const a = selectedParents.A;
  const b = selectedParents.B;
  if (!a || !b) {
    toast("Нужны два родителя 🧬");
    return;
  }

  const cost = breedingCosts();
  if (!spendEnergy(cost.energy)) {
    toast("Не хватает энергии ⚡");
    return;
  }
  if (!spendPollen(cost.pollen)) {
    toast("Не хватает пыльцы 🌼");
    return;
  }

  const seed = makeSeed(a, b);
  if (!state.seeds[seed.key]) state.seeds[seed.key] = { ...seed, count: 0 };
  state.seeds[seed.key].count += 1;

  bumpQuest("breed", 1);

  log(`Скрещивание: A(${a.color}/${a.shape}/${a.aroma}) + B(${b.color}/${b.shape}/${b.aroma}) → ${seed.name} (+1 семя)`);

  // выберем новое семя для удобства
  state.selectedSeedKey = seed.key;

  renderAll();
  toast("Новое семя создано 🌱");
}

// ===== UI Rendering =====
const el = (id) => document.getElementById(id);

function toast(msg) {
  // минимальный “тост” через лог + subtitle
  el("dayHint").textContent = `День: ${state.daily.iso} • ${msg}`;
  setTimeout(() => {
    el("dayHint").textContent = `День: ${state.daily.iso} • Мутация дня: ${state.daily.mutationOfDay.kind}=${state.daily.mutationOfDay.value}`;
  }, 1600);
}

function log(line) {
  const d = new Date();
  const t = d.toTimeString().slice(0, 8);
  state.log.push(`[${t}] ${line}`);
  if (state.log.length > 200) state.log.shift();
}

function renderTop() {
  el("pollen").textContent = Math.floor(state.pollen);
  el("energy").textContent = Math.floor(state.energy);
  el("energyMax").textContent = Math.floor(state.energyMax);
  el("dayHint").textContent = `День: ${state.daily.iso} • Мутация дня: ${state.daily.mutationOfDay.kind}=${state.daily.mutationOfDay.value}`;
}

function renderGarden() {
  const root = el("garden");
  root.innerHTML = "";

  state.plots.forEach((plot, i) => {
    const card = document.createElement("div");
    card.className = "plot";
    card.setAttribute("data-idx", String(i));

    if (!plot.plantedAt) {
      card.innerHTML = `
        <div class="stage">Пусто</div>
        <div class="name">Грядка ${i + 1}</div>
        <div class="meta">Нажми, чтобы посадить выбранное семя.</div>
        <div class="plantEmoji">🪴</div>
        <div class="badge">Стоимость: 8⚡</div>
      `;
    } else {
      const st = plotStage(plot);
      const seed = state.seeds[plot.seedKey];
      const genes = seed?.genes;
      const badge1 = genes ? `${rarityToEmoji(genes.rarity)} ${genes.rarity}` : "—";
      const badge2 = genes ? `${genes.color} / ${genes.shape}` : "—";
      const badge3 = genes ? `${genes.aroma}` : "—";
      const actionHint = (st.stage === "Созрело")
        ? "Нажми, чтобы собрать урожай."
        : "Нажми: ускорить (6⚡+).";

      card.innerHTML = `
        <div class="stage">${st.stage}</div>
        <div class="name">Грядка ${i + 1}</div>
        <div class="meta">${seed?.name || "Семя"}<br>${actionHint}</div>
        <div class="plantEmoji">${rarityToEmoji(genes?.rarity || "Обычное")}</div>
        <div>
          <span class="badge">${badge1}</span>
          <span class="badge">${badge2}</span>
          <span class="badge">${badge3}</span>
        </div>
      `;
    }

    card.addEventListener("click", () => {
      if (!plot.plantedAt) plantOnPlot(i);
      else harvestPlot(i); // если не созрело — внутри попробует ускорить
    });

    root.appendChild(card);
  });
}

function renderInventory() {
  // seeds
  const seedList = el("seedList");
  seedList.innerHTML = "";

  const entries = Object.values(state.seeds)
    .filter(s => (s.count || 0) > 0)
    .sort((a,b) => (b.count||0) - (a.count||0));

  if (entries.length === 0) {
    seedList.innerHTML = `<div class="small muted">Семян нет. Делай тапы → сажай → собирай.</div>`;
  } else {
    for (const s of entries) {
      const genes = s.genes;
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="left">
          <div class="emoji">${rarityToEmoji(genes.rarity)}</div>
          <div>
            <div class="title">${s.name}</div>
            <div class="desc">${genes.rarity} • ${genes.color}/${genes.shape}/${genes.aroma}</div>
            ${s.key === state.selectedSeedKey ? `<div class="desc"><b>Выбрано для посадки ✅</b></div>` : ``}
          </div>
        </div>
        <div class="count">x${s.count}</div>
      `;
      item.addEventListener("click", () => {
        state.selectedSeedKey = s.key;
        el("inventoryHint").textContent = `Выбрано: ${s.name}`;
        renderInventory();
        renderGarden();
      });
      seedList.appendChild(item);
    }
  }

  // collection
  const col = el("collectionList");
  col.innerHTML = "";

  const collEntries = Object.values(state.collection)
    .sort((a,b) => (b.harvested||0) - (a.harvested||0));

  if (collEntries.length === 0) {
    col.innerHTML = `<div class="small muted">Пока пусто. Собери первый урожай, и тут появятся растения.</div>`;
  } else {
    for (const c of collEntries) {
      const p = c.plant;
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="left">
          <div class="emoji">${p.emoji}</div>
          <div>
            <div class="title">${p.rarity} • ${p.color}</div>
            <div class="desc">${p.shape} • аромат: ${p.aroma}</div>
          </div>
        </div>
        <div class="count">⨉${c.harvested}</div>
      `;
      col.appendChild(item);
    }
  }

  el("inventoryHint").textContent ||= "Выбирай семена для посадки.";
}

function renderBreeding() {
  const a = selectedParents.A;
  const b = selectedParents.B;

  el("parentA").textContent = a ? formatPlant(a) : "Не выбран";
  el("parentB").textContent = b ? formatPlant(b) : "Не выбран";

  const cost = breedingCosts();
  el("breedCostEnergy").textContent = `${cost.energy}⚡`;
  el("breedCostPollen").textContent = `${cost.pollen}🌼`;

  const p = state.daily.mutationOfDay;
  el("breedHint").textContent = `Мутация дня: ${p.kind} = ${p.value}. Выбор сейчас: ${breedPickMode === "A" ? "A" : "B"}.`;

  // list of plants from collection
  const list = el("breedCollectionList");
  list.innerHTML = "";

  const collEntries = Object.values(state.collection)
    .map(x => x.plant)
    .sort((x,y) => x.rarity.localeCompare(y.rarity));

  if (collEntries.length === 0) {
    list.innerHTML = `<div class="small muted">Сначала собери урожай, чтобы появились растения для скрещивания.</div>`;
  } else {
    for (const pnt of collEntries) {
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="left">
          <div class="emoji">${pnt.emoji}</div>
          <div>
            <div class="title">${pnt.rarity} • ${pnt.color}</div>
            <div class="desc">${pnt.shape} • аромат: ${pnt.aroma}</div>
          </div>
        </div>
        <div class="count">Выбрать</div>
      `;
      item.addEventListener("click", () => selectParent(pnt));
      list.appendChild(item);
    }
  }
}

function renderQuest() {
  const q = state.daily.quest;
  const r = state.daily.reward;

  el("questText").textContent = q.text;
  el("questReward").textContent = `+${r.pollen}🌼 +${r.seeds}🌱`;

  const pct = (q.progress / q.goal) * 100;
  el("questFill").style.width = `${clamp(pct, 0, 100)}%`;
  el("questProgressText").textContent = `${q.progress}/${q.goal} • ${q.claimed ? "Получено ✅" : (q.progress >= q.goal ? "Готово!" : "В процессе")}`;

  const btn = el("btnClaimQuest");
  btn.disabled = q.claimed || q.progress < q.goal;
}

function claimQuest() {
  ensureDailyFresh();
  const q = state.daily.quest;
  if (q.claimed) return;
  if (q.progress < q.goal) return;

  const r = state.daily.reward;
  state.pollen += r.pollen;

  // бонус-семена: даём базовые или выбранного типа
  const seedKey = state.selectedSeedKey || Object.keys(state.seeds)[0];
  if (seedKey) {
    if (!state.seeds[seedKey]) return;
    state.seeds[seedKey].count += r.seeds;
  }

  q.claimed = true;
  log(`Задание дня выполнено! Награда: +${r.pollen} пыльцы, +${r.seeds} сем.`);
  renderAll();
  toast("Награда получена 🏆");
}

// ===== Tick (growth update) =====
function tick() {
  ensureDailyFresh();

  // пассив: чуть-чуть энергии, но медленно
  const dt = (now() - state.lastTick) / 1000;
  state.lastTick = now();

  state.energy = clamp(state.energy + dt * 0.35, 0, state.energyMax);

  // обновление UI раз в тик
  renderTop();
  renderGarden();
  renderQuest();
}

function openModal(id) {
  const m = el(id);
  m.setAttribute("aria-hidden", "false");
  if (id === "modalInventory") renderInventory();
  if (id === "modalBreeding") renderBreeding();
  if (id === "modalLog") renderLog();
}

function closeModal(id) {
  el(id).setAttribute("aria-hidden", "true");
}

function renderLog() {
  el("log").textContent = (state.log.length ? state.log.join("\n") : "Лог пуст.");
}

function renderAll() {
  renderTop();
  renderQuest();
  renderGarden();
  // модалки рендерим по факту открытия
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ===== Wire events =====
let state = loadState();
ensureDailyFresh();

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-close]");
  if (btn) closeModal(btn.getAttribute("data-close"));
});

el("btnTap").addEventListener("click", tap);
el("btnOpenInventory").addEventListener("click", () => openModal("modalInventory"));
el("btnOpenBreeding").addEventListener("click", () => openModal("modalBreeding"));
el("btnOpenLog").addEventListener("click", () => openModal("modalLog"));

el("btnBreed").addEventListener("click", doBreed);
el("btnClaimQuest").addEventListener("click", claimQuest);

el("btnSave").addEventListener("click", saveState);
el("btnReset").addEventListener("click", () => {
  const ok = confirm("Сбросить прогресс? Это удалит сохранение в браузере.");
  if (ok) hardReset();
});

el("btnClearLog").addEventListener("click", () => {
  state.log = [];
  renderLog();
  localStorage.setItem(KEY, JSON.stringify(state));
});

// автосейв
setInterval(() => localStorage.setItem(KEY, JSON.stringify(state)), 5000);

// основной тик
renderAll();
setInterval(tick, 300);

// стартовый лог
if (!state.log || state.log.length === 0) {
  state.log = [];
  log("Добро пожаловать в Сад Мутаций 🌱");
  log(`Мутация дня: ${state.daily.mutationOfDay.kind}=${state.daily.mutationOfDay.value}`);
  renderAll();
}