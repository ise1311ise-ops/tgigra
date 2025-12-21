(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restart");

  // Подстройка под экран: делаем canvas по ширине, но не больше 420
  function resizeCanvas() {
    const maxW = 420;
    const w = Math.min(window.innerWidth - 20, maxW);
    const h = Math.round(w * 1.5); // пропорция примерно как 360x540
    canvas.width = Math.max(280, w);
    canvas.height = Math.max(420, h);
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  let score = 0;
  let alive = true;

  const balls = [];
  const maxBalls = 7;

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function spawnBall() {
    const r = rand(14, 26);
    const x = rand(r, canvas.width - r);
    const y = -r - rand(0, canvas.height * 0.2);
    const speed = rand(1.2, 2.6) + score * 0.01;

    // 70% зелёные, 30% красные
    const good = Math.random() < 0.7;

    balls.push({
      x,
      y,
      r,
      vy: speed,
      good,
      // цвет зададим в draw
    });
  }

  function resetGame() {
    score = 0;
    alive = true;
    balls.length = 0;
    for (let i = 0; i < 4; i++) spawnBall();
    scoreEl.textContent = String(score);
  }

  restartBtn.addEventListener("click", resetGame);

  function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // лёгкая сетка
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#ffffff";
    const step = 40;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBall(b) {
    // тень
    ctx.beginPath();
    ctx.arc(b.x, b.y + b.r * 0.15, b.r * 1.02, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);

    ctx.fillStyle = b.good ? "#2ecc71" : "#e74c3c";
    ctx.fill();

    // блик
    ctx.beginPath();
    ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fill();
  }

  function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px system-ui, -apple-system, Arial";
    ctx.textAlign = "center";
    ctx.fillText("Игра окончена", canvas.width / 2, canvas.height / 2 - 10);

    ctx.font = "16px system-ui, -apple-system, Arial";
    ctx.fillText("Нажми «Заново»", canvas.width / 2, canvas.height / 2 + 20);
  }

  function update() {
    // поддерживаем количество шаров
    if (alive && balls.length < maxBalls && Math.random() < 0.04) {
      spawnBall();
    }

    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.y += b.vy;

      // ушёл вниз
      if (b.y - b.r > canvas.height) {
        balls.splice(i, 1);
      }
    }
  }

  function render() {
    drawBackground();

    // граница игрового поля
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

    for (const b of balls) drawBall(b);

    if (!alive) drawGameOver();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // Тап/клик по canvas
  function handleTap(clientX, clientY) {
    if (!alive) return;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    // ищем шар под тапом (сверху вниз по массиву не важно, но лучше — с конца)
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      const dx = x - b.x;
      const dy = y - b.y;
      if (dx * dx + dy * dy <= b.r * b.r) {
        // попал
        if (b.good) {
          score += 1;
          scoreEl.textContent = String(score);
          balls.splice(i, 1);
          // чуть сложнее со временем
          if (balls.length < 4) spawnBall();
        } else {
          alive = false;
        }
        return;
      }
    }
  }

  canvas.addEventListener("click", (e) => handleTap(e.clientX, e.clientY));
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      handleTap(t.clientX, t.clientY);
    },
    { passive: true }
  );

  resetGame();
  loop();
})();
