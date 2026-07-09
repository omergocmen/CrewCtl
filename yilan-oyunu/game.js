const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const GRID = 20, CELLS = canvas.width / GRID;
const DIRS = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
const rnd = () => Math.floor(Math.random() * CELLS);
let snake, dir, nextDir, food, score, gameOver;

function placeFood() {
    do { food = { x: rnd(), y: rnd() }; } while (snake.some(s => s.x === food.x && s.y === food.y));
}

function reset() {
    snake = [{ x: 10, y: 10 }]; dir = nextDir = { x: 1, y: 0 };
    score = 0; gameOver = false; scoreEl.textContent = 'Skor: 0';
    placeFood(); draw();
}

function update() {
    if (gameOver) return;
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const eating = head.x === food.x && head.y === food.y;
    // Yem yenmiyorsa kuyruk bu tikte boşalır; oraya girmek çarpışma sayılmaz.
    const body = eating ? snake : snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS || body.some(s => s.x === head.x && s.y === head.y)) {
        gameOver = true;
    } else {
        snake = [head, ...body];
        if (eating) {
            scoreEl.textContent = 'Skor: ' + ++score;
            if (snake.length === CELLS * CELLS) gameOver = true; else placeFood();
        }
    }
    draw();
}

function cell(p, color) { ctx.fillStyle = color; ctx.fillRect(p.x * GRID, p.y * GRID, GRID - 1, GRID - 1); }

function draw() {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    cell(food, '#e53935');
    snake.forEach(s => cell(s, '#4caf50'));
    if (!gameOver) return;
    ctx.fillStyle = '#fff'; ctx.font = '26px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('Oyun Bitti', canvas.width / 2, canvas.height / 2);
}

document.addEventListener('keydown', e => {
    if (e.key === ' ' && gameOver) return reset();
    const next = DIRS[e.key];
    // 180° dönüş yasak: yılan tek tikte kendi boynuna çarpardı.
    if (next && (next.x !== -dir.x || next.y !== -dir.y)) nextDir = next;
});

reset();
setInterval(update, 120);
