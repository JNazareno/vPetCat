# Virtual Pet Cat: 3D cat simulator

A browser-based 3D virtual cat simulator.

**Play online:** https://jnazareno.github.io/vPetCat/

**To play from a file:** open `cat-pet/index.html` in a web browser (Chrome, Safari, Firefox or Edge) on desktop or phone. It's a single self-contained file, so you can download just that file and it still works offline. Don't use a file *preview* (GitHub's code view or a phone's file viewer); those show the page without running it.

If the game can't start, for example because 3D graphics (WebGL) are turned off in the browser, the page says why instead of staying blank.

## The simulation
- **A cat with its own life.** A utility-based AI weighs the cat's needs, personality, time of day and surroundings. It eats, drinks, uses the litter box, naps (in its bed, on the sofa, in the box, on the cat tree, or in the sunbeam), grooms, scratches, explores, watches birds at the window, plays with toys, asks for attention, brings you gifts, gets the zoomies at night, and knocks the vase off the shelf while looking right at you.
- **Needs:** food, water, energy, fun, hygiene and social, plus bond, stress and a hidden bladder.
- **Personality:** two traits per cat (Playful, Lazy, Cuddly, Aloof, Foodie, Mischievous, Vocal, Tidy, Curious). Each cat also has its own hidden petting preferences that you discover by trying them (Cat tab).
- **Day/night cycle:** 1 real second = 1 game minute at 1×. You can pause or run at 4× or 15×. Real sunlight comes through the window, so the sunbeam moves across the floor during the day and the cat seeks it out. At night you can switch on the lamp.
- **Bathroom habits:** separate bladder and bowel urges (drinking fills one, eating the other). The cat sniffs the box, digs, turns around, squats (a quick pee or a longer hunched poop), then buries it, unless it can't be bothered. Some cats get post-poop zoomies. Pee clumps and poops pile up in the box until you scoop them, and smell wisps rise from a dirty box or anything left on the floor.
- **Consequences:** a dirty litter box leads to accidents: pee on the rug or even the bed, poop right next to the box. Very stressed cats sometimes go outside the box even when it's clean. Skipped brushing leads to hairballs. A neglected cat loses bond and gains stress. There's a daily recap with an allowance based on how the day went.
- **Growth:** kitten → junior → adult, and the model grows with it. The kitten arrives at 8 weeks old and each game day is about 2 months of its life (junior by day 3, adult by day 6).
- **Persistence:** saves in the browser. Time passes gently while you're away, and the journal tells you what happened. A cat from the earlier 2D prototype is carried over automatically.

## Interacting
| Tool | What it does |
| --- | --- |
| ✋ Hand | Stroke the cat to pet it (head, cheeks, chin, back, base of tail, belly...). Press and hold to pick it up and carry it, then drop it in the bed or on the sofa. Drag and flick toys to throw them. Click the bowls, litter box, lamp and messes. |
| 🪮 Brush | Stroke to brush. Improves hygiene and prevents hairballs. |
| 🔴 Laser | The dot follows your pointer on the floor and walls. Catches earn coins. |
| 🪶 Wand | Dangle the feather. The cat stalks, wiggles and pounces. Hold the mouse button to lift it higher. |
| 🍬 Treat | Toss a treat onto the floor. |

Body language matters: a lashing tail and flattened ears mean the cat is getting overstimulated. Keep going and you'll get swatted. Belly rubs are usually a trap.

Camera: drag empty space to orbit, scroll or pinch to zoom, double-click the cat to follow it. In laser/wand mode, right-drag or two-finger drag orbits.

## Code layout
The editable sources live in `cat-pet/src/`. `cat-pet/index.html` is generated from them, so after changing anything in `src/`, rebuild it with:

```
python3 cat-pet/build.py
```

You can also open `cat-pet/src/index.html` directly while developing.

- `src/js/world.js`: room, furniture, lighting and sun, outside scenery, toy/treat/vase physics, camera, raycasting
- `src/js/cat.js`: procedural cat model (coat patterns painted into vertex colours), pose blending, gait, tail, blinking, petting zones
- `src/js/brain.js`: needs, utility AI, activities written as generators, player interactions, save/load and offline catch-up
- `src/js/ui.js`: HUD, tools and input (pet, carry, throw, laser, wand), synthesized sound (purring, meows, hisses...), main loop

Debug handles in the console: `virtualPetCat.sim`, `virtualPetCat.world`, `virtualPetCat.setSpeed(n)`.

three.js r159 (MIT licence, see `cat-pet/src/vendor/LICENSE-three.txt`) is used as a classic script and inlined into the built page, so it works straight from `file://`.
