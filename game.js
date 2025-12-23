/* Telegram Word Game (Boggle-like)
   - уровни
   - табло букв NxN
   - собираем слова по соседним клеткам
   - подсчёт очков
   - работает как Telegram Web App и в обычном браузере
*/

const TG = window.Telegram?.WebApp;

function tgInit(){
  try{
    if(!TG) return;
    TG.ready();
    TG.expand();
    TG.setHeaderColor?.("#0b1020");
    TG.setBackgroundColor?.("#0b1020");
  }catch(e){}
}

function haptic(type="impact", style="light"){
  try{
    if(!TG?.HapticFeedback) return;
    if(type === "impact") TG.HapticFeedback.impactOccurred(style);
    if(type === "notif") TG.HapticFeedback.notificationOccurred(style); // "success"|"warning"|"error"
  }catch(e){}
}

tgInit();

/** ====== СЛОВАРЬ ======
 * Сейчас маленький демо-словарь, чтобы игра сразу работала.
 * Чтобы “очень много слов” — замени на большой список (тысячи/десятки тысяч).
 * Формат: МАССИВ СТРОК в ВЕРХНЕМ регистре.
 */
const WORDS = [
  "КОТ","ТОК","ТОН","НОТА","ТОНА","НОС","СОН","СОК","КОС",
  "МОРЕ","РОМ","МОР","РОТА","ТАРА","РАМА","МАРА",
  "ЛЕС","СЕЛ","СЛЕД","ДЕЛО","ДОМ","МОДА",
  "ИГРА","ГРА","РАЗ","ЗАРЯ","РЕКА","КАРА","КРАЙ",
  "МИР","РИМ","ГРОМ","МОЛОТ","ТОПОР",
  "СЛОВО","ОВАЛ","ВОЛЯ","ЯМА","МАЙ","ЙОД",
  "ПАР","ПАРА","ПАРК","КРАП","КАРП",
  "ЗЕМЛЯ","ЛЕТО","ЗИМА","ВЕСНА","ОСЕНЬ",
  "СНЕГ","ЛЁД","ДОЖДЬ","ВЕТЕР"
].map(w => w.toUpperCase());

const DICT = new Set(WORDS);

/** ====== УРОВНИ ======
 * Можно делать:
 * - фиксированные поля (стабильный геймплей)
 * - или генерацию, пока не будет много доступных слов (см. makeLevelBoard)
 */
const LEVELS = [
  { size: 4, goal: 8,  minLen: 3 },
  { size: 4, goal: 12, minLen: 3 },
  { size: 5, goal: 16, minLen: 3 },
  { size: 5, goal: 22, minLen: 3 },
  { size: 6, goal: 28, minLen: 3 },
];

/** Русские буквы (без Ё можно, но я оставил опционально) */
const LETTERS = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЫЬЭЮЯ";
const LETTER_WEIGHTS = [
  // простые веса: чаще гласные и частые согласные
  { chars: "АЕИНОРСТ", w: 6 },
  { chars: "ЛКМДПУВ", w: 4 },
  { chars: "ГБЧЯЮЗЖХЦШЩЫЬЭФЙ", w: 2 }
];

function pickWeightedLetter(){
  const bag = [];
  for(const g of LETTER_WEIGHTS){
    for(const ch of g.chars) for(let i=0;i<g.w;i++) bag.push(ch);
  }
  return bag[(Math.random()*bag.length)|0];
}

/** ====== DOM ====== */
const elBoard = document.getElementById("board");
const elCurrent = document.getElementById("currentWord");
const elScore = document.getElementById("score");
const elFound = document.getElementById("foundCount");
const elGoal = document.getElementById("goalCount");
const elLevelLine = document.getElementById("levelLine");
const elWordsList = document.getElementById("wordsList");
const elHintLine = document.getElementById("hintLine");
const elDiff = document.getElementById("difficultyPill");
const elToast = document.getElementById("toast");

document.getElementById("btnClear").addEventListener("click", clearSelection);
document.getElementById("btnSubmit").addEventListener("click", submitWord);
document.getElementById("btnRestart").addEventListener("click", () => startLevel(state.levelIndex, true));

/** ====== STATE ====== */
const state = {
  levelIndex: 0,
  size: 4,
  board: [],      // letters
  path: [],       // indices
  found: new Set(),
  score: 0,
  minLen: 3,
  goal: 10,
  // drag handling
  dragging: false
};

const SAVE_KEY = "tg_words_game_v1";

function saveProgress(){
  const data = {
    levelIndex: state.levelIndex,
    score: state.score,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function loadProgress(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    if(Number.isInteger(data.levelIndex)) state.levelIndex = data.levelIndex;
    if(Number.isInteger(data.score)) state.score = data.score;
  }catch(e){}
}

/** ====== HELPERS ====== */
function toast(msg, ok=true){
  elToast.textContent = msg;
  elToast.style.borderColor = ok ? "rgba(46,229,157,.35)" : "rgba(255,77,109,.35)";
  elToast.classList.add("show");
  setTimeout(()=> elToast.classList.remove("show"), 900);
}

function idxToRC(i){ return { r: Math.floor(i/state.size), c: i%state.size }; }
function isNeighbor(a,b){
  const A = idxToRC(a), B = idxToRC(b);
  const dr = Math.abs(A.r-B.r), dc = Math.abs(A.c-B.c);
  return (dr<=1 && dc<=1 && !(dr===0 && dc===0));
}

function wordScore(w){
  // простая система очков
  const n = w.length;
  if(n < 3) return 0;
  if(n === 3) return 10;
  if(n === 4) return 20;
  if(n === 5) return 35;
  if(n === 6) return 55;
  return 55 + (n-6)*15;
}

/** ====== BOARD GENERATION ======
 * Чтобы уровни были “богатыми” на слова — делаем генерацию:
 * 1) рандомное поле
 * 2) считаем сколько слов реально можно собрать (DFS по словарю)
 * 3) если мало — перегенерируем
 *
 * Для больших словарей это реально круто работает.
 */
function buildTrie(words){
  const root = {};
  for(const w of words){
    let node = root;
    for(const ch of w){
      node[ch] = node[ch] || {};
      node = node[ch];
    }
    node.$ = true;
  }
  return root;
}

const TRIE = buildTrie(WORDS);

function neighborsOf(i, size){
  const r = Math.floor(i/size), c = i%size;
  const res = [];
  for(let dr=-1; dr<=1; dr++){
    for(let dc=-1; dc<=1; dc++){
      if(dr===0 && dc===0) continue;
      const rr=r+dr, cc=c+dc;
      if(rr>=0 && rr<size && cc>=0 && cc<size) res.push(rr*size+cc);
    }
  }
  return res;
}

function solveAllWordsOnBoard(board, size, trieRoot, minLen=3, limit=5000){
  const found = new Set();
  const neigh = Array.from({length: size*size}, (_,i)=>neighborsOf(i,size));
  const used = new Array(size*size).fill(false);

  function dfs(i, node, str){
    if(found.size >= limit) return;
    used[i] = true;
    const ch = board[i];
    const next = node[ch];
    if(!next){ used[i]=false; return; }
    const s2 = str + ch;
    if(next.$ && s2.length >= minLen) found.add(s2);

    for(const j of neigh[i]){
      if(!used[j]) dfs(j, next, s2);
    }
    used[i] = false;
  }

  for(let i=0;i<size*size;i++){
    dfs(i, trieRoot, "");
    if(found.size >= limit) break;
  }
  return found;
}

function makeLevelBoard(size, minWordsNeeded){
  // пытаемся сделать “богатое” поле
  for(let attempt=0; attempt<200; attempt++){
    const b = Array.from({length:size*size}, ()=>pickWeightedLetter());
    const all = solveAllWordsOnBoard(b, size, TRIE, 3, 5000);
    if(all.size >= minWordsNeeded) return { board: b, possible: all };
  }
  // если словарь маленький и не получается — просто поле
  return { board: Array.from({length:size*size}, ()=>pickWeightedLetter()), possible: new Set() };
}

/** ====== RENDER ====== */
function renderBoard(){
  elBoard.innerHTML = "";
  elBoard.style.gridTemplateColumns = `repeat(${state.size}, 1fr)`;
  elDiff.textContent = `${state.size}×${state.size}`;

  for(let i=0;i<state.board.length;i++){
    const div = document.createElement("div");
    div.className = "tile";
    div.textContent = state.board[i];
    div.dataset.idx = String(i);

    // click
    div.addEventListener("pointerdown", (e)=>{
      e.preventDefault();
      state.dragging = true;
      handlePick(i);
    });
    div.addEventListener("pointerenter", ()=>{
      if(state.dragging) handlePick(i);
    });
    div.addEventListener("pointerup", ()=> state.dragging=false);
    div.addEventListener("pointercancel", ()=> state.dragging=false);

    elBoard.appendChild(div);
  }

  // stop drag on outside
  window.addEventListener("pointerup", ()=> state.dragging=false);
}

function updateSelectionUI(ok=true){
  const tiles = elBoard.querySelectorAll(".tile");
  tiles.forEach(t => { t.classList.remove("sel","bad"); });

  for(const idx of state.path){
    const t = tiles[idx];
    if(t) t.classList.add(ok ? "sel" : "bad");
  }

  const word = state.path.map(i=>state.board[i]).join("");
  elCurrent.textContent = word || "—";
}

function renderStats(){
  elScore.textContent = String(state.score);
  elFound.textContent = String(state.found.size);
  elGoal.textContent = String(state.goal);
  elLevelLine.textContent = `Уровень ${state.levelIndex + 1}`;
}

function renderFoundWords(){
  elWordsList.innerHTML = "";
  const arr = Array.from(state.found).sort((a,b)=>a.localeCompare(b,"ru"));
  for(const w of arr){
    const chip = document.createElement("div");
    chip.className = "wordChip";
    chip.textContent = w;
    elWordsList.appendChild(chip);
  }
}

/** ====== GAMEPLAY ====== */
function handlePick(i){
  // если уже в пути — игнор
  if(state.path.includes(i)) return;

  // если первая буква — ок
  if(state.path.length === 0){
    state.path.push(i);
    haptic("impact","light");
    updateSelectionUI(true);
    return;
  }

  // должна быть соседней
  const last = state.path[state.path.length-1];
  if(!isNeighbor(last, i)){
    haptic("notif","warning");
    updateSelectionUI(false);
    return;
  }

  state.path.push(i);
  haptic("impact","light");
  updateSelectionUI(true);
}

function clearSelection(){
  state.path = [];
  updateSelectionUI(true);
}

function submitWord(){
  const word = state.path.map(i=>state.board[i]).join("");
  if(word.length < state.minLen){
    toast(`Минимум ${state.minLen} буквы`, false);
    haptic("notif","warning");
    return clearSelection();
  }

  if(state.found.has(word)){
    toast("Уже было", false);
    haptic("notif","warning");
    return clearSelection();
  }

  if(!DICT.has(word)){
    toast("Нет в словаре", false);
    haptic("notif","error");
    return clearSelection();
  }

  // принято
  state.found.add(word);
  const add = wordScore(word);
  state.score += add;
  toast(`+${add} очков`, true);
  haptic("notif","success");

  renderStats();
  renderFoundWords();
  clearSelection();

  // win?
  if(state.found.size >= state.goal){
    levelComplete();
  }
}

function levelComplete(){
  toast("Уровень пройден! 🎉", true);
  haptic("notif","success");
  saveProgress();

  // следующий уровень
  const next = state.levelIndex + 1;
  if(next < LEVELS.length){
    setTimeout(()=> startLevel(next, false), 450);
  }else{
    elHintLine.textContent = "Ты прошёл все уровни! Можно добавить новые 🙂";
  }
}

function startLevel(levelIndex, restartSame=false){
  state.levelIndex = Math.max(0, Math.min(levelIndex, LEVELS.length-1));
  const cfg = LEVELS[state.levelIndex];
  state.size = cfg.size;
  state.minLen = cfg.minLen;
  state.goal = cfg.goal;
  state.found = new Set();
  state.path = [];

  // Генерируем поле так, чтобы было достаточно слов.
  // Если словарь маленький — всё равно запустится.
  const minWordsNeeded = Math.max(cfg.goal * 2, cfg.goal + 10);
  const { board, possible } = makeLevelBoard(state.size, minWordsNeeded);
  state.board = board;

  // Подсказка: сколько вообще слов есть (работает круто с большим словарём)
  if(possible.size){
    elHintLine.textContent = `На этом поле можно найти примерно ${possible.size}+ слов.`;
  }else{
    elHintLine.textContent = `Собирай слова и проходи уровень.`;
  }

  renderBoard();
  renderStats();
  renderFoundWords();
  updateSelectionUI(true);

  saveProgress();
}

/** ====== START ====== */
loadProgress();
renderStats();
startLevel(state.levelIndex, false);