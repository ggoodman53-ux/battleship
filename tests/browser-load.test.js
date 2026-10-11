'use strict';

// Loads the game scripts the way a browser does (classic <script> tags, no
// CommonJS `module`) to catch browser-only problems in the module wrappers.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function ({ test, assert }) {
  test('game.js and ai.js work as browser scripts and a game can start', function () {
    const sandbox = { Math, Number, Array, Object, Set, Map, Error, RangeError, TypeError, String };
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    ['game.js', 'ai.js'].forEach(function (file) {
      const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
      vm.runInContext(source, sandbox, { filename: file });
    });
    assert.ok(sandbox.BattleshipGame, 'BattleshipGame global missing');
    assert.ok(sandbox.BattleshipAI, 'BattleshipAI global missing');
    const result = vm.runInContext(
      '(function () {' +
      '  var g = new BattleshipGame.Game({ difficulty: "hard" });' +
      '  g.playerBoard.randomize();' +
      '  g.start();' +
      '  g.playerFire(0, 0);' +
      '  var shot = g.computerFire();' +
      '  return g.phase + "|" + (shot ? "fired" : "none");' +
      '})()', sandbox);
    assert.ok(result === 'playing|fired' || result === 'over|fired', 'unexpected state: ' + result);
  });
};
