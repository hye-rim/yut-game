'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 윷놀이: 화면·입력·소리. 규칙과 컴퓨터는 logic.js (LOGIC_YUT)
(() => {
const L = LOGIC_YUT;
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const INK = '#2b1d52', YELLOW = '#ffd23f';
const COLORS = ['#ff5a4f', '#3d8bff'];
const T = { anim: 600, after: 350, cpu: 750, move: 450 };       // 시간(ms). 시험용으로 줄일 수 있다

// ---------- 저장소 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let wins = Number(store.get('yutWins')) || 0;

// ---------- 소리 ----------
let audio = null;
let muted = store.get('yutMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.09, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'triangle', vol = 0.09) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  toss: () => [0, 90, 190, 300, 420].forEach((d) => setTimeout(() => tone(180 + Math.random() * 120, 0.05, 'square', 0.04), d)),
  result: (steps) => tone(400 + steps * 80, 0.14, 'triangle', 0.1, 120),
  step: () => tone(520, 0.07, 'triangle', 0.07),
  stack: () => seq([523, 659], 70, 'triangle', 0.08),
  capture: () => seq([300, 220, 160], 80, 'sawtooth', 0.06),
  finish: () => seq([523, 659, 784], 80, 'triangle', 0.1),
  win: () => seq([523, 659, 784, 1047], 110, 'triangle', 0.1),
  lose: () => seq([392, 330, 262, 196], 150, 'sawtooth', 0.06),
};
function toggleMute() { muted = !muted; store.set('yutMuted', muted ? '1' : '0'); $('muteBtn').textContent = muted ? '🔇' : '🔊'; }
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// ---------- 판 그리기 (칸 좌표) ----------
const BR = [290, 290], TR = [290, 30], TL = [30, 30], BL = [30, 290], C = [160, 160];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const POS = { 0: BR, 5: TR, 10: TL, 15: BL, 22: C };
for (let i = 1; i <= 4; i++) POS[i] = lerp(BR, TR, i / 5);
for (let i = 6; i <= 9; i++) POS[i] = lerp(TR, TL, (i - 5) / 5);
for (let i = 11; i <= 14; i++) POS[i] = lerp(TL, BL, (i - 10) / 5);
for (let i = 16; i <= 19; i++) POS[i] = lerp(BL, BR, (i - 15) / 5);
POS[20] = lerp(TR, C, 1 / 3); POS[21] = lerp(TR, C, 2 / 3);
POS[23] = lerp(C, BL, 1 / 3); POS[24] = lerp(C, BL, 2 / 3);
POS[25] = lerp(TL, C, 1 / 3); POS[26] = lerp(TL, C, 2 / 3);
POS[27] = lerp(C, BR, 1 / 3); POS[28] = lerp(C, BR, 2 / 3);

const svg = $('board');
function mk(tag, attrs, parent = svg) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}
const pieceEls = new Map();
let ghostLayer = null;
function buildBoard() {
  svg.innerHTML = '';
  const line = { fill: 'none', stroke: INK, 'stroke-width': 4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  mk('path', { ...line, d: `M${BR} L${TR} L${TL} L${BL} Z` });
  mk('path', { ...line, d: `M${TR} L${BL} M${TL} L${BR}` });
  for (let p = 0; p <= 28; p++) {
    const big = [0, 5, 10, 15, 22].includes(p);
    mk('circle', { cx: POS[p][0], cy: POS[p][1], r: big ? 14 : 9, fill: big ? YELLOW : '#fff', stroke: INK, 'stroke-width': 3 });
  }
  const t = mk('text', { x: BR[0], y: BR[1], class: 'lbl', 'dominant-baseline': 'central' });
  t.style.fill = INK; t.textContent = '출발';
  const piecesLayer = mk('g', { id: 'pieces' });
  for (const p of st.pieces) {
    const g = mk('g', { class: 'pc' }, piecesLayer);
    g.style.display = 'none';
    mk('circle', { class: 'ring', r: 15, fill: 'none', stroke: YELLOW, 'stroke-width': 3 }, g);
    mk('circle', { class: 'body', r: 10, fill: COLORS[p.owner] }, g);
    mk('text', { y: 1 }, g);
    g.addEventListener('click', () => onPieceClick(p.id));
    pieceEls.set(p.id, g);
  }
  ghostLayer = mk('g', { id: 'ghosts' });
}

// ---------- 상태 ----------
let st = L.newGame();
let mode = 'easy';                                         // 'easy' · 'hard' (컴퓨터) · 'two' (둘이서)
let playing = false, busy = false, sel = 0, overTimer = 0;
const isHuman = (p) => mode === 'two' || p === 0;
const nameOf = (p) => (mode === 'two' ? (p === 0 ? '빨강' : '파랑') : (p === 0 ? '내' : '컴퓨터'));
const subject = (p) => (mode === 'two' ? nameOf(p) + '이' : p === 0 ? '내가' : '컴퓨터가');
const humanTurn = () => playing && st.winner < 0 && isHuman(st.turn);

// ---------- 그리기 ----------
function renderTray(box, owner) {
  const ps = st.pieces.filter((p) => p.owner === owner);
  const waiting = ps.filter((p) => p.pos === L.WAIT).length, done = ps.filter((p) => p.pos === L.DONE).length;
  const can = humanTurn() && !busy && L.phase(st) === 'move' && st.turn === owner && waiting > 0;
  box.style.background = playing && st.winner < 0 && st.turn === owner ? '#fff4c2' : '#fff';
  box.innerHTML = `<span class="who">${nameOf(owner)}</span><div class="toks"></div><span class="done">완주 ${done}/${st.perSide}</span>`;
  const toks = box.querySelector('.toks');
  for (let i = 0; i < waiting; i++) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tok' + (can ? ' can' : ''); b.style.setProperty('--c', COLORS[owner]);
    b.setAttribute('aria-label', '대기 중인 말');
    if (can) b.onclick = () => onGroup(L.WAIT);
    toks.appendChild(b);
  }
}
function renderPieces() {
  const movable = new Set();
  const live = humanTurn() && !busy && L.phase(st) === 'move';
  if (live) for (const g of L.groups(st, st.turn)) if (g.pos !== L.WAIT) g.ids.forEach((id) => movable.add(id));
  const byPos = new Map();
  for (const p of st.pieces) if (p.pos >= 1 && p.pos <= 28) { if (!byPos.has(p.pos)) byPos.set(p.pos, []); byPos.get(p.pos).push(p.id); }
  for (const p of st.pieces) {
    const g = pieceEls.get(p.id);
    if (!(p.pos >= 1 && p.pos <= 28)) { g.style.display = 'none'; g.dataset.at = ''; continue; }
    const ids = byPos.get(p.pos), i = ids.indexOf(p.id), n = ids.length;
    const x = POS[p.pos][0] + (i - (n - 1) / 2) * 7, y = POS[p.pos][1] - (i - (n - 1) / 2) * 7;
    const wasHidden = g.style.display === 'none';
    if (wasHidden) { g.style.transition = 'none'; }
    g.style.display = '';
    g.style.transform = `translate(${x}px, ${y}px)`;
    if (wasHidden) { void g.getBoundingClientRect(); g.style.transition = ''; }
    g.querySelector('text').textContent = i === n - 1 && n > 1 ? String(n) : '';
    g.classList.toggle('can', movable.has(p.id));
    g.querySelector('.ring').style.display = movable.has(p.id) ? '' : 'none';
    g.dataset.at = String(p.pos);
  }
}
function renderGhosts() {
  ghostLayer.innerHTML = '';
  if (!(humanTurn() && !busy && L.phase(st) === 'move' && st.pending[sel])) return;
  const res = st.pending[sel];
  for (const g of L.groups(st, st.turn)) {
    const r = L.preview(st, g, res.steps);
    const pt = r.done ? POS[0] : POS[r.pos];
    const label = r.done ? '완주' : r.capture.length ? '잡기' : r.stackWith.length ? '업기' : res.name;
    const grp = mk('g', { class: 'ghost' }, ghostLayer);
    mk('circle', { cx: pt[0], cy: pt[1], r: 16, fill: r.capture.length ? 'rgba(255,90,79,.35)' : 'rgba(255,255,255,.7)', stroke: INK, 'stroke-width': 2.5, 'stroke-dasharray': '4 3' }, grp);
    const t = mk('text', { x: pt[0], y: pt[1] + 1 }, grp);
    t.textContent = label;
    grp.addEventListener('click', () => onGroup(g.pos));
  }
}
function renderChips() {
  const box = $('chips');
  box.innerHTML = '';
  if (busy) return;
  const canPick = humanTurn() && L.phase(st) === 'move';
  st.pending.forEach((pd, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (canPick && i === sel ? ' sel' : '');
    b.innerHTML = `${pd.name}<small>${pd.steps}칸</small>`;
    if (canPick) b.onclick = () => { sel = i; render(); };
    else b.disabled = true;
    box.appendChild(b);
  });
}
function renderHud() {
  $('wins').textContent = wins.toLocaleString('ko-KR');
  let text = '윷놀이';
  if (playing && st.winner < 0) {
    const ph = L.phase(st);
    if (!isHuman(st.turn)) text = '컴퓨터 차례…';
    else text = `${nameOf(st.turn)} 차례 · ${ph === 'throw' ? '윷 던지기' : '말 옮기기'}`;
  }
  $('turn').textContent = text;
}
function renderActions() {
  const b = $('throwBtn');
  const ok = humanTurn() && !busy && L.phase(st) === 'throw';
  b.disabled = !ok;
  b.classList.toggle('go', ok);
  b.textContent = st.pending.length && L.phase(st) === 'throw' ? '🎲 한 번 더 던지기' : '🎲 던지기';
}
function render() {
  if (sel >= st.pending.length) sel = 0;
  renderTray($('trayOp'), 1); renderTray($('trayMe'), 0);
  renderPieces(); renderGhosts(); renderChips(); renderHud(); renderActions();
}
function say(t) { $('msg').textContent = t; }

// ---------- 윷 던지기 ----------
function showSticks(flats) {
  [...$('sticks').children].forEach((s, i) => s.classList.toggle('flat', flats ? flats[i] : false));
}
function throwNow() {
  busy = true; renderActions(); renderChips(); renderGhosts();
  const who = st.turn;
  const t = L.throwTurn(st);
  $('resName').textContent = ''; $('resName').classList.remove('pop');
  [...$('sticks').children].forEach((s) => { s.classList.remove('toss'); void s.offsetWidth; s.classList.add('toss'); });
  say(mode !== 'two' && who === 0 ? '던지는 중…' : `${nameOf(who)} 던지는 중…`);
  sfx.toss();
  setTimeout(() => {
    [...$('sticks').children].forEach((s) => s.classList.remove('toss'));
    showSticks(t.flats);
    const rn = $('resName'); rn.textContent = t.name; void rn.offsetWidth; rn.classList.add('pop');
    sfx.result(t.steps);
    say(t.extra ? `${t.name}! 한 번 더 던져요` : `${t.name}! ${t.steps}칸`);
    if (isHuman(who)) tutorialSignal('throw');
    setTimeout(advance, T.after);
  }, T.anim);
}
function onThrow() {
  if (!humanTurn() || busy || L.phase(st) !== 'throw') return;
  throwNow();
}

// ---------- 말 움직이기 ----------
function onGroup(pos) {
  if (!humanTurn() || busy || L.phase(st) !== 'move') return;
  const who = st.turn;
  const r = L.move(st, sel, pos);
  if (!r) return;
  afterMove(who, r, true);
}
function onPieceClick(id) {
  if (!humanTurn() || busy || L.phase(st) !== 'move') return;
  const p = st.pieces[id];
  if (p.owner !== st.turn || !(p.pos >= 1 && p.pos <= 28)) return;
  onGroup(p.pos);
}
function afterMove(who, r, human) {
  busy = true; sel = 0;
  if (r.captured) { sfx.capture(); say(`🎯 ${subject(who)} ${r.captured}개를 잡았어요! 한 번 더`); }
  else if (r.done) { sfx.finish(); say(`🏁 완주!${r.moving.length > 1 ? ` (${r.moving.length}개 한꺼번에)` : ''}`); }
  else if (r.stacked) { sfx.stack(); say('업었어요! 함께 움직여요'); }
  else { sfx.step(); say(''); }
  if (human) { tutorialSignal('move'); if (r.captured) tutorialSignal('capture'); }
  renderTray($('trayOp'), 1); renderTray($('trayMe'), 0); renderPieces(); renderGhosts(); renderChips(); renderHud(); renderActions();
  setTimeout(advance, T.move);
}

// ---------- 진행 ----------
function advance() {
  busy = false;
  if (st.winner >= 0) { render(); overTimer = setTimeout(showOver, 700); return; }
  render();
  if (humanTurn() && L.phase(st) === 'move') say('점선 칸이나 반짝이는 말을 눌러 옮겨요');
  if (playing && !isHuman(st.turn)) { busy = true; renderActions(); setTimeout(cpuStep, T.cpu); }
}
function cpuStep() {
  if (!playing || st.winner >= 0) { busy = false; return; }
  if (L.phase(st) === 'throw') { throwNow(); return; }
  const pick = L.aiPick(st, mode === 'hard' ? 'hard' : 'easy');
  if (!pick) { busy = false; return; }
  const who = st.turn;
  const r = L.move(st, pick.idx, pick.groupPos);
  afterMove(who, r, false);
}

// ---------- 시작·끝 ----------
function startGame(m) {
  clearTimeout(overTimer);
  mode = m; st = L.newGame(); playing = true; busy = false; sel = 0;
  buildBoard(); showSticks(null); $('resName').textContent = ''; say('');
  $('overlay').classList.add('hidden');
  render();
}
function showOver() {
  playing = false;
  const w = st.winner, cpu = mode !== 'two';
  const youWon = cpu && w === 0;
  if (youWon) { wins++; store.set('yutWins', String(wins)); sfx.win(); } else if (cpu) sfx.lose(); else sfx.win();
  const title = cpu ? (youWon ? '이겼어요! 🎉' : '아쉬워요! 😵') : `${nameOf(w)} 승리! 🎉`;
  const row = (label, a, b) => `<dt>${label}</dt><dd>${a} : ${b}</dd>`;
  const done = (o) => st.pieces.filter((p) => p.owner === o && p.pos === L.DONE).length;
  $('overlay').innerHTML = `
    <h2>${title}</h2>
    <dl class="stats card2"><dt style="grid-column:1/-1;text-align:center">${nameOf(0)} : ${nameOf(1)}</dt>${row('완주', done(0), done(1))}${row('잡은 말', st.stats.captures[0], st.stats.captures[1])}${row('던진 횟수', st.stats.throws[0], st.stats.throws[1])}</dl>
    ${cpu ? `<p>컴퓨터 상대 승리 <b>${wins}</b>번</p>` : ''}
    <div class="col"><button id="againBtn">다시 하기</button><button id="homeBtn" class="sub">모드 바꾸기</button></div>`;
  $('overlay').classList.remove('hidden');
  render();
  $('againBtn').onclick = (e) => { e.currentTarget.blur(); startGame(mode); };
  $('homeBtn').onclick = (e) => { e.currentTarget.blur(); showTitle(); };
}
function showTitle() {
  clearTimeout(overTimer);
  playing = false; busy = false; sel = 0;
  st = L.newGame(); buildBoard(); showSticks(null); $('resName').textContent = ''; say(''); render();
  $('overlay').innerHTML = `
    <h1>윷놀이</h1>
    <p>윷을 던져 <b>말 ${st.perSide}개</b>를 먼저 한 바퀴 돌려 보내요</p>
    <div class="card2" style="font-size:13px"><b>도</b> 1 · <b>개</b> 2 · <b>걸</b> 3 · <b>윷</b> 4 · <b>모</b> 5칸<br>윷·모가 나오거나 <b>말을 잡으면</b> 한 번 더!<br>모서리에 서면 <b>지름길</b>로 질러가요<br>같은 편 말은 만나면 <b>업혀서</b> 함께 가요</div>
    <div class="col"><button id="easyBtn">컴퓨터랑 · 쉬움</button><button id="hardBtn" class="sub">컴퓨터랑 · 어려움</button><button id="twoBtn" class="sub">둘이서 (한 기기)</button></div>
    <p style="font-size:12px;opacity:.85">PC: Space 던지기 · 말을 눌러 옮겨요</p>`;
  $('overlay').classList.remove('hidden');
  $('easyBtn').onclick = (e) => { e.currentTarget.blur(); startGame('easy'); };
  $('hardBtn').onclick = (e) => { e.currentTarget.blur(); startGame('hard'); };
  $('twoBtn').onclick = (e) => { e.currentTarget.blur(); startGame('two'); };
}

// ---------- 입력 ----------
$('throwBtn').onclick = (e) => { e.currentTarget.blur(); onThrow(); };
addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space' || e.code === 'Enter') { if (humanTurn() && !busy && L.phase(st) === 'throw') { e.preventDefault(); onThrow(); } return; }
  if (e.code === 'KeyM') toggleMute();
});

for (let i = 0; i < 4; i++) { const s = document.createElement('div'); s.className = 'stick'; $('sticks').appendChild(s); }
showTitle();

/* @test-hooks:start */
window.__yut = { get st() { return st; }, get busy() { return busy; }, get mode() { return mode; }, T, onThrow, onGroup, startGame, advance, get sel() { return sel; } };
/* @test-hooks:end */
})();
