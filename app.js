import {
  abs, answerOf, divide, divisor, isOne, isSolved, locate, merge, move, neg, parseEquation, ratText, solve,
} from './equation.js';

const LEVELS = [
  { src: 'x + 3 = 7', guide: true },
  { src: 'x - 5 = 2', guide: true },
  { src: '2x = 8', guide: true },
  { src: '3x + 1 = 10' },
  { src: '12 = 4x - 4', tip: 'x は右辺に集めてもいい' },
  { src: '2x + 3x = 15' },
  { src: '5x - 4 = 3x + 6', tip: '= の向こうの同じ種類の項に直接重ねると、移項とまとめが 1 手でできる' },
  { src: '7 - 2x = x + 1' },
  { src: '4x + 2 - x = 8 + 3' },
  { src: '3x - 7 = 5x + 2', tip: '答えが分数になることもある' },
  { src: '1/2x + 1 = 4', tip: '1/2 で割る ＝ 2 倍する' },
];
const DEFAULT_TIP = 'つまんで動かす ・ 重ねてまとめる ・ x をタップで割る';
const MAX_FS = Math.min(44, Math.max(30, window.innerWidth / 9));
const MIN_FS = 15;
const DRAG_THRESHOLD = 8;

const $ = (sel) => document.querySelector(sel);
const boardEl = $('#board');
const eqEl = $('#eq');
const equalsEl = eqEl.querySelector('.equals');
const sideEls = [...eqEl.querySelectorAll('.side')];
const termsEls = sideEls.map((s) => s.querySelector('.terms'));
const denomEls = sideEls.map((s) => s.querySelector('.denom'));
const coachEl = $('#coach');
const scoreEl = $('#score');
const previewEl = $('#preview');
const sheetEl = $('#sheet');
const levelsEl = $('#levels');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

const sfx = (() => {
  let ctx = null;
  let enabled = store.get('im.sound', true);
  const tone = (freq, dur, type = 'sine', gain = 0.07, delay = 0) => {
    if (!enabled || !ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };
  return {
    get enabled() { return enabled; },
    wake() {
      ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    },
    toggle() {
      enabled = !enabled;
      store.set('im.sound', enabled);
      return enabled;
    },
    lift: () => tone(520, 0.06, 'triangle'),
    flip: () => { tone(760, 0.05, 'square', 0.025); tone(1140, 0.06, 'square', 0.02, 0.04); },
    drop: () => tone(340, 0.08, 'triangle', 0.08),
    merge: () => { tone(660, 0.08); tone(990, 0.12, 'sine', 0.06, 0.06); },
    divide: () => { tone(440, 0.1, 'triangle'); tone(330, 0.16, 'triangle', 0.06, 0.12); },
    bad: () => tone(160, 0.14, 'sawtooth', 0.03),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.09)),
  };
})();

const buzz = (pattern) => navigator.vibrate?.(pattern);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (n) => (reduceMotion.matches ? Math.round(n * 0.3) : n);

let levelIndex = store.get('im.linear.level', 0);
let stars = store.get('im.linear.stars', {});
let state;
let history = [];
let moves = 0;
let par = 0;
let busy = false;
let solved = false;
let drag = null;
const chips = new Map();

function numHTML(r) {
  const a = abs(r);
  return a.d === 1 ? `${a.n}` : `<span class="frac"><span>${a.n}</span><span>${a.d}</span></span>`;
}

function bodyHTML(kind, coef) {
  if (kind === 'c') return numHTML(coef);
  return `${isOne(abs(coef)) ? '' : numHTML(coef)}<i class="var">x</i>`;
}

function valueHTML(kind, coef) {
  return `${coef.n < 0 ? '−' : ''}${bodyHTML(kind, coef)}`;
}

function termText(id) {
  const { term, index } = locate(state, id);
  const a = abs(term.coef);
  const sign = term.coef.n < 0 ? '−' : index === 0 ? '' : '+';
  if (term.kind === 'c') return `${sign}${ratText(a)}`;
  return `${sign}${isOne(a) ? '' : ratText(a)}x`;
}

function paint(el, kind, coef) {
  el.querySelector('.op').textContent = coef.n < 0 ? '−' : '+';
  el.querySelector('.body').innerHTML = bodyHTML(kind, coef);
}

function chipFor(term) {
  let el = chips.get(term.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'term';
    el.dataset.id = term.id;
    el.innerHTML = '<div class="face"><span class="op"></span><span class="body"></span></div>';
    chips.set(term.id, el);
  }
  el.classList.toggle('kind-x', term.kind === 'x');
  paint(el, term.kind, term.coef);
  return el;
}

function measure() {
  return new Map([...chips].map(([id, el]) => [id, el.getBoundingClientRect()]));
}

function fit() {
  eqEl.style.setProperty('--fs', `${MAX_FS}px`);
  const room = sideEls[0].clientWidth - MAX_FS * 0.5;
  const need = Math.max(...termsEls.map((t) => t.scrollWidth), 1);
  const fs = Math.max(MIN_FS, Math.min(MAX_FS, (MAX_FS * room) / need));
  eqEl.style.setProperty('--fs', `${fs}px`);
}

function flipFrom(el, before) {
  const after = el.getBoundingClientRect();
  const dx = before.left - after.left;
  const dy = before.top - after.top;
  const s = before.width / after.width;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) return;
  el.animate(
    [
      { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${s})` },
      { transformOrigin: '0 0', transform: 'none' },
    ],
    { duration: ms(340), easing: 'cubic-bezier(.2, .9, .3, 1.15)' },
  );
}

function popIn(el, delay = 0) {
  el.querySelector('.face').animate(
    [
      { transform: 'scale(.55)', opacity: 0.3 },
      { transform: 'scale(1.16)', offset: 0.6 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: ms(320), delay, easing: 'ease-out', fill: 'backwards' },
  );
}

function render(first = new Map(), pop = new Set()) {
  const live = new Set();
  state.sides.forEach((terms, i) => {
    const nodes = terms.map((t, k) => {
      const el = chipFor(t);
      el.classList.toggle('lead', k === 0);
      el.classList.remove('lifted', 'target', 'shake');
      el.style.transform = '';
      live.add(t.id);
      return el;
    });
    if (!nodes.length) {
      const zero = document.createElement('span');
      zero.className = 'zero';
      zero.textContent = '0';
      nodes.push(zero);
    }
    termsEls[i].replaceChildren(...nodes);
  });
  for (const id of chips.keys()) if (!live.has(id)) chips.delete(id);
  fit();
  let n = 0;
  for (const id of live) {
    const el = chips.get(id);
    const before = first.get(id);
    if (before) flipFrom(el, before);
    if (!before) popIn(el, ms(n++ * 60));
    else if (pop.has(id)) popIn(el);
  }
}

function say(text, tone = 'say') {
  coachEl.className = `coach ${text ? tone : ''}`;
  coachEl.textContent = text || LEVELS[levelIndex].tip || DEFAULT_TIP;
}

function clearHint() {
  for (const el of chips.values()) el.classList.remove('hint-src', 'hint-dst', 'hint-tap');
  sideEls.forEach((s) => s.classList.remove('hint-zone'));
}

function guideText(step) {
  if (step.type === 'divide') {
    return `${termText(step.id)} をタップして、両辺を ${ratText(divisor(state).coef)} で割ろう`;
  }
  if (step.type === 'merge') return `${termText(step.id)} を ${termText(step.target)} に重ねてまとめよう`;
  return `${termText(step.id)} を = の${step.to ? '右' : '左'}へドラッグ（符号が裏返る）`;
}

function showHint() {
  const result = solve(state);
  if (!result?.first) return;
  clearHint();
  const step = result.first;
  if (step.type === 'divide') chips.get(step.id).classList.add('hint-tap');
  else {
    chips.get(step.id).classList.add('hint-src');
    if (step.type === 'merge') chips.get(step.target).classList.add('hint-dst');
    else sideEls[step.to].classList.add('hint-zone');
  }
  say(guideText(step));
}

function updateHud() {
  scoreEl.innerHTML = `手数<b>${moves}</b>目標<b>${par}</b>`;
  $('#undo').disabled = !history.length || busy;
  $('#hint').disabled = solved;
}

function afterChange() {
  clearHint();
  updateHud();
  if (isSolved(state)) return celebrate();
  if (LEVELS[levelIndex].guide) showHint();
  else say('');
}

function commit(next, { pop = [], counted = true } = {}) {
  const first = measure();
  if (counted) {
    history.push(state);
    moves += 1;
  }
  state = next;
  render(first, new Set(pop));
  afterChange();
}

function centerX() {
  const r = equalsEl.getBoundingClientRect();
  return r.left + r.width / 2;
}

function sideAt(x) {
  return x < centerX() ? 0 : 1;
}

function findTarget(x, y) {
  const kind = locate(state, drag.id).term.kind;
  for (const [id, el] of chips) {
    if (id === drag.id) continue;
    const r = el.getBoundingClientRect();
    if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 16 && y <= r.bottom + 16) {
      return locate(state, id).term.kind === kind ? id : null;
    }
  }
  return null;
}

function insertionIndex(side, x, id) {
  return state.sides[side].filter((t) => {
    if (t.id === id) return false;
    const r = chips.get(t.id).getBoundingClientRect();
    return r.left + r.width / 2 < x;
  }).length;
}

function setTarget(id) {
  if (drag.target === id) return;
  if (drag.target != null) chips.get(drag.target)?.classList.remove('target');
  drag.target = id;
  if (id == null) {
    previewEl.classList.remove('show');
    return;
  }
  const el = chips.get(id);
  el.classList.add('target');
  const merged = locate(merge(state, drag.id, id), id)?.term;
  previewEl.innerHTML = merged ? valueHTML(merged.kind, merged.coef) : '0';
  const r = el.getBoundingClientRect();
  const b = boardEl.getBoundingClientRect();
  previewEl.style.left = `${r.left + r.width / 2 - b.left}px`;
  previewEl.style.top = `${r.top - b.top - 14}px`;
  previewEl.classList.add('show');
  buzz(6);
}

function flipSign() {
  const { el, id, home } = drag;
  const term = locate(state, id).term;
  const lifted = 'scale(1.14) rotate(-3deg)';
  el.querySelector('.face').animate(
    [
      { transform: `${lifted} rotateY(0deg)` },
      { transform: `${lifted} rotateY(90deg)` },
      { transform: `${lifted} rotateY(0deg)` },
    ],
    { duration: ms(220), easing: 'ease-in-out' },
  );
  setTimeout(() => {
    if (drag?.el !== el) return;
    paint(el, term.kind, drag.side === home ? term.coef : neg(term.coef));
  }, ms(110));
  boardEl.classList.remove('cross');
  void boardEl.offsetWidth;
  boardEl.classList.add('cross');
  sfx.flip();
  buzz(14);
}

function startDrag() {
  drag.started = true;
  drag.el.getAnimations().forEach((a) => a.cancel());
  drag.el.classList.add('lifted');
  eqEl.classList.add('dragging');
  sideEls[drag.home].classList.add('over');
  sfx.lift();
  buzz(8);
}

function endDragVisuals() {
  eqEl.classList.remove('dragging');
  sideEls.forEach((s) => s.classList.remove('over'));
  previewEl.classList.remove('show');
}

function onPointerDown(e) {
  const el = e.target.closest('.term');
  if (!el || busy || drag || solved) return;
  e.preventDefault();
  sfx.wake();
  clearHint();
  el.setPointerCapture(e.pointerId);
  const id = Number(el.dataset.id);
  const home = locate(state, id).side;
  drag = { el, id, home, side: home, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, target: null };
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.started) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    startDrag();
  }
  drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
  const side = sideAt(e.clientX);
  if (side !== drag.side) {
    drag.side = side;
    sideEls.forEach((s, i) => s.classList.toggle('over', i === side));
    flipSign();
  }
  setTarget(findTarget(e.clientX, e.clientY));
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  endDragVisuals();
  if (!d.started) return tap(d);
  if (e.type === 'pointercancel') return render(measure());
  if (d.target != null) return dropOnto(d);
  const index = insertionIndex(d.side, e.clientX, d.id);
  if (d.side !== d.home) {
    sfx.drop();
    buzz(10);
    return commit(move(state, d.id, d.side, index));
  }
  if (locate(state, d.id).index === index) return render(measure());
  commit(move(state, d.id, d.side, index), { counted: false });
}

function poof(rect) {
  const el = document.createElement('div');
  el.className = 'poof';
  el.textContent = '0';
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.style.fontSize = getComputedStyle(eqEl).fontSize;
  document.body.append(el);
  el.animate(
    [
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0 },
    ],
    { duration: ms(480), easing: 'ease-out' },
  ).finished.then(() => el.remove());
}

async function dropOnto(d) {
  busy = true;
  const targetEl = chips.get(d.target);
  const tr = targetEl.getBoundingClientRect();
  const sr = d.el.getBoundingClientRect();
  const current = d.el.style.transform || 'translate(0px, 0px)';
  const ox = tr.left + tr.width / 2 - (sr.left + sr.width / 2);
  const oy = tr.top + tr.height / 2 - (sr.top + sr.height / 2);
  await d.el.animate(
    [
      { transform: current },
      { transform: `${current} translate(${ox}px, ${oy}px) scale(.35)`, opacity: 0 },
    ],
    { duration: ms(170), easing: 'ease-in', fill: 'forwards' },
  ).finished;
  const next = merge(state, d.id, d.target);
  if (!locate(next, d.target)) poof(tr);
  sfx.merge();
  buzz([8, 30, 12]);
  busy = false;
  commit(next, { pop: [d.target] });
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function tap(d) {
  const term = locate(state, d.id).term;
  const div = divisor(state);
  if (div?.id === d.id) return runDivide(div);
  shake(d.el.querySelector('.face'));
  sfx.bad();
  buzz(30);
  if (term.kind === 'c') return say('数の項はつまんで動かそう', 'warn');
  if (state.sides.flat().filter((t) => t.kind === 'x').length > 1) return say('割れるのは x の項が 1 つにまとまってから', 'warn');
  if (isOne(term.coef)) return say('x はもう 1x。反対側を 1 つにまとめよう', 'warn');
  say('x の項を片側に 1 つだけにしてから割ろう', 'warn');
}

async function runDivide(div) {
  busy = true;
  updateHud();
  denomEls.forEach((el) => {
    el.innerHTML = valueHTML('c', div.coef);
    el.classList.add('show');
  });
  sfx.divide();
  buzz(12);
  await wait(ms(650));
  denomEls.forEach((el) => el.classList.remove('show'));
  busy = false;
  commit(divide(state), { pop: state.sides.flat().map((t) => t.id) });
}

function confetti(origin) {
  if (reduceMotion.matches) return;
  const glyphs = ['+', '−', '×', '÷', '=', 'x'];
  const colors = ['var(--pen)', 'var(--xedge)', 'var(--ok)', 'var(--ink)'];
  for (let i = 0; i < 34; i++) {
    const el = document.createElement('span');
    el.className = 'bit';
    el.textContent = glyphs[i % glyphs.length];
    el.style.color = colors[i % colors.length];
    el.style.left = `${origin.x}px`;
    el.style.top = `${origin.y}px`;
    document.body.append(el);
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 170;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 120;
    const spin = (Math.random() - 0.5) * 720;
    el.animate(
      [
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 1 },
        { transform: `translate(calc(-50% + ${vx * 0.6}px), calc(-50% + ${vy * 0.6}px)) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.4 },
        { transform: `translate(calc(-50% + ${vx}px), calc(-50% + ${vy + 260}px)) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: 1000 + Math.random() * 500, easing: 'cubic-bezier(.2, .6, .4, 1)' },
    ).finished.then(() => el.remove());
  }
}

function starsFor(count) {
  if (count <= par) return 3;
  if (count <= par + 2) return 2;
  return 1;
}

async function celebrate() {
  solved = true;
  updateHud();
  const earned = starsFor(moves);
  stars = { ...stars, [levelIndex]: Math.max(stars[levelIndex] ?? 0, earned) };
  store.set('im.linear.stars', stars);
  renderLevels();
  for (const el of chips.values()) el.classList.add('solved');
  say('解けた！');
  const xEl = [...chips.values()].find((el) => el.classList.contains('kind-x'));
  const r = xEl.getBoundingClientRect();
  await wait(ms(260));
  confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  sfx.win();
  buzz([20, 40, 20, 40, 60]);
  $('#answer').innerHTML = `<i class="var">x</i> = ${valueHTML('c', answerOf(state))}`;
  const verdict = moves < par ? '目標より短い！' : moves === par ? 'ぴったり目標どおり' : `目標まであと ${moves - par} 手`;
  $('#detail').textContent = `${moves} 手でクリア ・ ${verdict}`;
  $('#next').textContent = levelIndex === LEVELS.length - 1 ? '最初の問題へ' : '次の問題へ';
  const starEls = [...$('#stars').children];
  starEls.forEach((s) => s.classList.remove('on'));
  sheetEl.classList.add('open');
  starEls.slice(0, earned).forEach((s, i) => setTimeout(() => s.classList.add('on'), ms(260 + i * 160)));
}

function renderLevels() {
  levelsEl.replaceChildren(
    ...LEVELS.map((_, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = i + 1;
      b.setAttribute('aria-label', `問題 ${i + 1}`);
      if (stars[i]) b.classList.add(`s${stars[i]}`);
      if (i === levelIndex) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => loadLevel(i));
      li.append(b);
      return li;
    }),
  );
}

function loadLevel(i) {
  levelIndex = i;
  store.set('im.linear.level', i);
  state = parseEquation(LEVELS[i].src);
  history = [];
  moves = 0;
  par = solve(state).length;
  solved = false;
  busy = false;
  sheetEl.classList.remove('open');
  chips.clear();
  termsEls.forEach((t) => t.replaceChildren());
  $('#lv').textContent = `Lv.${i + 1}`;
  render();
  renderLevels();
  afterChange();
}

function undo() {
  if (!history.length || busy) return;
  const first = measure();
  state = history.pop();
  moves -= 1;
  solved = false;
  sheetEl.classList.remove('open');
  for (const el of chips.values()) el.classList.remove('solved');
  render(first);
  afterChange();
}

eqEl.addEventListener('pointerdown', onPointerDown);
eqEl.addEventListener('pointermove', onPointerMove);
eqEl.addEventListener('pointerup', onPointerUp);
eqEl.addEventListener('pointercancel', onPointerUp);
$('#undo').addEventListener('click', undo);
$('#hint').addEventListener('click', () => { sfx.wake(); showHint(); });
$('#reset').addEventListener('click', () => loadLevel(levelIndex));
$('#retry').addEventListener('click', () => loadLevel(levelIndex));
$('#next').addEventListener('click', () => loadLevel((levelIndex + 1) % LEVELS.length));
$('#sound').setAttribute('aria-pressed', String(sfx.enabled));
$('#sound').addEventListener('click', (e) => {
  sfx.wake();
  e.currentTarget.setAttribute('aria-pressed', String(sfx.toggle()));
});
window.addEventListener('resize', fit);
document.fonts?.ready.then(fit);

loadLevel(Math.min(levelIndex, LEVELS.length - 1));
