const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const CELL = 20;
const COLS = canvas.width / CELL;
const ROWS = canvas.height / CELL;

let snake, dir, next, food, score;

function reset() {
  snake = [{ x: 10, y: 10 }];
  dir = { x: 1, y: 0 };
  next = dir;
  score = 0;
  scoreEl.textContent = score;
  placeFood();
}

function placeFood() {
  const free = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++)
      if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
  food = free[Math.floor(Math.random() * free.length)] || null;
}

function tick() {
  dir = next;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  const grow = food && head.x === food.x && head.y === food.y;
  if (!grow) snake.pop();
  const wall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
  if (wall || snake.some((s) => s.x === head.x && s.y === head.y)) {
    alert("Oyun bitti! Skor: " + score);
    reset();
    return draw();
  }
  snake.unshift(head);
  if (grow) {
    scoreEl.textContent = ++score;
    placeFood();
  }
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (food) {
    ctx.fillStyle = "#e05263";
    ctx.fillRect(food.x * CELL, food.y * CELL, CELL - 1, CELL - 1);
  }
  ctx.fillStyle = "#4ea852";
  snake.forEach((s) => ctx.fillRect(s.x * CELL, s.y * CELL, CELL - 1, CELL - 1));
}

const KEYS = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

document.addEventListener("keydown", (e) => {
  const d = KEYS[e.key];
  if (!d) return;
  e.preventDefault();
  if (d.x === -next.x && d.y === -next.y) return;
  next = d;
});

reset();
draw();
setInterval(tick, 120);
