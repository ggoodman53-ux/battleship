# Bug log

Real bugs found while building and testing this game, in the order they were found. Each entry says what went wrong, how it was found, why it happened, and how it was fixed.

---

## 1. Starting a game could leave it half-started when the difficulty setting was bad

**What went wrong:** If the game was asked to start with a difficulty name it did not recognise, it reported an error but had already switched itself into "playing" mode with no computer opponent behind it. The game was stuck in a broken in-between state.

**How it was found:** Code review of the game logic.

**Root cause:** When you press Start, the game did its steps in the wrong order. It first flipped the switch that says "the battle has begun" and only then tried to set up the computer opponent. If setting up the opponent failed, the switch had already been flipped.

**How it was fixed:** The opponent is now set up first. Only once that has worked does the game switch to "playing". If it fails, the game stays in setup as if Start had never been pressed. An automated test now checks this.

---

## 2. The game crashed in the browser the moment you pressed Start Game

**What went wrong:** The game logic worked when it was tested on its own, but when loaded in a web page, pressing Start Game failed with the error `ReferenceError: root is not defined`, so a game could never begin.

**How it was found:** Automated test. A test was written that loads the game files the same way a web page does (plain script tags rather than the Node test setup), and it failed with this error. Before the fix, the same error would have appeared in the browser console.

**Root cause:** The game files are written so they work in two places: the Node test runner and the browser. A small wrapper at the top of the file decides which one it is in and calls the browser's global space `root`. The code that starts a game sat outside that wrapper's reach and still tried to use the name `root`. In Node a different code path was used, so the tests that ran in Node never touched that line. In the browser that line ran, and the name meant nothing there.

**How it was fixed:** That line now looks up the browser's global space directly (`self`, or `globalThis` as a fallback) instead of relying on the wrapper's name. The browser-style load test (`tests/browser-load.test.js`) stays in the suite so this kind of browser-only failure is caught automatically.

---

## 3. The computer could get confused about which of its targets it had already sunk when two ships touched

**What went wrong:** When two of your ships lay end to end and the computer had hit both, sinking one of them could make the computer mark the wrong squares as "sunk". For example, with the Destroyer on A1-A2 and the Cruiser on A3-A5, the computer hits A1, A3 and A4, then sinks the Destroyer with a shot at A2. It then wrongly decides the Destroyer was A2-A3. It treats A3, which belongs to the still-floating Cruiser, as finished, and keeps treating A1, which belongs to the sunk Destroyer, as a live target. On Normal and Hard this sent its next shots in the wrong direction.

**How it was found:** Devin Review, an automated code review run on the pull request.

**Root cause:** When a ship sank, the game only told the computer "you sank a ship of length 2", not which squares it was on. The computer had to guess from the row of hits it had made. When hits on two different ships sat side by side, more than one guess fit, and it could pick the wrong one.

**How it was fixed:** The game now tells the computer exactly which squares the sunk ship occupied, and the computer marks exactly those squares as sunk. This gives it no unfair advantage, because the player's screen shows the exact squares of every ship they sink too. The guessing code was removed. A new automated test sets up this exact layout and checks that A1-A2 are marked sunk while A3-A4 stay live targets.

---

## 4. Pressing R rotated your ship even when you were somewhere else on the page

**What went wrong:** During setup, R is the shortcut to turn the ship you're placing. But it worked no matter what was selected on the page. A player moving through the buttons with the keyboard (for example, on New Game or Randomize) who pressed R would see their ship's direction flip without meaning to.

**How it was found:** Devin Review, an automated code review run on the pull request.

**Root cause:** The game listened for the R key across the whole page and only ignored it inside text boxes and drop-down menus. It never checked whether the player was actually working on the placement grid.

**How it was fixed:** R now rotates the ship only when a square on Your Fleet is selected with the keyboard, or when the mouse is over Your Fleet. Everywhere else on the page, R does nothing. The Rotate button still works with a mouse click, Enter or Space. This was checked in the browser using keyboard navigation.

---

## 5. Choosing a ship with the keyboard threw you back to the top of the page

**What went wrong:** During setup, a keyboard player who moved to a ship in the ship list and pressed Enter to choose it lost their place. The ship was selected, but the keyboard cursor jumped back to the start of the page. The next Tab started over from the top instead of moving on toward the grid.

**How it was found:** Browser play-testing with keyboard navigation, while checking the fix for bug 4.

**Root cause:** Every time a ship was chosen, the game threw away the whole row of ship buttons and drew a fresh row to show the new selection. The button the player was on no longer existed, so the browser had nowhere to keep the keyboard cursor and reset it to the top of the page.

**How it was fixed:** After redrawing the ship buttons, the game now puts the keyboard cursor back on the button for the ship the player was on. This was checked in the browser: after pressing Enter on a ship, the cursor stays on that ship and the next Tab moves on to the next control.

---

Apart from these, no bugs were found during browser play-testing. Testing covered wins and losses, every difficulty, manual placement with rotation, New Game during a game and after one ended, keyboard play, and a phone-sized screen. The browser console showed no errors.
