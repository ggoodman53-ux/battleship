(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game.js'));
  else root.BattleshipAI = factory(root.BattleshipGame);
})(typeof self !== 'undefined' ? self : this, function (game) {
  'use strict';

  const SIZE = game.SIZE;
  const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);
  const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function createAI(difficulty, rng) {
    if (DIFFICULTIES.indexOf(difficulty) === -1) {
      throw new Error('Unknown difficulty: ' + difficulty);
    }
    const random = typeof rng === 'function' ? rng : Math.random;
    const knowledge = Array.from({ length: SIZE }, function () {
      return Array(SIZE).fill(null);
    });
    const remainingSizes = game.FLEET.map(function (ship) { return ship.size; });
    const hitOrder = Array.from({ length: SIZE }, function () {
      return Array(SIZE).fill(-1);
    });
    let latestHit = 0;

    function randomIndex(length) {
      return Math.floor(random() * length);
    }

    function untriedCells() {
      const cells = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          if (knowledge[row][col] === null) cells.push({ row: row, col: col });
        }
      }
      return cells;
    }

    function choose(cells) {
      if (!cells.length) return null;
      return cells[randomIndex(cells.length)];
    }

    function unresolvedHits() {
      const cells = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          if (knowledge[row][col] === 'hit') cells.push({ row: row, col: col });
        }
      }
      return cells;
    }

    function orthogonalUnknownNeighbors(row, col) {
      return DIRECTIONS.map(function (direction) {
        return { row: row + direction[0], col: col + direction[1] };
      }).filter(function (cell) {
        return game.inBounds(cell.row, cell.col) && knowledge[cell.row][cell.col] === null;
      });
    }

    function hitLines(hits) {
      const lines = [];
      for (let row = 0; row < SIZE; row += 1) {
        let col = 0;
        while (col < SIZE) {
          if (knowledge[row][col] !== 'hit') {
            col += 1;
            continue;
          }
          const start = col;
          while (col < SIZE && knowledge[row][col] === 'hit') col += 1;
          if (col - start >= 2) {
            lines.push({ orientation: 'H', cells: Array.from({ length: col - start }, function (_, index) {
              return { row: row, col: start + index };
            }) });
          }
        }
      }
      for (let col = 0; col < SIZE; col += 1) {
        let row = 0;
        while (row < SIZE) {
          if (knowledge[row][col] !== 'hit') {
            row += 1;
            continue;
          }
          const start = row;
          while (row < SIZE && knowledge[row][col] === 'hit') row += 1;
          if (row - start >= 2) {
            lines.push({ orientation: 'V', cells: Array.from({ length: row - start }, function (_, index) {
              return { row: start + index, col: col };
            }) });
          }
        }
      }
      return lines;
    }

    function normalShot() {
      const hits = unresolvedHits();
      if (hits.length) {
        const lines = hitLines(hits);
        if (lines.length) {
          const longestLength = Math.max.apply(null, lines.map(function (line) { return line.cells.length; }));
          const extensions = [];
          lines.filter(function (line) { return line.cells.length === longestLength; })
            .forEach(function (line) {
              const first = line.cells[0];
              const last = line.cells[line.cells.length - 1];
              const before = line.orientation === 'H'
                ? { row: first.row, col: first.col - 1 }
                : { row: first.row - 1, col: first.col };
              const after = line.orientation === 'H'
                ? { row: last.row, col: last.col + 1 }
                : { row: last.row + 1, col: last.col };
              [before, after].forEach(function (cell) {
                if (game.inBounds(cell.row, cell.col) && knowledge[cell.row][cell.col] === null) {
                  extensions.push(cell);
                }
              });
            });
          if (extensions.length) return choose(extensions);
        }

        const latest = hits.reduce(function (mostRecent, cell) {
          return hitOrder[cell.row][cell.col] > hitOrder[mostRecent.row][mostRecent.col] ? cell : mostRecent;
        }, hits[0]);
        const preferred = orthogonalUnknownNeighbors(latest.row, latest.col);
        if (preferred.length) return choose(preferred);
        const neighbors = [];
        hits.forEach(function (cell) {
          orthogonalUnknownNeighbors(cell.row, cell.col).forEach(function (neighbor) {
            neighbors.push(neighbor);
          });
        });
        if (neighbors.length) return choose(neighbors);
      }

      const checkerboard = untriedCells().filter(function (cell) {
        return (cell.row + cell.col) % 2 === 0;
      });
      return choose(checkerboard.length ? checkerboard : untriedCells());
    }

    function hardShot() {
      const hits = unresolvedHits();
      const scores = Array.from({ length: SIZE }, function () {
        return Array(SIZE).fill(0);
      });

      remainingSizes.forEach(function (size) {
        for (let row = 0; row < SIZE; row += 1) {
          for (let col = 0; col < SIZE; col += 1) {
            for (const orientation of ['H', 'V']) {
              const cells = game.shipCells(row, col, size, orientation);
              if (!cells.every(function (cell) { return game.inBounds(cell.row, cell.col); })) continue;
              if (cells.some(function (cell) {
                return knowledge[cell.row][cell.col] === 'miss' ||
                  knowledge[cell.row][cell.col] === 'sunk';
              })) continue;
              const hitsCovered = cells.reduce(function (total, cell) {
                return total + (knowledge[cell.row][cell.col] === 'hit' ? 1 : 0);
              }, 0);
              if (hits.length && hitsCovered === 0) continue;
              const weight = hits.length ? hitsCovered * hitsCovered : 1;
              cells.forEach(function (cell) {
                if (knowledge[cell.row][cell.col] === null) {
                  scores[cell.row][cell.col] += weight;
                }
              });
            }
          }
        }
      });

      let highest = 0;
      let best = [];
      for (let row = 0; row < SIZE; row += 1) {
        for (let col = 0; col < SIZE; col += 1) {
          if (knowledge[row][col] !== null) continue;
          if (scores[row][col] > highest) {
            highest = scores[row][col];
            best = [{ row: row, col: col }];
          } else if (scores[row][col] === highest && highest > 0) {
            best.push({ row: row, col: col });
          }
        }
      }
      return choose(best.length ? best : untriedCells());
    }

    function resolveSunkShip(row, col, size) {
      const candidates = [];
      for (const orientation of ['H', 'V']) {
        for (let offset = 0; offset < size; offset += 1) {
          const startRow = orientation === 'H' ? row : row - offset;
          const startCol = orientation === 'H' ? col - offset : col;
          const cells = game.shipCells(startRow, startCol, size, orientation);
          if (!cells.every(function (cell) {
            return game.inBounds(cell.row, cell.col) && knowledge[cell.row][cell.col] === 'hit';
          })) continue;
          const sinkIsEndpoint = offset === 0 || offset === size - 1;
          const hasAlignedHit = cells.some(function (cell) {
            return cell.row !== row || cell.col !== col;
          });
          candidates.push({
            cells: cells,
            preferred: sinkIsEndpoint && hasAlignedHit
          });
        }
      }

      const selected = candidates.find(function (candidate) { return candidate.preferred; }) ||
        candidates[0];
      if (selected) {
        selected.cells.forEach(function (cell) {
          knowledge[cell.row][cell.col] = 'sunk';
        });
      } else {
        knowledge[row][col] = 'sunk';
      }
    }

    return {
      nextShot: function () {
        const shot = difficulty === 'easy'
          ? choose(untriedCells())
          : difficulty === 'normal' ? normalShot() : hardShot();
        if (!shot) throw new Error('No untried cells remain');
        return shot;
      },

      recordResult: function (shot) {
        if (!shot || !game.inBounds(shot.row, shot.col)) {
          throw new RangeError('Coordinate is off the board');
        }
        if (knowledge[shot.row][shot.col] !== null) {
          throw new Error('Result recorded for an already tried cell');
        }
        if (shot.result !== 'miss' && shot.result !== 'hit' && shot.result !== 'sunk') {
          throw new Error('Unknown shot result: ' + shot.result);
        }
        if (shot.result === 'miss') {
          knowledge[shot.row][shot.col] = 'miss';
          return;
        }
        knowledge[shot.row][shot.col] = 'hit';
        latestHit += 1;
        hitOrder[shot.row][shot.col] = latestHit;
        if (shot.result === 'sunk') {
          resolveSunkShip(shot.row, shot.col, shot.shipSize);
          const sizeIndex = remainingSizes.indexOf(shot.shipSize);
          if (sizeIndex !== -1) remainingSizes.splice(sizeIndex, 1);
        }
      }
    };
  }

  return {
    DIFFICULTIES: DIFFICULTIES,
    createAI: createAI
  };
});
