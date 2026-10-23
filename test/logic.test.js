'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

// 칸을 정해 놓고 시작하는 판 (owner 0 의 말 id 0~3, owner 1 의 말 id 4~7)
function setup(places = {}) {
  const st = L.newGame({ seed: 1 });
  for (const [id, [pos, via]] of Object.entries(places)) { st.pieces[id].pos = pos; st.pieces[id].via = via || null; }
  return st;
}
const throwAndPending = (st, flats) => { const t = L.throwTurn(st, flats); return t; };

test('flats to steps: 1 do, 2 gae, 3 geol, 4 yut, 0 mo', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 0].map(L.stepsOfFlats), [1, 2, 3, 4, 5]);
  const names = [1, 2, 3, 4, 0].map((n) => L.throwSticks(() => 0.5, n).name);
  assert.deepStrictEqual(names, ['도', '개', '걸', '윷', '모']);
  assert.ok(L.throwSticks(() => 0.5, 4).extra);
  assert.ok(L.throwSticks(() => 0.5, 0).extra);
  assert.ok(!L.throwSticks(() => 0.5, 3).extra);
});

test('throw odds add up to one and match the sticks', () => {
  const sum = Object.values(L.CHANCE).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  const rand = (() => { let a = 12345; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
  const n = 40000, cnt = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let i = 0; i < n; i++) cnt[L.throwSticks(rand).steps]++;
  for (const s of [1, 2, 3, 4, 5]) assert.ok(Math.abs(cnt[s] / n - L.CHANCE[s]) < 0.01, 'steps ' + s);
});

test('outer road: waiting piece enters and walks', () => {
  assert.deepStrictEqual(L.advance(L.WAIT, null, 3).path, [1, 2, 3]);
  assert.strictEqual(L.advance(L.WAIT, null, 5).pos, 5);
  assert.deepStrictEqual(L.advance(3, null, 3).path, [4, 5, 6]);       // 지나가기만 하면 지름길로 안 빠진다
  assert.deepStrictEqual(L.advance(8, null, 4).path, [9, 10, 11, 12]);
});

test('corner shortcut is taken only when the move starts on the corner', () => {
  assert.deepStrictEqual(L.advance(5, null, 5).path, [20, 21, 22, 23, 24]);
  assert.deepStrictEqual(L.advance(10, null, 5).path, [25, 26, 22, 27, 28]);
  assert.deepStrictEqual(L.advance(5, null, 1).path, [20]);
  assert.deepStrictEqual(L.advance(7, null, 5).path, [8, 9, 10, 11, 12]);   // 10 번을 지나쳐도 바깥 길
  assert.deepStrictEqual(L.advance(15, null, 2).path, [16, 17]);             // 15 번에는 지름길이 없다
});

test('center continues straight on both diagonals', () => {
  assert.deepStrictEqual(L.advance(21, 'A', 4).path, [22, 23, 24, 15]);
  assert.deepStrictEqual(L.advance(26, 'B', 3).path, [22, 27, 28]);
  assert.deepStrictEqual(L.advance(22, 'A', 3).path, [23, 24, 15]);
  assert.deepStrictEqual(L.advance(22, 'B', 3).path, [27, 28, 'done']);
  const r = L.advance(24, 'A', 3);
  assert.deepStrictEqual(r.path, [15, 16, 17]);
  assert.strictEqual(r.via, null);
});

test('finishing: passing the start line completes the lap', () => {
  assert.strictEqual(L.advance(19, null, 1).done, true);
  assert.strictEqual(L.advance(18, null, 5).done, true);
  assert.strictEqual(L.advance(28, 'B', 1).done, true);
  assert.strictEqual(L.advance(27, 'B', 3).done, true);
  assert.strictEqual(L.advance(17, null, 2).done, false);
  assert.strictEqual(L.advance(17, null, 2).pos, 19);
  assert.strictEqual(L.advance(L.WAIT, null, 1).pos, 1);
});

test('every position and move stays on the board', () => {
  const places = [[L.WAIT, null]];
  for (let p = 1; p <= 19; p++) places.push([p, null]);
  for (const p of [20, 21, 22, 23, 24]) places.push([p, 'A']);
  for (const p of [25, 26, 22, 27, 28]) places.push([p, 'B']);
  for (const [pos, via] of places) for (let s = 1; s <= 5; s++) {
    const r = L.advance(pos, via, s);
    assert.ok(r.done || (r.pos >= 1 && r.pos <= 28), `${pos}+${s}`);
    assert.ok(r.path.length >= 1 && r.path.length <= s);
  }
});

test('remaining counts down to finish', () => {
  assert.strictEqual(L.remaining(28, 'B'), 1);
  assert.strictEqual(L.remaining(19, null), 1);
  assert.ok(L.remaining(5, null) < L.remaining(4, null) + 1);
  assert.ok(L.remaining(L.WAIT, null) > L.remaining(1, null));
});

test('new game: eight pieces waiting, red first, one throw', () => {
  const st = L.newGame({ seed: 3 });
  assert.strictEqual(st.pieces.length, 8);
  assert.ok(st.pieces.every((p) => p.pos === L.WAIT));
  assert.deepStrictEqual([st.turn, st.throwsLeft, L.phase(st)], [0, 1, 'throw']);
  assert.strictEqual(L.newGame({ seed: 3, pieces: 3 }).pieces.length, 6);
});

test('throw is only allowed in the throw phase and builds the pending list', () => {
  const st = setup();
  assert.ok(L.throwTurn(st, 2));
  assert.deepStrictEqual(st.pending, [{ name: '개', steps: 2 }]);
  assert.strictEqual(L.phase(st), 'move');
  assert.strictEqual(L.throwTurn(st, 2), null);
});

test('yut and mo give extra throws before moving', () => {
  const st = setup();
  L.throwTurn(st, 4);
  assert.strictEqual(L.phase(st), 'throw');
  L.throwTurn(st, 0);
  assert.strictEqual(L.phase(st), 'throw');
  L.throwTurn(st, 1);
  assert.strictEqual(L.phase(st), 'move');
  assert.deepStrictEqual(st.pending.map((p) => p.steps), [4, 5, 1]);
});

test('moving uses one result at a time and the turn passes when all are used', () => {
  const st = setup();
  L.throwTurn(st, 4); L.throwTurn(st, 2);
  const r1 = L.move(st, 0, L.WAIT);
  assert.deepStrictEqual([r1.from, r1.to, r1.steps], [L.WAIT, 4, 4]);
  assert.strictEqual(st.turn, 0);
  const r2 = L.move(st, 0, 4);
  assert.strictEqual(r2.to, 6);
  assert.strictEqual(st.turn, 1);
  assert.deepStrictEqual([st.throwsLeft, st.pending.length, L.phase(st)], [1, 0, 'throw']);
});

test('only one waiting piece enters at a time', () => {
  const st = setup();
  L.throwTurn(st, 2);
  L.move(st, 0, L.WAIT);
  assert.strictEqual(st.pieces.filter((p) => p.owner === 0 && p.pos === L.WAIT).length, 3);
  assert.strictEqual(st.pieces.filter((p) => p.owner === 0 && p.pos === 2).length, 1);
});

test('invalid moves are refused and change nothing', () => {
  const st = setup({ 0: [7] });
  assert.strictEqual(L.move(st, 0, 7), null);                         // 아직 안 던짐
  L.throwTurn(st, 2);
  const before = JSON.stringify(st.pieces) + JSON.stringify(st.pending);
  assert.strictEqual(L.move(st, 1, 7), null);
  assert.strictEqual(L.move(st, -1, 7), null);
  assert.strictEqual(L.move(st, 0, 12), null);                        // 그 칸에 내 말이 없다
  assert.strictEqual(L.move(st, 0, 99), null);
  assert.strictEqual(JSON.stringify(st.pieces) + JSON.stringify(st.pending), before);
});

test('landing on an enemy captures every piece there and earns a throw', () => {
  const st = setup({ 0: [3], 4: [6], 5: [6] });
  L.throwTurn(st, 3);
  const r = L.move(st, 0, 3);
  assert.strictEqual(r.captured, 2);
  assert.strictEqual(st.pieces[4].pos, L.WAIT);
  assert.strictEqual(st.pieces[5].pos, L.WAIT);
  assert.strictEqual(st.turn, 0);
  assert.deepStrictEqual([st.throwsLeft, L.phase(st)], [1, 'throw']);
  assert.strictEqual(st.stats.captures[0], 2);
});

test('capture is kept for the next throw even with results left', () => {
  const st = setup({ 0: [3], 4: [4] });
  L.throwTurn(st, 4); L.throwTurn(st, 1);                              // 윷(4) 와 도(1)
  L.move(st, 1, 3);                                                    // 도로 4 번을 잡는다
  assert.strictEqual(st.throwsLeft, 1);
  assert.strictEqual(st.pending.length, 1);
  L.throwTurn(st, 2);
  assert.strictEqual(L.phase(st), 'move');
  assert.strictEqual(st.pending.length, 2);
});

test('captured piece loses its shortcut state', () => {
  const st = setup({ 0: [19], 4: [22, 'A'] });
  st.pieces[0].pos = 21; st.pieces[0].via = 'A';
  L.throwTurn(st, 1);
  L.move(st, 0, 21);
  assert.strictEqual(st.pieces[4].pos, L.WAIT);
  assert.strictEqual(st.pieces[4].via, null);
});

test('landing on your own piece stacks and the stack moves together', () => {
  const st = setup({ 0: [3], 1: [5] });
  L.throwTurn(st, 2);
  st.pending.push({ name: '걸', steps: 3 });                           // 아직 안 쓴 결과가 하나 더 남은 상황
  const r = L.move(st, 0, 3);
  assert.ok(r.stacked);
  assert.strictEqual(st.pieces[0].pos, 5);
  assert.strictEqual(st.pieces[1].pos, 5);
  const g = L.groups(st, 0).find((x) => x.pos === 5);
  assert.deepStrictEqual(g.ids.sort(), [0, 1]);
  const r2 = L.move(st, 0, 5);                                         // 5 번에서 출발: 지름길
  assert.deepStrictEqual(r2.path, [20, 21, 22]);
  assert.deepStrictEqual(r2.moving.sort(), [0, 1]);
  assert.deepStrictEqual([st.pieces[0].pos, st.pieces[1].pos, st.pieces[0].via, st.pieces[1].via], [22, 22, 'A', 'A']);
});

test('enemy stack is captured as a whole and stacking with a captured square works', () => {
  const st = setup({ 0: [1], 1: [2], 4: [7], 5: [7], 6: [7] });
  L.throwTurn(st, 1);
  L.move(st, 0, 1);                                                    // 1 → 2 업기
  assert.strictEqual(L.groups(st, 0).find((g) => g.pos === 2).ids.length, 2);
  const st2 = setup({ 0: [4], 4: [7], 5: [7], 6: [7] });
  L.throwTurn(st2, 3);
  assert.strictEqual(L.move(st2, 0, 4).captured, 3);
});

test('a stack can finish together', () => {
  const st = setup({ 0: [19], 1: [19] });
  L.throwTurn(st, 1);
  const r = L.move(st, 0, 19);
  assert.ok(r.done);
  assert.deepStrictEqual([st.pieces[0].pos, st.pieces[1].pos], [L.DONE, L.DONE]);
  assert.strictEqual(st.winner, -1);
});

test('finishing all four pieces wins at once', () => {
  const st = setup({ 0: [L.DONE], 1: [L.DONE], 2: [L.DONE], 3: [19] });
  L.throwTurn(st, 1);
  L.move(st, 0, 19);
  assert.strictEqual(st.winner, 0);
  assert.strictEqual(L.phase(st), 'over');
  assert.strictEqual(L.throwTurn(st, 1), null);
  assert.deepStrictEqual(L.options(st), []);
});

test('preview does not change the game', () => {
  const st = setup({ 0: [4], 4: [6] });
  L.throwTurn(st, 2);
  const before = JSON.stringify(st);
  const g = L.groups(st, 0).find((x) => x.pos === 4);
  const p = L.preview(st, g, 2);
  assert.strictEqual(p.pos, 6);
  assert.deepStrictEqual(p.capture, [4]);
  assert.strictEqual(JSON.stringify(st), before);
});

test('options list each distinct result with each group', () => {
  const st = setup({ 0: [3], 1: [8] });
  L.throwTurn(st, 4); L.throwTurn(st, 2); L.throwTurn(st, 2);
  const opts = L.options(st);
  const stepsList = [...new Set(opts.map((o) => st.pending[o.idx].steps))].sort();
  assert.deepStrictEqual(stepsList, [2, 4]);
  assert.strictEqual(opts.length, 2 * 3);                              // 결과는 두 종류(개는 한 번만) x 묶음 셋(대기 + 말 두 개)
});

test('ai always picks a legal option and prefers a capture', () => {
  for (const level of ['easy', 'hard']) {
    const st = setup({ 0: [3], 1: [10], 4: [6] });
    L.throwTurn(st, 3);
    const pick = L.aiPick(st, level, () => 0.5);
    assert.ok(L.options(st).some((o) => o.idx === pick.idx && o.groupPos === pick.groupPos));
    assert.strictEqual(pick.groupPos, 3, level);                      // 3 번 말이 걸로 6 번 상대를 잡는다
  }
});

test('hard ai finishes a piece when it can and avoids a risky square', () => {
  const st = setup({ 0: [19], 1: [3], 2: [L.WAIT] });
  L.throwTurn(st, 1);
  assert.strictEqual(L.aiPick(st, 'hard', () => 0.5).groupPos, 19);
  const st2 = setup({ 0: [1], 1: [2], 4: [4] });                      // 1 번 말이 2 칸 가면 4 번(상대)을 잡는다
  L.throwTurn(st2, 2);
  assert.strictEqual(L.aiPick(st2, 'hard', () => 0.5).groupPos, 2);   // 2 번 말은 2 칸 가서 4 번을 잡는다
});

// 컴퓨터끼리 끝까지 두어 보기: 끝나지 않거나 규칙이 깨지면 여기서 걸린다
for (const level of ['easy', 'hard']) {
  test('full games between computers always finish with a winner (' + level + ')', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const st = L.newGame({ seed });
      let guard = 0;
      while (st.winner < 0) {
        if (++guard > 4000) assert.fail('stuck, seed ' + seed);
        if (L.phase(st) === 'throw') { assert.ok(L.throwTurn(st)); continue; }
        const pick = L.aiPick(st, level);
        assert.ok(pick, 'no option, seed ' + seed);
        assert.ok(L.move(st, pick.idx, pick.groupPos), 'bad move, seed ' + seed);
        for (const p of st.pieces) assert.ok(p.pos === L.WAIT || p.pos === L.DONE || (p.pos >= 1 && p.pos <= 28));
      }
      const loser = st.pieces.filter((p) => p.owner === 1 - st.winner && p.pos === L.DONE).length;
      assert.ok(loser < 4);
    }
  });
}

test('hard ai beats easy ai most of the time', () => {
  let hardWins = 0;
  const games = 200;
  for (let seed = 1; seed <= games; seed++) {
    const st = L.newGame({ seed });
    const level = [ 'hard', 'easy' ];
    while (st.winner < 0) {
      if (L.phase(st) === 'throw') { L.throwTurn(st); continue; }
      const pick = L.aiPick(st, level[st.turn]);
      L.move(st, pick.idx, pick.groupPos);
    }
    if (st.winner === 0) hardWins++;
  }
  assert.ok(hardWins / games > 0.55, 'hard won ' + hardWins + ' of ' + games);
});
