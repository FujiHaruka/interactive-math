import {
  abs, answerOf, completeSquare, divide, expand, factor, isBareX, isBracket, isOne, isSolved, isZero, lcm, locate,
  membersOf, merge, move, multiply, neg, parseEquation, quadOf, rat, ratText, rootable, sameKind, solve, split,
  splittable, sqrt,
} from './equation.js';

const MODES = {
  linear: {
    tip: 'つまんで動かす ・ 重ねてまとめる ・ タップで割る',
    levels: [
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
      { src: '2(x + 3) = x + 10', guide: true },
      { src: '3(x - 2) = x + 4', tip: 'かっこの中をタップすると開く' },
      { src: '3(x - 2) = 9', guide: true },
      { src: '5 - 2(x - 3) = x', tip: 'かっこの前が − なら、開くと中身の符号が全部裏返る' },
      { src: '4(x + 1) = 2(x + 5)', tip: '両辺を 2 で割ってから開くと数が小さくなる' },
      { src: '1/3x = 4', guide: true },
      { src: '1/6x + 1/2 = 1/3x', tip: '赤い分母をつまんで = に落とすと、両辺に掛けられる' },
      { src: '1/2(x + 4) = 3', tip: '掛けてかっこの外が 1 になると、かっこはそのまま外れる' },
      { src: '1/3(x + 3) = 1/2x + 1', tip: 'つまんだ分母を別の分母に通すと、掛ける数が最小公倍数になる' },
    ],
  },
  quad: {
    tip: 'x² をタップ ・ つまんで動かす ・ 重ねてまとめる',
    levels: [
      { src: 'x² = 9', guide: true },
      { src: 'x² = 7', tip: '√ を使えば、どんな正の数でも答えにできる' },
      { src: '2x² = 32', tip: 'x² の係数が 1 になってから平方根' },
      { src: 'x² - 25 = 0', tip: '数を移項して x² だけにしてから平方根' },
      { src: '9x² = 4' },
      { src: '(x - 1)² = 4', guide: true },
      { src: '(x + 3)² = 5' },
      { src: '(x + 2)(x - 3) = 0', guide: true },
      { src: 'x(x - 5) = 0' },
      { src: 'x² + 5x + 6 = 0', guide: true },
      { src: 'x² - 7x + 12 = 0', tip: '帯がマイナスになったら、かどの面積もマイナスをかけ合わせて考える' },
      { src: 'x² + x - 6 = 0', tip: '右と下で符号が違うと、かどはマイナスになる' },
      { src: 'x² - 4x = 0', tip: '数の項がないなら、かどは 0。帯を片側に寄せたままでいい' },
      { src: 'x² + 6x + 9 = 0', tip: '面積図が正方形になると、解は 1 つだけ（重解）' },
      { src: 'x² - 2x = 15', tip: '因数分解は、片方の辺を 0 にしてから' },
      { src: 'x² + 4x - 1 = 0', guide: true },
      { src: 'x² + 6x = 7', tip: '因数分解でも、正方形の穴埋めでも解ける' },
      { src: '2x² - 4x - 6 = 0' },
      { src: '(x + 1)(x - 3) = 5', tip: '= 0 でない積は分けられない。かっこの中をタップして展開' },
      { src: 'x² + 3x + 1 = 0', tip: '帯が奇数本なら半分ずつ。半端な正方形でも穴は埋められる' },
    ],
  },
};
const MAX_FS = Math.min(44, Math.max(30, window.innerWidth / 9));
const MIN_FS = 15;
const DRAG_THRESHOLD = 8;

const $ = (sel) => document.querySelector(sel);
const boardEl = $('#board');
const lanesEl = $('#lanes');
const coachEl = $('#coach');
const scoreEl = $('#score');
const previewEl = $('#preview');
const sheetEl = $('#sheet');
const levelsEl = $('#levels');
const tokenEl = $('#token');
const areaEl = $('#area');
const areaBoxEl = $('#area-box');
const areaReadEl = $('#area-read');
const areaGoEl = $('#area-go');
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
    multiply: () => { tone(330, 0.1, 'triangle'); tone(495, 0.16, 'triangle', 0.06, 0.12); },
    expand: () => [600, 760, 900].forEach((f, i) => tone(f, 0.07, 'triangle', 0.06, i * 0.05)),
    root: () => [392, 523, 784].forEach((f, i) => tone(f, 0.12, 'sine', 0.06, i * 0.07)),
    split: () => { tone(500, 0.14, 'triangle', 0.06); tone(750, 0.14, 'triangle', 0.05, 0.02); tone(375, 0.18, 'triangle', 0.05, 0.12); },
    tick: () => tone(880, 0.03, 'square', 0.015),
    bad: () => tone(160, 0.14, 'sawtooth', 0.03),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.07, i * 0.09)),
  };
})();

const buzz = (pattern) => navigator.vibrate?.(pattern);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ms = (n) => (reduceMotion.matches ? Math.round(n * 0.3) : n);

let mode = MODES[store.get('im.mode')] ? store.get('im.mode') : 'linear';
let levelIndex = 0;
let stars = {};
let lanes = [];
let history = [];
let moves = 0;
let par = 0;
let busy = false;
let solved = false;
let drag = null;
let area = null;
const chips = new Map();
const laneViews = [];
const orEls = [];

const levels = () => MODES[mode].levels;

function find(id) {
  for (const [lane, state] of lanes.entries()) {
    const found = locate(state, id);
    if (found) return { lane, ...found };
  }
  return null;
}

const X_HTML = '<i class="var">x</i>';
const X2_HTML = `${X_HTML}<sup class="pow">2</sup>`;

const fracHTML = (top, d) => `<span class="frac"><span>${top}</span><span class="den" data-d="${d}">${d}</span></span>`;

function numHTML(r, root) {
  const a = abs(r);
  if (!root) return a.d === 1 ? `${a.n}` : fracHTML(a.n, a.d);
  const top = `${a.n === 1 ? '' : a.n}<span class="surd">√<span class="rad">${root}</span></span>`;
  return a.d === 1 ? top : fracHTML(top, a.d);
}

function bodyHTML(kind, coef, root) {
  const a = abs(coef);
  if (kind === 'c') return numHTML(coef, root);
  if (isBracket({ kind })) return isOne(a) ? '' : numHTML(coef);
  const x = `${a.n === 1 ? '' : a.n}${kind === 'x2' ? X2_HTML : X_HTML}`;
  return a.d === 1 ? x : fracHTML(x, a.d);
}

function valueHTML(kind, coef, root) {
  return `${coef.n < 0 ? '−' : ''}${bodyHTML(kind, coef, root)}`;
}

const surdText = (a, root) => (root ? `${a.n === 1 ? '' : a.n}√${root}${a.d === 1 ? '' : `/${a.d}`}` : ratText(a));

function textOf(item, lead) {
  const a = abs(item.coef);
  const sign = item.coef.n < 0 ? '−' : lead ? '' : '+';
  if (item.kind === 'c') return `${sign}${surdText(a, item.root)}`;
  const coef = isOne(a) ? '' : ratText(a);
  if (item.kind === 'x') return `${sign}${coef}x`;
  if (item.kind === 'x2') return `${sign}${coef}x²`;
  const inner = (terms) => terms.map((t, k) => textOf(t, k === 0)).join('');
  if (item.kind === 'sq') return `${sign}${coef}(${inner(item.terms)})²`;
  if (item.kind === 'prod') return `${sign}${coef}${item.factors.map((f) => (isBareX(f) ? 'x' : `(${inner(f)})`)).join('')}`;
  return `${sign}${coef}(${inner(item.terms)})`;
}

function termText(id) {
  const { term, index } = find(id);
  return textOf(term, index === 0);
}

function paint(el, item, coef = item.coef) {
  el.classList.toggle('neg', coef.n < 0);
  el.querySelector('.op').textContent = coef.n < 0 ? '−' : '+';
  el.querySelector('.body').innerHTML = bodyHTML(item.kind, coef, item.root);
}

const HEAD = '<span class="op"></span><span class="body"></span>';
const PARENS = '<span class="paren">(</span><span class="members"></span><span class="paren">)</span>';

function faceHTML(item) {
  if (item.kind === 'sq') return `<div class="face">${HEAD}${PARENS}<sup class="pow">2</sup></div>`;
  if (item.kind === 'prod') {
    return `<div class="face">${HEAD}${item.factors.map((f) => (isBareX(f) ? '<span class="members"></span>' : PARENS)).join('')}</div>`;
  }
  return `<div class="face">${HEAD}${item.kind === 'group' ? PARENS : ''}</div>`;
}

function chipFor(item) {
  let el = chips.get(item.id);
  if (!el) {
    el = document.createElement('div');
    el.className = isBracket(item) ? `term group ${item.kind}` : 'term';
    el.dataset.id = item.id;
    el.innerHTML = faceHTML(item);
    chips.set(item.id, el);
  }
  el.classList.toggle('kind-x', item.kind === 'x');
  el.classList.toggle('kind-x2', item.kind === 'x2');
  paint(el, item);
  const slots = el.querySelectorAll(':scope > .face > .members');
  const groups = item.kind === 'prod' ? item.factors : item.terms ? [item.terms] : [];
  groups.forEach((terms, i) => slots[i].replaceChildren(...terms.map((t, k) => placeChip(t, k, true))));
  return el;
}

function placeChip(item, index, member = false) {
  const el = chipFor(item);
  el.classList.toggle('lead', index === 0);
  el.classList.toggle('member', member);
  el.classList.remove('lifted', 'target', 'shake');
  el.style.transform = '';
  return el;
}

const itemsOf = (item) => [item, ...membersOf(item)];

function measure() {
  return new Map([...chips].map(([id, el]) => [id, el.getBoundingClientRect()]));
}

const SIDE_HTML = (i) =>
  `<div class="side" data-side="${i}"><div class="stack"><div class="mult"></div><div class="terms"></div><div class="denom"></div></div></div>`;

function laneView(i) {
  while (laneViews.length <= i) {
    const root = document.createElement('div');
    root.className = 'eq';
    root.dataset.lane = laneViews.length;
    root.innerHTML = `${SIDE_HTML(0)}<div class="equals">=</div>${SIDE_HTML(1)}`;
    const sides = [...root.querySelectorAll('.side')];
    laneViews.push({
      root,
      sides,
      terms: sides.map((s) => s.querySelector('.terms')),
      mults: sides.map((s) => s.querySelector('.mult')),
      denoms: sides.map((s) => s.querySelector('.denom')),
      equals: root.querySelector('.equals'),
    });
    const or = document.createElement('p');
    or.className = 'or';
    or.textContent = 'または';
    orEls.push(or);
  }
  return laneViews[i];
}

function syncLanes() {
  const nodes = lanes.flatMap((_, i) => {
    const { root } = laneView(i);
    return i ? [orEls[i], root] : [root];
  });
  const current = [...lanesEl.children];
  if (current.length !== nodes.length || current.some((n, i) => n !== nodes[i])) lanesEl.replaceChildren(...nodes);
  lanesEl.classList.toggle('multi', lanes.length > 1);
}

function fit() {
  const views = lanes.map((_, i) => laneView(i));
  const tall = area ? 30 : (boardEl.clientHeight * 0.62) / (lanes.length * 3.6);
  const max = Math.max(MIN_FS, Math.min(MAX_FS, tall));
  lanesEl.style.setProperty('--fs', `${max}px`);
  const room = views[0].sides[0].clientWidth - max * 0.5;
  const need = Math.max(...views.flatMap((v) => v.terms).map((t) => t.scrollWidth), 1);
  const fs = Math.max(MIN_FS, Math.min(max, (max * room) / need));
  lanesEl.style.setProperty('--fs', `${fs}px`);
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

const carriedByGroup = (el, first) => el.classList.contains('member') && first.has(Number(el.closest('.group').dataset.id));

function render(first = new Map(), pop = new Set()) {
  const live = new Map(lanes.flatMap((s) => s.sides.flat().flatMap(itemsOf)).map((t) => [t.id, t]));
  syncLanes();
  lanes.forEach((state, li) => {
    const view = laneView(li);
    state.sides.forEach((terms, i) => {
      const nodes = terms.map((t, k) => placeChip(t, k));
      if (!nodes.length) {
        const zero = document.createElement('span');
        zero.className = 'zero';
        zero.textContent = '0';
        nodes.push(zero);
      }
      view.terms[i].replaceChildren(...nodes);
    });
    view.root.classList.toggle('done', lanes.length > 1 && isSolved(state));
  });
  for (const id of chips.keys()) if (!live.has(id)) chips.delete(id);
  fit();
  let n = 0;
  for (const [id, item] of live) {
    const el = chips.get(id);
    const before = first.get(id) ?? first.get(item.from);
    delete item.from;
    if (!before) {
      popIn(el, ms(n++ * 60));
      continue;
    }
    if (!carriedByGroup(el, first)) flipFrom(el, before);
    if (pop.has(id)) popIn(el);
  }
}

function say(text, tone = 'say') {
  coachEl.className = `coach ${text ? tone : ''}`;
  coachEl.textContent = text || levels()[levelIndex].tip || MODES[mode].tip;
}

function clearHint() {
  for (const el of chips.values()) el.classList.remove('hint-src', 'hint-dst', 'hint-tap', 'hint-coef');
  lanesEl.querySelectorAll('.hint-den, .hint-eq, .hint-zone').forEach((el) => el.classList.remove('hint-den', 'hint-eq', 'hint-zone'));
  areaEl.classList.remove('hint-handle');
}

const isTopDen = (el) => !el.closest('.member');

function densFor(lane, k) {
  const dens = [...laneView(lane).root.querySelectorAll('.den')].filter((el) => isTopDen(el) && k % Number(el.dataset.d) === 0);
  const exact = dens.find((el) => Number(el.dataset.d) === k);
  if (exact) return [exact];
  const picked = [];
  let acc = 1;
  for (const el of dens.sort((a, b) => b.dataset.d - a.dataset.d)) {
    const next = lcm(acc, Number(el.dataset.d));
    if (next === acc) continue;
    picked.push(el);
    acc = next;
    if (acc === k) break;
  }
  return picked;
}

const numText = (v) => ratText(rat(Math.round(v * 4), 4));
const signed = (v) => `${v < 0 ? '−' : '+'} ${numText(Math.abs(v))}`;

function guideText(lane, step) {
  const areaOpen = area?.id === step.id;
  if (step.type === 'sqrt') {
    const zero = !rootable(lanes[lane], step.id).value.n;
    return `${termText(step.id)} をタップして平方根をとろう${zero ? '（0 の平方根は 0 だけ）' : '（± で 2 つに分かれる）'}`;
  }
  if (step.type === 'split') return `${termText(step.id)} をタップ。掛けて 0 なら、どちらかが 0`;
  if (step.type === 'factor') {
    if (!areaOpen) return 'x² をタップして面積図を開こう（因数分解）';
    const q = area.b - step.p;
    return `● を動かして、右の帯を ${signed(step.p)}、下の帯を ${signed(q)} にしよう`;
  }
  if (step.type === 'complete') {
    if (!areaOpen) return 'x² をタップして面積図を開き、正方形を作ろう（平方完成）';
    return `● を動かして帯を ${signed(area.b / 2)} ずつに分け、正方形にしよう`;
  }
  if (step.type === 'expand') {
    const { kind } = find(step.id).term;
    return `${termText(step.id)} のかっこの中をタップして${kind === 'group' ? '開こう' : '展開しよう'}`;
  }
  if (step.type === 'multiply') {
    const [first, ...rest] = densFor(lane, step.k).map((el) => el.dataset.d);
    const grab = rest.length ? `つまみ、${rest.join(' と ')} の上を通して` : 'つまんで';
    return `赤い分母 ${first} を${grab} = に落とそう（両辺 ×${step.k}）`;
  }
  if (step.type === 'divide') {
    const { kind, coef } = find(step.id).term;
    const where = isBracket({ kind }) ? `かっこの外の ${ratText(coef)}` : termText(step.id);
    return `${where} をタップして、両辺を ${ratText(coef)} で割ろう`;
  }
  if (step.type === 'merge') return `${termText(step.id)} を ${termText(step.target)} に重ねてまとめよう`;
  return `${termText(step.id)} を = の${step.to ? '右' : '左'}へドラッグ（符号が裏返る）`;
}

function nextStep() {
  const lane = lanes.findIndex((s) => !isSolved(s));
  const first = lane < 0 ? null : solve(lanes[lane])?.first;
  return first ? { lane, step: first } : null;
}

function showHint() {
  const next = nextStep();
  if (!next) return;
  clearHint();
  const { lane, step } = next;
  const view = laneView(lane);
  const chip = chips.get(step.id);
  if (step.type === 'factor' || step.type === 'complete') {
    if (area?.id === step.id) areaEl.classList.add('hint-handle');
    else chip.classList.add('hint-tap');
  } else if (step.type === 'divide' && isBracket(find(step.id).term)) chip.classList.add('hint-coef');
  else if (['divide', 'expand', 'sqrt', 'split'].includes(step.type)) chip.classList.add('hint-tap');
  else if (step.type === 'multiply') {
    densFor(lane, step.k).forEach((el) => el.classList.add('hint-den'));
    view.equals.classList.add('hint-eq');
  } else {
    chip.classList.add('hint-src');
    if (step.type === 'merge') chips.get(step.target).classList.add('hint-dst');
    else view.sides[step.to].classList.add('hint-zone');
  }
  say(guideText(lane, step));
}

function updateHud() {
  scoreEl.innerHTML = `手数<b>${moves}</b>目標<b>${par}</b>`;
  $('#undo').disabled = !history.length || busy;
  $('#hint').disabled = solved;
}

function afterChange() {
  clearHint();
  updateHud();
  if (lanes.every(isSolved)) return celebrate();
  if (levels()[levelIndex].guide) showHint();
  else say('');
}

function commit(lane, next, { pop = [], counted = true } = {}) {
  const first = measure();
  if (counted) {
    history.push(lanes);
    moves += 1;
  }
  lanes = [...lanes.slice(0, lane), ...(Array.isArray(next) ? next : [next]), ...lanes.slice(lane + 1)];
  closeArea();
  render(first, new Set(pop));
  afterChange();
}

function centerX(lane) {
  const r = laneView(lane).equals.getBoundingClientRect();
  return r.left + r.width / 2;
}

function sideAt(x) {
  return x < centerX(drag.lane) ? 0 : 1;
}

function findTarget(x, y) {
  const state = lanes[drag.lane];
  const dragged = locate(state, drag.id).term;
  for (const term of state.sides.flat()) {
    if (term.id === drag.id || isBracket(term)) continue;
    const r = chips.get(term.id).getBoundingClientRect();
    if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 16 && y <= r.bottom + 16) {
      return sameKind(term, dragged) ? term.id : null;
    }
  }
  return null;
}

function insertionIndex(lane, side, x, id) {
  return lanes[lane].sides[side].filter((t) => {
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
  const merged = locate(merge(lanes[drag.lane], drag.id, id), id)?.term;
  previewEl.innerHTML = merged ? valueHTML(merged.kind, merged.coef, merged.root) : '0';
  const r = el.getBoundingClientRect();
  const b = boardEl.getBoundingClientRect();
  previewEl.style.left = `${r.left + r.width / 2 - b.left}px`;
  previewEl.style.top = `${r.top - b.top - 14}px`;
  previewEl.classList.add('show');
  buzz(6);
}

function flipSign() {
  const { el, id, home } = drag;
  const term = find(id).term;
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
    paint(el, term, drag.side === home ? term.coef : neg(term.coef));
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
  laneView(drag.lane).root.classList.add('dragging');
  laneView(drag.lane).sides[drag.home].classList.add('over');
  sfx.lift();
  buzz(8);
}

function endDragVisuals() {
  for (const view of laneViews) {
    view.root.classList.remove('dragging', 'scaling', 'armed');
    view.sides.forEach((s) => s.classList.remove('over'));
  }
  previewEl.classList.remove('show');
  tokenEl.classList.remove('show');
  lanesEl.querySelectorAll('.den.taken').forEach((el) => el.classList.remove('taken'));
}

function placeToken(x, y) {
  tokenEl.style.left = `${x}px`;
  tokenEl.style.top = `${y}px`;
}

function startScale(e) {
  drag.started = true;
  drag.scale = { k: Number(drag.den.dataset.d), taken: new Set([drag.den]), armed: false };
  drag.den.classList.add('taken');
  tokenEl.textContent = `×${drag.scale.k}`;
  placeToken(e.clientX, e.clientY);
  tokenEl.classList.add('show');
  laneView(drag.lane).root.classList.add('scaling');
  sfx.lift();
  buzz(8);
}

function overEquals(x, y) {
  const view = laneView(drag.lane);
  const r = view.equals.getBoundingClientRect();
  const b = view.root.getBoundingClientRect();
  return Math.abs(x - (r.left + r.width / 2)) < r.width / 2 + 24 && y > b.top - 24 && y < b.bottom + 24;
}

function moveScale(e) {
  const sc = drag.scale;
  placeToken(e.clientX, e.clientY);
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.den');
  if (hit && laneView(drag.lane).root.contains(hit) && isTopDen(hit) && !sc.taken.has(hit)) {
    sc.taken.add(hit);
    hit.classList.add('taken');
    const k = lcm(sc.k, Number(hit.dataset.d));
    if (k !== sc.k) {
      sc.k = k;
      tokenEl.textContent = `×${k}`;
      tokenEl.animate(
        [{ scale: 1 }, { scale: 1.35 }, { scale: 1 }],
        { duration: ms(260), easing: 'ease-out' },
      );
      sfx.merge();
      buzz([8, 30, 12]);
    }
  }
  const armed = overEquals(e.clientX, e.clientY);
  if (armed === sc.armed) return;
  sc.armed = armed;
  laneView(drag.lane).root.classList.toggle('armed', armed);
  if (armed) buzz(6);
}

function onPointerDown(e) {
  const el = e.target.closest('.term.group') ?? e.target.closest('.term');
  if (!el || busy || drag || solved) return;
  e.preventDefault();
  sfx.wake();
  clearHint();
  el.setPointerCapture(e.pointerId);
  const id = Number(el.dataset.id);
  const { lane, side } = find(id);
  const den = e.target.closest('.den');
  drag = {
    el, id, lane, home: side, side, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, started: false, target: null,
    den: den?.closest('.term') === el ? den : null,
    onCoef: e.target.closest('.op, .body')?.closest('.term') === el,
  };
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const dx = e.clientX - drag.x0;
  const dy = e.clientY - drag.y0;
  if (!drag.started) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (drag.den) startScale(e);
    else startDrag();
  }
  if (drag.scale) return moveScale(e);
  drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
  const side = sideAt(e.clientX);
  if (side !== drag.side) {
    drag.side = side;
    laneView(drag.lane).sides.forEach((s, i) => s.classList.toggle('over', i === side));
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
  if (d.scale) return d.scale.armed && e.type !== 'pointercancel' ? runMultiply(d.lane, d.scale.k) : undefined;
  if (e.type === 'pointercancel') return render(measure());
  if (d.target != null) return dropOnto(d);
  const state = lanes[d.lane];
  const index = insertionIndex(d.lane, d.side, e.clientX, d.id);
  if (d.side !== d.home) {
    sfx.drop();
    buzz(10);
    return commit(d.lane, move(state, d.id, d.side, index));
  }
  if (locate(state, d.id).index === index) return render(measure());
  commit(d.lane, move(state, d.id, d.side, index), { counted: false });
}

function poof(rect) {
  const el = document.createElement('div');
  el.className = 'poof';
  el.textContent = '0';
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height / 2}px`;
  el.style.fontSize = getComputedStyle(lanesEl).fontSize;
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
  const next = merge(lanes[d.lane], d.id, d.target);
  if (!locate(next, d.target)) poof(tr);
  sfx.merge();
  buzz([8, 30, 12]);
  busy = false;
  commit(d.lane, next, { pop: [d.target] });
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function refuse(d, text) {
  shake(d.el.querySelector('.face'));
  sfx.bad();
  buzz(30);
  say(text, 'warn');
}

function tap(d) {
  const state = lanes[d.lane];
  const { term } = find(d.id);
  if (term.kind !== 'c' && !isOne(term.coef) && (!isBracket(term) || d.onCoef)) return runDivide(d.lane, term);
  if (term.kind === 'x2' || term.kind === 'sq') {
    const r = rootable(state, d.id);
    if (r?.value.n < 0) return refuse(d, '2 乗して負になる数はない。この式に答えはない');
    if (r) return runSqrt(d.lane, d.id);
  }
  if (term.kind === 'x2') {
    if (quadOf(state, d.id)) return openArea(d.lane, d.id);
    return refuse(d, 'x² のある辺を「x²・x・数」の 3 つまでにまとめてから');
  }
  if (term.kind === 'prod' && splittable(state, d.id)) return runSplit(d.lane, term);
  if (isBracket(term)) return runExpand(d.lane, term);
  refuse(d, term.kind === 'c' ? '数の項はつまんで動かそう' : 'x の係数はもう 1。割らなくていい');
}

function flyLabel(text, from, to, delay) {
  const el = document.createElement('span');
  el.className = 'fly';
  el.textContent = text;
  el.style.fontSize = `${parseFloat(getComputedStyle(lanesEl).fontSize) * 0.5}px`;
  el.style.left = `${from.left + from.width / 2}px`;
  el.style.top = `${from.top}px`;
  document.body.append(el);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top - from.top;
  return el.animate(
    [
      { transform: 'translate(-50%, -100%) scale(.6)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-100% + ${dy * 0.5 - 18}px)) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-100% + ${dy}px)) scale(.8)`, opacity: 0 },
    ],
    { duration: ms(420), delay, easing: 'ease-in-out', fill: 'backwards' },
  ).finished.then(() => el.remove());
}

async function runExpand(lane, group) {
  busy = true;
  updateHud();
  const el = chips.get(group.id);
  sfx.expand();
  buzz(12);
  if (group.kind === 'group') {
    const body = el.querySelector(':scope > .face > .body');
    const from = (body.childNodes.length ? body : el.querySelector(':scope > .face > .op')).getBoundingClientRect();
    const label = `×${group.coef.n < 0 ? `(${ratText(group.coef)})` : ratText(group.coef)}`;
    await Promise.all(group.terms.map((t, i) => flyLabel(label, from, chips.get(t.id).getBoundingClientRect(), ms(i * 90))));
  } else {
    await el.querySelector('.face').animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.12, .9)' }, { transform: 'scale(.6)', opacity: 0 }],
      { duration: ms(300), easing: 'ease-in', fill: 'forwards' },
    ).finished;
  }
  busy = false;
  commit(lane, expand(lanes[lane], group.id), { pop: group.kind === 'group' ? group.terms.map((t) => t.id) : [] });
}

function overlay(els, html) {
  els.forEach((el) => {
    el.innerHTML = html;
    el.classList.add('show');
  });
}

async function runMultiply(lane, k) {
  busy = true;
  updateHud();
  const { mults } = laneView(lane);
  overlay(mults, `×${k}`);
  sfx.multiply();
  buzz(12);
  await wait(ms(650));
  mults.forEach((el) => el.classList.remove('show'));
  busy = false;
  commit(lane, multiply(lanes[lane], k), { pop: lanes[lane].sides.flat().flatMap(itemsOf).map((t) => t.id) });
}

async function runDivide(lane, div) {
  busy = true;
  updateHud();
  const { denoms } = laneView(lane);
  overlay(denoms, valueHTML('c', div.coef));
  sfx.divide();
  buzz(12);
  await wait(ms(650));
  denoms.forEach((el) => el.classList.remove('show'));
  busy = false;
  commit(lane, divide(lanes[lane], div.id), { pop: lanes[lane].sides.flat().map((t) => t.id) });
}

async function runSqrt(lane, id) {
  busy = true;
  updateHud();
  const { mults } = laneView(lane);
  const next = sqrt(lanes[lane], id);
  overlay(mults, '√');
  sfx.root();
  buzz(12);
  await wait(ms(460));
  if (next.length > 1) {
    const value = next[0].sides.flat().find((t) => t.kind === 'c');
    const el = chips.get(value.id);
    el.classList.remove('neg');
    el.classList.add('pm');
    el.querySelector('.op').textContent = '±';
    el.querySelector('.body').innerHTML = bodyHTML('c', value.coef, value.root);
    popIn(el);
    await wait(ms(560));
    el.classList.remove('pm');
    sfx.split();
    buzz([10, 40, 10]);
  }
  mults.forEach((el) => el.classList.remove('show'));
  busy = false;
  commit(lane, next);
}

async function runSplit(lane, term) {
  busy = true;
  updateHud();
  const face = chips.get(term.id).querySelector(':scope > .face');
  await face.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.08, .92)' }, { transform: 'scaleX(1.18)' }],
    { duration: ms(260), easing: 'ease-in' },
  ).finished;
  sfx.split();
  buzz([10, 40, 10]);
  busy = false;
  commit(lane, split(lanes[lane], term.id));
}

function areaPoint() {
  const p = area.stops[area.i];
  const q = area.b - p;
  const corner = p * q;
  const match = corner === area.c;
  const square = p === q;
  return { p, q, corner, match, square };
}

function areaAction() {
  const { p, q, match, square } = areaPoint();
  if (match && area.zero) return { kind: 'factor', label: `${productText(p, q)} にする` };
  if (square && area.b !== 0) {
    const k = p * p - area.c;
    const label = k > 0 ? `穴を埋める（両辺に + ${numText(k)}）` : k < 0 ? `はみ出しを取る（両辺から − ${numText(-k)}）` : `${productText(p, q)} にする`;
    return { kind: 'complete', label };
  }
  if (match) return { kind: null, label: '形はできた。= 0 にしないと因数分解は使えない' };
  return { kind: null, label: `かどの面積を ${numText(area.c)} にしよう` };
}

const factorText = (v) => (v === 0 ? 'x' : `(x ${signed(v)})`);

function productText(p, q) {
  if (p === q) return `(x ${signed(p)})²`;
  return [p, q].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b)).map(factorText).join('');
}

function polyHTML(b, c, cls) {
  const x = b === 0 ? '' : ` ${b < 0 ? '−' : '+'} ${Math.abs(b) === 1 ? '' : Math.abs(b)}${X_HTML}`;
  return `${X2_HTML}${x} <b class="${cls}">${signed(c)}</b>`;
}

function cornerHTML(p, q, c, style) {
  const n = Math.abs(p * q);
  const neg = p * q < 0 ? ' neg' : '';
  if (!Number.isInteger(p)) return `<div class="cell corner whole${neg}" style="${style}">${numText(p * q)}</div>`;
  const same = c !== 0 && Math.sign(c) === Math.sign(p * q);
  const filled = same ? Math.min(Math.abs(c), n) : 0;
  const tiles = Array.from({ length: n }, (_, k) => `<i class="${k < filled ? 'fill' : 'hole'}"></i>`).join('');
  return `<div class="cell corner${neg}" style="${style};grid-template-columns:repeat(${Math.abs(p)}, 1fr)">${tiles}</div>`;
}

function stripHTML(v, dir, style, room) {
  const text = room >= 26 ? `${v < 0 ? '−' : ''}${Math.abs(v) === 1 ? '' : numText(Math.abs(v))}${X_HTML}` : '';
  return `<div class="cell strip ${dir}${v < 0 ? ' neg' : ''}" style="${style}"><span>${text}</span></div>`;
}

const rect = (l, t, r, b) =>
  `left:${Math.min(l, r)}px;top:${Math.min(t, b)}px;width:${Math.abs(r - l)}px;height:${Math.abs(b - t)}px`;

const AREA_LEFT = 52;
const AREA_TOP = 26;
const AREA_PAD = 14;

function sizeArea() {
  const chrome = [...areaEl.children].reduce((h, el) => h + (el === areaBoxEl || el.classList.contains('area-close') ? 0 : el.offsetHeight), 0) + 34;
  const others = lanesEl.offsetHeight + coachEl.offsetHeight + 36;
  const room = Math.min(areaEl.clientWidth - 24 - AREA_LEFT, boardEl.clientHeight - others - chrome - AREA_TOP);
  const X = Math.round(Math.max(60, Math.min(120, room * 0.5)));
  const fitPos = Math.floor((room - X - AREA_PAD) / area.pos);
  area.X = X;
  area.u = Math.max(4, Math.min(18, fitPos, area.negs ? Math.floor((X - 16) / area.negs) : 18));
}

function renderArea() {
  const { b, c, pos, X, u } = area;
  const { p, q, corner, match, square } = areaPoint();
  const L = AREA_LEFT;
  const T = AREA_TOP;
  const pad = AREA_PAD;
  const x0 = L + X;
  const y0 = T + X;
  const px = x0 + p * u;
  const qy = y0 + q * u;
  areaBoxEl.style.width = `${x0 + pos * u + pad}px`;
  areaBoxEl.style.height = `${y0 + pos * u + pad}px`;
  areaBoxEl.style.setProperty('--u', `${u}px`);
  areaBoxEl.innerHTML = [
    `<div class="cell x2" style="${rect(L, T, x0, y0)}"><span>${X2_HTML}</span></div>`,
    p ? stripHTML(p, 'v', rect(x0, T, px, y0), Math.abs(p) * u) : '',
    q ? stripHTML(q, 'h', rect(L, y0, x0, qy), Math.abs(q) * u + 8) : '',
    p && q ? cornerHTML(p, q, c, rect(x0, y0, px, qy)) : '',
    `<div class="frame" style="${rect(L, T, px, qy)}"></div>`,
    `<span class="dim" style="${rect(L, 0, px, T)}"><span>${p ? `${X_HTML} ${signed(p)}` : X_HTML}</span></span>`,
    `<span class="dim" style="${rect(0, T, L - 6, qy)}"><span>${q ? `${X_HTML} ${signed(q)}` : X_HTML}</span></span>`,
    `<span class="knob" style="left:${px}px;top:${qy}px"></span>`,
  ].join('');
  areaBoxEl.setAttribute('aria-valuenow', String(p));
  areaBoxEl.setAttribute('aria-valuetext', productText(p, q));
  areaEl.classList.toggle('match', match && area.zero);
  areaEl.classList.toggle('square', square);
  areaReadEl.innerHTML =
    `<span class="form">${productText(p, q).replaceAll('x', X_HTML)}</span> = ${polyHTML(b, corner, match ? 'ok' : 'bad')}` +
    `<br><small>この辺 ${polyHTML(b, c, '')}</small>`;
  const act = areaAction();
  areaGoEl.textContent = act.label;
  areaGoEl.disabled = !act.kind;
  areaGoEl.classList.toggle('primary', Boolean(act.kind));
}

function openArea(lane, id) {
  const q = quadOf(lanes[lane], id);
  const half = Math.sqrt(Math.max(q.b * q.b - 4 * q.c, 0)) / 2;
  const lo = Math.floor(Math.min(0, q.b, q.b / 2 - half)) - 1;
  const hi = Math.ceil(Math.max(0, q.b, q.b / 2 + half)) + 1;
  const stops = [];
  for (let p = lo; p <= hi; p++) stops.push(p);
  if (q.b % 2) stops.push(q.b / 2);
  stops.sort((a, b) => a - b);
  const pos = Math.max(1, ...stops.map((p) => Math.max(p, q.b - p)));
  const negs = Math.max(0, ...stops.map((p) => Math.max(-p, p - q.b)));
  closeArea();
  area = { lane, id, ...q, stops, pos, negs, i: stops.indexOf(q.b), grab: null, X: 60, u: 10 };
  chips.get(id).classList.add('picked');
  areaEl.hidden = false;
  boardEl.classList.add('area-open');
  fit();
  renderArea();
  areaEl.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: ms(220), easing: 'ease-out' });
  sfx.lift();
  buzz(8);
  clearHint();
  if (levels()[levelIndex].guide) showHint();
  else say('● を動かすと、x の帯が右と下に分かれる。かどの面積に注目');
  sizeArea();
  renderArea();
  areaBoxEl.focus({ preventScroll: true });
}

function closeArea() {
  if (!area) return;
  chips.get(area.id)?.classList.remove('picked');
  area = null;
  areaEl.hidden = true;
  boardEl.classList.remove('area-open');
  fit();
}

function stepArea(i) {
  const next = Math.max(0, Math.min(area.stops.length - 1, i));
  if (next === area.i) return false;
  area.i = next;
  renderArea();
  areaEl.classList.remove('hint-handle');
  const { kind } = areaAction();
  if (kind === 'factor') {
    sfx.merge();
    buzz([8, 30, 12]);
  } else if (kind) {
    sfx.lift();
    buzz(10);
  } else {
    sfx.tick();
    buzz(4);
  }
  return true;
}

async function applyArea() {
  const act = areaAction();
  if (!act.kind || busy) return;
  const { lane, id } = area;
  const { p } = areaPoint();
  busy = true;
  updateHud();
  sfx.expand();
  await areaBoxEl.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.4 }, { transform: 'scale(.4) translateY(-40%)', opacity: 0 }],
    { duration: ms(380), easing: 'ease-in' },
  ).finished;
  busy = false;
  const state = lanes[lane];
  commit(lane, act.kind === 'factor' ? factor(state, id, p) : completeSquare(state, id));
}

areaBoxEl.addEventListener('pointerdown', (e) => {
  if (!area || busy) return;
  e.preventDefault();
  sfx.wake();
  areaBoxEl.setPointerCapture(e.pointerId);
  area.grab = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, i0: area.i, moved: false };
  areaEl.classList.add('grabbing');
});

areaBoxEl.addEventListener('pointermove', (e) => {
  const g = area?.grab;
  if (!g || e.pointerId !== g.pointerId) return;
  const along = (e.clientX - g.x0 - (e.clientY - g.y0)) / 2;
  if (stepArea(g.i0 + Math.round(along / Math.max(area.u, 8)))) g.moved = true;
});

const releaseArea = (e) => {
  const g = area?.grab;
  if (!g || e.pointerId !== g.pointerId) return;
  area.grab = null;
  areaEl.classList.remove('grabbing');
  if (g.moved && e.type === 'pointerup' && areaAction().kind === 'factor') applyArea();
};
areaBoxEl.addEventListener('pointerup', releaseArea);
areaBoxEl.addEventListener('pointercancel', releaseArea);

areaBoxEl.addEventListener('keydown', (e) => {
  if (!area) return;
  const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  if (delta) {
    e.preventDefault();
    stepArea(area.i + delta);
  } else if (e.key === 'Enter') applyArea();
  else if (e.key === 'Escape') closeArea();
});

areaGoEl.addEventListener('click', applyArea);
$('#area-close').addEventListener('click', () => {
  closeArea();
  afterChange();
});

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

function solutionHTML(terms) {
  if (!terms.length) return '0';
  return terms.map((t, k) => `${k ? (t.coef.n < 0 ? ' − ' : ' + ') : t.coef.n < 0 ? '−' : ''}${bodyHTML('c', t.coef, t.root)}`).join('');
}

const sameRat = (a, b) => a.n === b.n && a.d === b.d;

function answerHTML() {
  const sols = lanes.map(answerOf);
  const x = `${X_HTML} =`;
  if (sols.length === 1) return `${x} ${solutionHTML(sols[0])}${mode === 'quad' ? '<small>（重解）</small>' : ''}`;
  const parts = sols.map((cs) => ({ r: cs.find((t) => !t.root)?.coef ?? rat(0), s: cs.find((t) => t.root) }));
  const [a, b] = parts;
  if (a.s && b.s && a.s.root === b.s.root && sameRat(a.r, b.r) && sameRat(a.s.coef, neg(b.s.coef))) {
    const rest = isZero(a.r) ? '' : `${valueHTML('c', a.r)} `;
    return `${x} ${rest}± ${bodyHTML('c', abs(a.s.coef), a.s.root)}`;
  }
  if (!a.s && !b.s && !isZero(a.r) && sameRat(a.r, neg(b.r))) return `${x} ± ${bodyHTML('c', a.r)}`;
  return `${x} ${sols.map(solutionHTML).join(', ')}`;
}

async function celebrate() {
  solved = true;
  updateHud();
  const earned = starsFor(moves);
  stars = { ...stars, [levelIndex]: Math.max(stars[levelIndex] ?? 0, earned) };
  store.set(`im.${mode}.stars`, stars);
  renderLevels();
  for (const el of chips.values()) el.classList.add('solved');
  say(lanes.length > 1 ? `解けた！ 答えは ${lanes.length} つ` : '解けた！');
  const xEl = [...chips.values()].find((el) => el.classList.contains('kind-x'));
  const r = xEl.getBoundingClientRect();
  await wait(ms(260));
  confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  sfx.win();
  buzz([20, 40, 20, 40, 60]);
  $('#answer').innerHTML = answerHTML();
  const verdict = moves < par ? '目標より短い！' : moves === par ? 'ぴったり目標どおり' : `目標まであと ${moves - par} 手`;
  $('#detail').textContent = `${moves} 手でクリア ・ ${verdict}`;
  $('#next').textContent = levelIndex === levels().length - 1 ? '最初の問題へ' : '次の問題へ';
  const starEls = [...$('#stars').children];
  starEls.forEach((s) => s.classList.remove('on'));
  sheetEl.classList.add('open');
  starEls.slice(0, earned).forEach((s, i) => setTimeout(() => s.classList.add('on'), ms(260 + i * 160)));
}

function renderLevels() {
  levelsEl.replaceChildren(
    ...levels().map((_, i) => {
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
  store.set(`im.${mode}.level`, i);
  closeArea();
  lanes = [parseEquation(levels()[i].src)];
  history = [];
  moves = 0;
  par = solve(lanes[0]).length;
  solved = false;
  busy = false;
  sheetEl.classList.remove('open');
  chips.clear();
  laneViews.forEach((v) => v.terms.forEach((t) => t.replaceChildren()));
  $('#lv').textContent = `Lv.${i + 1}`;
  render();
  renderLevels();
  afterChange();
}

function setMode(next) {
  mode = next;
  store.set('im.mode', mode);
  stars = store.get(`im.${mode}.stars`, {});
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  loadLevel(Math.min(store.get(`im.${mode}.level`, 0), levels().length - 1));
}

function undo() {
  if (!history.length || busy) return;
  const first = measure();
  lanes = history.pop();
  moves -= 1;
  solved = false;
  closeArea();
  sheetEl.classList.remove('open');
  for (const el of chips.values()) el.classList.remove('solved');
  render(first);
  afterChange();
}

lanesEl.addEventListener('pointerdown', onPointerDown);
lanesEl.addEventListener('pointermove', onPointerMove);
lanesEl.addEventListener('pointerup', onPointerUp);
lanesEl.addEventListener('pointercancel', onPointerUp);
$('#undo').addEventListener('click', undo);
$('#hint').addEventListener('click', () => { sfx.wake(); showHint(); });
$('#reset').addEventListener('click', () => loadLevel(levelIndex));
$('#retry').addEventListener('click', () => loadLevel(levelIndex));
$('#next').addEventListener('click', () => loadLevel((levelIndex + 1) % levels().length));
document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => b.dataset.mode !== mode && setMode(b.dataset.mode)));
$('#sound').setAttribute('aria-pressed', String(sfx.enabled));
$('#sound').addEventListener('click', (e) => {
  sfx.wake();
  e.currentTarget.setAttribute('aria-pressed', String(sfx.toggle()));
});
window.addEventListener('resize', () => {
  fit();
  if (!area) return;
  sizeArea();
  renderArea();
});
document.fonts?.ready.then(fit);

setMode(mode);
