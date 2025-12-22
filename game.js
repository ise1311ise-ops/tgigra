function go(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startGame(user) {
  document.getElementById('vs').innerText = `Бой 1×1 vs ${user}`;
  go('game');
}

function fillGrids() {
  document.querySelectorAll('.grid').forEach(grid => {
    grid.innerHTML = '';
    for (let i = 0; i < 100; i++) {
      const c = document.createElement('div');
      grid.appendChild(c);
    }
  });
}

fillGrids();