const STORAGE_KEY = "glass-planner:v2";

let state = {
  tasks: [],
  filter: "all",      // all | active | done
  query: "",
  sectionPick: "today" // today | tomorrow | later (куда добавляем)
};

const $ = (id) => document.getElementById(id);

const el = {
  today: $("today"),
  focusValue: $("focusValue"),
  addForm: $("addForm"),
  taskInput: $("taskInput"),
  searchInput: $("searchInput"),
  groups: $("groups"),
  stats: $("stats"),
  clearDone: $("clearDone"),
  filterChips: () => Array.from(document.querySelectorAll("[data-filter]")),
  sectionBtns: () => Array.from(document.querySelectorAll("[data-section]")),
};

function uid() {
  return crypto.randomUUID();
}

function formatToday() {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) state.tasks = parsed;
  } catch {}
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch {}
}

function addTask(title) {
  const t = title.trim();
  if (!t) return;

  state.tasks.unshift({
    id: uid(),
    title: t,
    done: false,
    section: state.sectionPick, // today/tomorrow/later
    createdAt: Date.now(),      // храним, но НЕ показываем (может пригодиться)
  });

  save();
  render();
}

function toggleTask(id) {
  state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  save();
  render();
}

function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  save();
  render();
}

function clearDone() {
  state.tasks = state.tasks.filter((t) => !t.done);
  save();
  render();
}

function setFilter(f) {
  state.filter = f;
  el.filterChips().forEach((btn) => btn.classList.toggle("is-active", btn.dataset.filter === f));
  render();
}

function setQuery(q) {
  state.query = q;
  render();
}

function setSectionPick(s) {
  state.sectionPick = s;
  el.sectionBtns().forEach((btn) => btn.classList.toggle("is-active", btn.dataset.section === s));
  // легкий UX: фокус на вводе после выбора секции
  el.taskInput.focus();
}

function getStats() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  const left = total - done;
  return { total, done, left };
}

function visibleTasks() {
  const q = state.query.trim().toLowerCase();

  return state.tasks
    .filter((t) => {
      if (state.filter === "active") return !t.done;
      if (state.filter === "done") return t.done;
      return true;
    })
    .filter((t) => (q ? t.title.toLowerCase().includes(q) : true))
    // сначала невыполненные, потом выполненные
    .sort((a, b) => (a.done === b.done ? b.createdAt - a.createdAt : a.done ? 1 : -1));
}

function groupTitle(key) {
  if (key === "today") return "Сегодня";
  if (key === "tomorrow") return "Завтра";
  return "Позже";
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emptyItem(text) {
  const row = document.createElement("div");
  row.className = "item";
  row.style.justifyContent = "center";
  row.style.padding = "16px 12px";
  row.innerHTML = `<div style="color: rgba(15,23,42,.62)">${escapeHtml(text)}</div>`;
  return row;
}

function taskNode(task) {
  const row = document.createElement("div");
  row.className = `item ${task.done ? "is-done" : ""}`;

  const check = document.createElement("button");
  check.className = `check ${task.done ? "is-done" : ""}`;
  check.type = "button";
  check.ariaLabel = task.done ? "Отметить как не выполнено" : "Отметить как выполнено";
  check.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 7L10 17l-5-5" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  check.addEventListener("click", () => toggleTask(task.id));

  const main = document.createElement("div");
  main.className = "item__main";
  main.innerHTML = `<div class="item__title">${escapeHtml(task.title)}</div>`;

  const del = document.createElement("button");
  del.className = "iconbtn";
  del.type = "button";
  del.ariaLabel = "Удалить задачу";
  del.textContent = "Удалить";
  del.addEventListener("click", () => removeTask(task.id));

  row.append(check, main, del);
  return row;
}

function groupNode(key, tasks) {
  const box = document.createElement("section");
  box.className = "group";

  const head = document.createElement("div");
  head.className = "group__head";

  const title = document.createElement("div");
  title.className = "group__title";
  title.textContent = groupTitle(key);

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.textContent = `${tasks.filter(t => !t.done).length} активн. · ${tasks.length} всего`;

  head.append(title, badge);

  const list = document.createElement("div");
  list.className = "list";

  if (tasks.length === 0) {
    list.appendChild(emptyItem("Пока пусто в этой секции"));
  } else {
    tasks.forEach((t) => list.appendChild(taskNode(t)));
  }

  box.append(head, list);
  return box;
}

function render() {
  el.today.textContent = formatToday();

  const s = getStats();
  el.focusValue.textContent = s.left === 0 ? "Свободно ✨" : `${s.left} задач(и)`;
  el.stats.innerHTML = `Осталось: <b>${s.left}</b> · Готово: <b>${s.done}</b> · Всего: <b>${s.total}</b>`;
  el.clearDone.disabled = s.done === 0;

  // группируем по секциям
  const tasks = visibleTasks();
  const map = { today: [], tomorrow: [], later: [] };
  for (const t of tasks) {
    const sec = t.section || "today";
    (map[sec] || map.today).push(t);
  }

  el.groups.innerHTML = "";
  el.groups.appendChild(groupNode("today", map.today));
  el.groups.appendChild(groupNode("tomorrow", map.tomorrow));
  el.groups.appendChild(groupNode("later", map.later));
}

function bind() {
  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addTask(el.taskInput.value);
    el.taskInput.value = "";
    el.taskInput.focus();
  });

  el.searchInput.addEventListener("input", (e) => setQuery(e.target.value));

  el.filterChips().forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  el.sectionBtns().forEach((btn) => {
    btn.addEventListener("click", () => setSectionPick(btn.dataset.section));
  });

  el.clearDone.addEventListener("click", clearDone);

  // shortcuts
  window.addEventListener("keydown", (e) => {
    const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (!isInput && e.key === "/") {
      e.preventDefault();
      el.taskInput.focus();
    }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "k") {
      e.preventDefault();
      el.taskInput.focus();
    }
  });
}

function init() {
  load();
  bind();
  setFilter("all");
  setSectionPick("today");
  render();
}

init();
