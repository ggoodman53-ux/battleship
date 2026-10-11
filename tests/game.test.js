'use strict';

const GameModule = require('../js/game.js');
const { Board, Game, FLEET, createRng, coordLabel, inBounds, shipCells } = GameModule;

module.exports = function ({ test, assert }) {
  test('coordinate helpers label the board and reject invalid coordinates', function () {
    assert.strictEqual(coordLabel(0, 0), 'A1');
    assert.strictEqual(coordLabel(9, 9), 'J10');
    assert.strictEqual(inBounds(0, 0), true);
    assert.strictEqual(inBounds(9, 9), true);
    assert.strictEqual(inBounds(1.5, 2), false);
    assert.strictEqual(inBounds(10, 0), false);
    assert.deepStrictEqual(shipCells(2, 3, 3, 'H'), [
      { row: 2, col: 3 }, { row: 2, col: 4 }, { row: 2, col: 5 }
    ]);
    assert.deepStrictEqual(shipCells(2, 3, 2, 'V'), [
      { row: 2, col: 3 }, { row: 3, col: 3 }
    ]);
  });

  test('valid placement, overlap and invalid placements', function () {
    const board = new Board();
    assert.strictEqual(board.placeShip('carrier', 0, 0, 'H'), true);
    assert.strictEqual(board.canPlace('destroyer', 0, 4, 'H'), false);
    assert.strictEqual(board.placeShip('destroyer', 0, 4, 'H'), false);
    assert.strictEqual(board.canPlace('carrier', 0, 6, 'H'), false);
    assert.strictEqual(board.canPlace('carrier', 6, 0, 'V'), false);
    assert.strictEqual(board.canPlace('carrier', -1, 0, 'V'), false);
    assert.strictEqual(board.canPlace('unknown', 0, 0, 'H'), false);
    assert.strictEqual(board.placeShip('unknown', 0, 0, 'H'), false);
    assert.strictEqual(board.ships.length, 1);
  });

  test('repositioning ignores the ship itself and invalid moves preserve it', function () {
    const board = new Board();
    assert.strictEqual(board.placeShip('destroyer', 0, 0, 'H'), true);
    assert.strictEqual(board.canPlace('destroyer', 0, 1, 'H'), true);
    assert.strictEqual(board.placeShip('destroyer', 2, 2, 'V'), true);
    assert.strictEqual(board.getShip('destroyer').row, 2);
    assert.strictEqual(board.getShip('destroyer').col, 2);
    assert.strictEqual(board.ships.length, 1);
    assert.strictEqual(board.placeShip('destroyer', 9, 9, 'H'), false);
    assert.deepStrictEqual(board.getShip('destroyer').cells, [
      { row: 2, col: 2 }, { row: 3, col: 2 }
    ]);
  });

  test('allPlaced reflects the complete fleet', function () {
    const board = new Board();
    assert.strictEqual(board.allPlaced(), false);
    board.randomize(createRng(7));
    assert.strictEqual(board.allPlaced(), true);
    FLEET.forEach(function (ship) {
      assert.strictEqual(board.getShip(ship.id).size, ship.size);
    });
  });

  test('randomize creates legal complete fleets across 1,000 seeds', function () {
    for (let seed = 0; seed < 1000; seed += 1) {
      const board = new Board();
      board.randomize(createRng(seed));
      assert.strictEqual(board.ships.length, 5);
      assert.strictEqual(board.allPlaced(), true);
      const occupied = new Set();
      let cellCount = 0;
      board.ships.forEach(function (ship) {
        const definition = FLEET.find(function (entry) { return entry.id === ship.id; });
        assert.strictEqual(ship.size, definition.size);
        assert.strictEqual(ship.cells.length, ship.size);
        const rows = new Set(ship.cells.map(function (cell) { return cell.row; }));
        const cols = new Set(ship.cells.map(function (cell) { return cell.col; }));
        assert.strictEqual(rows.size === 1 || cols.size === 1, true);
        ship.cells.forEach(function (cell, index) {
          assert.strictEqual(inBounds(cell.row, cell.col), true);
          const key = cell.row + ',' + cell.col;
          assert.strictEqual(occupied.has(key), false);
          occupied.add(key);
          if (index > 0) {
            const previous = ship.cells[index - 1];
            const deltaRow = Math.abs(cell.row - previous.row);
            const deltaCol = Math.abs(cell.col - previous.col);
            assert.strictEqual(deltaRow + deltaCol, 1);
            assert.strictEqual(deltaRow === 1 || deltaCol === 1, true);
          }
        });
        cellCount += ship.cells.length;
      });
      assert.strictEqual(cellCount, 17);
      assert.strictEqual(occupied.size, 17);
    }
  });

  test('shots detect miss, hit, sunk, ship names and cell states', function () {
    const board = new Board();
    board.placeShip('destroyer', 0, 0, 'H');
    const miss = board.receiveShot(9, 9);
    assert.strictEqual(miss.result, 'miss');
    assert.strictEqual(miss.ship, null);
    assert.strictEqual(miss.label, 'J10');
    const hit = board.receiveShot(0, 0);
    assert.strictEqual(hit.result, 'hit');
    assert.deepStrictEqual(hit.ship, { id: 'destroyer', name: 'Destroyer', size: 2 });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(hit, 'cells'), false);
    assert.strictEqual(board.cellState(0, 0), 'hit');
    const sunk = board.receiveShot(0, 1);
    assert.strictEqual(sunk.result, 'sunk');
    assert.deepStrictEqual(sunk.ship, { id: 'destroyer', name: 'Destroyer', size: 2 });
    assert.deepStrictEqual(sunk.cells, [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    assert.strictEqual(board.cellState(0, 0), 'sunk');
  });

  test('allSunk becomes true only after the last ship cell is hit', function () {
    const board = new Board();
    board.randomize(createRng(21));
    assert.strictEqual(board.allSunk(), false);
    const cells = board.ships.flatMap(function (ship) {
      return ship.cells.map(function (cell) { return { row: cell.row, col: cell.col }; });
    });
    cells.slice(0, -1).forEach(function (cell) {
      board.receiveShot(cell.row, cell.col);
      assert.strictEqual(board.allSunk(), false);
    });
    const finalCell = cells[cells.length - 1];
    board.receiveShot(finalCell.row, finalCell.col);
    assert.strictEqual(board.allSunk(), true);
    assert.deepStrictEqual(board.remainingShips(), []);
  });

  test('duplicate shots do not change state and invalid receiveShot throws', function () {
    const board = new Board();
    board.placeShip('destroyer', 0, 0, 'H');
    assert.strictEqual(board.receiveShot(9, 9).result, 'miss');
    const count = board.shotCount;
    assert.strictEqual(board.receiveShot(9, 9), null);
    assert.strictEqual(board.shotCount, count);
    assert.throws(function () { board.receiveShot(10, 0); }, RangeError);
    assert.throws(function () { board.receiveShot(1.5, 0); }, RangeError);
  });

  test('clear removes ships and recorded shots', function () {
    const board = new Board();
    board.placeShip('destroyer', 0, 0, 'H');
    board.receiveShot(9, 9);
    board.clear();
    assert.deepStrictEqual(board.ships, []);
    assert.strictEqual(board.shotCount, 0);
    assert.strictEqual(board.allPlaced(), false);
  });

  test('Game requires fleet setup and alternates turns from player first', function () {
    const game = new Game({ rng: createRng(42) });
    assert.throws(function () { game.start(); }, /full fleet/);
    game.playerBoard.randomize(createRng(5));
    game.start();
    assert.strictEqual(game.phase, 'playing');
    assert.strictEqual(game.turn, 'player');
    const first = game.playerFire(0, 0);
    assert.ok(first);
    assert.strictEqual(game.turn, 'computer');
    assert.strictEqual(game.playerFire(0, 1), null);
    assert.strictEqual(game.turn, 'computer');
    assert.ok(game.computerFire());
    assert.strictEqual(game.turn, 'player');
    assert.strictEqual(game.playerFire(0, 0), null);
    assert.strictEqual(game.turn, 'player');
  });

  test('invalid difficulty does not partially start a game', function () {
    const game = new Game({ difficulty: '', rng: createRng(3) });
    game.playerBoard.randomize(createRng(4));
    assert.throws(function () { game.start(); }, /Unknown difficulty/);
    assert.strictEqual(game.phase, 'setup');
    assert.strictEqual(game.ai, null);
  });

  test('Game sets winner and blocks both sides after the game is over', function () {
    const game = new Game({ rng: createRng(89) });
    game.playerBoard.randomize(createRng(90));
    const cells = game.computerBoard.ships.flatMap(function (ship) {
      return ship.cells.map(function (cell) { return { row: cell.row, col: cell.col }; });
    });
    cells.slice(0, -1).forEach(function (cell) {
      game.computerBoard.receiveShot(cell.row, cell.col);
    });
    game.start();
    const lastCell = cells[cells.length - 1];
    assert.strictEqual(game.playerFire(lastCell.row, lastCell.col).result, 'sunk');
    assert.strictEqual(game.phase, 'over');
    assert.strictEqual(game.winner, 'player');
    assert.strictEqual(game.playerFire(0, 0), null);
    assert.strictEqual(game.computerFire(), null);
  });
};
