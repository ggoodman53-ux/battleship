'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fakeDOM = require('./fake-dom');

function createHarness() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = fakeDOM.createFakeDOM(html);
  let nextTimerId = 1;
  let now = 0;
  const timers = [];
  const sandbox = {
    document: dom.document,
    setTimeout: function (callback, delay) {
      const timer = { id: nextTimerId++, callback: callback, due: now + Number(delay || 0), cleared: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout: function (id) {
      timers.forEach(function (timer) { if (timer.id === id) timer.cleared = true; });
    }
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  ['game.js', 'ai.js', 'ui.js'].forEach(function (file) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  });
  dom.document.dispatchEvent(new dom.FakeEvent('DOMContentLoaded', { bubbles: false }));

  function dispatch(target, type, options) {
    return target.dispatchEvent(new dom.FakeEvent(type, options));
  }
  function click(target, options) {
    options = options || {};
    if (options.pointerType) {
      dispatch(target, 'pointerdown', { pointerType: options.pointerType });
    }
    dispatch(target, 'click', { detail: options.detail === undefined ? 1 : options.detail });
  }
  function keydown(key, options) {
    options = options || {};
    dispatch(dom.document.activeElement, 'keydown', {
      key: key,
      repeat: options.repeat,
      ctrlKey: options.ctrlKey,
      metaKey: options.metaKey,
      altKey: options.altKey
    });
  }
  function mouseenter(target) { dispatch(target, 'mouseenter', { bubbles: false }); }
  function mouseover(target) { dispatch(target, 'mouseover'); }
  function pointerdown(target, pointerType) { dispatch(target, 'pointerdown', { pointerType: pointerType }); }
  function advance(milliseconds) {
    now += milliseconds;
    let due;
    do {
      due = timers.filter(function (timer) { return !timer.cleared && timer.due <= now; })
        .sort(function (a, b) { return a.due - b.due; })[0];
      if (due) {
        due.cleared = true;
        due.callback();
      }
    } while (due);
  }
  function cell(gridId, row, col) {
    return dom.document.getElementById(gridId).querySelectorAll('.cell')[row * 10 + col];
  }
  function shipButton(id) {
    return dom.document.getElementById('ship-picker').querySelector('[data-ship-id="' + id + '"]');
  }
  function previewCells() {
    return dom.document.getElementById('player-grid').querySelectorAll('.preview-valid, .preview-invalid');
  }

  return {
    document: dom.document,
    advance: advance,
    cell: cell,
    click: click,
    keydown: keydown,
    mouseenter: mouseenter,
    mouseover: mouseover,
    pointerdown: pointerdown,
    previewCells: previewCells,
    shipButton: shipButton
  };
}

module.exports = function ({ test, assert }) {
  test('UI sanity: ignores rapid enemy clicks and cancels the old game timer', function () {
    const ui = createHarness();
    ui.click(ui.document.getElementById('randomize'));
    ui.click(ui.document.getElementById('start'));
    ui.click(ui.cell('enemy-grid', 0, 0));
    assert.strictEqual(ui.document.getElementById('turn').textContent, "Computer's turn");
    assert.strictEqual(ui.document.getElementById('log').childNodes.length, 1);
    ui.click(ui.cell('enemy-grid', 0, 1));
    assert.strictEqual(ui.document.getElementById('log').childNodes.length, 1);
    ui.click(ui.document.getElementById('new-game'));
    ui.advance(550);
    assert.strictEqual(ui.document.getElementById('log').childNodes.length, 0);
  });

  test('UI Bug 6: holding R does not rotate repeatedly', function () {
    const ui = createHarness();
    ui.mouseenter(ui.document.getElementById('player-grid'));
    ui.keydown('r', { repeat: false });
    assert.strictEqual(ui.document.getElementById('rotate').textContent, 'Rotate: Vertical');
    ui.keydown('r', { repeat: true });
    assert.strictEqual(ui.document.getElementById('rotate').textContent, 'Rotate: Vertical');
  });

  test('UI Bug 7: a placement misclick does not pick up the occupying ship', function () {
    const ui = createHarness();
    ui.click(ui.cell('player-grid', 0, 0));
    ui.click(ui.cell('player-grid', 0, 2));
    const grid = ui.document.getElementById('player-grid');
    for (let col = 0; col < 5; col += 1) {
      assert.ok(grid.querySelectorAll('.cell')[col].classList.contains('ship'));
    }
    assert.ok(ui.shipButton('carrier').classList.contains('is-placed'));
    assert.ok(ui.shipButton('battleship').classList.contains('is-selected'));
    assert.ok(!ui.shipButton('battleship').classList.contains('is-placed'));
    assert.ok(ui.document.getElementById('message').textContent.indexOf("doesn't fit") !== -1);
  });

  test('UI ship pickup still works when no ship is selected', function () {
    const ui = createHarness();
    [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]].forEach(function (position) {
      ui.click(ui.cell('player-grid', position[0], position[1]));
    });
    assert.ok(ui.document.getElementById('start').disabled === false);
    ui.click(ui.cell('player-grid', 0, 0));
    assert.ok(ui.shipButton('carrier').classList.contains('is-selected'));
    assert.ok(!ui.shipButton('carrier').classList.contains('is-placed'));
    assert.ok(ui.document.getElementById('message').textContent.indexOf('Carrier picked up') !== -1);
  });

  test('UI Bug 8: touch placement clears the stale ship preview', function () {
    const ui = createHarness();
    const cell = ui.cell('player-grid', 0, 0);
    ui.pointerdown(cell, 'touch');
    ui.mouseover(cell);
    ui.click(cell, { detail: 1 });
    assert.strictEqual(ui.previewCells().length, 0);
  });

  test('UI desktop mouse placement keeps the next-ship preview at the pointer', function () {
    const ui = createHarness();
    const cell = ui.cell('player-grid', 0, 0);
    ui.pointerdown(cell, 'mouse');
    ui.mouseover(cell);
    ui.click(cell, { detail: 1 });
    assert.ok(ui.previewCells().length > 0);
  });

  test('UI keyboard placement keeps the next-ship preview on the focused cell', function () {
    const ui = createHarness();
    const cell = ui.cell('player-grid', 0, 0);
    cell.focus();
    ui.click(cell, { detail: 0 });
    assert.ok(ui.previewCells().length > 0);
  });
};
