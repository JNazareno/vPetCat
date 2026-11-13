# Whisker Room: virtual cat prototype

A single-file, no-build virtual pet game about cats. Open `index.html` in any modern browser (desktop or phone).

## What's in it
- **Adoption:** choose one of six coats (orange/grey tabby, black, white, tuxedo, calico) and a name. Each cat rolls two personality traits (Playful, Lazy, Cuddly, Aloof, Foodie, Mischievous, Vocal, Tidy) that change how it behaves.
- **Needs:** Fullness, Fun, Energy, Hygiene, and Bond, which drop in real time.
- **Autonomous cat AI:** the cat wanders, eats from its bowl, naps in its bed, grooms, uses the scratching post, uses the litter box, meows about what it needs, brings you gifts, and knocks the vase off the shelf.
- **Cat-specific mechanics:**
  - *Petting with overstimulation:* press and stroke the cat to raise Bond. A lashing tail means stop, or you get swatted. Aloof cats have a shorter fuse.
  - *Litter box:* if it gets too dirty, the cat goes on the floor instead. Tidy cats are pickier.
  - *Hairballs* from self-grooming. Brushing helps.
  - *Baths:* fully clean, deeply offended cat.
  - *Laser pointer:* move your pointer or finger across the floor. Each catch earns a coin.
  - *Catnip zoomies*, and lights-off bedtime.
- **Economy:** earn coins from laser catches and gifts. Spend them on tuna, treats, and catnip.
- **Growth:** kitten → junior → adult (1 minute of play = 1 cat-week).
- **Persistence:** saves to localStorage. Time passes while you're away (at a gentler rate, capped at 8 h), and the journal tells you what happened.
- Settings: simulation speed (1×/5×/20× for testing), theme, and reset.

Debug handle in the console: `whisker.state`, `whisker.setSpeed(n)`.
