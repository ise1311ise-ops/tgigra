const STORAGE_KEY = "glass-planner:v1";

let state = {
  tasks: [],
  filter: "all", // all | active | done
  query: "",
};

const $ = (id) => document.getElementById(id);

const el = {
  today: $("today"),
  focusValue: $("focusValue"),
  addForm: $("addForm"),
  taskInput: $("taskInput"),
  searchInput: $("searchInput"),
  list: $("list"),
  stats: $("stats"),
  clearDone: $("clearDone"),
  chips: () => Array.from(document.querySelectorAll("[data-filter]")),
};

function uid() {
  // modern browsers (GitHub Pages ok)
  return crypto.randomUUID();
}

function formatToday() {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function formatTime(ts) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(ts);
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
    createdAt: Date.now(),
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
  el.chips().forEach((btn) => btn.classList.toggle("chip--active", btn.dataset.filter === f));
  render();
}

function setQuery(q) {
  state.query = q;
  render();
}

function stats() {
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
    .sort((a, b) => (a.done === b.done ? b.createdAt - a.createdAt : a.done ? 1 : -1));
}

function emptyStateNode() {
  const box = document.createElement("div");
  box.className = "item";
  box.style.justifyContent = "center";
  box.style.padding = "18px 12px";
  box.innerHTML = `
    <div style="text-align:center;">
      <div style="font-weight:650; font-size:16px; color: rgba(17,24,39,.95);">Пока пусто</div>
      <div style="margin-top:4px; color: rgba(17,24,39,.62);">Добавь первую задачу. Минимум шума — максимум фокуса.</div>
    </div>
  `;
  return box;
}

function taskNode(task) {
  const row = document.createElement("div");
  row.className = `item ${task.done ? "item--done" : ""}`;
  row.setAttribute("role", "listitem");

  const check = document.createElement("button");
  check.className = `check ${task.done ? "check--done" : ""}`;
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
  main.innerHTML = `
    <div class="item__title">${escapeHtml(task.title)}</div>
    <div class="item__meta">${formatTime(task.createdAt)}</div>
  `;

  const del = document.createElement("button");
  del.className = "iconbtn";
  del.type = "button";
  del.ariaLabel = "Удалить задачу";
  del.textContent = "Удалить";
  del.addEventListener("click", () => removeTask(task.id));

  row.append(check, main, del);
  return row;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  // header
  el.today.textContent = formatToday();

  const s = stats();
  el.focusValue.textContent = s.left === 0 ? "Свободно ✨" : `${s.left} задач(и)`;
  el.stats.innerHTML = `Осталось: <b>${s.left}</b> · Готово: <b>${s.done}</b> · Всего: <b>${s.total}</b>`;
  el.clearDone.disabled = s.done === 0;

  // list
  el.list.innerHTML = "";
  const items = visibleTasks();
  if (items.length === 0) {
    el.list.appendChild(emptyStateNode());
    return;
  }
  items.forEach((t) => el.list.appendChild(taskNode(t)));
}

function bind() {
  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addTask(el.taskInput.value);
    el.taskInput.value = "";
    el.taskInput.focus();
  });

  el.searchInput.addEventListener("input", (e) => setQuery(e.target.value));

  el.chips().forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  el.clearDone.addEventListener("click", clearDone);

  // shortcuts: "/" or Ctrl/⌘K focus
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
  render();
}

init();
