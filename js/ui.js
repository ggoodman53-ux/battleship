/* Battleship user interface: renders the game state and handles input.
 * All rules live in game.js / ai.js; this file only talks to the Game API. */
(function () {
  'use strict';

  var G = window.BattleshipGame;
  var SIZE = G.SIZE;
  var FLEET = G.FLEET;
  var COMPUTER_DELAY_MS = 550;
  var LOG_LIMIT = 60;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    body: document.body,
    difficulty: $('difficulty'),
    newGame: $('new-game'),
    turn: $('turn'),
    message: $('message'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerText: $('banner-text'),
    playAgain: $('play-again'),
    setup: $('setup'),
    shipPicker: $('ship-picker'),
    rotate: $('rotate'),
    randomize: $('randomize'),
    clear: $('clear'),
    start: $('start'),
    playerGrid: $('player-grid'),
    enemyGrid: $('enemy-grid'),
    playerShips: $('player-ships'),
    enemyShips: $('enemy-ships'),
    playerCount: $('player-count'),
    enemyCount: $('enemy-count'),
    log: $('log')
  };

  var game = null;
  var computerTimer = null;
  var pointerOverPlayerGrid = false;
  var selectedShipId = null;
  var orientation = 'H';
  var previewAnchor = null;
  var lastShot = { player: null, enemy: null };
  var cells = { player: [], enemy: [] };
  var focusPos = { player: { row: 0, col: 0 }, enemy: { row: 0, col: 0 } };

  // ---------- Grid construction ----------

  function buildGrid(container, owner) {
    container.innerHTML = '';
    var corner = document.createElement('span');
    corner.className = 'axis';
    corner.setAttribute('aria-hidden', 'true');
    container.appendChild(corner);
    for (var c = 0; c < SIZE; c++) {
      var colLabel = document.createElement('span');
      colLabel.className = 'axis';
      colLabel.setAttribute('aria-hidden', 'true');
      colLabel.textContent = String(c + 1);
      container.appendChild(colLabel);
    }
    cells[owner] = [];
    for (var r = 0; r < SIZE; r++) {
      var rowLabel = document.createElement('span');
      rowLabel.className = 'axis';
      rowLabel.setAttribute('aria-hidden', 'true');
      rowLabel.textContent = G.ROWS[r];
      container.appendChild(rowLabel);
      cells[owner][r] = [];
      for (c = 0; c < SIZE; c++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cell';
        btn.dataset.row = String(r);
        btn.dataset.col = String(c);
        btn.tabIndex = (r === 0 && c === 0) ? 0 : -1;
        container.appendChild(btn);
        cells[owner][r][c] = btn;
      }
    }
  }

  function cellFromEvent(e) {
    var target = e.target.closest ? e.target.closest('.cell') : null;
    if (!target) return null;
    return { row: Number(target.dataset.row), col: Number(target.dataset.col), el: target };
  }

  // ---------- Game lifecycle ----------

  function newGame() {
    cancelComputerTurn();
    pointerOverPlayerGrid = false;
    game = new G.Game({ difficulty: els.difficulty.value });
    selectedShipId = FLEET[0].id;
    orientation = 'H';
    previewAnchor = null;
    lastShot = { player: null, enemy: null };
    els.log.innerHTML = '';
    els.banner.hidden = true;
    els.banner.className = 'banner';
    setStatus('Setup', null, 'Place your fleet: pick a ship and click Your Fleet, or press Randomize.');
    render();
  }

  function cancelComputerTurn() {
    if (computerTimer !== null) {
      clearTimeout(computerTimer);
      computerTimer = null;
    }
  }

  function startGame() {
    if (game.phase !== 'setup' || !game.playerBoard.allPlaced()) return;
    game.difficulty = els.difficulty.value;
    game.start();
    selectedShipId = null;
    previewAnchor = null;
    setStatus('Your turn', 'player', 'Battle stations! Fire at a cell in Enemy Waters.');
    render();
    focusCell('enemy', focusPos.enemy.row, focusPos.enemy.col);
  }

  function describeResult(res) {
    if (res.result === 'sunk') return 'Sunk: ' + res.ship.name + '.';
    if (res.result === 'hit') return 'Hit!';
    return 'Miss.';
  }

  function playerFire(row, col) {
    if (!game || game.phase !== 'playing' || game.turn !== 'player') return;
    var res = game.playerFire(row, col);
    if (!res) return;
    lastShot.enemy = { row: row, col: col };
    addLog('player', res);
    if (game.phase === 'over') {
      render();
      endGame();
      return;
    }
    setStatus("Computer's turn", 'computer', 'You fired at ' + res.label + ': ' + describeResult(res) + ' The computer is aiming\u2026');
    render();
    scheduleComputerTurn();
  }

  function scheduleComputerTurn() {
    cancelComputerTurn();
    var thisGame = game;
    computerTimer = setTimeout(function () {
      computerTimer = null;
      if (game !== thisGame) return;
      computerFire();
    }, COMPUTER_DELAY_MS);
  }

  function computerFire() {
    var res = game.computerFire();
    if (!res) return;
    lastShot.player = { row: res.row, col: res.col };
    addLog('computer', res);
    if (game.phase === 'over') {
      render();
      endGame();
      return;
    }
    setStatus('Your turn', 'player', 'Computer fired at ' + res.label + ': ' + describeResult(res) + ' Your turn.');
    render();
  }

  function endGame() {
    var playerWon = game.winner === 'player';
    var shots = playerWon ? game.computerBoard.shotCount : game.playerBoard.shotCount;
    els.banner.hidden = false;
    els.banner.className = 'banner ' + (playerWon ? 'is-win' : 'is-loss');
    els.bannerTitle.textContent = playerWon ? 'Victory! You sank the enemy fleet.' : 'Defeat. Your fleet has been sunk.';
    els.bannerText.textContent = playerWon
      ? 'You won in ' + shots + ' shots on ' + capitalize(game.difficulty) + '.'
      : 'The computer won in ' + shots + ' shots on ' + capitalize(game.difficulty) + '. Enemy ships are now revealed.';
    var last = els.log.firstChild ? els.log.firstChild.textContent.replace(/^(You|Computer)/, '$1 ') : '';
    setStatus(playerWon ? 'You win' : 'You lose', playerWon ? 'win' : 'loss',
      (playerWon ? 'You win! ' : 'You lose. ') + (last ? 'Final shot \u2014 ' + last : ''));
    render();
    els.playAgain.focus();
  }

  // ---------- Setup interactions ----------

  function selectShip(id) {
    selectedShipId = id;
    renderSetup();
    renderPreview();
  }

  function nextUnplacedShip(afterId) {
    var start = 0;
    for (var i = 0; i < FLEET.length; i++) if (FLEET[i].id === afterId) start = i + 1;
    for (var k = 0; k < FLEET.length; k++) {
      var ship = FLEET[(start + k) % FLEET.length];
      if (!game.playerBoard.getShip(ship.id)) return ship.id;
    }
    return null;
  }

  function rotate() {
    if (game.phase !== 'setup') return;
    orientation = orientation === 'H' ? 'V' : 'H';
    renderSetup();
    renderPreview();
  }

  function shipName(id) {
    for (var i = 0; i < FLEET.length; i++) if (FLEET[i].id === id) return FLEET[i].name;
    return id;
  }

  function placeAt(row, col) {
    var board = game.playerBoard;
    if (selectedShipId && board.canPlace(selectedShipId, row, col, orientation)) {
      var placedName = shipName(selectedShipId);
      board.placeShip(selectedShipId, row, col, orientation);
      selectedShipId = nextUnplacedShip(selectedShipId);
      setStatus('Setup', null, board.allPlaced()
        ? 'All ships placed. Press Start Game when ready (or click a ship to move it).'
        : placedName + ' placed at ' + G.coordLabel(row, col) + '. Next: ' + shipName(selectedShipId) + '.');
      render();
      return;
    }
    var occupant = board.shipAt(row, col);
    if (occupant) {
      // Pick the ship back up so it can be moved.
      board.removeShip(occupant.id);
      selectedShipId = occupant.id;
      orientation = occupant.orientation;
      setStatus('Setup', null, occupant.name + ' picked up. Click a cell to place it again.');
      render();
      return;
    }
    if (selectedShipId) {
      setStatus('Setup', null, "The " + shipName(selectedShipId) + " doesn't fit at " + G.coordLabel(row, col) + '. Try another cell or rotate.');
    } else {
      setStatus('Setup', null, 'All ships placed. Click a ship to move it, or press Start Game.');
    }
  }

  function randomizeFleet() {
    if (game.phase !== 'setup') return;
    game.playerBoard.randomize();
    selectedShipId = null;
    previewAnchor = null;
    setStatus('Setup', null, 'Fleet placed at random. Press Start Game, Randomize again, or click a ship to move it.');
    render();
  }

  function clearFleet() {
    if (game.phase !== 'setup') return;
    game.playerBoard.clear();
    selectedShipId = FLEET[0].id;
    setStatus('Setup', null, 'Board cleared. Place your Carrier.');
    render();
  }

  // ---------- Rendering ----------

  function setStatus(turnText, turnKind, message) {
    els.turn.textContent = turnText;
    els.turn.className = 'turn-pill' + (turnKind ? ' is-' + turnKind : '');
    els.message.textContent = message;
  }

  function render() {
    var phase = game.phase;
    els.body.classList.toggle('phase-setup', phase === 'setup');
    els.body.classList.toggle('phase-playing', phase === 'playing');
    els.body.classList.toggle('phase-over', phase === 'over');
    els.body.classList.toggle('turn-player', phase === 'playing' && game.turn === 'player');
    els.body.classList.toggle('turn-computer', phase === 'playing' && game.turn === 'computer');
    els.difficulty.disabled = phase === 'playing';
    els.setup.hidden = phase !== 'setup';
    renderSetup();
    renderPlayerBoard();
    renderEnemyBoard();
    renderShipList(els.playerShips, els.playerCount, game.playerBoard);
    renderShipList(els.enemyShips, els.enemyCount, game.computerBoard);
    renderPreview();
  }

  function renderSetup() {
    if (game.phase !== 'setup') return;
    els.shipPicker.innerHTML = '';
    FLEET.forEach(function (ship) {
      var placed = !!game.playerBoard.getShip(ship.id);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ship-btn' + (ship.id === selectedShipId ? ' is-selected' : '') + (placed ? ' is-placed' : '');
      btn.setAttribute('aria-pressed', ship.id === selectedShipId ? 'true' : 'false');
      btn.setAttribute('aria-label', ship.name + ', length ' + ship.size + (placed ? ', placed' : ', not placed'));
      btn.innerHTML = '<span class="ship-name"></span><span class="pips" aria-hidden="true"></span>';
      btn.querySelector('.ship-name').textContent = ship.name;
      btn.querySelector('.pips').innerHTML = new Array(ship.size + 1).join('<span class="pip"></span>');
      btn.addEventListener('click', function () { selectShip(ship.id); });
      els.shipPicker.appendChild(btn);
    });
    els.rotate.textContent = 'Rotate: ' + (orientation === 'H' ? 'Horizontal' : 'Vertical');
    els.rotate.setAttribute('aria-label', 'Rotate ship, currently ' + (orientation === 'H' ? 'horizontal' : 'vertical'));
    els.start.disabled = !game.playerBoard.allPlaced();
  }

  function segmentClasses(ship, row, col) {
    var cls = ' seg-' + (ship.orientation === 'H' ? 'h' : 'v');
    var first = ship.cells[0];
    var last = ship.cells[ship.cells.length - 1];
    if (first.row === row && first.col === col) cls += ' seg-start';
    if (last.row === row && last.col === col) cls += ' seg-end';
    return cls;
  }

  function renderPlayerBoard() {
    var board = game.playerBoard;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var el = cells.player[r][c];
        var state = board.cellState(r, c);
        var ship = board.shipAt(r, c);
        var cls = 'cell';
        var label = G.coordLabel(r, c);
        if (ship) {
          cls += ' ship' + segmentClasses(ship, r, c);
          label += ', your ' + ship.name;
        }
        if (state === 'miss') { cls += ' miss'; label += ', miss'; }
        else if (state === 'hit') { cls += ' hit'; label += ', hit'; }
        else if (state === 'sunk') { cls += ' sunk'; label += ', sunk'; }
        else if (!ship) { label += ', empty water'; }
        if (lastShot.player && lastShot.player.row === r && lastShot.player.col === c) cls += ' last-shot';
        el.className = cls;
        el.setAttribute('aria-label', label);
      }
    }
  }

  function renderEnemyBoard() {
    var board = game.computerBoard;
    var over = game.phase === 'over';
    var playing = game.phase === 'playing';
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var el = cells.enemy[r][c];
        var state = board.cellState(r, c);
        var cls = 'cell';
        var label = G.coordLabel(r, c);
        if (state === 'miss') { cls += ' miss'; label += ', miss'; }
        else if (state === 'hit') { cls += ' hit'; label += ', hit'; }
        else if (state === 'sunk') {
          cls += ' sunk';
          label += ', sunk ' + board.shipAt(r, c).name;
        } else if (state === 'ship' && over) {
          var ship = board.shipAt(r, c);
          cls += ' revealed';
          label += ', enemy ' + ship.name + ' (not hit)';
        } else {
          if (playing) cls += ' open';
          label += over ? ', empty water' : ', not fired';
        }
        if (lastShot.enemy && lastShot.enemy.row === r && lastShot.enemy.col === c) cls += ' last-shot';
        el.className = cls;
        el.setAttribute('aria-label', label);
        var unavailable = !playing || state === 'miss' || state === 'hit' || state === 'sunk';
        el.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
      }
    }
  }

  function renderShipList(listEl, countEl, board) {
    listEl.innerHTML = '';
    var afloat = 0;
    FLEET.forEach(function (ship) {
      var sunk = board.isSunk(ship.id);
      if (!sunk) afloat++;
      var li = document.createElement('li');
      li.className = sunk ? 'is-sunk' : '';
      li.innerHTML = '<span class="pips" aria-hidden="true">' + new Array(ship.size + 1).join('<span class="pip"></span>') + '</span><span></span>';
      li.lastChild.textContent = ship.name + (sunk ? ' (sunk)' : '');
      listEl.appendChild(li);
    });
    countEl.textContent = String(afloat);
  }

  function clearPreview() {
    var marked = els.playerGrid.querySelectorAll('.preview-valid, .preview-invalid');
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove('preview-valid', 'preview-invalid');
  }

  function renderPreview() {
    clearPreview();
    if (!game || game.phase !== 'setup' || !previewAnchor || !selectedShipId) return;
    var ship = null;
    for (var i = 0; i < FLEET.length; i++) if (FLEET[i].id === selectedShipId) ship = FLEET[i];
    var valid = game.playerBoard.canPlace(selectedShipId, previewAnchor.row, previewAnchor.col, orientation);
    G.shipCells(previewAnchor.row, previewAnchor.col, ship.size, orientation).forEach(function (p) {
      if (G.inBounds(p.row, p.col)) cells.player[p.row][p.col].classList.add(valid ? 'preview-valid' : 'preview-invalid');
    });
  }

  // ---------- Log ----------

  function addLog(who, res) {
    var li = document.createElement('li');
    var whoEl = document.createElement('span');
    whoEl.className = 'who who-' + who;
    whoEl.textContent = who === 'player' ? 'You' : 'Computer';
    var what = document.createElement('span');
    what.textContent = res.label + ' \u2014 ';
    var outcome = document.createElement('span');
    outcome.className = 'res-' + res.result;
    outcome.textContent = describeResult(res);
    what.appendChild(outcome);
    li.appendChild(whoEl);
    li.appendChild(what);
    els.log.insertBefore(li, els.log.firstChild);
    while (els.log.childNodes.length > LOG_LIMIT) els.log.removeChild(els.log.lastChild);
  }

  // ---------- Focus management (roving tabindex) ----------

  function focusCell(owner, row, col) {
    var prev = focusPos[owner];
    cells[owner][prev.row][prev.col].tabIndex = -1;
    focusPos[owner] = { row: row, col: col };
    var el = cells[owner][row][col];
    el.tabIndex = 0;
    el.focus();
  }

  function handleGridKeydown(owner, e) {
    var pos = cellFromEvent(e);
    if (!pos) return;
    var row = pos.row, col = pos.col;
    switch (e.key) {
      case 'ArrowUp': row = Math.max(0, row - 1); break;
      case 'ArrowDown': row = Math.min(SIZE - 1, row + 1); break;
      case 'ArrowLeft': col = Math.max(0, col - 1); break;
      case 'ArrowRight': col = Math.min(SIZE - 1, col + 1); break;
      case 'Home': col = 0; break;
      case 'End': col = SIZE - 1; break;
      default: return;
    }
    e.preventDefault();
    focusCell(owner, row, col);
  }

  function syncRoving(owner, pos) {
    var prev = focusPos[owner];
    if (prev.row === pos.row && prev.col === pos.col) return;
    cells[owner][prev.row][prev.col].tabIndex = -1;
    cells[owner][pos.row][pos.col].tabIndex = 0;
    focusPos[owner] = { row: pos.row, col: pos.col };
  }

  // ---------- Wiring ----------

  function wire() {
    els.newGame.addEventListener('click', newGame);
    els.playAgain.addEventListener('click', function () {
      newGame();
      els.randomize.focus();
    });
    els.difficulty.addEventListener('change', function () {
      if (game.phase === 'setup') game.difficulty = els.difficulty.value;
    });
    els.rotate.addEventListener('click', rotate);
    els.randomize.addEventListener('click', randomizeFleet);
    els.clear.addEventListener('click', clearFleet);
    els.start.addEventListener('click', startGame);

    els.playerGrid.addEventListener('click', function (e) {
      var pos = cellFromEvent(e);
      if (!pos || game.phase !== 'setup') return;
      syncRoving('player', pos);
      previewAnchor = { row: pos.row, col: pos.col };
      placeAt(pos.row, pos.col);
    });
    els.playerGrid.addEventListener('mouseenter', function () {
      pointerOverPlayerGrid = true;
    });
    els.playerGrid.addEventListener('mouseover', function (e) {
      var pos = cellFromEvent(e);
      if (!pos || game.phase !== 'setup') return;
      previewAnchor = { row: pos.row, col: pos.col };
      renderPreview();
    });
    els.playerGrid.addEventListener('focusin', function (e) {
      var pos = cellFromEvent(e);
      if (!pos) return;
      syncRoving('player', pos);
      if (game.phase !== 'setup') return;
      previewAnchor = { row: pos.row, col: pos.col };
      renderPreview();
    });
    els.playerGrid.addEventListener('mouseleave', function () {
      pointerOverPlayerGrid = false;
      if (document.activeElement && els.playerGrid.contains(document.activeElement)) {
        var pos = cellFromEvent({ target: document.activeElement });
        previewAnchor = pos ? { row: pos.row, col: pos.col } : null;
      } else {
        previewAnchor = null;
      }
      renderPreview();
    });
    els.playerGrid.addEventListener('focusout', function (e) {
      if (!els.playerGrid.contains(e.relatedTarget)) {
        previewAnchor = null;
        renderPreview();
      }
    });
    els.playerGrid.addEventListener('keydown', function (e) { handleGridKeydown('player', e); });

    els.enemyGrid.addEventListener('click', function (e) {
      var pos = cellFromEvent(e);
      if (!pos) return;
      syncRoving('enemy', pos);
      playerFire(pos.row, pos.col);
    });
    els.enemyGrid.addEventListener('focusin', function (e) {
      var pos = cellFromEvent(e);
      if (pos) syncRoving('enemy', pos);
    });
    els.enemyGrid.addEventListener('keydown', function (e) { handleGridKeydown('enemy', e); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'r' && e.key !== 'R') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!game || game.phase !== 'setup') return;
      var onGrid = els.playerGrid.contains(document.activeElement);
      if (!onGrid && !pointerOverPlayerGrid) return;
      e.preventDefault();
      rotate();
    });
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  buildGrid(els.playerGrid, 'player');
  buildGrid(els.enemyGrid, 'enemy');
  wire();
  newGame();
})();
