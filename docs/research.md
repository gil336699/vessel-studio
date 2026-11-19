# Research summary: space colonization for Vein Studio

Written 2026-11-18 from the research kit in `~/Desktop/Space Colonization Research/` (3 notes and 12 PDFs, all read), Gil's four older SCA pages in `HomeMadeTools`, and Voronoi Studio's Leaf veins. The PDFs stay where they are, outside git; the table at the end says where each one is.

## 1. How the algorithm works

Space colonization grows a branching network toward points that mark free space. Runions et al. described it for leaf veins in 2005 and for trees in 2007.

- **Attractors** (the papers' *auxin sources* or *attraction points*) are scattered inside the shape.
- **Vein points** (*nodes*) start at one or more **roots**.

Each step:

1. **Pair.** Every attractor pulls on its nearest vein point, if that point is closer than the *attraction distance*. Leaves use no limit; trees use one.
2. **Grow.** Every vein point with at least one attractor grows one new point, a *segment length* away. The direction is the sum of unit vectors toward its attractors, normalised. Any point can grow, not only the ends, so side branches start anywhere.
3. **Remove.** An attractor disappears once any vein point is closer than the *kill distance*.

A step's new points are added together, so the order of points never matters. Growth ends when no attractors are left, none is within reach, or a step cap is hit.

Branches appear on their own. Attractors that pulled one point in one step pull two different points later, and the two grow apart.

| Parameter | What it does | Values the papers use |
| --- | --- | --- |
| Segment length D | Step size, the unit of everything else | 1 (leaves), 0.01 of a unit sphere (trees) |
| Kill distance dk | How close a vein must come to use up an attractor | 1–100 D (open leaves), 1 D (all closed leaves), 2–20 D (trees) |
| Attraction distance di | How far a vein point senses attractors | unlimited (leaves), 8–60 D (trees) |
| Attractor count or spacing | How much free space there is | 375–12,000 points (trees), darts per area (leaves) |
| Bias g | A steady pull, such as gravity or light | −0.7 to +0.995 added to the unit direction |
| Murray exponent n | How veins thicken toward the root: parent^n = Σ child^n | 2 (leaves), 1.7–2.5 (trees), 3 (Murray's blood vessels) |

The applied papers keep the same order of sizes, D < dk < di. The liver model (Emerson et al. 2025) used D 5 mm, dk 10 mm and di 15 mm. The mayfly gill model (Ruiz-Sobrino et al. 2020) used step 2 px, kill 11 px and reach 40 px, at 1.69 µm per px. Comino (2013) used reach 16–40 D and kill 2–7 D for trees.

## 2. Variants worth offering

| Variant | What it is | Source | In 1.0? |
| --- | --- | --- | --- |
| Open venation (tree) | The rule above; each attractor has one owner | Runions 2005, 2007 | Yes |
| Closed venation (loops) | An attractor pulls on every vein point in its *relative neighbourhood*: v counts unless some u is nearer both the attractor and v. It stays until every vein heading for it arrives, then they join, closing a loop. | Runions 2005 §4; thesis p. 87–89 | Yes, with an explicit join edge (the thesis's Ch. 5 areole variant), so SVG and DXF loops are really closed |
| Bounds | Attractors only inside the shape, and growth can't leave it | Runions 2007 (envelopes); Webb's "bounds" | Yes, any shape, including imported SVG outlines |
| Obstacles | Holes in the shape. Attractors behind an obstacle can't pull, so veins go round. | Runions 2007 ("eliminate points beyond collision surfaces") | Yes, as holes, with a line-of-sight test |
| Attractors from a shape | Even (blue noise), random, jittered grid, or crowded near the edge | Runions 2007 Fig. 7; thesis p. 42 | Yes |
| Attractors from a picture | More attractors where the picture is darker | (our extension) | Yes, simple version |
| Leaf growth (marginal growth) | The shape grows outward from the root, and attractors switch on as the outline reaches them. Main veins form first, then finer ones. | Runions 2005 §3.3 | Yes |
| Several roots | Separate trees compete for space, as in a hedge, or a row of roots as in grass | Runions 2007 Fig. 10; 2005 grass leaf | Yes |
| Vein thickening | Murray's law from the tips to the roots: each fork's parent width^n = sum of child widths^n | Runions 2005 §3.5; Murray 1926 | Yes, exponent 2–4 |
| Keep heading (inertia), wiggle | Blend each step with the last one's heading, plus seeded noise | Gil's BioVessel Pro; Lieb 2022 (inertia µ) | Yes |
| Pull (tropism) | Add a steady direction, such as up for trees or down for roots | Runions 2007 Eq. 3 | Yes |
| Moving attractors, growing domains with deformation, artery–vein pairs, flow-solved radii | Biological models | Ruiz-Sobrino 2020; Brown 2024; Emerson 2025 | Later |

## 3. What makes results look good

- **Even, random attractors, never a grid.** A grid gives visible regularity, long straight runs and sharp merges (thesis p. 42, 78). Blue noise also steadies branch directions. Too few attractors make branches irregular, because one point added or removed swings the direction (Runions 2007).
- **Kill distance sets the density.** Smaller is denser: higher-order veins appear and then loops (Runions 2005 Fig. 9). In the gill study it was the most sensitive parameter. Keep dk ≥ D; every example does.
- **Attraction distance sets the curvature.** A small di makes tips wander between attractors, which looks "wiggly or gnarly" (Runions 2007). Unlimited gives smooth trees.
- **Leaf growth gives hierarchy.** Marginal growth with many attractors gives smooth main veins and ladder-like fine veins. Uniform growth gives net-like fine veins (Runions 2005 Fig. 9h, 15).
- **Shape matters more than the numbers.** The same settings give a pinnate orchid leaf or a parallel grass leaf (Runions 2005 Fig. 14).
- **Thickness from the tips.** Murray widths make the hierarchy readable. A chain without forks keeps one width, which suits vector output (one path, one stroke width).
- **Smooth the polyline.** Corner-cut or spline the points. Pulling branch points halfway to their parent softens forks that tend toward 90° (Runions 2007; thesis p. 60, 124–126).
- **Avoid pile-ups.** Attractors pulling a point in opposite directions can stack points on one spot. A new point is refused if it lands within about half a segment of another vein point, which Voronoi Studio's Leaf veins also do.
- **Measure, don't only look.** The gill study judged patterns by branch density, tip density and fractal dimension. Vein Studio shows tips, forks, loops and length as numbers.

## 4. What can't be reused, by license

Nothing in the research folder is code, so nothing was copied. The papers and repos are references only.

| Item | License | What it means here |
| --- | --- | --- |
| Jason Webb, 2d-space-colonization-experiments | **CC BY-NC-SA 4.0** (non-commercial, share-alike) | Its code can't go into an MIT repo. Read it for ideas and numbers only. Voronoi Studio's veins re-implement the papers at his proportions, and Vein Studio does the same. |
| Coding Train sketch on editor.p5js.org (ardensch) | No license stated, so all rights reserved | Don't copy. The Coding Train's own site code is MIT. |
| nicknikolov/space-colonization | MIT per README and package.json, though there's no LICENSE file | Usable with credit; not needed |
| edap/ofxSpaceColonization | MIT per README | Usable with credit; not needed |
| ciphrd/unity-growing-tree, bebbo203/procedural_tree_generator | No license | Don't copy |
| Mesmerize, jakobrichert/space-colonization, dsforza96/tree-gen | MIT | Usable with credit; not needed |
| KDBush (used by Webb) | ISC | Not needed: a uniform grid does the same job here |
| Runions 2005 (© ACM), Runions 2007 (© Eurographics), Runions 2008 thesis (© Adam Runions) | All rights reserved | Cite only. Don't copy figures or text. Re-implementing the method is fine. |
| Feriani 2017, Comino 2013, Nuic 2019, Bieksa | No statement, so all rights reserved | Cite only. Comino's orthophoto figures also carry ICC terms. |
| Ruiz-Sobrino 2020 (Elsevier accepted manuscript) | No reuse license | Cite only |
| Lieb, Klee and Lawonn 2022 | CC BY (open access) | Figures could be reused with credit, marked CC BY |
| Brown 2024 (Nat Commun), Emerson 2025 (Sci Rep) | CC BY 4.0 | Figures could be reused with credit and a licence link. The liver paper's Fig. 2a has its own Servier credit. |
| Murray 1926 | US public domain (published 1926) | Equations and figures can be redrawn freely |

## 5. Gil's older SCA pages (this is a rebuild)

Four single-file pages in `HomeMadeTools` are earlier versions of this tool, so Vein Studio follows the rebuild steps. The full inventory and the measured problems are in [rebuild.md](rebuild.md). They were left untouched; reading them only downloaded the cloud copies.

## 6. Voronoi Studio's Leaf veins

`voronoi-studio/src/voronoi/veins.ts` already grows veins by space colonization, in two parts.

- **`growTree`** is open venation: nearest vein point within reach, kill before growth, Webb-style jitter of ±0.1, a crowding check at 0.45 D, and a pipe-model tip count.
- **`loopVeins`** is closed venation: relative neighbourhood capped at 48 candidates, wait until all arrive, join at the source, inertia 0.5, and trimming of loose ends.

Both are one-shot functions with fixed proportions (spacing size/75, D size/140, reach size/23), made to draw a Voronoi pattern's main veins. Vein Studio reuses the ideas: the grid queries, the relative-neighbourhood test, the join-at-source rule, the crowding check, and trimming. Its engine is new, though, because it must step, pause, save, resume bit for bit and take user settings. Both repos are Gil's and MIT, so code can move between them freely.

## Sources

The PDFs sit in `~/Desktop/Space Colonization Research/`, with ten of them in `papers/`.

| Paper | File | Public link |
| --- | --- | --- |
| Runions et al. 2005, Modeling and visualization of leaf venation patterns | papers/Runions-et-al-2005-Leaf-Venation-Patterns.pdf | https://algorithmicbotany.org/papers/venation.sig2005.pdf |
| Runions, Lane and Prusinkiewicz 2007, Modeling trees with a space colonization algorithm | papers/Runions-Lane-Prusinkiewicz-2007-Space-Colonization.pdf | https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf |
| Runions 2008, M.Sc. thesis | papers/Runions-2008-Thesis-Space-Colonization-reduced.pdf | https://algorithmicbotany.org/papers/runionsa.th2008.html |
| Ruiz-Sobrino et al. 2020, mayfly gills | papers/Ruiz-Sobrino-et-al-2020-Space-Colonization-Mayfly-Gills.pdf | https://doi.org/10.1016/j.ydbio.2020.02.005 |
| Murray 1926, minimum work and branching | papers/Murray-1926-Minimum-Work-Arterial-Branching.pdf | https://doi.org/10.1085/jgp.9.6.835 |
| Feriani 2017, art-directing SCA vegetation in Houdini | papers/Feriani-2017-Art-Directing-SCA-Vegetation.pdf | https://nccastaff.bournemouth.ac.uk/jmacey/MastersProject/MSc17/01/report.pdf |
| Comino Trinidad 2013, vegetation from orthophotos (32 MB) | papers/Comino-Trinidad-2013-3D-Vegetation-Reconstruction.pdf | https://upcommons.upc.edu/ |
| Nuic and Mihajlovic 2019, procedural trees | papers/Nuic-Mihajlovic-2019-Procedural-Tree-Algorithms.pdf | https://www.zemris.fer.hr/~zeljkam/radovi/19_Mipro_Nuic.pdf |
| Bieksa, procedural trees with SCA | papers/Bieksa-Procedural-Tree-Generation-SCA.pdf | https://pauliusbieksa.github.io/assets/PDFs/pcg_trees.pdf |
| Lieb, Klee and Lawonn 2022, Clasping Trees | papers/Lieb-Klee-Lawonn-2022-Clasping-Trees.pdf | https://doi.org/10.2312/vmv.20221203 |
| Brown et al. 2024, synthetic retinal vessels | s41467-024-50911-y.pdf | https://doi.org/10.1038/s41467-024-50911-y |
| Emerson, Rabin and Kara 2025, liver perfusion model | s41598-025-85170-4.pdf | https://doi.org/10.1038/s41598-025-85170-4 |
