'use strict';

// 윷놀이: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 윷 네 개를 던져 평평한 면(배)이 몇 개 나오느냐로 정한다: 1개 도(1칸) · 2개 개(2칸) · 3개 걸(3칸) · 4개 윷(4칸) · 0개 모(5칸)
// - 윷이나 모가 나오거나 상대 말을 잡으면 한 번 더 던진다. 던진 결과는 쌓아 두었다가 원하는 말에 하나씩 쓴다
// - 판: 바깥 길 20칸 + 지름길. 모서리(5번, 10번)에 멈췄다가 다음에 움직이면 지름길로 질러가고, 가운데(22번)에서는 곧장 이어진다
// - 도착점(출발점)을 지나치면 완주. 내 말 4개를 먼저 모두 완주시키면 이긴다
// - 상대 말이 있는 칸에 멈추면 그 말을 모두 잡아 대기로 돌려보내고, 내 말이 있는 칸에 멈추면 업어서 함께 움직인다
// - 백도(뒤로 한 칸)는 넣지 않았다
//
// 칸 번호: 바깥 길 1~19 (0은 출발·도착), 5→20→21→22→23→24→15 와 10→25→26→22→27→28→도착이 지름길
const LOGIC_YUT = (() => {
const FLAT = 0.55;                                    // 윷 한 개가 평평한 면으로 나올 확률
const WAIT = -1, DONE = 99;
const NAMES = { 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' };

function rng(seed) {                                  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 평평한 면의 개수 → 칸 수 (0개는 모)
const stepsOfFlats = (n) => (n === 0 ? 5 : n);

// 윷 던지기: flats 는 네 개 각각 평평한 면이 나왔는지. forceFlats 는 시험용
function throwSticks(rand, forceFlats) {
  const flats = [0, 1, 2, 3].map((i) => (forceFlats == null ? rand() < FLAT : i < forceFlats));
  const steps = stepsOfFlats(flats.filter(Boolean).length);
  return { flats, steps, name: NAMES[steps], extra: steps >= 4 };
}

// 칸 수별 나올 확률 (컴퓨터가 위험을 가늠할 때 쓴다)
const CHANCE = (() => {
  const p = FLAT, q = 1 - FLAT;
  return { 1: 4 * p * q ** 3, 2: 6 * p * p * q * q, 3: 4 * p ** 3 * q, 4: p ** 4, 5: q ** 4 };
})();

// 한 칸 가기. first 는 이번 이동의 첫걸음인지 (모서리에서 출발할 때만 지름길로 들어간다). done 이면 완주
function stepOnce(pos, via, first) {
  if (pos === WAIT) return { pos: 1, via: null };
  if (pos >= 1 && pos <= 19) {
    if (first && pos === 5) return { pos: 20, via: 'A' };
    if (first && pos === 10) return { pos: 25, via: 'B' };
    if (pos === 19) return { done: true };
    return { pos: pos + 1, via: null };
  }
  switch (pos) {
    case 20: return { pos: 21, via: 'A' };
    case 21: return { pos: 22, via: 'A' };
    case 22: return via === 'A' ? { pos: 23, via: 'A' } : { pos: 27, via: 'B' };
    case 23: return { pos: 24, via: 'A' };
    case 24: return { pos: 15, via: null };
    case 25: return { pos: 26, via: 'B' };
    case 26: return { pos: 22, via: 'B' };
    case 27: return { pos: 28, via: 'B' };
    default: return { done: true };                   // 28
  }
}

// steps 칸 가기: { pos, via, done, path } (path 는 거쳐 간 칸, 완주하면 마지막은 'done')
function advance(pos, via, steps) {
  let p = pos, v = via;
  const path = [];
  for (let i = 0; i < steps; i++) {
    const s = stepOnce(p, v, i === 0);
    if (s.done) { path.push('done'); return { done: true, pos: DONE, via: null, path }; }
    p = s.pos; v = s.via; path.push(p);
  }
  return { done: false, pos: p, via: v, path };
}

// 도착까지 남은 걸음 수 (모서리에 서게 되면 지름길을 탄다고 보고 센다. 컴퓨터가 고를 때만 쓰는 어림값)
function remaining(pos, via) {
  let p = pos, v = via, n = 0;
  for (;;) {
    const s = stepOnce(p, v, true);
    n++;
    if (s.done) return n;
    p = s.pos; v = s.via;
  }
}

function newGame(opts = {}) {
  const perSide = opts.pieces || 4;
  const seed = opts.seed == null ? (Math.random() * 2 ** 31) | 0 : opts.seed;
  const pieces = [];
  for (let owner = 0; owner < 2; owner++) for (let i = 0; i < perSide; i++) pieces.push({ id: owner * perSide + i, owner, pos: WAIT, via: null });
  return {
    seed, rand: rng(seed), perSide, pieces, turn: 0, throwsLeft: 1, pending: [], winner: -1,
    stats: { throws: [0, 0], captures: [0, 0] },
  };
}

// 지금 할 일: 'throw'(던지기) · 'move'(결과를 말에 쓰기) · 'over'
function phase(st) {
  if (st.winner >= 0) return 'over';
  return st.throwsLeft > 0 ? 'throw' : 'move';
}

function throwTurn(st, forceFlats) {
  if (phase(st) !== 'throw') return null;
  const t = throwSticks(st.rand, forceFlats);
  st.throwsLeft--;
  if (t.extra) st.throwsLeft++;
  st.pending.push({ name: t.name, steps: t.steps });
  st.stats.throws[st.turn]++;
  return t;
}

// 한 사람의 말을 칸별로 묶기. 대기 중인 말은 한 묶음 (pos -1). 완주한 말은 뺀다
function groups(st, owner) {
  const map = new Map();
  for (const p of st.pieces) {
    if (p.owner !== owner || p.pos === DONE) continue;
    if (!map.has(p.pos)) map.set(p.pos, { pos: p.pos, via: p.via, ids: [] });
    map.get(p.pos).ids.push(p.id);
  }
  return [...map.values()].sort((a, b) => a.pos - b.pos);
}

// 묶음이 steps 칸 가면 어떻게 되는지 (상태는 바꾸지 않는다). 대기 묶음은 말 한 개만 들어간다
function preview(st, group, steps) {
  const owner = st.pieces[group.ids[0]].owner;
  const r = advance(group.pos, group.via, steps);
  const moving = group.pos === WAIT ? [group.ids[0]] : group.ids.slice();
  let capture = [], stackWith = [];
  if (!r.done) {
    for (const p of st.pieces) {
      if (p.pos !== r.pos || p.id === moving[0]) continue;
      if (moving.includes(p.id)) continue;
      if (p.owner === owner) stackWith.push(p.id); else capture.push(p.id);
    }
  }
  return { ...r, moving, capture, stackWith };
}

function nextTurn(st) { st.turn = 1 - st.turn; st.throwsLeft = 1; st.pending = []; }

// 쌓아 둔 결과 pending[idx] 를 pos 칸의 묶음에 쓴다. 규칙에 어긋나면 null
function move(st, idx, groupPos) {
  if (phase(st) !== 'move') return null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= st.pending.length) return null;
  const group = groups(st, st.turn).find((g) => g.pos === groupPos);
  if (!group) return null;
  const steps = st.pending[idx].steps;
  const r = preview(st, group, steps);
  st.pending.splice(idx, 1);
  for (const id of r.capture) { const p = st.pieces[id]; p.pos = WAIT; p.via = null; }
  for (const id of r.moving) { const p = st.pieces[id]; p.pos = r.pos; p.via = r.via; }
  for (const id of r.stackWith) st.pieces[id].via = r.via;
  if (r.capture.length) { st.throwsLeft++; st.stats.captures[st.turn] += r.capture.length; }
  const mine = st.pieces.filter((p) => p.owner === st.turn);
  if (mine.every((p) => p.pos === DONE)) st.winner = st.turn;
  else if (st.throwsLeft === 0 && st.pending.length === 0) nextTurn(st);
  return { from: group.pos, to: r.pos, done: r.done, path: r.path, moving: r.moving, captured: r.capture.length, stacked: r.stackWith.length > 0, steps };
}

// 지금 고를 수 있는 선택 전부
function options(st) {
  if (phase(st) !== 'move') return [];
  const out = [];
  const gs = groups(st, st.turn);
  const seen = new Set();
  st.pending.forEach((pd, idx) => {
    if (seen.has(pd.steps)) return;                    // 같은 결과는 한 번만
    seen.add(pd.steps);
    for (const g of gs) out.push({ idx, groupPos: g.pos });
  });
  return out;
}

// 컴퓨터가 고르기. level: 'easy' 는 잡을 수 있으면 잡고 아니면 거의 아무거나, 'hard' 는 잡기·완주·업기·지름길·위험을 따진다
function aiPick(st, level, rand = st.rand) {
  const opts = options(st);
  if (!opts.length) return null;
  const me = st.turn, gs = groups(st, me), foe = groups(st, 1 - me);
  let best = null, bestScore = -Infinity;
  for (const o of opts) {
    const g = gs.find((x) => x.pos === o.groupPos);
    const r = preview(st, g, st.pending[o.idx].steps);
    let score = rand() * 4;
    if (r.capture.length) score += 100 + 10 * r.capture.length;
    if (level === 'hard') {
      const size = r.moving.length;
      if (r.done) score += 70 + 10 * size;
      else {
        score += (remaining(g.pos, g.via) - remaining(r.pos, r.via)) * 3 * size;
        if (r.stackWith.length) score += 12;
        let danger = 0;                               // 내 말이 서게 될 칸을 상대가 다음에 잡을 수 있는 정도
        for (const f of foe) for (let s = 1; s <= 5; s++) if (advance(f.pos, f.via, s).pos === r.pos) danger += CHANCE[s];
        score -= danger * 40 * (size + r.stackWith.length);
      }
    } else if (r.done) score += 8;
    if (score > bestScore) { bestScore = score; best = o; }
  }
  return best;
}

return { FLAT, WAIT, DONE, NAMES, CHANCE, stepsOfFlats, throwSticks, stepOnce, advance, remaining, newGame, phase, throwTurn, groups, preview, move, options, aiPick, nextTurn };
})();
if (typeof module !== 'undefined') module.exports = LOGIC_YUT;
