/* Темщик Mini App
   - Хранит прогресс в localStorage
   - Интеграция с Telegram WebApp SDK (если открыт внутри Telegram)
*/

const LS_KEY = "temsik_state_v1";

const state = loadState() ?? {
  xp: 0,
  lvl: 1,
  ideas: [],
  quests: []
};

const el = {
  lvl: document.getElementById("lvl"),
  xp: document.getElementById("xp"),
  meterFill: document.getElementById("meterFill"),
  meterText: document.getElementById("meterText"),
  ideas: document.getElementById("ideas"),
  quests: document.getElementById("quests"),
  ideaInput: document.getElementById("ideaInput"),
  questInput: document.getElementById("questInput"),
  addIdeaBtn: document.getElementById("addIdeaBtn"),
  addQuestBtn: document.getElementById("addQuestBtn"),
  tapBtn: document.getElementById("tapBtn"),
  shareBtn: document.getElementById("shareBtn"),
  tgInfo: document.getElementById("tgInfo"),
};

const XP_PER_TAP = 1;
const XP_PER_QUEST_DONE = 15;

// простая “кривая” уровней: 50, 80, 110, ...
function xpToNextLevel(lvl) {
  return 50 + (lvl - 1) * 30;
}

function addXP(amount, reason = "") {
  state.xp += amount;

  // ап уровней
  while (state.xp >= xpToNextLevel(state.lvl)) {
    state.xp -= xpToNextLevel(state.lvl);
    state.lvl += 1;
    haptic("notification", "success");
  }

  saveState();
  render();
}

function addIdea(text) {
  state.ideas.unshift({
    id: cryptoRandomId(),
    text: text.trim(),
    createdAt: Date.now(),
  });
  saveState();
  render();
}

function addQuest(text) {
  state.quests.unshift({
    id: cryptoRandomId(),
    text: text.trim(),
    done: false,
    createdAt: Date.now(),
  });
  saveState();
  render();
}

function toggleQuest(id) {
  const q = state.quests.find(x => x.id === id);
  if (!q) return;

  const wasDone = q.done;
  q.done = !q.done;

  // XP только при отметке “сделано”
  if (!wasDone && q.done) {
    addXP(XP_PER_QUEST_DONE, "quest_done");
  } else {
    saveState();
    render();
  }
}

function deleteIdea(id) {
  state.ideas = state.ideas.filter(x => x.id !== id);
  saveState();
  render();
}

function deleteQuest(id) {
  state.quests = state.quests.filter(x => x.id !== id);
  saveState();
  render();
}

function render() {
  el.lvl.textContent = String(state.lvl);
  el.xp.textContent = String(state.xp);

  const need = xpToNextLevel(state.lvl);
  const pct = Math.max(0, Math.min(100, Math.round((state.xp / need) * 100)));
  el.meterFill.style.width = pct + "%";
  el.meterText.textContent = `${state.xp} / ${need}`;

  // идеи
  el.ideas.innerHTML = "";
  for (const it of state.ideas) {
    const li = document.createElement("li");
    li.className = "item";

    const text = document.createElement("div");
    text.className = "item__text";
    text.textContent = it.text;

    const actions = document.createElement("div");
    actions.className = "item__actions";

    const del = document.createElement("div");
    del.className = "pill pill--del";
    del.textContent = "Удалить";
    del.onclick = () => { haptic("impact", "light"); deleteIdea(it.id); };

    actions.appendChild(del);
    li.appendChild(text);
    li.appendChild(actions);
    el.ideas.appendChild(li);
  }

  // квесты
  el.quests.innerHTML = "";
  for (const q of state.quests) {
    const li = document.createElement("li");
    li.className = "item";

    const text = document.createElement("div");
    text.className = "item__text";
    text.textContent = q.done ? `✅ ${q.text}` : q.text;

    const actions = document.createElement("div");
    actions.className = "item__actions";

    const done = document.createElement("div");
    done.className = "pill pill--done";
    done.textContent = q.done ? "Отменить" : "Сделано";
    done.onclick = () => { haptic("impact", "medium"); toggleQuest(q.id); };

    const del = document.createElement("div");
    del.className = "pill pill--del";
    del.textContent = "Удалить";
    del.onclick = () => { haptic("impact", "light"); deleteQuest(q.id); };

    actions.appendChild(done);
    actions.appendChild(del);

    li.appendChild(text);
    li.appendChild(actions);
    el.quests.appendChild(li);
  }
}

function wireUI() {
  el.addIdeaBtn.onclick = () => {
    const v = el.ideaInput.value;
    if (!v.trim()) return;
    addIdea(v);
    el.ideaInput.value = "";
    haptic("impact", "light");
  };

  el.addQuestBtn.onclick = () => {
    const v = el.questInput.value;
    if (!v.trim()) return;
    addQuest(v);
    el.questInput.value = "";
    haptic("impact", "light");
  };

  el.tapBtn.onclick = () => {
    addXP(XP_PER_TAP, "tap");
    haptic("impact", "light");
  };

  el.shareBtn.onclick = () => {
    const payload = {
      app: "temsik",
      lvl: state.lvl,
      xp: state.xp,
      ideasCount: state.ideas.length,
      quests: {
        total: state.quests.length,
        done: state.quests.filter(x => x.done).length
      },
      ts: Date.now()
    };

    // Если в Telegram — отправим данные боту
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.sendData(JSON.stringify(payload));
      window.Telegram.WebApp.showAlert("Отправил прогресс боту ✅");
      haptic("notification", "success");
    } else {
      // в браузере — просто покажем
      alert("Открой внутри Telegram, чтобы отправить боту.\n\n" + JSON.stringify(payload, null, 2));
    }
  };
}

function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) {
    el.tgInfo.textContent = "Telegram: открыт в браузере (не внутри Telegram)";
    return;
  }

  tg.ready();
  tg.expand();

  // theme (чтобы подстраиваться под тему телеги)
  // Можно использовать tg.themeParams, но мы уже сделали свой стиль.
  const user = tg.initDataUnsafe?.user;
  if (user) {
    el.tgInfo.textContent = `Telegram: ${user.first_name}${user.username ? " @" + user.username : ""}`;
  } else {
    el.tgInfo.textContent = "Telegram: WebApp";
  }
}

function saveState() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// небольшой helper для “вибро”
function haptic(type, style) {
  const tg = window.Telegram?.WebApp;
  const h = tg?.HapticFeedback;
  if (!h) return;

  try {
    if (type === "impact") h.impactOccurred(style); // light/medium/heavy/rigid/soft
    if (type === "notification") h.notificationOccurred(style); // error/success/warning
  } catch {}
}

function cryptoRandomId() {
  // простой id без зависимостей
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

wireUI();
initTelegram();
render();