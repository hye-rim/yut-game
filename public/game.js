'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 윷놀이: 화면·입력·소리·온라인. 규칙과 컴퓨터는 logic.js (LOGIC_YUT), 방·매칭은 server.js
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
const ONLINE_KEY = 'yutOnline', SESSION_KEY = 'yutSession';
const loadJson = (k) => { try { return JSON.parse(store.get(k)) || {}; } catch (_) { return {}; } };
function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_) { return null; } }
function saveSession(s) { try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch (_) {} }
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const myName = () => store.get('yutName') || '';

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
  found: () => seq([392, 523], 90, 'triangle', 0.08),
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
  pieceEls.clear();
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
let st = L.newGame();             // 화면에 그리는 판 (온라인에서는 서버가 보낸 판)
let mode = 'easy';                // 'easy' · 'hard' (컴퓨터) · 'online'
let playing = false, busy = false, sel = 0, overTimer = 0, animTimer = 0;
// 온라인
let room = null;                  // 서버가 보낸 방
let waitingNet = false;           // 내 동작을 보내고 서버 답을 기다리는 중
let seenThrow = 0, seenMove = 0, turnEnd = 0, netDown = false, recorded = '';
const online = () => mode === 'online';
const meOwner = () => (online() && room ? room.you : 0);                   // 아래쪽에 보이는 내 말 색
const opponent = () => (room ? room.players.find((p) => p.color !== room.you) : null);
const nameOf = (p) => (p === meOwner() ? '내' : online() ? ((opponent() || {}).name || '상대') : '컴퓨터');
const subject = (p) => (p === meOwner() ? '내가' : `${nameOf(p)}${online() ? '이' : '가'}`);
const myTurn = () => (online() ? !!room && room.state === 'playing' && st.turn === room.you && !netDown : playing && st.winner < 0 && st.turn === 0);
const humanTurn = () => playing && st.winner < 0 && myTurn();
const canAct = () => humanTurn() && !busy && !waitingNet;

// ---------- 그리기 ----------
function renderTray(box, owner) {
  const ps = st.pieces.filter((p) => p.owner === owner);
  const waiting = ps.filter((p) => p.pos === L.WAIT).length, done = ps.filter((p) => p.pos === L.DONE).length;
  const can = canAct() && L.phase(st) === 'move' && st.turn === owner && waiting > 0;
  box.style.background = playing && st.winner < 0 && st.turn === owner ? '#fff4c2' : '#fff';
  box.innerHTML = `<span class="who">${esc(nameOf(owner))}</span><div class="toks"></div><span class="done">완주 ${done}/${st.perSide}</span>`;
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
  const live = canAct() && L.phase(st) === 'move';
  if (live) for (const g of L.groups(st, st.turn)) if (g.pos !== L.WAIT) g.ids.forEach((id) => movable.add(id));
  const byPos = new Map();
  for (const p of st.pieces) if (p.pos >= 1 && p.pos <= 28) { if (!byPos.has(p.pos)) byPos.set(p.pos, []); byPos.get(p.pos).push(p.id); }
  for (const p of st.pieces) {
    const g = pieceEls.get(p.id);
    if (!g) continue;
    if (!(p.pos >= 1 && p.pos <= 28)) { g.style.display = 'none'; continue; }
    const ids = byPos.get(p.pos), i = ids.indexOf(p.id), n = ids.length;
    const x = POS[p.pos][0] + (i - (n - 1) / 2) * 7, y = POS[p.pos][1] - (i - (n - 1) / 2) * 7;
    const wasHidden = g.style.display === 'none';
    if (wasHidden) g.style.transition = 'none';
    g.style.display = '';
    g.style.transform = `translate(${x}px, ${y}px)`;
    if (wasHidden) { void g.getBoundingClientRect(); g.style.transition = ''; }
    g.querySelector('text').textContent = i === n - 1 && n > 1 ? String(n) : '';
    g.classList.toggle('can', movable.has(p.id));
    g.querySelector('.ring').style.display = movable.has(p.id) ? '' : 'none';
  }
}
function renderGhosts() {
  ghostLayer.innerHTML = '';
  if (!(canAct() && L.phase(st) === 'move' && st.pending[sel])) return;
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
  const canPick = canAct() && L.phase(st) === 'move';
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
    const ph = L.phase(st), act = ph === 'throw' ? '윷 던지기' : '말 옮기기';
    if (online()) {
      if (netDown) text = '연결 다시 붙이는 중…';
      else {
        const sec = Math.max(0, Math.ceil((turnEnd - performance.now()) / 1000));
        text = st.turn === room.you ? `내 차례 · ${act} · ${sec}초` : `${nameOf(st.turn)} 차례 · ${sec}초`;
      }
    } else text = !myTurn() ? '컴퓨터 차례…' : `내 차례 · ${act}`;
  }
  $('turn').textContent = text;
  $('resignBtn').style.display = online() && room && room.state === 'playing' ? '' : 'none';
}
function renderActions() {
  const b = $('throwBtn');
  const ok = canAct() && L.phase(st) === 'throw';
  b.disabled = !ok;
  b.classList.toggle('go', ok);
  b.textContent = st.pending.length && L.phase(st) === 'throw' ? '🎲 한 번 더 던지기' : '🎲 던지기';
}
function render() {
  if (sel >= st.pending.length) sel = 0;
  renderTray($('trayOp'), 1 - meOwner()); renderTray($('trayMe'), meOwner());
  renderPieces(); renderGhosts(); renderChips(); renderHud(); renderActions();
}
function say(t) { $('msg').textContent = t; }

// ---------- 창 ----------
const overlayOpen = () => !$('overlay').classList.contains('hidden');
function showOverlay(html) { $('overlay').innerHTML = html; $('overlay').classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

// ---------- 윷 던지기 ----------
function showSticks(flats) {
  [...$('sticks').children].forEach((s, i) => s.classList.toggle('flat', flats ? flats[i] : false));
}
// 던지는 모습을 보여 주고 결과를 알린 뒤 done 을 부른다. who: 던진 사람, t: { flats, steps, name, extra }
function animateThrow(who, t, done) {
  busy = true; renderActions(); renderChips(); renderGhosts();
  clearTimeout(animTimer);
  $('resName').textContent = ''; $('resName').classList.remove('pop');
  [...$('sticks').children].forEach((s) => { s.classList.remove('toss'); void s.offsetWidth; s.classList.add('toss'); });
  say(who === meOwner() ? '던지는 중…' : `${nameOf(who)} 던지는 중…`);
  sfx.toss();
  animTimer = setTimeout(() => {
    [...$('sticks').children].forEach((s) => s.classList.remove('toss'));
    showSticks(t.flats);
    const rn = $('resName'); rn.textContent = t.name; void rn.offsetWidth; rn.classList.add('pop');
    sfx.result(t.steps);
    say(t.extra ? `${t.name}! 한 번 더 던져요` : `${t.name}! ${t.steps}칸`);
    if (who === meOwner()) tutorialSignal('throw');
    animTimer = setTimeout(done, T.after);
  }, T.anim);
}
function throwNow() {                                         // 컴퓨터 모드: 내 판에서 직접 던진다
  const who = st.turn;
  const t = L.throwTurn(st);
  animateThrow(who, t, advance);
}
function onThrow() {
  if (!canAct() || L.phase(st) !== 'throw') return;
  if (online()) { waitingNet = true; renderActions(); net.send('throw'); } else throwNow();
}

// ---------- 말 움직이기 ----------
function describeMove(who, r) {
  if (r.captured) { sfx.capture(); say(`🎯 ${subject(who)} ${r.captured}개를 잡았어요! 한 번 더`); }
  else if (r.done) { sfx.finish(); say(`🏁 완주!${r.moving > 1 ? ` (${r.moving}개 한꺼번에)` : ''}`); }
  else if (r.stacked) { sfx.stack(); say('업었어요! 함께 움직여요'); }
  else { sfx.step(); say(''); }
}
function onGroup(pos) {
  if (!canAct() || L.phase(st) !== 'move') return;
  if (online()) {
    waitingNet = true; renderActions();
    net.send('move', { idx: sel, pos });
    sel = 0;
    return;
  }
  const who = st.turn;
  const r = L.move(st, sel, pos);
  if (!r) return;
  busy = true; sel = 0;
  describeMove(who, { captured: r.captured, done: r.done, stacked: r.stacked, moving: r.moving.length });
  tutorialSignal('move'); if (r.captured) tutorialSignal('capture');
  render();
  setTimeout(advance, T.move);
}
function onPieceClick(id) {
  if (!canAct() || L.phase(st) !== 'move') return;
  const p = st.pieces[id];
  if (!p || p.owner !== st.turn || !(p.pos >= 1 && p.pos <= 28)) return;
  onGroup(p.pos);
}

// ---------- 진행 (컴퓨터 모드) ----------
function advance() {
  busy = false;
  if (online()) { render(); return; }
  if (st.winner >= 0) { render(); overTimer = setTimeout(showOver, 700); return; }
  render();
  if (humanTurn() && L.phase(st) === 'move') say('점선 칸이나 반짝이는 말을 눌러 옮겨요');
  if (playing && !myTurn()) { busy = true; renderActions(); setTimeout(cpuStep, T.cpu); }
}
function cpuStep() {
  if (!playing || st.winner >= 0 || online()) { busy = false; return; }
  if (L.phase(st) === 'throw') { throwNow(); return; }
  const pick = L.aiPick(st, mode === 'hard' ? 'hard' : 'easy');
  if (!pick) { busy = false; return; }
  const who = st.turn;
  const r = L.move(st, pick.idx, pick.groupPos);
  describeMove(who, { captured: r.captured, done: r.done, stacked: r.stacked, moving: r.moving.length });
  render();
  setTimeout(advance, T.cpu);
}

// ---------- 시작·끝 (컴퓨터) ----------
function startGame(m) {
  leaveOnline();
  clearTimeout(overTimer); clearTimeout(animTimer);
  mode = m; st = L.newGame(); playing = true; busy = false; sel = 0;
  buildBoard(); showSticks(null); $('resName').textContent = ''; say('');
  hideOverlay();
  render();
}
function showOver() {
  playing = false;
  const youWon = st.winner === 0;
  if (youWon) { wins++; store.set('yutWins', String(wins)); sfx.win(); } else sfx.lose();
  const done = (o) => st.pieces.filter((p) => p.owner === o && p.pos === L.DONE).length;
  const row = (label, a, b) => `<dt>${label}</dt><dd>${a} : ${b}</dd>`;
  showOverlay(`
    <h2>${youWon ? '이겼어요! 🎉' : '아쉬워요! 😵'}</h2>
    <dl class="stats card2"><dt style="grid-column:1/-1;text-align:center">내 : 컴퓨터</dt>${row('완주', done(0), done(1))}${row('잡은 말', st.stats.captures[0], st.stats.captures[1])}${row('던진 횟수', st.stats.throws[0], st.stats.throws[1])}</dl>
    <p>컴퓨터 상대 승리 <b>${wins}</b>번</p>
    <div class="col"><button data-act="again">다시 하기</button><button class="sub" data-act="home">처음으로</button></div>`);
  render();
}
function showTitle() {
  leaveOnline();
  clearTimeout(overTimer); clearTimeout(animTimer);
  mode = 'easy'; playing = false; busy = false; sel = 0;
  st = L.newGame(); buildBoard(); showSticks(null); $('resName').textContent = ''; say(''); render();
  const on = loadJson(ONLINE_KEY);
  showOverlay(`
    <h1>윷놀이</h1>
    <p>윷을 던져 <b>말 ${st.perSide}개</b>를 먼저 한 바퀴 돌려 보내요</p>
    <div class="card2" style="font-size:13px"><b>도</b> 1 · <b>개</b> 2 · <b>걸</b> 3 · <b>윷</b> 4 · <b>모</b> 5칸<br>윷·모가 나오거나 <b>말을 잡으면</b> 한 번 더!<br>모서리에 서면 <b>지름길</b>로 질러가요<br>같은 편 말은 만나면 <b>업혀서</b> 함께 가요</div>
    <div class="col"><button data-act="cpu" data-lv="easy">🤖 컴퓨터랑 · 쉬움</button><button class="sub" data-act="cpu" data-lv="hard">🤖 컴퓨터랑 · 어려움</button><button class="sub" data-act="online">🌐 온라인 대전${on.w || on.l ? ` · ${on.w || 0}승 ${on.l || 0}패` : ''}</button></div>
    <p style="font-size:12px;opacity:.85">PC: Space 던지기 · 말을 눌러 옮겨요</p>`);
}

// ---------- 온라인: 연결 ----------
const net = {
  ws: null, pulse: null, outbox: [], retry: 0,
  connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}${location.pathname}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.raw('hello', { name: myName() });
      const s = loadSession();
      if (s) this.raw('resume', s);
      for (const [t, p] of this.outbox.splice(0)) this.raw(t, p);
      clearInterval(this.pulse);
      // 프록시가 WebSocket ping 을 대신 받아버리는 환경이 있어 살아있다는 신호를 직접 보낸다
      this.pulse = setInterval(() => this.raw('pulse'), 10000);
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } onNet(m); };
    ws.onclose = () => {
      clearInterval(this.pulse);
      if (this.ws !== ws) return;   // 일부러 닫은 연결
      this.ws = null;
      if (!online()) return;
      if (room || loadSession()) {
        // 대국 중이면 계속 다시 붙어본다. 서버는 30초 동안 자리를 비워둔다.
        netDown = true; waitingNet = false; render();
        setTimeout(() => { if (online()) this.connect(); }, Math.min(4000, 500 * 2 ** this.retry++));
      } else showOnline('서버와 연결이 끊겼어요. 다시 시도해 주세요.');
    };
  },
  send(t, p = {}) {
    if (this.ws && this.ws.readyState === 1) this.raw(t, p);
    else { this.outbox.push([t, p]); this.connect(); }
  },
  raw(t, p = {}) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ t, ...p })); },
  close() {
    const ws = this.ws;
    this.ws = null; this.outbox = [];
    clearInterval(this.pulse);
    if (ws) ws.close();
  },
};

function onNet(m) {
  if (m.t === 'queued') showQueued();
  else if (m.t === 'room') applyRoom(m);
  else if (m.t === 'error') { room = null; saveSession(null); showOnline(m.msg); }
  else if (m.t === 'resumeFailed') {
    saveSession(null);
    if (room) { room = null; showOnline('대국이 끝나서 이어갈 수 없어요.'); }
    netDown = false; render();
  }
}

function leaveOnline() {
  if (!online()) return;
  net.send('leave'); net.close();
  saveSession(null);
  room = null; netDown = false; waitingNet = false; playing = false; mode = 'easy';
}

// 서버가 보낸 방으로 그릴 판을 만든다 (규칙 함수가 읽는 모양)
function viewState(r) {
  return { pieces: r.pieces.map((p) => ({ ...p })), perSide: r.perSide, turn: r.turn, throwsLeft: r.throwsLeft, pending: r.pending.map((x) => ({ ...x })), winner: r.state === 'over' ? r.winner : -1, stats: r.stats };
}

// ---------- 온라인: 대국 ----------
function applyRoom(r) {
  const fresh = !room || room.code !== r.code;
  const newGame = fresh || room.games !== r.games;
  room = r;
  netDown = false; waitingNet = false;
  saveSession({ code: r.code, token: r.token });
  turnEnd = performance.now() + r.remain;
  st = viewState(r);
  if (newGame) { seenThrow = r.lastThrow ? r.lastThrow.seq : 0; seenMove = r.lastMove ? r.lastMove.seq : 0; busy = false; sel = 0; clearTimeout(animTimer); say(''); showSticks(null); $('resName').textContent = ''; }
  if (fresh || newGame) buildBoard();
  if (r.state === 'waiting') { playing = false; showWaiting(); render(); return; }
  playing = true;
  if (newGame && r.state === 'playing') sfx.found();
  if (r.state === 'playing' && !($('overlay').dataset.screen === 'confirm')) hideOverlay();
  const t = r.lastThrow, mv = r.lastMove;
  if (t && t.seq > seenThrow && !newGame) {
    seenThrow = t.seq;
    animateThrow(t.who, { flats: t.flats, steps: t.steps, name: t.name, extra: t.steps >= 4 }, () => { busy = false; afterRoom(); });
    return;
  }
  if (mv && mv.seq > seenMove && !newGame) {
    seenMove = mv.seq;
    describeMove(mv.who, { captured: mv.captured, done: mv.done, stacked: mv.stacked, moving: mv.n });
    if (mv.who === r.you) { tutorialSignal('move'); if (mv.captured) tutorialSignal('capture'); }
  }
  if (!busy) { sel = Math.min(sel, Math.max(0, r.pending.length - 1)); }
  afterRoom();
}
function afterRoom() {
  const r = room;
  if (!r) return;
  st = viewState(r);
  render();
  if (r.state === 'playing' && myTurn() && L.phase(st) === 'move' && !busy) say('점선 칸이나 반짝이는 말을 눌러 옮겨요');
  if (r.state === 'over') {
    const key = `${r.code}:${r.games}:${r.reason}:${r.winner}`;
    if (recorded !== key) {
      recorded = key;
      const rec = loadJson(ONLINE_KEY);
      if (r.winner === r.you) { rec.w = (rec.w || 0) + 1; sfx.win(); } else { rec.l = (rec.l || 0) + 1; sfx.lose(); }
      store.set(ONLINE_KEY, JSON.stringify(rec));
      setTimeout(() => { if (room && room.state === 'over') showResult(); }, 900);
    } else if (overlayOpen()) showResult();
  }
}

function showResult() {
  const r = room, opp = opponent();
  const won = r.winner === r.you;
  const why = {
    finish: won ? '말을 먼저 모두 완주시켰어요!' : '상대가 먼저 모두 완주했어요',
    resign: won ? '상대가 기권했어요' : '기권했어요',
    timeout: won ? '상대가 시간을 넘겼어요' : '시간을 넘겼어요',
    left: won ? '상대가 나갔어요' : '연결이 끊겨 패배했어요',
  }[r.reason] || '';
  const rec = loadJson(ONLINE_KEY);
  const iVoted = r.rematch.includes(r.you), theyVoted = opp && r.rematch.includes(opp.color);
  let again;
  if (!opp) again = '<p>상대가 방을 나갔어요</p>';
  else if (iVoted) again = '<p>상대를 기다리는 중…</p>';
  else again = `${theyVoted ? '<p>상대가 한 판 더 하고 싶어해요!</p>' : ''}<button data-act="rematch">한 판 더</button>`;
  showOverlay(`
    <h2>${won ? '🎉 승리!' : '😵 패배'}</h2>
    ${why ? `<p>${why}</p>` : ''}
    <span class="tag">온라인 ${rec.w || 0}승 ${rec.l || 0}패</span>
    <div class="col">${again}
      <div class="row"><button class="sub" data-act="view">판 보기</button><button class="sub" data-act="leave">나가기</button></div>
    </div>`);
}

function showOnline(error = '') {
  leaveOnline();
  clearTimeout(animTimer);
  mode = 'online'; playing = false; room = null; busy = false;
  st = L.newGame(); buildBoard(); showSticks(null); $('resName').textContent = ''; say(''); render();
  showOverlay(`
    <h2>🌐 온라인 대전</h2>
    <input id="nameInput" maxlength="10" placeholder="내 이름 (최대 10자)" value="${esc(myName())}" autocomplete="off">
    <div class="col">
      <button data-act="quick">⚡ 빠른 대전</button>
      <button class="sub" data-act="create">방 만들기</button>
      <div class="row join"><input id="codeInput" maxlength="4" placeholder="방 코드" autocomplete="off" autocapitalize="characters"><button class="sub" data-act="join">들어가기</button></div>
    </div>
    <span class="error">${esc(error)}</span>
    <button class="back" data-act="home">← 처음으로</button>
    <p style="font-size:12.5px">던지거나 옮길 때마다 30초 · 먼저 하는 쪽은 한 판마다 바뀌어요</p>`);
}
function showQueued() {
  showOverlay(`
    <h2>상대를 찾는 중…</h2>
    <div class="dots"><span></span><span></span><span></span></div>
    <p>누군가 빠른 대전을 누르면 바로 시작해요</p>
    <button class="sub" data-act="cancel">취소</button>`);
}
const inviteUrl = () => `${location.origin}${location.pathname}?room=${room.code}`;
function showWaiting() {
  showOverlay(`
    <h2>친구를 기다리는 중…</h2>
    <p>방 코드</p>
    <div class="code">${esc(room.code)}</div>
    <p>친구가 <b>온라인 대전 → 들어가기</b>에<br>이 코드를 넣으면 시작해요</p>
    <button data-act="copy">🔗 초대 링크 복사</button>
    <button class="sub" data-act="cancel">취소</button>`);
}
function saveName() {
  const input = $('nameInput');
  if (!input) return;
  const name = input.value.trim().slice(0, 10);
  store.set('yutName', name);
  net.send('hello', { name });
}
function confirmResign() {
  showOverlay(`<h2>기권할까요?</h2><p>이번 판은 패배로 기록돼요</p>
    <div class="row"><button data-act="close">계속하기</button><button class="sub" data-act="resign">🏳 기권</button></div>`);
  $('overlay').dataset.screen = 'confirm';
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  $('overlay').dataset.screen = '';
  const act = btn.dataset.act;
  if (act === 'cpu') startGame(btn.dataset.lv);
  else if (act === 'again') startGame(mode);
  else if (act === 'home') showTitle();
  else if (act === 'online') showOnline();
  else if (act === 'quick') { saveName(); net.send('quick'); }
  else if (act === 'create') { saveName(); net.send('create'); }
  else if (act === 'join') {
    const code = ($('codeInput').value || '').trim().toUpperCase();
    if (code.length !== 4) { $('overlay').querySelector('.error').textContent = '방 코드 4자리를 넣어 주세요.'; return; }
    saveName();
    net.send('join', { code });
  } else if (act === 'cancel') { net.send('cancel'); showOnline(); }
  else if (act === 'copy') {
    const url = inviteUrl();
    const done = () => { btn.textContent = '✅ 복사했어요'; setTimeout(() => { btn.textContent = '🔗 초대 링크 복사'; }, 1500); };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: '윷놀이 한 판 해요!', url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt('링크를 복사하세요', url));
    else prompt('링크를 복사하세요', url);
  } else if (act === 'rematch') { net.send('rematch'); }
  else if (act === 'view') hideOverlay();
  else if (act === 'leave') showOnline();
  else if (act === 'resign') { net.send('resign'); hideOverlay(); }
  else if (act === 'close') hideOverlay();
});
$('overlay').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'codeInput') $('overlay').querySelector('[data-act="join"]').click();
  if (e.target.id === 'nameInput') $('overlay').querySelector('[data-act="quick"]').click();
  e.stopPropagation();
});
$('resignBtn').onclick = (e) => { e.currentTarget.blur(); if (online() && room && room.state === 'playing') confirmResign(); };
$('throwBtn').onclick = (e) => { e.currentTarget.blur(); onThrow(); };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space' || e.code === 'Enter') { if (canAct() && L.phase(st) === 'throw') { e.preventDefault(); onThrow(); } return; }
  if (e.code === 'KeyM') toggleMute();
});
setInterval(() => { if (online() && room && room.state === 'playing' && !netDown) renderHud(); }, 500);

for (let i = 0; i < 4; i++) { const s = document.createElement('div'); s.className = 'stick'; $('sticks').appendChild(s); }

// ---------- 시작 ----------
// 초대 링크(?room=CODE)로 들어왔거나, 새로고침 전에 하던 대국이 있으면 온라인으로 바로 간다
const invite = new URLSearchParams(location.search).get('room');
if (invite) { try { window.history.replaceState(null, '', location.pathname); } catch (_) {} }
function joinInvite(code) { showOnline(); net.send('join', { code: code.toUpperCase() }); }
if (loadSession()) {
  mode = 'online';
  buildBoard();
  showOverlay('<h2>대국으로 돌아가는 중…</h2>');
  net.connect();
  const until = setInterval(() => {
    if (room || !loadSession()) { clearInterval(until); if (!room) invite ? joinInvite(invite) : showOnline(); }
  }, 100);
} else if (invite) joinInvite(invite);
else showTitle();

/* @test-hooks:start */
window.__yut = { get st() { return st; }, get busy() { return busy; }, get mode() { return mode; }, get room() { return room; }, T, onThrow, onGroup, startGame, advance, get sel() { return sel; } };
/* @test-hooks:end */
})();
