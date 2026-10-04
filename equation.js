const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export const rat = (n, d = 1) => {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return { n: n / g + 0, d: d / g };
};
export const lcm = (a, b) => (a * b) / gcd(a, b);

export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const neg = (a) => rat(-a.n, a.d);
export const abs = (a) => rat(Math.abs(a.n), a.d);
export const quotient = (a, b) => rat(a.n * b.d, a.d * b.n);
export const isZero = (a) => a.n === 0;
export const isOne = (a) => a.n === 1 && a.d === 1;
export const ratText = (a) => `${a.n < 0 ? '−' : ''}${Math.abs(a.n)}${a.d === 1 ? '' : `/${a.d}`}`;

let nextId = 1;

const unwrap = (items) => items.flatMap((t) => (t.kind === 'group' && isOne(t.coef) ? t.terms : [t]));
const normalized = (sides) => ({ sides: sides.map(unwrap) });

function parseSide(src) {
  const s = src.replace(/\s+/g, '');
  const re = /([+-]?)(\d+(?:\/\d+)?)?(x|\()?/y;
  const items = [];
  while (re.lastIndex < s.length) {
    const m = re.exec(s);
    if (!m || (!m[2] && !m[3])) throw new Error(`cannot parse "${src}"`);
    const [n, d = '1'] = (m[2] ?? '1').split('/');
    const coef = rat((m[1] === '-' ? -1 : 1) * Number(n), Number(d));
    if (m[3] !== '(') {
      items.push({ id: nextId++, kind: m[3] ? 'x' : 'c', coef });
      continue;
    }
    const close = s.indexOf(')', re.lastIndex);
    if (close < 0) throw new Error(`unclosed "(" in "${src}"`);
    items.push({ id: nextId++, kind: 'group', coef, terms: parseSide(s.slice(re.lastIndex, close)) });
    re.lastIndex = close + 1;
  }
  return items;
}

export function parseEquation(src) {
  const [left, right] = src.split('=');
  return { sides: [parseSide(left), parseSide(right)] };
}

export function locate(state, id) {
  for (const [side, terms] of state.sides.entries()) {
    const index = terms.findIndex((t) => t.id === id);
    if (index >= 0) return { side, index, term: terms[index] };
  }
  return null;
}

export function move(state, id, toSide, index) {
  const { side, index: from, term } = locate(state, id);
  const sides = state.sides.map((s) => s.slice());
  sides[side].splice(from, 1);
  const moved = side === toSide ? term : { ...term, coef: neg(term.coef) };
  sides[toSide].splice(index ?? sides[toSide].length, 0, moved);
  return normalized(sides);
}

export const hasX = (item) => item.kind === 'x' || (item.kind === 'group' && item.terms.some(hasX));

export function merge(state, srcId, dstId) {
  const src = locate(state, srcId);
  const dst = locate(state, dstId);
  if (!src || !dst || srcId === dstId || src.term.kind !== dst.term.kind || src.term.kind === 'group') return null;
  const delta = src.side === dst.side ? src.term.coef : neg(src.term.coef);
  const coef = add(dst.term.coef, delta);
  const sides = state.sides.map((terms) =>
    terms
      .filter((t) => t.id !== srcId)
      .map((t) => (t.id === dstId ? { ...t, coef } : t))
      .filter((t) => !isZero(t.coef)),
  );
  return { sides };
}

export function divisor(state) {
  for (const [side, terms] of state.sides.entries()) {
    const other = state.sides[1 - side];
    if (terms.length !== 1 || terms[0].kind !== 'x') continue;
    if (other.some(hasX) || isOne(terms[0].coef)) continue;
    return { side, id: terms[0].id, coef: terms[0].coef };
  }
  return null;
}

export function divide(state) {
  const d = divisor(state);
  if (!d) return null;
  return normalized(state.sides.map((terms) => terms.map((t) => ({ ...t, coef: quotient(t.coef, d.coef) }))));
}

export function expand(state, id) {
  const found = locate(state, id);
  if (found?.term.kind !== 'group') return null;
  const { side, index, term } = found;
  const sides = state.sides.map((s) => s.slice());
  sides[side].splice(index, 1, ...term.terms.map((t) => ({ ...t, coef: mul(t.coef, term.coef) })));
  return { sides };
}

export const denominators = (state) => [...new Set(state.sides.flat().map((t) => t.coef.d).filter((d) => d > 1))];

export function multipliers(state) {
  let ks = [];
  for (const d of denominators(state)) ks = [...new Set([...ks, d, ...ks.map((k) => lcm(k, d))])];
  return ks;
}

export function multiply(state, k) {
  return normalized(state.sides.map((items) => items.map((t) => ({ ...t, coef: mul(t.coef, rat(k)) }))));
}

export function isSolved(state) {
  return state.sides.some((terms, side) => {
    const other = state.sides[1 - side];
    return (
      terms.length === 1 &&
      terms[0].kind === 'x' &&
      isOne(terms[0].coef) &&
      other.length <= 1 &&
      other.every((t) => t.kind === 'c')
    );
  });
}

export function answerOf(state) {
  const constant = state.sides.flat().find((t) => t.kind === 'c');
  return constant ? constant.coef : rat(0);
}

function successors(state, shortcut) {
  const expands = [];
  const merges = [];
  const moves = [];
  state.sides.forEach((items, si) => {
    for (const t of [...items].reverse()) {
      moves.push([{ type: 'move', id: t.id, to: 1 - si }, move(state, t.id, 1 - si)]);
      if (t.kind === 'group') {
        expands.push([{ type: 'expand', id: t.id }, expand(state, t.id)]);
        continue;
      }
      state.sides.forEach((others, sj) => {
        if (sj !== si && !shortcut) return;
        for (const u of others) {
          if (u.id !== t.id && u.kind === t.kind) merges.push([{ type: 'merge', id: t.id, target: u.id }, merge(state, t.id, u.id)]);
        }
      });
    }
  });
  const multiplies = multipliers(state).map((k) => [{ type: 'multiply', k }, multiply(state, k)]);
  const d = divisor(state);
  const divides = d ? [[{ type: 'divide', id: d.id }, divide(state)]] : [];
  return [...expands, ...merges, ...multiplies, ...divides, ...moves];
}

const itemKey = (t) =>
  `${t.kind}${t.coef.n}/${t.coef.d}${t.kind === 'group' ? `(${t.terms.map(itemKey).join(',')})` : ''}`;
const keyOf = (state) => state.sides.map((items) => items.map(itemKey).sort().join(',')).join('=');

export function solve(state, { shortcut = false, maxDepth = 14 } = {}) {
  if (isSolved(state)) return { length: 0, first: null };
  const seen = new Set([keyOf(state)]);
  let frontier = [{ state, first: null }];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next = [];
    for (const node of frontier) {
      for (const [step, s] of successors(node.state, shortcut)) {
        const key = keyOf(s);
        if (seen.has(key)) continue;
        seen.add(key);
        const first = node.first ?? step;
        if (isSolved(s)) return { length: depth, first };
        next.push({ state: s, first });
      }
    }
    frontier = next;
  }
  return null;
}
