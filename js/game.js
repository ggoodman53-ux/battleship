(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BattleshipGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 10;
  const ROWS = 'ABCDEFGHIJ';
  const FLEET = Object.freeze([
    Object.freeze({ id: 'carrier', name: 'Carrier', size: 5 }),
    Object.freeze({ id: 'battleship', name: 'Battleship', size: 4 }),
    Object.freeze({ id: 'cruiser', name: 'Cruiser', size: 3 }),
    Object.freeze({ id: 'submarine', name: 'Submarine', size: 3 }),
    Object.freeze({ id: 'destroyer', name: 'Destroyer', size: 2 })
  ]);

  function coordLabel(row, col) {
    if (!inBounds(row, col)) throw new RangeError('Coordinate is off the board');
    return ROWS[row] + (col + 1);
  }

  function inBounds(row, col) {
    return Number.isInteger(row) && Number.isInteger(col) &&
      row >= 0 && row < SIZE && col >= 0 && col < SIZE;
  }

  function shipCells(row, col, size, orientation) {
    if (!Number.isInteger(size) || size < 1 || (orientation !== 'H' && orientation !== 'V')) {
      return [];
    }
    const cells = [];
    for (let offset = 0; offset < size; offset += 1) {
      cells.push(orientation === 'H'
        ? { row, col: col + offset }
        : { row: row + offset, col });
    }
    return cells;
  }

  function createRng(seed) {
    let state = seed >>> 0;
    return function () {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cellKey(row, col) {
    return row + ',' + col;
  }

  class Board {
    constructor() {
      this.ships = [];
      this._shots = new Set();
    }

    canPlace(shipId, row, col, orientation) {
      const definition = FLEET.find(function (ship) { return ship.id === shipId; });
      if (!definition || !Number.isInteger(row) || !Number.isInteger(col) ||
          (orientation !== 'H' && orientation !== 'V')) return false;
      const cells = shipCells(row, col, definition.size, orientation);
      if (!cells.every(function (cell) { return inBounds(cell.row, cell.col); })) return false;

      return !this.ships.some(function (ship) {
        if (ship.id === shipId) return false;
        return ship.cells.some(function (occupied) {
          return cells.some(function (cell) {
            return cell.row === occupied.row && cell.col === occupied.col;
          });
        });
      });
    }

    placeShip(shipId, row, col, orientation) {
      if (!this.canPlace(shipId, row, col, orientation)) return false;
      const definition = FLEET.find(function (ship) { return ship.id === shipId; });
      this.removeShip(shipId);
      this.ships.push({
        id: definition.id,
        name: definition.name,
        size: definition.size,
        row: row,
        col: col,
        orientation: orientation,
        cells: shipCells(row, col, definition.size, orientation),
        hits: 0
      });
      return true;
    }

    removeShip(shipId) {
      const index = this.ships.findIndex(function (ship) { return ship.id === shipId; });
      if (index === -1) return null;
      return this.ships.splice(index, 1)[0];
    }

    clear() {
      this.ships = [];
      this._shots.clear();
    }

    getShip(shipId) {
      return this.ships.find(function (ship) { return ship.id === shipId; }) || null;
    }

    shipAt(row, col) {
      return this.ships.find(function (ship) {
        return ship.cells.some(function (cell) {
          return cell.row === row && cell.col === col;
        });
      }) || null;
    }

    allPlaced() {
      return FLEET.every((ship) => this.getShip(ship.id) !== null);
    }

    randomize(rng) {
      const random = typeof rng === 'function' ? rng : Math.random;
      this.clear();
      const fleet = FLEET.slice().sort(function (a, b) { return b.size - a.size; });

      function shuffled(values) {
        for (let index = values.length - 1; index > 0; index -= 1) {
          const other = Math.floor(random() * (index + 1));
          const value = values[index];
          values[index] = values[other];
          values[other] = value;
        }
        return values;
      }

      function placeNext(board, index) {
        if (index === fleet.length) return true;
        const ship = fleet[index];
        const placements = [];
        for (let row = 0; row < SIZE; row += 1) {
          for (let col = 0; col < SIZE; col += 1) {
            for (const orientation of ['H', 'V']) {
              if (board.canPlace(ship.id, row, col, orientation)) {
                placements.push({ row, col, orientation });
              }
            }
          }
        }
        for (const placement of shuffled(placements)) {
          board.placeShip(ship.id, placement.row, placement.col, placement.orientation);
          if (placeNext(board, index + 1)) return true;
          board.removeShip(ship.id);
        }
        return false;
      }

      if (!placeNext(this, 0)) throw new Error('Unable to place fleet');
      return this;
    }

    isShot(row, col) {
      return this._shots.has(cellKey(row, col));
    }

    get shotCount() {
      return this._shots.size;
    }

    receiveShot(row, col) {
      if (!inBounds(row, col)) throw new RangeError('Coordinate is off the board');
      if (this.isShot(row, col)) return null;
      this._shots.add(cellKey(row, col));
      const ship = this.shipAt(row, col);
      if (!ship) {
        return { row, col, label: coordLabel(row, col), result: 'miss', ship: null };
      }

      ship.hits += 1;
      const info = { id: ship.id, name: ship.name, size: ship.size };
      if (ship.hits === ship.size) {
        return {
          row,
          col,
          label: coordLabel(row, col),
          result: 'sunk',
          ship: info,
          cells: ship.cells.map(function (cell) { return { row: cell.row, col: cell.col }; })
        };
      }
      return { row, col, label: coordLabel(row, col), result: 'hit', ship: info };
    }

    cellState(row, col) {
      const ship = this.shipAt(row, col);
      if (!this.isShot(row, col)) return ship ? 'ship' : 'empty';
      if (!ship) return 'miss';
      return this.isSunk(ship.id) ? 'sunk' : 'hit';
    }

    isSunk(shipId) {
      const ship = this.getShip(shipId);
      return Boolean(ship && ship.hits >= ship.size);
    }

    allSunk() {
      return this.allPlaced() && this.ships.every((ship) => this.isSunk(ship.id));
    }

    remainingShips() {
      return FLEET.filter((ship) => !this.isSunk(ship.id));
    }
  }

  class Game {
    constructor(options) {
      const settings = options || {};
      this.difficulty = settings.difficulty === undefined ? 'normal' : settings.difficulty;
      this.rng = settings.rng || Math.random;
      this.playerBoard = new Board();
      this.computerBoard = new Board();
      this.computerBoard.randomize(this.rng);
      this.phase = 'setup';
      this.turn = 'player';
      this.winner = null;
      this.ai = null;
      this.log = [];
    }

    start() {
      if (this.phase !== 'setup') throw new Error('Game can only start from setup');
      if (!this.playerBoard.allPlaced()) throw new Error('Place the full fleet before starting');
      let aiModule;
      if (typeof module === 'object' && module.exports) {
        aiModule = require('./ai.js');
      } else {
        aiModule = (typeof self !== 'undefined' ? self : globalThis).BattleshipAI;
      }
      if (!aiModule) throw new Error('BattleshipAI must be loaded before starting');
      this.ai = aiModule.createAI(this.difficulty, this.rng);
      this.phase = 'playing';
      this.turn = 'player';
      return this;
    }

    playerFire(row, col) {
      if (this.phase !== 'playing' || this.turn !== 'player' || !inBounds(row, col) ||
          this.computerBoard.isShot(row, col)) return null;
      const result = this.computerBoard.receiveShot(row, col);
      this.log.push({ by: 'player', result: result });
      if (this.computerBoard.allSunk()) {
        this.phase = 'over';
        this.winner = 'player';
      } else {
        this.turn = 'computer';
      }
      return result;
    }

    computerFire() {
      if (this.phase !== 'playing' || this.turn !== 'computer') return null;
      const shot = this.ai.nextShot();
      const row = shot.row;
      const col = shot.col;
      if (!inBounds(row, col) || this.playerBoard.isShot(row, col)) {
        throw new Error('AI repeated/invalid shot');
      }
      const result = this.playerBoard.receiveShot(row, col);
      this.ai.recordResult({
        row: row,
        col: col,
        result: result.result,
        shipSize: result.result === 'sunk' ? result.ship.size : undefined
      });
      this.log.push({ by: 'computer', result: result });
      if (this.playerBoard.allSunk()) {
        this.phase = 'over';
        this.winner = 'computer';
      } else {
        this.turn = 'player';
      }
      return result;
    }
  }

  return {
    SIZE: SIZE,
    ROWS: ROWS,
    FLEET: FLEET,
    coordLabel: coordLabel,
    inBounds: inBounds,
    shipCells: shipCells,
    createRng: createRng,
    Board: Board,
    Game: Game
  };
});
