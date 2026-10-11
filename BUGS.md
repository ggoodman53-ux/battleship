# QA summary

**Total bugs found:** 9.

**How they were found:**
- Code review: 1 (#1).
- Automated test: 1 (#2).
- Devin Review: 3 (#3, #4, and #9).
- Browser play-testing: 1 (#5).
- Independent QA: 3 (#6–#8); #6 was found by code review and confirmed in the browser, while #7 and #8 were found by play-testing.

- **Misclick deletes your ship (#7):** While placing the Battleship, clicking a square that overlapped your Carrier didn't just say "doesn't fit", it quietly lifted the Carrier off the board.
- **The AI and touching ships (#3):** When two ships touched end-to-end, sinking one could make the AI treat the wrong squares as sunk, leaving part of the sunk ship as a live target and marking the other ship's squares as finished.
- **Ghost ship on phones (#8):** After you tapped to place a ship, a red "doesn't fit" outline of the next ship stayed drawn over the one you'd just placed, so a valid placement looked like an error.

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

## 6. Holding R could rotate the ship back and forth

**What went wrong:** During setup, holding R first turned the ship, then repeated key events turned it back again. The direction could keep changing for as long as the key was held.

**How it was found:** Independent QA code review of the key handler, confirmed in the browser with a held key.

**Root cause:** The page-level R shortcut handled repeating keydown events just like the first keydown, so each repeat toggled the direction again.

**How it was fixed:** The key handler now ignores repeating keydown events. The automated test `UI Bug 6: holding R does not rotate repeatedly` checks that the direction stays vertical after the repeated event.

---

## 7. A placement misclick could pick up a ship that was already on the board

**What went wrong:** While placing the Battleship, clicking a square that overlapped the Carrier did not just say it didn't fit: it quietly lifted the Carrier off the board.

**How it was found:** Independent QA browser play-testing, with a misclick during placement.

**Root cause:** After a selected ship failed its placement check, the code picked up any ship occupying the clicked square. That pickup was intended for when no ship was selected, not when a player was trying to place another ship.

**How it was fixed:** A ship on the board is now picked up by clicking its cell only when no ship is selected. With a ship selected, an invalid placement keeps the existing "doesn't fit" message and leaves the placed ship in place. The tests `UI Bug 7: a placement misclick does not pick up the occupying ship` and `UI ship pickup still works when no ship is selected` cover both cases.

---

## 8. A touch placement left the next ship's invalid preview on the board

**What went wrong:** On a phone-sized touch viewport, tapping to place a ship left a red "doesn't fit" outline for the next ship over the ship just placed, making the valid placement look like an error.

**How it was found:** Independent QA play-testing on a phone-sized touch viewport.

**Root cause:** The click handler cleared the tap's preview anchor after placing the ship, but the tapped cell remained focused. When the pointer later left the grid, the `mouseleave` handler re-anchored the preview to that focused cell without checking the input type, bringing back the next ship's red outline.

**How it was fixed:** The game remembers the pointer type from pointer down and pointer over events. It clears the preview anchor only after a successful touch placement, and when the pointer leaves it restores a preview from the focused cell unless the last pointer was touch. Mouse and hover-capable pen previews remain visible, and keyboard previews still work. The tests `UI Bug 8: touch placement stays clear after the pointer leaves the grid`, `UI desktop mouseleave keeps the next-ship preview on the focused cell`, `UI desktop mouse placement keeps the next-ship preview at the pointer`, and `UI keyboard placement keeps the next-ship preview on the focused cell` check these behaviors.

---

## 9. The touch-preview fix also hid the preview for hovering styluses

**What went wrong:** With a hover-capable stylus, the next ship's preview disappeared after placing the Carrier even though the stylus was still hovering over A1. It stayed missing until the stylus moved.

**How it was found:** Devin Review, while reviewing the independent QA pull request.

**Root cause:** Bug 8's fix treated every non-mouse pointer as unable to hover. That included pen input, even though a hovering stylus can continue to show a preview at the cell.

**How it was fixed:** The game now treats only touch as non-hover input. Pen placement keeps the next ship's preview while the stylus hovers, and mouseleave restores the focused-cell preview unless the last pointer was touch. The test `UI Bug 9: pen placement keeps the next-ship hover preview` checks placement and mouseleave behavior.

---

Earlier browser play-testing covered wins and losses, every difficulty, manual placement with rotation, New Game during a game and after one ended, keyboard play, and a phone-sized screen. Independent QA and Devin Review later found the issues recorded in entries 6–9. The browser console showed no errors during the earlier testing.
