# Battleship

A browser Battleship game against a computer opponent. Plain HTML, CSS and JavaScript: no build step, no backend, no dependencies.

**Play:** open `index.html`, or serve the repo with GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). All paths are relative.

## How to play

1. **Place your fleet** on *Your Fleet*: pick a ship, hover over a cell to preview it (the preview shows whether the spot is valid), then click to place. Press **R** while on *Your Fleet*, or use **Rotate**, to switch between horizontal and vertical. Click a placed ship's button to move it. You can also use **Randomize**.
2. Press **Start Game** once all five ships are placed.
3. Fire by clicking a cell in *Enemy Waters*, or use the arrow keys and Enter/Space. You go first. Each shot reports Hit, Miss, or "Sunk: [ship]". You can't fire at the same cell twice.
4. The first side to sink the whole enemy fleet wins. The computer's ships are revealed at the end. **New Game** resets everything at any time.

## Difficulty

| Level | Strategy |
| --- | --- |
| Easy | Fires at random untried cells. |
| Normal (default) | Hunts on a checkerboard. After a hit it tries neighbouring cells, follows the line once it knows the direction, and only goes back to hunting when every hit belongs to a sunk ship. It handles ships lying side by side. |
| Hard | Probability targeting. For each untried cell it counts how many ways the remaining ships could fit through it given known hits and misses, then fires at the highest-scoring cell. |

## Project layout

```
index.html          entry point
css/style.css       styles (responsive down to phone width)
js/game.js          rules: boards, placement, shots, turns, win detection (no DOM)
js/ai.js            computer opponents (no DOM)
js/ui.js            rendering and input only
tests/run.js        zero-dependency test runner
tests/*.test.js     unit, browser-load and simulation tests
BUGS.md             log of real bugs found during development
```

## Tests

```
node tests/run.js
```

No installs needed. The suite covers placement rules (including 1,000 random fleets), hit/miss/sunk and win detection, duplicate-shot rejection, AI behaviour, and 500 complete simulated games per difficulty. It also prints the average number of shots each AI needs to sink a fleet and checks that Hard < Normal < Easy.
