const STORAGE_KEY = "glass-cal-planner:v1";

/**
 * Данные:
 * {
 *   "2025-12-25": [{id, text, done, createdAt}, ...],
 *   "2025-12-26": [...]
 * }
 */
let db = {};

let view = {
  year: 0,
  month: 0,       // 0..11
  selected: "",   // YYYY-MM-DD
};

const $ = (id) => document.getElementById(id);

const el = {
  monthTitle: $("monthTitle"),
  grid: $("grid"),
  btnPrev: $("btnPrev"),
  btnNext: $("btnNext"),
  dayBig: $("dayBig"),
  daySmall: $("daySmall"),
  list: $("list"),
  addForm: $("addForm"),
  taskInput: $("taskInput"),
  clearDay: $("clearDay"),
  clearDone: $("clearDone"),
};

function uid() {
  return crypto.randomUUID();
}

function pad2(n){ return String(n).padStart(2, "0"); }

function keyOf(y, m, d){
  return `${y}-${pad2(m+1)}-${pad2(d)}`;
}

function parseKey(key){
  const [y, mm, dd] = key.split("-").map(Number);
  return { y, m: mm-1, d: dd };
}

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") db = parsed;
  }catch{}
}

function save(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }catch{}
}

function monthName(y, m){
  // в стиле "ДЕК."
  const long = new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(y, m, 1));
  return (long.replace(".", "") + ".").toUpperCase();
}

function weekdayShortRu(date){
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date);
}

function dayLabelRu(date){
  // "25 чт"
  const d = date.getDate();
  const wd = weekdayShortRu(date); // "чт"
  return `${d} ${wd}`;
}

function ensureDay(key){
  if (!db[key]) db[key] = [];
  return db[key];
}

function addTaskForSelected(text){
  const t = text.trim();
  if (!t) return;
  const list = ensureDay(view.selected);
  list.unshift({ id: uid(), text: t, done: false, createdAt: Date.now() });
  save();
  render();
}

function toggleTask(dayKey, id){
  const list = ensureDay(dayKey);
  db[dayKey] = list.map(x => x.id === id ? { ...x, done: !x.done } : x);
  save();
  render();
}

function deleteTask(dayKey, id){
  const list = ensureDay(dayKey);
  db[dayKey] = list.filter(x => x.id !== id);
  if (db[dayKey].length === 0) delete db[dayKey]; // чистим пустые дни
  save();
  render();
}

function clearDoneForSelected(){
  const k = view.selected;
  if (!db[k]) return;
  db[k] = db[k].filter(x => !x.done);
  if (db[k].length === 0) delete db[k];
  save();
  render();
}

function clearDay(){
  const k = view.selected;
  if (db[k]) {
    delete db[k];
    save();
    render();
  }
}

function getCountsForDay(dayKey){
  const list = db[dayKey] || [];
  const done = list.filter(x => x.done).length;
  const total = list.length;
  const active = total - done;
  return { total, done, active };
}

function firstDayMondayIndex(y, m){
  // ПН=0..ВС=6
  const js = new Date(y, m, 1).getDay(); // ВС=0..СБ=6
  return (js + 6) % 7;
}

function daysInMonth(y, m){
  return new Date(y, m+1, 0).getDate();
}

function renderTop(){
  el.monthTitle.textContent = monthName(view.year, view.month);
}

function renderGrid(){
  el.grid.innerHTML = "";

  const y = view.year;
  const m = view.month;

  const startIdx = firstDayMondayIndex(y, m);
  const dim = daysInMonth(y, m);

  // предыдущий месяц для "серых" дней
  const prevMonth = (m + 11) % 12;
  const prevYear = m === 0 ? y - 1 : y;
  const dimPrev = daysInMonth(prevYear, prevMonth);

  // всего 6 недель * 7 = 42 клетки (как в календарях)
  const totalCells = 42;

  const today = new Date();
  const todayKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate());

  for (let i = 0; i < totalCells; i++){
    let cellY = y, cellM = m, cellD = 1;
    let isOther = false;

    if (i < startIdx){
      // хвост прошлого месяца
      isOther = true;
      cellY = prevYear;
      cellM = prevMonth;
      cellD = dimPrev - (startIdx - 1 - i);
    } else if (i >= startIdx + dim){
      // начало следующего
      isOther = true;
      const nextMonth = (m + 1) % 12;
      const nextYear = m === 11 ? y + 1 : y;
      cellY = nextYear;
      cellM = nextMonth;
      cellD = i - (startIdx + dim) + 1;
    } else {
      cellD = i - startIdx + 1;
    }

    const dayKey = keyOf(cellY, cellM, cellD);
    const dateObj = new Date(cellY, cellM, cellD);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    if (isOther) cell.classList.add("is-other");
    if (dateObj.getDay() === 0) cell.classList.add("is-sun"); // Sunday
    if (dayKey === todayKey) cell.classList.add("is-today");
    if (dayKey === view.selected) cell.classList.add("is-selected");

    cell.setAttribute("data-key", dayKey);
    cell.setAttribute("aria-label", dayKey);

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = String(cellD);

    const dots = document.createElement("div");
    dots.className = "dots";
    const c = getCountsForDay(dayKey);
    if (c.total > 0){
      // 2 точки: активные и выполненные (как индикаторы)
      const dotA = document.createElement("div");
      dotA.className = "dot is-active";
      const dotD = document.createElement("div");
      dotD.className = "dot is-done";
      // если нет одного из типов — делаем его "пустым"
      if (c.active === 0) dotA.className = "dot";
      if (c.done === 0) dotD.className = "dot";
      dots.append(dotA, dotD);
    }

    cell.append(num);
    if (c.total > 0) cell.append(dots);

    cell.addEventListener("click", () => {
      view.selected = dayKey;
      render();
    });

    el.grid.append(cell);
  }
}

function renderDayPanel(){
  const { y, m, d } = parseKey(view.selected);
  const date = new Date(y, m, d);

  el.dayBig.textContent = String(d);
  el.daySmall.textContent = weekdayShortRu(date);

  // список задач
  const list = db[view.selected] || [];
  el.list.innerHTML = "";

  if (list.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Пока ничего нет. Добавь задачу снизу.";
    el.list.append(empty);
    return;
  }

  // сортировка: активные сверху, выполненные ниже
  const sorted = [...list].sort((a,b) => (a.done === b.done ? b.createdAt - a.createdAt : a.done ? 1 : -1));

  for (const item of sorted){
    const row = document.createElement("div");
    row.className = "item" + (item.done ? " is-done" : "");

    const check = document.createElement("button");
    check.type = "button";
    check.className = "check" + (item.done ? " is-done" : "");
    check.ariaLabel = item.done ? "Снять выполнение" : "Отметить выполненным";
    check.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7L10 17l-5-5" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    check.addEventListener("click", () => toggleTask(view.selected, item.id));

    const text = document.createElement("div");
    text.className = "item__text";
    text.textContent = item.text;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Удалить";
    del.addEventListener("click", () => deleteTask(view.selected, item.id));

    row.append(check, text, del);
    el.list.append(row);
  }
}

function render(){
  renderTop();
  renderGrid();
  renderDayPanel();
}

function shiftMonth(delta){
  const d = new Date(view.year, view.month + delta, 1);
  view.year = d.getFullYear();
  view.month = d.getMonth();

  // если выбранный день не в этом месяце — оставим выбранным "1 число текущего"
  view.selected = keyOf(view.year, view.month, 1);
  render();
}

function bind(){
  el.btnPrev.addEventListener("click", () => shiftMonth(-1));
  el.btnNext.addEventListener("click", () => shiftMonth(+1));

  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addTaskForSelected(el.taskInput.value);
    el.taskInput.value = "";
    el.taskInput.focus();
  });

  el.clearDone.addEventListener("click", clearDoneForSelected);
  el.clearDay.addEventListener("click", clearDay);
}

function init(){
  load();

  const now = new Date();
  view.year = now.getFullYear();
  view.month = now.getMonth();
  view.selected = keyOf(now.getFullYear(), now.getMonth(), now.getDate());

  bind();
  render();
}

init();
