const arena = document.getElementById("arena");
const timeEl = document.getElementById("time");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

const startBtn = document.getElementById("start");
const resetBtn = document.getElementById("reset");
const complimentBtn = document.getElementById("compliment");
const hintEl = document.getElementById("hint");

const BEST_KEY = "for_yulenka_best";
let best = Number(localStorage.getItem(BEST_KEY) || 0);
bestEl.textContent = String(best);

let running = false;
let timeLeft = 30;
let score = 0;

let timerId = null;
let spawnId = null;

const compliments = [
  "Юленька, ты — мой самый тёплый человек 💗",
  "Твоя улыбка делает мир спокойнее ✨",
  "Ты красивая. И внутри тоже. Очень.",
  "С тобой даже обычный день становится праздником 💞",
  "Если бы нежность была музыкой — это была бы ты 🎶"
];

function popHint(text){
  hintEl.textContent = text;
  hintEl.classList.add("pop");
  setTimeout(() => hintEl.classList.remove("pop"), 350);
}

function rand(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearArena(){
  arena.querySelectorAll(".heart").forEach(el => el.remove());
}

function spawnHeart(){
  if (!running) return;

  const el = document.createElement("button");
  el.className = "heart";
  el.type = "button";

  const hearts = ["💗","💞","💘","💖","💝","💓"];
  el.textContent = hearts[rand(0, hearts.length - 1)];

  el.style.left = `${rand(8, 92)}%`;
  el.style.top  = `${rand(12, 88)}%`;

  const ttl = rand(650, 1100);
  const born = Date.now();

  el.addEventListener("click", () => {
    if (!running) return;
    score += 1;
    scoreEl.textContent = String(score);
    el.remove();

    if (score % 7 === 0) popHint("Юленька, это тебе ещё +7 сердечек! 💖");
  });

  arena.appendChild(el);

  setTimeout(() => {
    if (Date.now() - born >= ttl) el.remove();
  }, ttl);
}

function tick(){
  timeLeft -= 1;
  timeEl.textContent = String(timeLeft);
  if (timeLeft <= 0) endGame();
}

function startGame(){
  if (running) return;
  running = true;

  score = 0;
  timeLeft = 30;
  scoreEl.textContent = "0";
  timeEl.textContent = "30";

  clearArena();
  popHint("Поехали! Лови сердечки для Юленьки 💗");

  timerId = setInterval(tick, 1000);
  spawnId = setInterval(spawnHeart, 280);
}

function endGame(){
  running = false;
  clearInterval(timerId);
  clearInterval(spawnId);
  timerId = null;
  spawnId = null;

  clearArena();

  if (score > best){
    best = score;
    localStorage.setItem(BEST_KEY, String(best));
    bestEl.textContent = String(best);
    popHint(`Новый рекорд: ${score} 💞 Юленька — чемпионка!`);
  } else {
    popHint(`Финиш! ${score} 💗 Попробуем ещё раз?`);
  }
}

function reset(){
  running = false;
  clearInterval(timerId);
  clearInterval(spawnId);
  timerId = null;
  spawnId = null;

  score = 0;
  timeLeft = 30;
  scoreEl.textContent = "0";
  timeEl.textContent = "30";

  clearArena();
  popHint("Нажми «Старт игры» — и ловим сердечки 💞");
}

startBtn.addEventListener("click", startGame);
resetBtn.addEventListener("click", reset);

complimentBtn.addEventListener("click", () => {
  const pick = compliments[rand(0, compliments.length - 1)];
  popHint(pick);
});