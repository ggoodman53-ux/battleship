'use strict';

const { Board, createRng } = require('../js/game.js');
const { DIFFICULTIES, createAI } = require('../js/ai.js');

module.exports = function ({ test, assert }) {
  test('each difficulty exhausts 100 unique in-bounds shots', function () {
    DIFFICULTIES.forEach(function (difficulty, index) {
      const ai = createAI(difficulty, createRng(500 + index));
      const tried = new Set();
      for (let turn = 0; turn < 100; turn += 1) {
        const shot = ai.nextShot();
        assert.strictEqual(Number.isInteger(shot.row) && shot.row >= 0 && shot.row < 10, true);
        assert.strictEqual(Number.isInteger(shot.col) && shot.col >= 0 && shot.col < 10, true);
        const key = shot.row + ',' + shot.col;
        assert.strictEqual(tried.has(key), false, difficulty + ' repeated ' + key);
        tried.add(key);
        ai.recordResult({ row: shot.row, col: shot.col, result: 'miss' });
      }
      assert.strictEqual(tried.size, 100);
    });
  });

  test('normal follows an unresolved line after two hits', function () {
    const ai = createAI('normal', function () { return 0; });
    ai.recordResult({ row: 4, col: 4, result: 'hit' });
    ai.recordResult({ row: 4, col: 5, result: 'hit' });
    const shot = ai.nextShot();
    assert.ok(
      (shot.row === 4 && shot.col === 3) || (shot.row === 4 && shot.col === 6),
      'expected a shot immediately beyond the hit line, got ' + shot.row + ',' + shot.col
    );
  });

  test('normal resolves adjacent parallel ships without leaving live hits', function () {
    const board = new Board();
    board.placeShip('battleship', 0, 0, 'H');
    board.placeShip('destroyer', 1, 0, 'H');
    const ai = createAI('normal', function () { return 0; });
    const observedHits = new Set();
    let shots = 0;

    while ((!board.isSunk('battleship') || !board.isSunk('destroyer')) && shots < 100) {
      const shot = ai.nextShot();
      const result = board.receiveShot(shot.row, shot.col);
      ai.recordResult({
        row: shot.row,
        col: shot.col,
        result: result.result,
        shipSize: result.result === 'sunk' ? result.ship.size : undefined
      });
      if (result.result === 'hit') observedHits.add(shot.row + ',' + shot.col);
      if (result.result === 'sunk') {
        result.cells.forEach(function (cell) { observedHits.delete(cell.row + ',' + cell.col); });
      }
      shots += 1;
    }

    assert.strictEqual(board.isSunk('battleship'), true);
    assert.strictEqual(board.isSunk('destroyer'), true);
    assert.strictEqual(observedHits.size, 0);
  });

  test('hard targets an untried cell adjacent to a lone hit', function () {
    const ai = createAI('hard', function () { return 0; });
    ai.recordResult({ row: 5, col: 5, result: 'hit' });
    const shot = ai.nextShot();
    assert.strictEqual(Math.abs(shot.row - 5) + Math.abs(shot.col - 5), 1);
  });

  test('unknown difficulties throw', function () {
    assert.throws(function () { createAI('expert'); }, /Unknown difficulty/);
  });
};
