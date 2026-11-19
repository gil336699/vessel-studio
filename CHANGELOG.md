# Vessel Studio Changelog

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
