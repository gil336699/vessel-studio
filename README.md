# Vessel Studio

Vessel Studio is a browser app that grows leaf veins, blood vessels, trees and roots inside any shape, by space colonization (Runions et al. 2005 and 2007).

- Attractors fill the shape, and each one pulls on its nearest vein. Veins grow toward them, a step at a time, until every attractor is reached.
- Grow open veins or closed ones that join into loops, inside a leaf, an ellipse, a ring, a tree, or an outline imported from Illustrator.
- Holes in the outline are obstacles the veins go round.
- Veins thicken toward their roots by Murray's law.
- Grow two or three systems together, as Vessel Studio 3D does: an inlet tree and an outlet tree that join where they meet, so flow can pass from one to the other, or interwoven systems that fill the same shape and never touch.
- Export the result at real size: SVG for Illustrator, Inkscape and pen plotters, DXF for Fusion and CAM, or PNG.

It rebuilds Gil's older space colonization pages (Vessel Lab, Basic, BioVessel Pro and Morphic Lab Pro) as one app.

**Use it online:** https://gil336699.github.io/vessel-studio/

![Vessel Studio in use: the Leaf preset grows open veins from the base of a leaf, main veins first; Leaf with loops joins them into a fine net; an Illustrator SVG of the word "Arbore" is dropped in, and every letter grows from its own root; Gil's shape, a rounded triangle with a window drawn as outlined strokes, is dropped in and its strokes are read as lines; Edge clearance is set to 12 pt and the veins grow clear of the drawn lines, seen close up; and the design is exported as an SVG at real size.](docs/demo.gif)

[Watch the demo as a video](https://github.com/gil336699/vessel-studio/releases/download/v1.4.0/vessel-studio-demo.mp4) (MP4, 1920 × 1080, 28 seconds).

![The eight presets, grown by the app's engine on A4: Leaf, open veins from the base with a midrib; Leaf with loops, a fine closed net; Tree, a trunk branching into its crown; Arterial, long smooth vessels from the centre; Neural, fine wandering branches; Capillary, a dense bed of small loops; Inlet to outlet, a red inlet tree from the bottom and a purple outlet tree from the top that join in the middle; Two interwoven, red and purple systems from roots round the edge, woven through each other without touching.](docs/presets.png)

## Run

```bash
npm ci
npm run dev
```

Open the address it prints, usually http://localhost:5173/. Use Node 22 or newer.

## Publish

GitHub Actions builds the app and publishes it to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`). Pages was turned on once with `gh api -X POST repos/gil336699/vessel-studio/pages -f build_type=workflow`. The build uses relative paths (`base: './'`), so it also works from any other folder or host.

## Layout

- **The sheet** fills the window, and everything else floats over it on glass.
- **Left:** tabs.
  - **Grow:** presets, attractors, growth and feel.
  - **Shape:** sheet size, the shape and the roots.
  - **Style:** vein widths, colours and curves.
  - **File:** projects and exports.
- **Top:** the Roots and Pan tools, and switches for what's shown: Veins, Attractors, Shape and Roots. Every export holds exactly what's shown. Zoom sits there too. With two or three systems, A, B and C buttons beside the tools pick which system the next root starts.
- **Bottom:** the dock, with Grow or Pause, Step, Reset, the status, and Undo and Redo.
- **Right:** measurements: vein points, forks, ends, loops, roots, attractors left, total length, steps and speed. With two or three systems, the vein points of each, and the joins and dead ends (Join) or the closest gap between systems (Interweave).

## Help in the app

- Hover over any control, or focus it with the keyboard, to see what it does, with its shortcut.
- A control that can't be used says why. For example, Grow after growth has finished says what's next.
- A three-step quick start shows on the first visit. The **?** button lists every shortcut and brings the quick start back.
- Changes that start the veins again (a new shape, new attractors, moving a root) say so in the status, and Undo brings the veins back.
- Opening a project, starting a new design or importing over grown veins asks first, in the app's own dialog. So do moving or removing a root and Reset, once veins have grown, whether or not the design is saved.
- A number typed past a limit is brought within it, and the status says so: a 4,200 mm sheet becomes 3,000 mm, the largest.

## Workflow

1. **Pick the sheet and the shape** on the Shape tab, or import an SVG outline. Choose where veins start with the root buttons, or click with the Roots tool.
2. **Pick a preset** on the Grow tab: Leaf, Leaf with loops, Tree, Arterial, Neural, Capillary, Inlet to outlet or Two interwoven. Each sets the growth and a look, with its lengths fitted to the sheet it's chosen on, so choose the sheet first; after a big change of sheet size, choose the preset again (the status says so). An imported shape and roots placed by hand stay.
3. **Grow:** press Space, or Grow. Growth settings (lengths, loops, feel) change live while the veins grow. Settings that move attractors start the veins again.
4. **Style:** Murray widths or one even width, the tip and largest width in real units, and colours.
5. **Export** on the File tab, or save a project to carry on later exactly where it stopped.

### With Illustrator

- An SVG from Illustrator has no stated size. Files from both Save As and Export As are recognised and read at 72 pt per inch, as Illustrator writes them, and the sheet becomes the page. Files saved with **Preserve Illustrator Editing Capabilities** work too. An Export As file drawn all in plain black can carry no sign of Illustrator; it's read at 96 per inch, the web's, and the Shape tab offers **Read at 72 points per inch** to fix it in one click.
- **Outlines that cross,** such as two overlapping shapes that weren't joined, overlap as a hole, and the status says so: join them first with **Pathfinder › Unite**. A **frame** (an outline whose openings take up most of it, one or several) grows in its band, as drawn; to grow in an opening, import that opening's outline alone. A frame round other shapes, as a badge's ring round its letters, grows in its band and in the shapes, and the status says so.
- Importing Vessel Studio's own SVG reads back its shape and skips its attractor and root dots.
- In **Export As › SVG**, tick **Use Artboards**, so the page is the artboard. Then open the exported SVG, copy it all, and use **Edit › Paste in Place** to line it up with the original artwork.
- Each part is its own group: shape (the outline), veins, attractors and roots. Illustrator opens them as groups in one layer (Object › Ungroup, or Release to Layers, splits them); Inkscape opens them as layers.
- Each vein between two forks is one path with its own stroke width, in real units.
- **Text, logos and maps** come in several parts: each letter, each island. Every part gets a root at its base, so all of it grows, and Row and Edge put roots in every part too; a drawing of more than 500 parts roots the 500 largest, and says so. A part too thin for a root at the segment length is counted in the status, with what to do. With Leaf growth, each part grows about its own root, so a pair of earrings grows alike. A bow tie or a figure of eight drawn as one path grows in both halves. Live type has no outlines; use **Type › Create Outlines** first. Copies made with `<use>` and symbols are read; clipping masks aren't applied, and the status says when the file has them.
- **Art past the page,** as with a bleed, is trimmed to the sheet: veins grow only in what's on it, and the status says so.
- **Sheets are 10 mm to 3 m a side.** A larger drawing is scaled to fit, and the status says by how much and how much to enlarge the exports for full size: a 4.2 m facade comes in at 71 %, to be enlarged by 140 %. **Read at 72 points per inch** keeps to the same limits.
- **Art off its page.** A file whose shapes all lie off the artboard says so, rather than importing an empty shape.
- **Outlined strokes.** A line saved with Outline Stroke or Expand comes in as a thin band: the line drawn twice, a stroke's width apart, in one compound path. Read as filled shapes, that leaves veins only the bands, about 1 mm wide. So two nested outlines of the same path that stay the same small distance apart all the way round (at most 3 % of the outline's size) are read as the one line they were. Shapes drawn on their own, such as a panel set in a frame's opening with an even gap round it, stay shapes. A boundary keeps its band's inner edge and a hole keeps its outer edge, so veins grow up to the drawn lines, never into them. Smaller outlines with the same band width are read the same way, and the status says how wide the bands were. To keep veins further off the lines, set **Edge clearance** on the Shape tab.

Measured on Gil's five test shapes (2026-11-18, in `test-fixtures/`), each imported into the production build on its 381 mm (1080 pt) page and grown to the end with the Leaf and Leaf with loops presets:

| Test shape | Outlines in the file → read | Bands | Area filled as drawn → as read | Open veins: points, attractors left | Loops: points, attractors left |
| --- | --- | --- | --- | --- | --- |
| 1-01, rounded triangle with a window | 4 → 2 | 2, 0.80 mm | 987 → 45,172 mm² | 3,608, 4 of 4,000 | 8,070, 2 of 4,500 |
| 1-02, lens with a round hole | 4 → 2 | 2, 0.96 mm | 946 → 28,119 mm² | 2,501, 0 | 6,014, 1 |
| 1-03, blob with a hooked slot | 4 → 2 | 2, 0.81 mm | 1,478 → 66,574 mm² | 4,817, 0 | 10,071, 3 |
| 1-04, curled band, drawn as stroked lines | 2 | none | 34,440 mm² | 3,007, 0 | 6,986, 4 |
| 1-05, branching outline | 1 | none | 46,979 mm² | 3,761, 0 | 8,259, 13 |

Across the ten runs, 57,094 vein points and 63,170 segments and joins were checked against the shape: none is outside it, none crosses an edge, and none lies on one of Gil's drawn lines.

With **Edge clearance** typed into the Shape tab, and a second root clicked just below each shape:

| Test shape, preset | Edge clearance | Vein points | Attractors left | Nearest vein point to an edge | Segments or joins closer than the clearance |
| --- | --- | --- | --- | --- | --- |
| 1-01, Leaf | 3 mm | 3,369 | 0 of 4,000 | 3.03 mm | 0 |
| 1-04, Leaf with loops | 2 mm | 6,463 (1,336 joins) | 4 of 4,500 | 2.002 mm | 0 |

With the clearance at 0, every preset and every run above grew exactly what 1.0.0 grew. With it, the roots are placed again for the clearance since 1.4.0, rather than moved in from where they were, so the two runs above grow a little differently from 1.3.0's.

### With pen plotters, lasers, Fusion and 3D printers

- **Pen plotters:** set Width to Even for one pen. The SVG's groups are Inkscape layers too, for AxiDraw. With two or three systems, each is a layer of its own, for a pen each.
- **Lasers:** SVG and DXF leave the background out, because a filled rectangle would be engraved. Veins are stroked centre lines; set cut or engrave in the laser software. Cutting a leaf skeleton needs the veins' outlines, which come later.
- **Fusion and CAM:** DXF R12, in mm or inches, with veins as polylines (smooth curves as close polylines) on layer `VEINS`, or with two or three systems on `VEINS_A`, `VEINS_B`, `VEINS_C` and `JOINS`. For a microfluidic chip, Inlet to outlet with Trim dead ends gives channels that all carry flow from the inlet to the outlet; set an edge clearance to keep them off the chip's edge.
- **3D printing:** keep veins at least 0.8 mm wide for a 0.4 mm nozzle (two lines). Set it with Tip width on the Style tab.

## Feature reference

### Shapes and roots

| Choice | What it does |
| --- | --- |
| Leaf | An ovate leaf with a pointed tip, about 0.62 times as wide as it is long, as large as the sheet allows. Veins start at its base. |
| Ellipse, Rectangle | The oval that fits the sheet, or the sheet itself, inside the margin. |
| Ring | An ellipse with a hole a third of its size. The hole is an obstacle. |
| Tree | A round crown on a narrow trunk. A vein climbs the trunk and branches in the crown, as Runions' trees do. |
| Imported | Every closed path of an SVG, read even-odd, so a shape inside a shape is a hole. Outlined strokes are read as the lines they were (see [With Illustrator](#with-illustrator)). Open paths are left out, and the status says so. The outline scales with the sheet. |
| Grow outside the shape | The sheet with the shape as a hole, so veins wrap round it. |
| Edge clearance | How far veins stay inside the shape's edges and holes, in real units. 0, the default, lets veins reach the outline, as in a real leaf. More keeps vein centre lines that far from a drawn outline or a cut line: every vein, loop join, attractor and root keeps it. For a clear gap, use more than half the widest vein near the edge. Changing it places the attractors again. |
| Roots | Default (a leaf's base, an ellipse's centre), Base, Centre, Row (along the bottom, for parallel veins), Edge (round every part's outline, growing in), Ends (a root at each end of the shape, across its longer side), or click with the Roots tool. For an imported drawing or a shape grown outside, every button puts roots in every separate part, up to 500. Roots placed with a button follow the shape: change the sheet, margin or edge clearance and they're placed again the same way. Roots placed by hand are moved in only as far as needed, each within its own part, and a preset keeps them. Drag a root to move it; Alt-click it, or press and hold it on a touch screen, to remove it. Once veins have grown, moving or removing a root asks first. |

### Systems

Two or three systems grow together, each from its own roots, as in Vessel Studio 3D. Set them on the Grow tab, or pick one of the two presets.

| Choice | What it does |
| --- | --- |
| One | One system of veins, as before 1.5.0. It grows exactly as 1.4.0 did. |
| Two, Join (preset Inlet to outlet) | An inlet tree (A) and an outlet tree (B) share the attractors: each attractor pulls the tree whose vein is nearer, so each tree takes the space nearest it. Each tree's free vein ends pull the nearest vein of the other tree, from up to 6 kill distances away, and the two join within the kill distance, so flow can pass from one to the other: the mutual tree attraction of Kinstlinger et al. (2020). Joins are spaced along the trees, as loops are: two joins less than 8 segments apart along both trees don't both form, so two veins running side by side don't join like the rungs of a ladder. The two trees' veins come edge to edge but never overlap, except where they join. Loops are off, as Join closes the network itself. |
| Tip pull | How strongly free vein ends pull the other tree, 0–100 %. |
| Trim dead ends | On by default. Leaves out the vein ends that never met the other tree, again and again, so every vein shown and exported carries flow from inlet to outlet. The view trims once growth pauses, so veins still meeting the other tree stay in view while it grows. |
| Two or Three, Interweave (preset Two interwoven) | Each system has Count attractors of its own, drawn in turn from one even spread, so every system fills the shape. A step that would bring one system's vein nearer another system's than the Gap, edge to edge, with the veins' widths, is refused; it turns away and tries again, three more times, so veins pass round each other. On a flat sheet two veins that cross touch, so the gap is kept along each whole segment, not only at its points. Murray widths grow after a vein has passed another system's, so the view and exports narrow veins where two systems pass closer than the gap, over a few segments. When growth stops, an attractor nearer another system's vein than any of its own is in that system's space and is used up, so a shape the systems have filled ends as reached. |
| Gap, Repel | The space kept between different systems' veins, edge to edge, in real units (0.63 mm on A4), and how strongly veins steer away from other systems as they grow, 0–100 %. |
| Roots for each system | Default puts each system at its own end of the shape, or of every part of a drawing: A at the bottom or the left, B at the other end, C in the middle. Base and Centre put a root for each system side by side, far enough apart for their widest veins and the gap. Row takes turns along the bottom. Edge puts six roots for each system round the outline, taking turns, so the systems interweave all through the shape: a ring of many more grows short spokes side by side. In a drawing of many parts, every part gets each system. The A, B and C buttons above the sheet, or the A, B and C keys, pick which system the next root you add starts. Changing the number of systems places roots again when a button placed them; roots placed by hand keep their systems. A system with no root says so in the status. |
| Colours | System A, B and C, and the joins, on the Style tab. Roots are drawn in their system's colour. |

On a flat sheet, whichever system reaches an area first keeps the other out, so where the roots are decides how much the systems interweave: from the two ends of a shape they interweave where they meet, and from roots round the edge, taking turns, all through it.

### Attractors

| Placement | What it does |
| --- | --- |
| Even | Mitchell's best candidate with 12 tries a point: evenly spread, never on a grid. Smoothest veins. |
| Random | Uniform at random, with clumps and gaps. |
| Grid | A jittered square grid, like BioVessel Pro's. It can show its regularity. |
| Edge | Crowded near the outline, so twigs fill a tree's crown edge (Runions 2007, Fig. 7). |
| Picture | More attractors where a chosen picture is darker. The picture fits inside the sheet, centred. The project saves the attractors, not the picture. An almost white picture spreads them evenly, and the status says so. A preset keeps Picture while a picture is loaded. |

Every placement gives exactly the count asked for, unless an edge clearance leaves too little room to hold that many; then the status says how many fit. The same pattern number always gives the same points.

### Exports

| Export | Contents | Units |
| --- | --- | --- |
| SVG | Groups `shape`, `veins`, `attractors`, `roots`, each only when shown. With two or three systems, `veins-a`, `veins-b` and `veins-c` (System A, B and C) and `joins` instead of `veins`, each in its own colour, so each system can be cut, plotted with its own pen or hidden on its own. One path per vein between forks, with its stroke width, smoothed through its points (Catmull–Rom) unless Smooth curves is off. Where a curve would swing out of the shape or inside the edge clearance, as at a sharp loop join, that piece is drawn straight. No background. Very long veins are split at Illustrator's 32,000-point path limit. | mm, in, pt or px, as the sheet; in px the SVG is that many pixels, which other apps show at 96 per inch |
| DXF | AutoCAD R12 text. Layers `VEINS` (centre-line polylines), `SHAPE`, `ATTRACTORS` and `ROOTS` (circles), each only when shown; with two or three systems, `VEINS_A`, `VEINS_B`, `VEINS_C` and `JOINS` instead of `VEINS`. y points up, as DXF expects. | mm, or in for inch sheets |
| PNG | The sheet at its pixels per inch, in its colours, optionally transparent. The file records its pixels per inch, so Illustrator, InDesign and Photoshop place it at real size. | px |
| Project | Settings, the imported shape, roots, attractors and every vein point at full precision, as `.vessel.json` (schema `vessel-studio`). Growth carries on exactly where it stopped. A design of one system is version 1, as before, so older versions open it; one of two or three is version 2, which adds each root's and vein point's system and the joins between the trees, and which older versions say is from a newer version. | mm |

## Controls

| Control | Effect |
| --- | --- |
| Count | Number of attractors, 100–20,000. With interwoven systems, Count per system: each system has that many. |
| Systems, How they grow | One, Two or Three systems, and for two, Join or Interweave; three always interweave. See [Systems](#systems). |
| Tip pull, Trim dead ends | Join: how strongly free vein ends pull the other tree, and whether the dead ends are left out. |
| Gap, Repel | Interweave: the space kept between systems' veins, and how strongly they steer apart. |
| New pattern | A new pattern number: new attractors and a new wiggle. |
| Segment length | Distance between neighbouring vein points. |
| Kill distance | How close a vein must come to use up an attractor. Smaller makes denser, finer veins (Runions 2005, Fig. 9). Keep it at least the segment length. |
| Limit attraction distance | Off by default, as for Runions' leaves: every attractor pulls its nearest vein however far away. On, only veins within the distance feel it, and tips wander. |
| Loops | Closed venation. An attractor pulls every vein point in its relative neighbourhood and waits until all of them arrive, then they join there with a real join, closing a loop. Veins less than 8 segments apart along the tree don't join, so no tiny bulbs. |
| Leaf growth | The outline grows about the first root from 6 % to full size over the steps set; in a drawing of separate parts, each part grows about the first root in it. Attractors join in as it reaches them, so main veins form first (marginal growth, Runions 2005). Choosing Row or Edge roots turns it off, as the other roots would wait on the first. |
| Keep veins apart | Refuses a new point within 0.45 segments of another vein. A refused open vein's step uses up the attractors it would have reached; with Loops, they wait for the other veins. Off grows as the older pages did. |
| Keep heading | Blends a growing vein's step with its last heading, 0–95 %. Side branches always start toward their own attractors. |
| Wiggle | A seeded wobble on each step, 0–1.5. |
| Pull | A steady pull, 0–1, up, down, left, right or out from the root (Runions 2007, Eq. 3). |
| Speed | Steps per screen update, 1–40. |
| Width | Murray's law (parent^n = sum of children^n, from the tip width at every end) or Even. |
| Tip width, Max width, Murray exponent | Finest vein, a cap on the widest, in real units, and n from 1.5 to 4. Murray is 3, retinal arteries about 2.6, Runions' leaves 2. How wide veins get depends on how many ends they feed: Measurements shows the widest. |
| Colours, Smooth curves | Vein (or each system's and the joins') and sheet colours, and curves or straight segments. |
| Sheet | Preset, units (mm, in, pt, px), width, height, pixels per inch, margin, edge clearance. |

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| Space | Grow or pause (hold Space and drag to pan). On a control reached with Tab, Space presses it; on a slider it always grows |
| S | Grow one step |
| R | Reset to the roots |
| O, H | Roots and Pan tools |
| A, B, C | With two or three systems: the system the next root starts |
| Alt-click, or press and hold on a touch screen | Remove a root |
| Scroll, pinch | Zoom |
| +, −, F | Zoom in, out, fit |
| 1, 2, 3, 4 | Show veins, attractors, outline, roots |
| ⌘Z, ⇧⌘Z | Undo, redo |
| ⌘S, ⌘O | Save, open project |
| Esc | Close a dialog, or go back to Roots |
| ? | Shortcuts and quick start |

## How it works

Each step does three things.

1. **Pair.** Every live attractor finds its nearest vein point. If that's closer than the kill distance, the attractor is used up. Otherwise it pulls, if the point is within the attraction distance and can see it past the shape's edges. With Loops on, it pulls every point of its relative neighbourhood instead: v counts unless some u is nearer both the attractor and v.
2. **Grow.** Every pulled point grows one new point a segment length away. Its direction is the average of the unit vectors to its attractors, blended with Keep heading and Wiggle, plus Pull. A step that would leave the shape, cross an edge, come nearer an edge than the edge clearance, or land on another vein is refused. The clearance is measured from the whole segment, not just its end, so a vein can't cut close past a corner.
3. **Add.** The step's new points go in together, so the result never depends on visiting order.

These rules make it fast and repeatable:

- **A cached nearest point.** Each attractor's nearest vein point is cached and updated with only the new points of each step. That is exact, because vein points never move, and ties go to the older point as a full search would.
- **Grids for the shape.** Inside tests use bands of edges and crossing tests walk a grid of edges, so imported outlines with thousands of points stay fast. Outlines are sorted by position and swept, so only those whose boxes meet are tested for nesting, and the nearest edge to a point is found on the grid: a drawing of 968 outlines is read in 52 ms (26 s when every pair was tested), and 10,000 small letters with holes import in 1.9 s (32 s in 1.3.0).
- **The same result every time.** Everything is seeded, and the project file holds the whole state, the random generator's included.
- **A worker.** The engine runs off the page and sends one frame at a time, after the page has drawn the last one. Frames carry only new points, with their systems.
- **Systems.** With two or three, each attractor keeps a nearest point in each tree it feeds, and each point knows its system and, for the gap, the vein ends it feeds. The tests check that no two systems' veins come nearer than the gap along any segment, that Join's trees never cross and join only within the kill distance, that trimmed, every end left is a join and the inlet reaches the outlet, and that a run saved part way, joins and all, carries on exactly as an unbroken one.

**An honest note on its limits:**
- It is a picture-making model, not a physiological one: Murray widths come from the number of vein ends each vein feeds, not from a flow solve. On a loop, a join takes the thinner end's width.
- A vein can't grow round an obstacle to reach an attractor it can't see. It grows toward attractors it can see, and gets there in the end.
- A handful of attractors can end up just beyond the kill distance of two veins, where no step is allowed. The status counts them: at most 14 of 4,500 (0.3 %) in the presets and Gil's test shapes, and up to 78 of 4,500 (1.7 %) on his pill outlines with loops.

## Known limits

Engine timings were measured in Node on this Mac (Apple silicon), best of 3 runs, 2026-11-18. In-app timings come from the production build driven in headless Chrome.

| Design | Placing attractors | Steps | Vein points | Grow (engine) | Per step | Steps/s |
| --- | --- | --- | --- | --- | --- | --- |
| Leaf, A4, 4,000 attractors | 64 ms | 266 | 6,286 | 66 ms | 0.25 ms | 4,003 |
| Leaf, A3, 20,000, 0.5 mm segments | 377 ms | 786 | 49,893 | 2,055 ms | 2.61 ms | 382 |
| Leaf with loops, A4, 4,500 | 74 ms | 269 | 12,984 | 295 ms | 1.10 ms | 913 |
| Loops, A3, 20,000, 0.5 mm | 371 ms | 787 | 92,333 | 11,102 ms | 14.11 ms | 71 |
| Capillary, A4, 5,000 | 82 ms | 140 | 17,949 | 1,240 ms | 8.86 ms | 113 |
| Inlet to outlet, A4, 2,000 shared (52 joins) | 32 ms | 174 | 6,626 | 481 ms | 2.76 ms | 362 |
| Two interwoven, A4, 3,000 a system | 99 ms | 149 | 12,750 | 754 ms | 5.06 ms | 198 |

The two systems' rows were measured on 2026-11-25 the same way. One system is as fast as in 1.4.0: best of 5, the A4 Leaf grows in 66 ms (1.4.0: 64–66 ms), Leaf with loops in 286 ms (282–289 ms) and Capillary in 1,248 ms (1,240–1,245 ms).

- **In the app** at the default Speed (3 steps a frame), growth is held to the screen: about 186 steps a second, so the A4 leaf takes 1.5 s. At Speed 40 the A3 leaf of 20,000 attractors took 2.06 s and 2.12 s in two runs, as fast as the engine alone.
- **In a background tab** growth carries on at about half the speed: 182 steps in 6 s at Speed 1, about 30 a second, against 60 in front.
- **Size caps:** 20,000 attractors and 400,000 vein points. A session larger than about 4.5 MB isn't kept in the browser between visits, and the File tab says so; save a project instead.
- **Loops are slower:** each source tests up to 48 nearby vein points for its neighbourhood. A long kill distance with short segments costs most: kill 20 mm with 1 mm segments takes about 7 ms a step; the extreme of kill 37 mm with 0.05 mm segments takes 0.1 s a step at first and up to about 1 s as the veins fill in.
- **Placing attractors** happens on the page, not in the worker. Even places 20,000 in about 0.4 s; Edge, which measures each point's distance to the outline, 1–1.5 s on Gil's test shapes.
- **Sheets are 10 mm to 3 m a side.** Larger work is scaled to fit, and exports come out at that scale; the status says how much to enlarge them.
- **Two systems on a flat sheet keep each other out.** Whichever reaches an area first holds it, so interwoven systems from the two ends of a shape interweave only where they meet; roots round the edge, taking turns, interweave them throughout. A few attractors can be left where no vein could grow, as with one system: 1 of 6,000 in Two interwoven on A4.
- **Inlet and outlet go at the ends of the shape's box,** across its longer side. In a curled shape, such as a band that turns back on itself, drag them to the ends you want.
- **Very thin frames read as lines.** Two nested outlines of one compound path less than 3 % of their size apart all the way round are read as one outlined stroke. A frame that thin can't hold veins anyway, and the status says when it happens.
- **Veins reach the outline unless Edge clearance is set.** Without it, vein centre lines come as close as 0.002 mm to the outline, so a vein's stroke width can overlap a drawn line. The clearance is for centre lines: to keep a vein's whole stroke clear, set it to at least half the widest vein that runs near the edge.

## Rebuilt from Gil's older pages

Vessel Studio replaces four pages in `HomeMadeTools`, which were left untouched. Every old control is listed in [docs/rebuild.md](docs/rebuild.md) with where it went, or why it was dropped. Fixed old problems, as measured:

- **Vessel Lab stopped after one step** with its defaults. Removing reached attractors deleted every one after the first, so 1,486 of 1,500 went.
- **Vessel Lab's SVG held no veins.**
- **Basic's SVG was white lines with no background.**
- **No units, no seed, no save, no undo** anywhere.

The engine follows the papers, as Basic and BioVessel did. Tests run copies of their growth steps beside it and match every vein point within 1e-6 mm for 120 steps. Vessel Lab's tip-only rule was dropped on purpose: with its default Max children of 1 it couldn't branch.

## Development

```bash
npm run lint      # ESLint, zero warnings
npm test          # Vitest
npm run build     # type-check and build to dist/
```

| Folder | What's in it |
| --- | --- |
| `src/veins/` | The engine, plain TypeScript: `engine.ts` (growth, with one, two or three systems), `region.ts` (shapes, inside and crossing tests), `attractors.ts`, `network.ts` (widths, veins between forks, smoothing, counts, trimming dead ends, narrowing where systems pass close), `strokes.ts` (outlined strokes read as lines), `shapes.ts`, `geometry.ts`, `random.ts`, with tests, including `parity.test.ts` against the old pages |
| `src/worker/` | The growth worker and its frame protocol (`runner.ts`), with a test |
| `src/lib/` | Settings and presets, the design, project files, SVG, DXF and PNG exports, SVG import (from Line Growth), units and the renderer |
| `src/components/` | The panels, bars, stage, tooltips, dialogs and tabs, with tests of the slider, dialog and tooltip driven by pointer, touch and key events (happy-dom) |
| `src/useVeins.ts` | The page's model: the design, the worker, undo and saving state |
| `docs/` | `research.md` (the algorithm and sources), `rebuild.md` (the old pages), `plan.md` (the 1.0 plan) |
| `test-fixtures/` | Gil's Illustrator pill outlines, his five TestingShapes (2026-11-18), Illustrator exports made in QA (a word, a logo, earrings, a facade and its frame) and a version 1 project file |
| `local/` | Not in git: QA scripts and probes |

## Sources and credits

- The method is from Runions, Fuhrer, Lane, Federl, Rolland-Lagan and Prusinkiewicz (2005), *Modeling and visualization of leaf venation patterns*, and from Runions, Lane and Prusinkiewicz (2007), *Modeling trees with a space colonization algorithm*. It was rebuilt from the papers; no code was copied.
- Jason Webb's 2D experiments (CC BY-NC-SA 4.0) were read for ideas only.
- The SVG reader and some interface parts come from Gil's own Line Growth (MIT).
- Join is the mutual tree attraction of Kinstlinger et al. (2020), *Generation of model tissues with dendritic vascular networks via sacrificial laser-sintered carbohydrate templates*, Nature Biomedical Engineering 4, 916–932. Join and Interweave follow Vessel Studio 3D's engine.
- See [docs/research.md](docs/research.md) for every source and its license.

## License

MIT. See [LICENSE](LICENSE).
