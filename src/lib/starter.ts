export const starterFiles = [
  { path: 'index.html', language: 'html', content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Focus — A little space to do great things</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="focus-app">
    <header>
      <a class="brand" href="#"><span class="brand-mark">f</span> focus.</a>
      <span class="edition">A LITTLE EVERY DAY</span>
    </header>

    <section class="welcome">
      <span class="eyebrow">LESS NOISE. MORE POSSIBILITY.</span>
      <h1>Good things<br>take focus<span>.</span></h1>
      <p>One task. A little time. Your full attention.</p>
    </section>

    <section class="timer-card" aria-label="Focus timer">
      <div class="timer-tabs">
        <button class="active" id="focus-tab">Focus</button>
        <button id="break-tab">Short break</button>
      </div>
      <div class="timer" id="timer" role="timer">25<span>:</span>00</div>
      <p class="timer-label" id="timer-label">Make a little room for your best work.</p>
      <div class="timer-actions">
        <button class="start" id="start">Start focusing <span>↗</span></button>
        <button class="reset" id="reset" aria-label="Reset timer">↺</button>
      </div>
    </section>

    <div class="task"><span class="task-dot"></span><span>Build something that matters.</span><span class="task-tag">TODAY</span></div>
    <footer><span>Your time. Your attention. Your space.</span><span>✳</span></footer>
  </main>
  <script src="app.js"></script>
</body>
</html>
` },
  { path: 'styles.css', language: 'css', content: `:root { color-scheme: light; --ink: #243d36; --accent: #db704c; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f6f2; color: var(--ink); font-family: 'Segoe UI', system-ui, sans-serif; }
button, a { -webkit-tap-highlight-color: transparent; }
button { cursor: pointer; font: inherit; transition: background .2s, transform .2s; }
button:hover { transform: translateY(-2px); }
button:focus-visible, a:focus-visible { outline: 3px solid #dc7957; outline-offset: 4px; }
.focus-app { max-width: 560px; padding: 24px 30px 16px; margin: auto; }
header { display: flex; justify-content: space-between; align-items: center; }
.brand { color: var(--ink); text-decoration: none; font-size: 24px; font-weight: 750; letter-spacing: -1px; display: flex; align-items: center; gap: 8px; }
.brand-mark { background: var(--ink); color: #f4f6f2; width: 26px; height: 28px; border-radius: 8px 8px 8px 2px; display: grid; place-items: center; font-family: Georgia, serif; font-style: italic; font-size: 24px; padding-bottom: 3px; }
.edition { font-size: 7px; letter-spacing: 1.3px; font-weight: 600; opacity: .65; }
.welcome { padding-top: 28px; }
.eyebrow { font-size: 7px; letter-spacing: 1.5px; font-weight: 700; color: #718379; }
h1 { font-size: clamp(38px, 8vw, 46px); line-height: 1.05; letter-spacing: -2px; margin: 12px 0 11px; font-weight: 650; }
h1 span { color: var(--accent); }
.welcome p { font-size: 10px; color: #7b8780; margin-bottom: 21px; }
.timer-card { position: relative; border: 1px solid #dce3d9; border-radius: 12px; padding: 16px 22px 18px; text-align: center; background: radial-gradient(ellipse at 50% 35%, #e7eddf 0%, #eef2e9 65%); overflow: hidden; }
.timer-tabs { display: inline-flex; background: #e2e8dc; border-radius: 6px; padding: 3px; gap: 2px; }
.timer-tabs button { border: 0; background: transparent; color: #7b897c; padding: 6px 14px; border-radius: 4px; font-size: 9px; }
.timer-tabs button.active { color: var(--ink); background: #fcfdf9; box-shadow: 0 1px 4px #263b3610; }
.timer { font-size: clamp(58px, 14vw, 74px); line-height: 1.15; font-weight: 300; letter-spacing: -4px; font-variant-numeric: tabular-nums; margin-top: 8px; }
.timer span { color: #8b9b82; }
.timer-label { font-size: 8px; color: #7b897c; margin: 3px 0 16px; }
.timer-actions { display: flex; gap: 8px; justify-content: center; }
.start { background: var(--ink); color: #fff; border: 0; padding: 11px 18px; border-radius: 6px; font-size: 10px; min-width: 155px; }
.start span { margin-left: 18px; color: #cbd9b9; }
.start:hover { background: #35564b; }
.reset { border: 1px solid #d0dacb; background: transparent; color: #61735f; width: 37px; border-radius: 6px; font-size: 21px; }
.task { margin-top: 12px; display: flex; align-items: center; gap: 9px; padding: 12px 0; border-bottom: 1px solid #e0e6dc; font-size: 9px; }
.task-dot { width: 11px; height: 11px; border: 1px solid #aab8a5; border-radius: 50%; }
.task-tag { margin-left: auto; font-size: 6px; letter-spacing: 1px; color: #87947e; background: #e8ede2; padding: 4px 6px; border-radius: 3px; }
footer { display: flex; justify-content: space-between; align-items: center; font-size: 7px; color: #94a08f; padding-top: 13px; }
footer span:last-child { font-size: 19px; color: #71826a; }
@media (max-width: 380px) { .focus-app { padding: 20px; } .edition { font-size: 6px; } .welcome { padding-top: 22px; } }
@media (max-height: 460px) {
  .focus-app { padding: 18px 25px 10px; }
  .welcome { padding-top: 16px; }
  h1 { font-size: 34px; margin: 9px 0; }
  .welcome p { margin-bottom: 15px; }
  .timer-card { padding: 10px 16px 12px; }
  .timer-tabs button { padding: 5px 12px; }
  .timer { font-size: 58px; margin-top: 5px; }
  .timer-label { margin: 2px 0 10px; }
  .start { padding: 9px 16px; }
  .task { padding: 9px 0; margin-top: 6px; }
  footer { display: none; }
}
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
` },
  { path: 'app.js', language: 'javascript', content: `// A small, distraction-free focus timer.
// Edit this file and watch your preview update.
const timer = document.getElementById('timer');
const startButton = document.getElementById('start');
const resetButton = document.getElementById('reset');
const focusTab = document.getElementById('focus-tab');
const breakTab = document.getElementById('break-tab');
const label = document.getElementById('timer-label');

let total = 25 * 60;
let remaining = total;
let interval = null;

function render() {
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  timer.innerHTML = minutes + '<span>:</span>' + seconds;
  startButton.innerHTML = interval
    ? 'Pause session <span>Ⅱ</span>'
    : remaining < total ? 'Keep going <span>↗</span>'
    : total === 300 ? 'Take a breath <span>↗</span>'
    : 'Start focusing <span>↗</span>';
}

function pause() {
  clearInterval(interval);
  interval = null;
  render();
}

function setMode(minutes) {
  pause();
  total = minutes * 60;
  remaining = total;
  focusTab.classList.toggle('active', minutes === 25);
  breakTab.classList.toggle('active', minutes === 5);
  label.textContent = minutes === 25
    ? 'Make a little room for your best work.'
    : 'Step away. A fresh perspective is waiting.';
  render();
}

startButton.addEventListener('click', () => {
  if (interval) return pause();
  if (remaining === 0) remaining = total;
  interval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    if (remaining === 0) {
      pause();
      label.textContent = 'Nicely done. Take a moment for yourself.';
    }
    render();
  }, 1000);
  render();
});

resetButton.addEventListener('click', () => setMode(total / 60));
focusTab.addEventListener('click', () => setMode(25));
breakTab.addEventListener('click', () => setMode(5));
render();
` },
  { path: 'hello.py', language: 'python', content: `# A little hello from your local machine.\n# Press Ctrl + Enter to run this file.\nfrom datetime import datetime\n\ndef greet(name):\n    return f"Hello, {name}. Let's build something good."\n\nprint(greet("builder"))\nprint("Local time:", datetime.now().strftime("%H:%M"))\nprint("2 + 2 =", 2 + 2)\n` },
  { path: 'README.md', language: 'markdown', content: `# Welcome to your little workspace\n\nThis is **Focus**, a tiny, working timer made with HTML, CSS, and JavaScript.\n\n## Make it yours\n\n- Edit \`index.html\`, \`styles.css\`, or \`app.js\`.\n- Your preview updates automatically after a short pause.\n- Use the Timer or Console tabs to inspect your running app.\n- Open \`hello.py\` and press **Ctrl + Enter** to run Python.\n- Connect llama.cpp in **Models** to chat with a local model.\n\n## Your workspace\n\nFiles and conversations are saved in your local PostgreSQL database.\nUse **Export ZIP** to take a copy of your project anywhere.\n\n## A note on execution\n\nJavaScript and Python run on the machine hosting Forge, not in a security sandbox.\nOnly run code you trust. Agent file changes and execution require your approval by default.\n\nHappy building.\n` },
];
