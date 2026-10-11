'use strict';

// Whole-game simulations: every difficulty plays hundreds of complete games
// through the real Game API, and the AI's shots-to-win are measured.

const { Board, Game, SIZE, createRng, inBounds } = require('../js/game.js');
const { DIFFICULTIES, createAI } = require('../js/ai.js');

const GAMES_PER_DIFFICULTY = 500;

function key(row, col) { return row + ',' + col; }

function shuffledCells(rng) {
  const cells = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) cells.push({ row, col });
  }
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = cells[i]; cells[i] = cells[j]; cells[j] = tmp;
  }
  return cells;
}

// Plays one full game: a random-shooting stand-in for the human vs the AI.
function playFullGame(difficulty, seed, assert) {
  const rng = createRng(seed);
  const game = new Game({ difficulty, rng });
  game.playerBoard.randomize(rng);
  game.start();

  const playerTargets = shuffledCells(createRng(seed ^ 0x9e3779b9));
  const computerShots = new Set();
  let playerShots = 0;
  let turns = 0;

  while (game.phase === 'playing') {
    turns += 1;
    assert.ok(turns <= 200, 'game did not finish within 200 turns');
    if (game.turn === 'player') {
      const target = playerTargets[playerShots++];
      // Off-turn and repeat attempts must be rejected without changing state.
      assert.strictEqual(game.computerFire(), null, 'computer fired on player turn');
      const result = game.playerFire(target.row, target.col);
      assert.ok(result, 'valid player shot was rejected');
      if (game.phase === 'playing') {
        assert.strictEqual(game.playerFire(target.row, target.col), null, 'player fired twice in a row');
      }
    } else {
      const result = game.computerFire();
      assert.ok(result, 'computer could not fire on its turn');
      assert.ok(inBounds(result.row, result.col), 'computer fired off the board');
      const k = key(result.row, result.col);
      assert.ok(!computerShots.has(k), 'computer repeated shot ' + result.label);
      computerShots.add(k);
    }
  }

  assert.ok(game.winner === 'player' || game.winner === 'computer', 'game ended without a winner');
  if (game.winner === 'player') assert.ok(game.computerBoard.allSunk());
  if (game.winner === 'computer') assert.ok(game.playerBoard.allSunk());
  assert.strictEqual(game.playerFire(0, 0), null, 'player fired after game over');
  assert.strictEqual(game.computerFire(), null, 'computer fired after game over');
  return { winner: game.winner, computerShots: computerShots.size };
}

// Lets the AI fire uninterrupted at a fleet and counts shots until all are sunk.
function shotsToSinkFleet(difficulty, boardSeed, aiSeed, assert) {
  const board = new Board();
  board.randomize(createRng(boardSeed));
  const ai = createAI(difficulty, createRng(aiSeed));
  const seen = new Set();
  while (!board.allSunk()) {
    const shot = ai.nextShot();
    assert.ok(inBounds(shot.row, shot.col), difficulty + ' fired off the board');
    const k = key(shot.row, shot.col);
    assert.ok(!seen.has(k), difficulty + ' repeated a shot');
    seen.add(k);
    const result = board.receiveShot(shot.row, shot.col);
    ai.recordResult({
      row: shot.row,
      col: shot.col,
      result: result.result,
      shipSize: result.result === 'sunk' ? result.ship.size : undefined
    });
    assert.ok(seen.size <= SIZE * SIZE, difficulty + ' needed more than 100 shots');
  }
  return seen.size;
}

module.exports = function ({ test, assert, log }) {
  DIFFICULTIES.forEach(function (difficulty, index) {
    test(GAMES_PER_DIFFICULTY + ' complete games on ' + difficulty + ' end with a winner and no repeated shots', function () {
      let computerWins = 0;
      let winShots = 0;
      for (let i = 0; i < GAMES_PER_DIFFICULTY; i += 1) {
        const outcome = playFullGame(difficulty, 10000 * (index + 1) + i, assert);
        if (outcome.winner === 'computer') {
          computerWins += 1;
          winShots += outcome.computerShots;
        }
      }
      log('    ' + difficulty + ': computer won ' + computerWins + '/' + GAMES_PER_DIFFICULTY +
        ' full games vs a random-shooting player' +
        (computerWins ? ', averaging ' + (winShots / computerWins).toFixed(1) + ' shots per win' : ''));
    });
  });

  test('average shots to win: hard < normal < easy (' + GAMES_PER_DIFFICULTY + ' fleets each)', function () {
    const averages = {};
    DIFFICULTIES.forEach(function (difficulty) {
      let total = 0;
      let min = Infinity;
      let max = 0;
      for (let i = 0; i < GAMES_PER_DIFFICULTY; i += 1) {
        // Same fleets for every difficulty so the comparison is fair.
        const shots = shotsToSinkFleet(difficulty, 777000 + i, 555000 + i, assert);
        total += shots;
        min = Math.min(min, shots);
        max = Math.max(max, shots);
      }
      averages[difficulty] = total / GAMES_PER_DIFFICULTY;
      log('    ' + difficulty.padEnd(6) + ' average ' + averages[difficulty].toFixed(1) +
        ' shots to sink the whole fleet (min ' + min + ', max ' + max + ')');
    });
    assert.ok(averages.hard < averages.normal, 'hard should need fewer shots than normal');
    assert.ok(averages.normal < averages.easy, 'normal should need fewer shots than easy');
  });
};
