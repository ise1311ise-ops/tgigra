(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restart");

  // Подгоняем канвас под экран, но не меньше базового
  function resize() {
    const w = Math.min(window.innerWidth, 480);
    const h = Math.min(window.innerHeight, 720);

    canvas.width = Math.max(320, w);
    canvas.height = Math.max(480, h);

    // Чтобы UI сверху/снизу не мешал — можно чуть уменьшить высоту под подсказку
    // но оставим как есть
  }
  window.addEventListener("resize", resize);
  resize();

  let score = 0;
  let running = true;

  const balls = [];
  const MAX_BALLS = 6;

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function spawnBall() {
    const r = rand(18, 32);
    const x = rand(r, canvas.width - r);
    const y = -r - rand(0, 200);

    const isGood = Math.random() < 0.6; // зелёных чуть больше
    const speed = rand(1.6, 3.6) + (score * 0.02);

    balls.push({
      x,
      y,
      r,
      vy: speed,
      isGood,
    });
  }

  function reset() {
    score = 0;
    running = true;
    balls.length = 0;
    for (let i = 0; i < 4; i++) spawnBall();
    scoreEl.textContent = String(score);
  }

  restartBtn.addEventListener("click", reset);

  function drawBall(b) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.closePath();

    // Цвета
    ctx.fillStyle = b.isGood ? "#00ff66" : "#ff3344";
    ctx.fill();

    // Обводка для контраста
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.stroke();
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "bold 36px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);

    ctx.font = "24px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText(`Очки: ${score}`, canvas.width / 2, canvas.height / 2 + 20);

    ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("Нажми «Заново»", canvas.width / 2, canvas.height / 2 + 55);
  }

  function update() {
    if (!running) return;

    // Добавляем шарики если мало
    while (balls.length < MAX_BALLS) spawnBall();

    // Двигаем шарики
    for (const b of balls) {
      b.y += b.vy;
    }

    // Удаляем те, что улетели вниз, и спавним новые
    for (let i = balls.length - 1; i >= 0; i--) {
      if (balls[i].y - balls[i].r > canvas.height + 40) {
        balls.splice(i, 1);
        spawnBall();
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const b of balls) drawBall(b);

    if (!running) drawGameOver();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }
  loop();

  function hitTest(x, y, b) {
    const dx = x - b.x;
    const dy = y - b.y;
    return dx * dx + dy * dy <= b.r * b.r;
  }

  function onTap(clientX, clientY) {
    if (!running) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Проверяем шарики сверху вниз (чтоб клик по верхнему срабатывал)
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      if (hitTest(x, y, b)) {
        if (b.isGood) {
          score += 1;
          scoreEl.textContent = String(score);
          balls.splice(i, 1);
          spawnBall();
        } else {
          running = false; // красный = проигрыш
        }
        return;
      }
    }
  }

  // Touch / Mouse
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (t) onTap(t.clientX, t.clientY);
  }, { passive: false });

  canvas.addEventListener("mousedown", (e) => {
    onTap(e.clientX, e.clientY);
  });

  reset();
})();
