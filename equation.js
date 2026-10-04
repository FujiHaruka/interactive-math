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

const BRACKETS = new Set(['group', 'sq', 'prod']);
export const isBracket = (t) => BRACKETS.has(t.kind);
export const membersOf = (t) => (t.kind === 'prod' ? t.factors.flat() : (t.terms ?? []));
export const isBareX = (terms) => terms.length === 1 && terms[0].kind === 'x' && isOne(terms[0].coef);
export const sameKind = (a, b) => a.kind === b.kind && (a.root ?? 1) === (b.root ?? 1);

const xTerm = () => ({ id: nextId++, kind: 'x', coef: rat(1) });
const constant = (coef, root = 1, id = nextId++) => (root > 1 ? { id, kind: 'c', coef, root } : { id, kind: 'c', coef });
const bracket = (p) => (isZero(p) ? [xTerm()] : [xTerm(), constant(p)]);

const unwrap = (items) => items.flatMap((t) => (t.kind === 'group' && isOne(t.coef) ? t.terms : [t]));
const normalized = (sides) => ({ sides: sides.map(unwrap) });

function parseSide(src) {
  const s = src.replace(/\s+/g, '');
  const re = /([+-]?)(\d+(?:\/\d+)?)?(x²|x|\()?/y;
  const items = [];
  while (re.lastIndex < s.length) {
    const m = re.exec(s);
    if (!m || (!m[2] && !m[3])) throw new Error(`cannot parse "${src}"`);
    const [n, d = '1'] = (m[2] ?? '1').split('/');
    const coef = rat((m[1] === '-' ? -1 : 1) * Number(n), Number(d));
    if (!m[3] || m[3] === 'x²' || (m[3] === 'x' && s[re.lastIndex] !== '(')) {
      items.push({ id: nextId++, kind: { x: 'x', 'x²': 'x2' }[m[3]] ?? 'c', coef });
      continue;
    }
    const factors = m[3] === 'x' ? [[xTerm()]] : [];
    if (m[3] === '(') re.lastIndex -= 1;
    while (s[re.lastIndex] === '(') {
      const close = s.indexOf(')', re.lastIndex);
      if (close < 0) throw new Error(`unclosed "(" in "${src}"`);
      factors.push(parseSide(s.slice(re.lastIndex + 1, close)));
      re.lastIndex = close + 1;
    }
    if (s[re.lastIndex] === '²') {
      re.lastIndex += 1;
      items.push({ id: nextId++, kind: 'sq', coef, terms: factors[0] });
    } else if (factors.length === 1) {
      items.push({ id: nextId++, kind: 'group', coef, terms: factors[0] });
    } else {
      items.push({ id: nextId++, kind: 'prod', coef, factors });
    }
  }
  return items;
}

export function parseEquation(src) {
  const [left, right] = src.split('=');
  return { sides: [left, right].map((s) => parseSide(s).filter((t) => !isZero(t.coef))) };
}

export function locate(state, id) {
  for (const [side, terms] of state.sides.entries()) {
    const index = terms.findIndex((t) => t.id === id);
    if (index >= 0) return { side, index, term: terms[index] };
  }
  return null;
}

const withSide = (side, terms, other) => {
  const sides = [];
  sides[side] = terms;
  sides[1 - side] = other;
  return normalized(sides);
};

export function move(state, id, toSide, index) {
  const { side, index: from, term } = locate(state, id);
  const sides = state.sides.map((s) => s.slice());
  sides[side].splice(from, 1);
  const moved = side === toSide ? term : { ...term, coef: neg(term.coef) };
  sides[toSide].splice(index ?? sides[toSide].length, 0, moved);
  return normalized(sides);
}

export function merge(state, srcId, dstId) {
  const src = locate(state, srcId);
  const dst = locate(state, dstId);
  if (!src || !dst || srcId === dstId || !sameKind(src.term, dst.term) || isBracket(src.term)) return null;
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

export const divisors = (state) =>
  state.sides.flat().filter((t) => t.kind !== 'c' && !isOne(t.coef)).map((t) => ({ id: t.id, coef: t.coef }));

export function divide(state, id) {
  const d = divisors(state).find((c) => c.id === id);
  if (!d) return null;
  return normalized(state.sides.map((terms) => terms.map((t) => ({ ...t, coef: quotient(t.coef, d.coef) }))));
}

const DEGREE = { c: 0, x: 1, x2: 2 };
const KINDS = ['c', 'x', 'x2'];

const polyOf = (terms) =>
  terms.reduce((p, t) => p.map((v, k) => (k === DEGREE[t.kind] ? add(v, t.coef) : v)), [rat(0), rat(0), rat(0)]);

const polyMul = (a, b) =>
  [0, 1, 2].map((k) => a.reduce((sum, v, i) => (k - i >= 0 && k - i < b.length ? add(sum, mul(v, b[k - i])) : sum), rat(0)));

const polyTerms = (poly) =>
  [2, 1, 0].filter((k) => !isZero(poly[k])).map((k) => ({ id: nextId++, kind: KINDS[k], coef: poly[k] }));

function expanded(term) {
  if (term.kind === 'group') return term.terms.map((t) => ({ ...t, coef: mul(t.coef, term.coef) }));
  const [a, b] = term.kind === 'sq' ? [term.terms, term.terms] : term.factors;
  return polyTerms(polyMul(polyOf(a), polyOf(b)).map((v) => mul(v, term.coef)));
}

export function expand(state, id) {
  const found = locate(state, id);
  if (!found || !isBracket(found.term)) return null;
  const { side, index, term } = found;
  const sides = state.sides.map((s) => s.slice());
  sides[side].splice(index, 1, ...expanded(term));
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

export function sqrtOf(r) {
  let m = r.n * r.d;
  let s = 1;
  for (let f = 2; f * f <= m; f++) {
    while (m % (f * f) === 0) {
      m /= f * f;
      s *= f;
    }
  }
  return { coef: rat(s, r.d), root: m };
}

export function rootable(state, id) {
  const found = locate(state, id);
  if (!found) return null;
  const { side, term } = found;
  if ((term.kind !== 'x2' && term.kind !== 'sq') || !isOne(term.coef) || state.sides[side].length !== 1) return null;
  const other = state.sides[1 - side];
  if (other.length > 1 || other.some((t) => t.kind !== 'c' || t.root)) return null;
  return { side, term, value: other[0]?.coef ?? rat(0) };
}

export function sqrt(state, id) {
  const r = rootable(state, id);
  if (!r || r.value.n < 0) return null;
  const { side, term } = r;
  const base = term.kind === 'x2' ? [{ id: term.id, kind: 'x', coef: rat(1) }] : term.terms;
  if (isZero(r.value)) return [withSide(side, base, [])];
  const { coef, root } = sqrtOf(r.value);
  const valueId = state.sides[1 - side][0].id;
  return [
    withSide(side, base, [constant(coef, root, valueId)]),
    withSide(
      side,
      base.map((t) => ({ ...t, id: nextId++, from: t.id })),
      [{ ...constant(neg(coef), root), from: valueId }],
    ),
  ];
}

export function splittable(state, id) {
  const found = locate(state, id);
  return found?.term.kind === 'prod' && state.sides[found.side].length === 1 && !state.sides[1 - found.side].length;
}

export function split(state, id) {
  if (!splittable(state, id)) return null;
  const { side, term } = locate(state, id);
  return term.factors.map((f) => withSide(side, f, []));
}

export function quadOf(state, id) {
  const found = locate(state, id);
  if (found?.term.kind !== 'x2' || !isOne(found.term.coef)) return null;
  const items = state.sides[found.side];
  const of = (kind) => items.filter((t) => t.kind === kind);
  if (of('x').length > 1 || of('c').length > 1 || of('x2').length > 1 || items.some((t) => isBracket(t) || t.root)) return null;
  const b = of('x')[0]?.coef ?? rat(0);
  const c = of('c')[0]?.coef ?? rat(0);
  if (b.d !== 1 || c.d !== 1) return null;
  return { side: found.side, b: b.n, c: c.n, zero: !state.sides[1 - found.side].length };
}

const replaceSide = (state, side, items) => ({ sides: state.sides.map((s, i) => (i === side ? items : s.slice())) });

export function factor(state, id, p) {
  const q = quadOf(state, id);
  if (!q?.zero || (q.b === 0 && q.c === 0)) return null;
  const r = q.b - p;
  if (p * r !== q.c) return null;
  if (p === r) return replaceSide(state, q.side, [{ id: nextId++, kind: 'sq', coef: rat(1), terms: bracket(rat(p)) }]);
  const order = [p, r].sort((a, b) => (a === 0 ? -1 : b === 0 ? 1 : a - b));
  return replaceSide(state, q.side, [{ id: nextId++, kind: 'prod', coef: rat(1), factors: order.map((v) => bracket(rat(v))) }]);
}

export function factorPoint(state, id) {
  const q = quadOf(state, id);
  if (!q?.zero || (q.b === 0 && q.c === 0)) return null;
  const disc = q.b * q.b - 4 * q.c;
  const s = Math.round(Math.sqrt(Math.max(disc, 0)));
  return disc >= 0 && s * s === disc ? (q.b - s) / 2 : null;
}

export function completeSquare(state, id) {
  const q = quadOf(state, id);
  if (!q || q.b === 0) return null;
  const p = rat(q.b, 2);
  const k = add(mul(p, p), rat(-q.c));
  const next = replaceSide(state, q.side, [{ id: nextId++, kind: 'sq', coef: rat(1), terms: bracket(p) }]);
  if (isZero(k)) return next;
  const other = next.sides[1 - q.side];
  const at = other.findIndex((t) => t.kind === 'c' && !t.root);
  if (at < 0) other.push(constant(k));
  else if (isZero(add(other[at].coef, k))) other.splice(at, 1);
  else other[at] = { ...other[at], coef: add(other[at].coef, k) };
  return next;
}

export function isSolved(state) {
  return state.sides.some((terms, side) => {
    const other = state.sides[1 - side];
    return (
      terms.length === 1 &&
      terms[0].kind === 'x' &&
      isOne(terms[0].coef) &&
      other.every((t) => t.kind === 'c') &&
      new Set(other.map((t) => t.root ?? 1)).size === other.length
    );
  });
}

export const answerOf = (state) => state.sides.flat().filter((t) => t.kind === 'c');

function successors(state, shortcut) {
  const splits = [];
  const forms = [];
  const expands = [];
  const merges = [];
  const moves = [];
  state.sides.forEach((items, si) => {
    for (const t of [...items].reverse()) {
      moves.push([{ type: 'move', id: t.id, to: 1 - si }, move(state, t.id, 1 - si)]);
      const roots = sqrt(state, t.id);
      if (roots) splits.push([{ type: 'sqrt', id: t.id }, roots]);
      if (splittable(state, t.id)) splits.push([{ type: 'split', id: t.id }, split(state, t.id)]);
      const p = factorPoint(state, t.id);
      if (p != null) forms.push([{ type: 'factor', id: t.id, p }, factor(state, t.id, p)]);
      const square = completeSquare(state, t.id);
      if (square) forms.push([{ type: 'complete', id: t.id }, square]);
      if (isBracket(t)) {
        expands.push([{ type: 'expand', id: t.id }, expand(state, t.id)]);
        continue;
      }
      state.sides.forEach((others, sj) => {
        if (sj !== si && !shortcut) return;
        for (const u of others) {
          if (u.id !== t.id && sameKind(u, t)) merges.push([{ type: 'merge', id: t.id, target: u.id }, merge(state, t.id, u.id)]);
        }
      });
    }
  });
  const multiplies = multipliers(state).map((k) => [{ type: 'multiply', k }, multiply(state, k)]);
  const divides = divisors(state).map((d) => [{ type: 'divide', id: d.id }, divide(state, d.id)]);
  return [...splits, ...forms, ...expands, ...merges, ...multiplies, ...moves, ...divides];
}

const itemKey = (t) => {
  const head = `${t.kind}${t.coef.n}/${t.coef.d}${t.root ? `r${t.root}` : ''}`;
  if (t.kind === 'prod') return `${head}${t.factors.map((f) => `(${f.map(itemKey).join(',')})`).join('')}`;
  return t.terms ? `${head}(${t.terms.map(itemKey).join(',')})` : head;
};
const keyOf = (state) => state.sides.map((items) => items.map(itemKey).sort().join(',')).join('=');

const laneCost = new Map();

function costOf(state, options) {
  const key = `${options.shortcut}|${keyOf(state)}`;
  if (!laneCost.has(key)) laneCost.set(key, solve(state, options)?.length ?? null);
  return laneCost.get(key);
}

export function solve(state, { shortcut = false, maxDepth = 14 } = {}) {
  if (isSolved(state)) return { length: 0, first: null };
  const seen = new Set([keyOf(state)]);
  let frontier = [{ state, first: null }];
  let best = null;
  for (let depth = 1; depth <= maxDepth && frontier.length && !(best && best.length <= depth); depth++) {
    const next = [];
    for (const node of frontier) {
      for (const [step, s] of successors(node.state, shortcut)) {
        const first = node.first ?? step;
        const offer = (length) => {
          if (!best || length < best.length) best = { length, first };
        };
        if (Array.isArray(s)) {
          const costs = s.map((lane) => costOf(lane, { shortcut, maxDepth }));
          if (costs.every((c) => c != null)) offer(depth + costs.reduce((a, c) => a + c, 0));
          continue;
        }
        const key = keyOf(s);
        if (seen.has(key)) continue;
        seen.add(key);
        if (isSolved(s)) offer(depth);
        else next.push({ state: s, first });
      }
    }
    frontier = next;
  }
  return best;
}
