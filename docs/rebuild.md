# Rebuild notes: Gil's older SCA pages

Vessel Studio rebuilds four single-file pages Gil made in `HomeMadeTools`. They were left exactly as found. Reading them downloaded their OneDrive cloud copies, which changes nothing in the files, and their SHA-256 hashes are recorded below. None is in git.

| Page | File | Date | Size | SHA-256 (first 12) |
| --- | --- | --- | --- | --- |
| Gil's Vessel Lab | `SCA_v2/sca_lab.html` | 2025-11-11 | 2,890 lines, 47 controls | ab434007c302 |
| Space Colonization – Basic | `SCA_2/SCA.html` | 2025-11-13 | 645 lines, 17 controls | 1eb6236289be |
| BioVessel Pro | `BackUp/SCA/sca.html` | 2026-01-23 | 675 lines, 17 controls | bca5f28436f3 |
| Morphic Lab Pro (SCA on a Voronoi scaffold) | `BackUp/SCA/Combine.html` | 2026-01-23 | 684 lines, 18 controls | dbea0b29da3d |

`BackUp/SCA/Voronoi.html` is Voronoi Lab 2.0, which became Voronoi Studio, so it isn't part of this rebuild.

## Which code really ran

- **Vessel Lab** runs only the tips. Each tip's attractors are grouped by angle, and the tip makes up to *Max children* new points. It removes attractors near tips, starts each frame anew from the newest tips, and stops at 95 % coverage.
- **Basic and BioVessel** run the papers' rule. Any vein point with attractors grows. Attractors within the kill radius go before growth.
  - BioVessel adds inertia (a blend with the last heading) and random wiggle, then Murray widths with exponent 2.8.
- **Morphic** runs the same rule, using Voronoi sites as attractors, and removes them after growth.

Vessel Studio's engine follows the papers, as Basic and BioVessel do. Tests run copies of Basic's `step()` and BioVessel's `grow()` beside the new engine, and require the same points to within 1e-6 after 120 steps. Vessel Lab's tip-only rule is dropped on purpose, for the reasons below.

## Problems measured in the old pages

Measured in headless Chrome on copies of the pages, with their default settings, most important first.

1. **Vessel Lab stops after one step.** The default run says "Done · 99.1 % coverage" after 1 step. It has 96 roots, 181 vein points and 0 branches.
   - The cause is `removeKilledLeaves` (line 2082). It swaps the last attractor into a removed one's place but checks the same place again, so one reached attractor removes every attractor after it.
   - 81 attractors were within the kill radius; 1,486 of 1,500 were removed.
2. **Vessel Lab's SVG export has no veins.** It holds 1,500 attractor circles and 1,501 Voronoi and Delaunay paths, but 0 vein strokes (`exportAsSVG`, line 2750).
3. **Basic's SVG is invisible on white.** It holds 6,537 separate `<line>` elements with white strokes and no background, and no physical size.
4. **No real units anywhere.** Sizes are screen pixels. Vessel Lab's PNG is a capture of the canvas at window size, pan and zoom included: 1,080 × 842 px for a 1,000 × 700 design. BioVessel's SVG background is a CSS style that Illustrator ignores.
5. **No run can be repeated.** There is `Math.random` everywhere and no seed. Two loads of Vessel Lab gave different attractors: 81 against 70 inside the kill radius at the start.
6. **Vessel Lab can't branch with its defaults.** With Max children 1, only tips grow, one point each (`growChildrenFromTips`, line 2098).
7. **Vessel Lab's Min branch angle 0 means 45°** (line 2102: `minBranchAngle||45`).
8. **Every Vessel Lab vein is 0.5 wide by default.** Max thickness 0.5 caps every width, and a vein's age is never increased (line 2438).
9. **Basic stacks every root on the centre** (line 379), so 50 roots draw as one. Its widths grow linearly with the tips fed (line 482), not by Murray's law.
10. **BioVessel needs the internet and uses a grid.**
    - It needs the internet (Tailwind from a CDN) and uses `alert()`, which embedded browsers block.
    - Its attractors sit on a jittered grid, which the thesis warns gives a regular look (p. 42, 78).
    - It compares every attractor with every vein point, every step.
11. **No page has save, open, undo or help.**

## Inventory: every old control, and where it went

| Page | Old control | Old detail | In Vessel Studio |
| --- | --- | --- | --- |
| Vessel Lab | Count | 50–2,000, default 1,500 | Attractors, 100–20,000 |
| Vessel Lab | Scatter mode | Rect, Circle, Ring, Mask (SVG or a triangle) | Shape: Leaf, Ellipse, Rectangle, Ring, Tree, or an imported SVG |
| Vessel Lab | Shape scale | 10–120 %, 78 | Margin from the sheet edge, in real units |
| Vessel Lab | Width, Height | 100–2,000 px | Sheet size in mm, in, pt or px, with presets |
| Vessel Lab | Poisson radius | 0–100 | Placement: Even (blue noise, exact count) |
| Vessel Lab | Mask SVG | path, polygon, rect, circle, ellipse | Import SVG: closed paths, holes become obstacles, read at Illustrator's 72 pt per inch |
| Vessel Lab | Invert region | grow outside the shape | Grow outside the shape (switch) |
| Vessel Lab | Regenerate | new random attractors | New pattern (dice), from a saved seed |
| Vessel Lab | Lloyd relax | moves points to Voronoi centroids | Dropped: Even placement is already evenly spaced |
| Vessel Lab | Mode | Grow, Voronoi/Delaunay, Seeds only | Dropped: Voronoi and Delaunay are Voronoi Studio's job |
| Vessel Lab | Step length | 1–120, 6 | Segment length |
| Vessel Lab | Attraction radius | 5–400, 100 | Attraction distance, or no limit |
| Vessel Lab | Kill radius | 2–200, 20 | Kill distance |
| Vessel Lab | Max children, Min branch angle, Min leaves to split | 1–4 / 0–120° / 1–12 | Dropped: these existed so that tip-only growth could branch at all. Any vein point can now sprout, as in the papers, and branches form by themselves. |
| Vessel Lab | Twig chance | 0–0.2 | Dropped: random twigs ignored the attractors. Use Wiggle. |
| Vessel Lab | Max thickness | 0.5–6 | Max width |
| Vessel Lab | Flux falloff | 0.2–0.95 | Replaced by the Murray exponent |
| Vessel Lab | Seed preset | Single, Ring, Border, Line | Roots: Base, Centre, Row, Around the edge, and the Roots tool |
| Vessel Lab | Play/Pause, Reset | | Grow/Pause (Space), Step (S), Reset (R) |
| Vessel Lab | Export format | SVG, PNG, JPG | SVG, DXF, PNG. JPG dropped; PNG is lossless. |
| Vessel Lab | Include overlays | | Exports hold what the view shows |
| Vessel Lab | Background colour | | Style: Background |
| Vessel Lab | Sites, Voronoi, Delaunay, Closed edges | | Attractors switch. Voronoi and Delaunay dropped. |
| Vessel Lab | Reset view | | Fit (F) |
| Vessel Lab | Alt-click adds a seed | | Roots tool: click to add, drag to move, Alt-click to remove |
| Vessel Lab | Space+drag, scroll | | Same, plus pinch and a Pan tool |
| Vessel Lab | HUD | attractors, zoom, tips, targets, coverage | Measurements panel and status |
| Basic | Mode | Circle, Rectangle, Ring, Vertical bands, Full canvas | Shapes. Bands and full canvas via Rectangle or an imported SVG. |
| Basic | Root seeds | 1–50, all at the centre | Roots tool and presets, at real positions |
| Basic | Attractors, influence, kill, segment | 100–2,000 / 20–120 / 2–40 / 2–20 | Same four, in real units |
| Basic | Canvas width, height | 200–8,000 px | Sheet size |
| Basic | Export PNG, JPG, SVG; Regenerate | | Export SVG, DXF, PNG; New pattern |
| BioVessel | Mask brush, brush size, Reset mask | paint the region | Later: painting a shape. 1.0 has shapes and SVG import. |
| BioVessel | Seed tool, Clear seeds | | Roots tool, Clear roots |
| BioVessel | Presets Arterial, Neural, Capillary | inertia, wiggle, thickness, density | Presets: the same three, plus Leaf, Leaf with loops and Tree |
| BioVessel | Inertia | 0–0.95, 0.6 | Keep heading |
| BioVessel | Thickness | 1–15 | Max width |
| BioVessel | Randomness | 0–1.5, 0.2 | Wiggle |
| BioVessel | Density | grid 20–250 | Attractors, with a Grid placement for the old look |
| BioVessel | Start growth, Kill sim | | Grow, Reset |
| BioVessel | Save PNG, Save SVG | | Export PNG, SVG, DXF |
| Morphic | Mask, Scatter and Seed tools, Smooth, Jitter, Auto-fill, Voronoi view | Voronoi scaffold | Dropped: Voronoi Studio does scaffolds. Roots tool kept. |
| Morphic | Wiggle | 0–100 | Wiggle |
| Morphic | Tapering | 10–150 | Tip width and Murray exponent |
| Morphic | Branch radius | 10–150 | Attraction distance |
| Morphic | Synthesize, Clear growth, Full reset; Export PNG | | Grow, Reset, New design; Export |
