# Whisker Room: 3D cat simulator

A browser-based 3D virtual cat simulator. Open `index.html` in any modern browser on desktop or phone. There's no build step and no internet needed: three.js is bundled in `vendor/`.

## The simulation
- **A cat with its own life.** A utility-based AI weighs the cat's needs, personality, time of day and surroundings. It eats, drinks, uses the litter box, naps (in its bed, on the sofa, in the box, on the cat tree, or in the sunbeam), grooms, scratches, explores, watches birds at the window, plays with toys, asks for attention, brings you gifts, gets the zoomies at night, and knocks the vase off the shelf while looking right at you.
- **Needs:** food, water, energy, fun, hygiene and social, plus bond, stress and a hidden bladder.
- **Personality:** two traits per cat (Playful, Lazy, Cuddly, Aloof, Foodie, Mischievous, Vocal, Tidy, Curious). Each cat also has its own hidden petting preferences that you discover by trying them (Cat tab).
- **Day/night cycle:** 1 real second = 1 game minute at 1×. You can pause or run at 4× or 15×. Real sunlight comes through the window, so the sunbeam moves across the floor during the day and the cat seeks it out. At night you can switch on the lamp.
- **Consequences:** a full litter box leads to accidents. Skipped brushing leads to hairballs. A neglected cat loses bond and gains stress. There's a daily recap with an allowance based on how the day went.
- **Growth:** kitten → junior → adult, and the model grows with it.
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
- `js/world.js`: room, furniture, lighting and sun, outside scenery, toy/treat/vase physics, camera, raycasting
- `js/cat.js`: procedural cat model (coat patterns painted into vertex colours), pose blending, gait, tail, blinking, petting zones
- `js/brain.js`: needs, utility AI, activities written as generators, player interactions, save/load and offline catch-up
- `js/ui.js`: HUD, tools and input (pet, carry, throw, laser, wand), synthesized sound (purring, meows, hisses...), main loop

Debug handles in the console: `whisker.sim`, `whisker.world`, `whisker.setSpeed(n)`.

three.js r159 (MIT licence, see `vendor/LICENSE-three.txt`) is loaded as a classic script so the page also works straight from `file://`.
