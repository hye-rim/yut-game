'use strict';

// 서버 시험: 보안·안정성 회귀 + 윷놀이 온라인 대국 흐름
// 실행: npm test  (Node 18 이상, 별도 설치 없이 node:test)
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { WebSocket } = require('ws');
const L = require('../public/logic.js');

// 운영체제가 지금 비어 있는 포트를 골라 준다 (고정 포트·범위 난수는 다른 서버와 겹쳐 가끔 실패한다)
const freePort = () => Number(require('child_process').execFileSync(process.execPath, ['-e', "const s = require('net').createServer().listen(0, '127.0.0.1', () => { console.log(s.address().port); s.close(); })"]));
const PORT = freePort();
const get = (p) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'GET' }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject); req.end();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), TURN_MS: '2500' }, stdio: 'ignore' });
child.unref();
process.on('exit', () => child.kill());
const ready = (async () => {
  for (let i = 0; i < 80; i++) { try { await get('/'); return; } catch { await sleep(100); } }
  throw new Error('server did not start');
})();

const open = () => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const c = { ws, msgs: [], room: null, queued: false, errors: [], closed: null };
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(d); } catch { return; }
    c.msgs.push(m);
    if (m.t === 'room') c.room = m;
    if (m.t === 'queued') c.queued = true;
    if (m.t === 'error') c.errors.push(m.msg);
  });
  ws.on('close', (code) => { c.closed = code; });
  ws.on('error', () => {});
  ws.on('open', () => resolve(c));
  setTimeout(() => reject(new Error('websocket connect failed')), 3000);
});
const send = (c, t, p = {}) => c.ws.send(JSON.stringify({ t, ...p }));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(15); } return false; };

// 두 손님을 빠른 대전으로 맺어 준다
async function pair() {
  const a = await open(), b = await open();
  send(a, 'hello', { name: '가' }); send(b, 'hello', { name: '나' });
  send(a, 'quick'); await until(() => a.queued);
  send(b, 'quick');
  assert.ok(await until(() => a.room && b.room && a.room.state === 'playing' && b.room.state === 'playing'), 'both players enter a playing room');
  return [a, b];
}
const mover = (a, b) => (a.room.turn === a.room.you ? a : b);
// 방이 보내 준 판을 규칙 함수가 읽는 모양으로
const viewOf = (room) => ({ pieces: room.pieces.map((p) => ({ ...p })), perSide: room.perSide, turn: room.turn, throwsLeft: room.throwsLeft, pending: room.pending.map((x) => ({ ...x })), winner: room.state === 'over' ? room.winner : -1 });
const waitForSeq = async (a, b, key, seq) => assert.ok(await until(() => a.room[key] && a.room[key].seq > seq && b.room[key] && b.room[key].seq > seq), key + ' reaches both players');
// 서버에 던지기 하나를 시키고 양쪽에 반영될 때까지 기다린다
async function doThrow(a, b) {
  const m = mover(a, b), seq = m.room.lastThrow ? m.room.lastThrow.seq : 0;
  send(m, 'throw');
  await waitForSeq(a, b, 'lastThrow', seq);
}
// 결과를 쓰기 좋은 수 하나를 컴퓨터(어려움)가 고른 대로 보낸다
async function doMove(a, b) {
  const m = mover(a, b), seq = m.room.lastMove ? m.room.lastMove.seq : 0;
  const pick = L.aiPick(viewOf(m.room), 'hard', Math.random);
  send(m, 'move', { idx: pick.idx, pos: pick.groupPos });
  await until(() => (a.room.lastMove && a.room.lastMove.seq > seq && b.room.lastMove && b.room.lastMove.seq > seq) || a.room.state === 'over');
}

test('malformed URLs get 400 and the server stays up', async () => {
  await ready;
  assert.strictEqual(await get('/%'), 400);
  assert.strictEqual(await get('/%00'), 400);
  assert.strictEqual(await get('/'), 200);
  assert.strictEqual(await get('/logic.js'), 200);
});

test('dotfiles and paths outside the public dir are not served', async () => {
  await ready;
  assert.strictEqual(await get('/.git/config'), 403);
  assert.ok([403, 404].includes(await get('/../server.js')));
});

test('oversized websocket message closes the connection (1009)', async () => {
  await ready;
  const c = await open();
  c.ws.send('x'.repeat(2 * 1024 * 1024));
  await sleep(500);
  assert.strictEqual(c.closed, 1009);
  assert.strictEqual(await get('/'), 200);
});

test('quick match starts with all pieces waiting and red to throw', async () => {
  await ready;
  const [a, b] = await pair();
  assert.strictEqual(a.room.code, b.room.code);
  assert.notStrictEqual(a.room.you, b.room.you);
  assert.strictEqual(a.room.turn, 0);
  assert.strictEqual(a.room.pieces.length, 8);
  assert.ok(a.room.pieces.every((p) => p.pos === L.WAIT));
  assert.deepStrictEqual([a.room.throwsLeft, a.room.pending.length], [1, 0]);
  a.ws.close(); b.ws.close();
});

test('out-of-turn and garbage actions are ignored', async () => {
  await ready;
  const [a, b] = await pair();
  const m = mover(a, b), other = m === a ? b : a;
  send(other, 'throw');                                              // 내 차례가 아님
  send(m, 'move', { idx: 0, pos: -1 });                              // 아직 안 던짐
  await sleep(250);
  assert.ok(!m.room.lastThrow && !m.room.lastMove);
  send(m, 'throw');
  await until(() => m.room.lastThrow);
  const before = JSON.stringify(m.room.pieces) + JSON.stringify(m.room.pending);
  send(other, 'move', { idx: 0, pos: -1 });                          // 남의 차례
  for (const bad of [{}, { idx: 'a', pos: -1 }, { idx: 0, pos: 'x' }, { idx: null, pos: -1 }, { idx: 0.5, pos: -1 }, { idx: 99, pos: -1 }, { idx: -1, pos: -1 }, { idx: 0, pos: 12 }, { idx: 0, pos: 99 }, { idx: 0, pos: 1e999 }]) send(m, 'move', bad);
  await sleep(300);
  assert.strictEqual(JSON.stringify(m.room.pieces) + JSON.stringify(m.room.pending), before, 'nothing changed');
  assert.ok(!m.room.lastMove);
  a.ws.close(); b.ws.close();
});

test('the server throws and both players see the same result', async () => {
  await ready;
  const [a, b] = await pair();
  await doThrow(a, b);
  assert.deepStrictEqual(a.room.lastThrow, b.room.lastThrow);
  const t = a.room.lastThrow;
  assert.strictEqual(t.flats.length, 4);
  assert.strictEqual(L.stepsOfFlats(t.flats.filter(Boolean).length), t.steps);
  assert.strictEqual(L.NAMES[t.steps], t.name);
  assert.strictEqual(a.room.pending[a.room.pending.length - 1].steps, t.steps);
  a.ws.close(); b.ws.close();
});

test('a full game between two bots finishes with a winner and fair stats', async () => {
  await ready;
  const [a, b] = await pair();
  let n = 0;
  while (a.room.state === 'playing' && n++ < 1500) {
    const ph = L.phase(viewOf(mover(a, b).room));
    if (ph === 'throw') await doThrow(a, b); else await doMove(a, b);
  }
  assert.ok(await until(() => a.room.state === 'over' && b.room.state === 'over'), 'the game ends');
  assert.strictEqual(a.room.reason, 'finish');
  assert.strictEqual(a.room.winner, b.room.winner);
  const w = a.room.winner;
  assert.strictEqual(a.room.pieces.filter((p) => p.owner === w && p.pos === L.DONE).length, 4);
  assert.ok(a.room.pieces.filter((p) => p.owner === 1 - w && p.pos === L.DONE).length < 4);
  assert.deepStrictEqual(a.room.pieces, b.room.pieces, 'same board for both');
  a.ws.close(); b.ws.close();
});

test('resigning ends the game and rematch swaps who goes first', async () => {
  await ready;
  const [a, b] = await pair();
  const colorA = a.room.you;
  send(a, 'resign');
  assert.ok(await until(() => b.room.state === 'over'));
  assert.strictEqual(b.room.reason, 'resign');
  assert.strictEqual(b.room.winner, b.room.you);
  send(a, 'rematch'); send(b, 'rematch');
  assert.ok(await until(() => a.room.state === 'playing' && a.room.games === 2));
  assert.notStrictEqual(a.room.you, colorA, 'colors swap on a rematch');
  assert.strictEqual(a.room.turn, 0);
  assert.ok(a.room.pieces.every((p) => p.pos === L.WAIT), 'a fresh board');
  a.ws.close(); b.ws.close();
});

test('running out of time loses the game for the one on move', async () => {
  await ready;
  const [a, b] = await pair();
  const first = mover(a, b);
  assert.ok(await until(() => a.room.state === 'over', 5000), 'the timer fires');
  assert.strictEqual(a.room.reason, 'timeout');
  assert.strictEqual(a.room.winner, 1 - first.room.you, 'the one who had to throw loses');
  a.ws.close(); b.ws.close();
});

test('private rooms: create, join by code, and a third player is turned away', async () => {
  await ready;
  const a = await open(), b = await open(), c = await open();
  send(a, 'create');
  assert.ok(await until(() => a.room && a.room.code));
  assert.strictEqual(a.room.state, 'waiting');
  send(b, 'join', { code: a.room.code.toLowerCase() });
  assert.ok(await until(() => a.room.state === 'playing' && b.room && b.room.state === 'playing'));
  send(c, 'join', { code: a.room.code });
  assert.ok(await until(() => c.errors.length > 0));
  assert.match(c.errors[0], /이미 두 사람/);
  a.ws.close(); b.ws.close(); c.ws.close();
});

test('a dropped player can resume the same seat with the token', async () => {
  await ready;
  const [a, b] = await pair();
  const token = a.room.token, code = a.room.code, you = a.room.you;
  a.ws.close();
  assert.ok(await until(() => b.room.players.some((p) => !p.online)), 'the other side sees the drop');
  const a2 = await open();
  send(a2, 'resume', { code, token });
  assert.ok(await until(() => a2.room && a2.room.you === you && a2.room.state === 'playing'));
  assert.ok(await until(() => b.room.players.every((p) => p.online)));
  a2.ws.close(); b.ws.close();
});

// 같은 주소에서 코드를 일부러 많이 틀리므로 이 시험은 맨 뒤에 둔다 (뒤의 시험이 막히지 않게)
test('repeated wrong room codes get temporarily blocked', async () => {
  await ready;
  const c = await open();
  for (let i = 0; i < 10; i++) c.ws.send(JSON.stringify({ t: 'join', code: 'ZZZ' + 'ABCDEFGH'[i] }));
  await sleep(500);
  assert.ok(c.errors.some((x) => /그런 방이 없어요/.test(x)), 'first attempts are answered with room-not-found');
  assert.ok(c.errors.some((x) => /너무 많이 틀렸어요/.test(x)), 'many wrong codes get blocked');
  c.ws.close();
});

test('shutdown', () => { child.kill(); });
