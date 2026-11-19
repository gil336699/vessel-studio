# Vessel Studio Changelog

## 1.4.0 2026-11-19

QA round 3 of 3: the same four reviews (a user test, a developer test, a UI/UX test and real jobs for designers), on 1.3.0.

- **Leaf growth grows each part of a drawing about its own root.** A pair of earrings, the panels of a facade or the letters of a word each grow out from their own first root, as a leaf of its own, and a mirrored pair grows alike. Before, every part grew about the first root in the file, so the second earring's veins swept in from the first one's side in long lines.
- **Undo after dragging Count is one step.** After the slider was let go, the browser's own change event left a hidden choice that the next key applied again: the first Undo seemed to do nothing, and Redo was lost. Arrow keys on Count now apply once they rest, so five presses place the attractors once, as one step.
- **Bow ties and figures of eight import again.** An outline drawn as one path that crosses itself was dropped as having no area, which 1.3.0 broke.
- **Roots follow the shape.**
  - Roots placed with Default, Base, Centre, Row or Edge are placed again the same way when the sheet, margin or edge clearance changes. A margin taken up and back puts the root back at the leaf's base; it stayed where it had been pushed. Every letter of a word keeps a root at any clearance; roots jumped to other letters.
  - Roots placed by hand move in only as far as needed, each within its own part, and a preset keeps them.
  - Row and Edge root every part of a drawing; Row missed parts. Edge roots a drawing of very many parts as the others do, its 500 largest.
- **Touch works as documented.** Tapping a greyed-out control shows why beside it: the finger lifting hid it at once. Pressing and holding a root after growth opens the question and leaves it open: on a tablet, the lift closed it.
- **Importing is faster and says more.**
  - 5,000 small letters with holes import in 1.2 s (8.6 s in 1.3.0), and 10,000 in 1.9 s (32 s).
  - Only the two edges of one compound path are read as an outlined stroke: a panel drawn in a frame's opening with an even gap round it stays a panel. It vanished.
  - A frame with several openings gets the frame note, and a frame round other shapes, as a badge's ring round its letters, gets one of its own.
  - A drawing larger than the 3 m sheet says how much it was scaled and how much to enlarge the exports for full size, and a sheet size typed past a limit says so; both were silent.
  - A file whose art lies wholly off its page says so; it imported as nothing. Parts too thin for a root at the segment length are counted, with what to do.
  - preserveAspectRatio's alignments and slice, percentages, SVG 2 symbols, nested pages with no size and switches by language are read as Chrome draws them, in 14 test cases.
  - Read at 72 points per inch keeps the sheet limits, the import's notes and your units.
- **Older projects** whose art ran past the page have their attractors placed again on the sheet or, once grown, those off it set aside, and the status says so.
- **Fixes**
  - Moving or removing a root, and Reset, ask first after growth even when the design is saved.
  - Space grows on a slider nudged with the arrow keys.
  - Widest vein reads the widest vein drawn; with a root that forks at once it gave the root's own width, 17–25 % too wide.
  - The count of attractors waiting for the growing leaf shows after opening, reloading and Undo.
  - A growth worker that can't load leaves the app usable, saying why; it could hang at "Stopping…".
  - Row or Edge with Leaf growth on is one Undo step.
  - On a phone the quick start sits below the sheet, and it closes on the first Grow.
  - The Placement label is no longer grey, the finished Grow looks unavailable in forced colours, slider rails and off switches are darker, the attractors waiting can wrap, compact buttons are 40 px on touch, and every tooltip is one sentence.
  - A sheet change that leaves a preset's lengths far off the new size says so; README's workflow now picks the sheet before the preset.
  - Art trimmed along the right or bottom of the sheet is a hole when growing outside the shape.
- **A correction to 1.3.0:** its commit said growth was identical to 1.2.0's. For imported drawings of several parts with Leaf, Leaf with loops and Tree, the default roots had moved, so those grew differently.

## 1.3.0 2026-11-19

QA round 2 of 3: the same four reviews, on 1.2.0, checking round 1's fixes and looking for what it missed.

- **Every part grows with every preset.** Arterial, Neural and Capillary start veins at the centre of each part of a word or logo; they gave the whole drawing one root, so most letters didn't grow. Base and Centre do the same, a drawing of up to 500 parts gets a root in each (it was 48), and a stalled design in parts says how to root the rest.
- **Sheet presets keep roots in place.** A new sheet size moved an imported drawing's roots differently from its outline, leaving letters without one.
- **Art past the page is trimmed to the sheet,** as for a bleed; veins grew off the sheet.
- **Files with no size** can be read again at Illustrator's 72 points per inch with one click on the Shape tab.
- **Grown veins are safe from a stray touch or drag.** Moving or removing a root after growth asks first, like Reset.
- **A preset keeps Picture placement,** and choosing a row or ring of roots turns Leaf growth off, saying why, so every root grows.
- **Measurements show the widest vein,** as Max width only caps it.
- **Fixes**
  - A root clicked near a corner stays by the corner; it could jump to the middle of an edge.
  - A restarted growth worker carries on from the veins shown; it could freeze.
  - Space after closing a dialog, or after clicking a switch's label, grows instead of pressing the control again.
  - On a touch screen, tapping a greyed-out control shows why beside it, as the status line can be off a phone's screen.
  - Long warnings keep their advice, the status isn't read out many times a second while growing, and several labels, contrasts and touch targets are better.
  - SVG symbols, nested pages and switches draw as in a browser, and a file of copies of copies is refused before it fills memory.
  - Dragging the Count slider places attractors once, when let go, and the shape is rebuilt only when it changes.

## 1.2.0 2026-11-19

The first of three QA rounds: a user test, a developer test, a UI/UX test and real jobs for designers, with every problem they found fixed.

- **Text, logos and maps grow everywhere.** Each separate part of an imported shape gets a root at its base, and so does each piece of space left round a shape grown outside it. Before, only one letter of a word grew, and some words and logos got no root at all.
- **More Illustrator files open at real size.**
  - Files from Export As are read at 72 pt per inch. They were read at 96, so they came in at 75 % of their size.
  - Files saved with Preserve Illustrator Editing Capabilities open. They were refused.
  - Copies made with `<use>` and symbols, shape sizes with units, and drawings with no size that reach above or left of the origin are read.
  - Live type and clipping masks are mentioned, with what to do.
- **Imported outlines keep their proportions** when you type a sheet size. They were stretched.
- **Faster.**
  - Edge placement and the Tree preset place attractors 4–8 times faster.
  - Settings that place attractors again do it once, not twice.
  - A Loops step with a long kill distance and short segments takes about a tenth of a second. It used to take minutes.
- **Exports keep their promises at sharp turns.** Where a smoothed curve would swing out of the shape or inside the edge clearance, as at a loop join, that piece is drawn straight.
- **Easier to use.**
  - A long status message wraps instead of pushing the dock off the window.
  - Warning text is easier to read, and dark-mode panels stay readable over the sheet.
  - Space grows even after you click a control.
  - Reset asks first.
  - On a touch screen, press and hold a root to remove it, and tap a greyed-out control to see why.
  - Count has a number box, the Feel section folds away, and tooltips are shorter.
- **Smaller fixes.**
  - An outline that crosses itself, like a bow tie, gets its attractors.
  - The stop message no longer blames an attraction limit that's off.
  - A pixel sheet keeps its pixels when its pixels per inch change.
  - The status says when a smaller sheet caps the margin or the edge clearance.
  - A stopped growth worker starts again by itself.

## 1.1.0 2026-11-18

- **Edge clearance.** A new setting on the Shape tab keeps veins a set distance inside the shape's edges and holes, in mm, in or pt. Every vein, loop join, attractor and root keeps it, so vein centre lines stay that far from a drawn outline or a cut line; for a clear gap, use more than half the widest vein near the edge. Before, veins grew right up to the outline, as close as 0.002 mm. It's measured along each whole segment, so a vein can't cut close past a corner.
- It's 0 by default, so new designs and saved projects grow exactly as in 1.0.0.
- The note for an outline drawn as outlined strokes points to it.

## 1.0.0 2026-11-18

The first version. It rebuilds Gil's four older space colonization pages as one app.

- **Grow veins inside any shape.**
  - Attractors fill a leaf, an ellipse, a rectangle, a ring, a tree, or an outline imported from Illustrator, and veins grow toward them from the roots.
  - Holes are obstacles the veins go round.
  - Six presets: Leaf, Leaf with loops, Tree, Arterial, Neural and Capillary. The last three are BioVessel Pro's. A preset keeps an imported shape: it sets how veins grow and look.
- **Outlined strokes read as lines.** In an outline saved with Outline Stroke, each line is drawn twice, a stroke's width apart. Read as filled shapes, that left veins only a 1 mm band. Each band is now read as the line it was, so veins fill the shape up to the drawn lines, and the status says so.
- **Imported outlines scale with the sheet** and keep their holes. A changed file imported under the same name is a new shape.
- **Open or closed veins.** With Loops on, veins from several sides meet at an attractor and really join there, so loops are closed paths in the SVG and DXF, not near misses.
- **Leaf growth.** The outline grows from the first root and attractors join in as it reaches them, so main veins form first.
- **Murray widths at real size.** Veins thicken toward the roots by Murray's law, from a tip width in mm, in or pt, with the exponent from 1.5 to 4. Even width suits pen plotters.
- **Real-size exports that hold what's shown.** SVG with a layer per part and one path per vein, DXF R12 for Fusion and CAM, and PNG that places at real size.
- **Repeatable and resumable.** A pattern number gives the same attractors and wiggle every time. A saved project carries on growing exactly where it stopped. Undo covers every change and every growth run.
- **What the old pages got wrong, fixed:**
  - Vessel Lab stopped after one step, deleting 1,486 of 1,500 attractors.
  - Its SVG had no veins in it.
  - Basic's SVG was white on nothing.
  - No page had units, a seed, saving or undo.
