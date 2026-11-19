# Plan for Vein Studio 1.0

Written 2026-11-18 with the "Starting a new app" checklist in the App Development Standard, §10.

## Who it's for

- **Makers.** Pen plotters, laser cutters, CNC, 3D printing, and Fusion and Illustrator users. They need clean vector lines at real size and veins that never leave the shape. Line widths must mean something in millimetres.
- **Medical and scientific illustrators.** They need believable branching vessels, leaf veins and trees inside an organ or leaf outline. The widths should follow Murray's law, the result should be editable in Illustrator, and the same pattern must come back from a saved file.

## Name

Gil chose **Vein Studio** on 2026-11-18: public repo `gil336699/vein-studio`, MIT, published once this round passes. The other candidates were Branch Studio (easy to confuse with git branches), Space Colonization Studio (long, reads like a space game) and Venation Studio (a botanical word few makers know). "Growth Studio" style names were taken by Gil's own apps.

## First version (1.0.0)

**Engine** (`src/veins/`, plain TypeScript, in a Web Worker). It is deterministic, with a seed in the file.
- Open venation, which makes trees, and closed venation, which makes loops with real join edges.
- Attraction distance (or no limit), kill distance and segment length, all in real units.
- Bounds and holes as obstacles. Veins never cross the shape's edge, and attractors behind an edge can't pull.
- Attractors placed Even (blue noise), Random, on a Grid, or crowded Near the edge, or from a picture's darkness.
- Leaf growth: the outline grows from the first root and switches attractors on as it reaches them.
- Keep heading (inertia), Wiggle, and Pull (tropism, a steady direction).
- Murray widths, from the tips, with an exponent.
- A crowding guard against pile-ups.

**Interface**
- Liquid Glass in light and dark, with tabs Shape, Grow, Style and File.
- A dock with Grow, Step, Reset, Undo and Redo, and a measurements panel.
- Roots tool, Pan tool, view toggles and zoom.
- Custom tooltips, in-app confirm dialogs, a three-step quick start and a ? dialog.
- Presets: Leaf, Tree, Arterial, Neural, Capillary.

**Files**
- Project files (`.vein.json`) with a schema name and version, holding the full state, so growth continues bit for bit.
- Autosave, and undo for each change and each growth run.
- Import an SVG outline at Illustrator's 72 pt per inch; other SVGs are read at 96 px per inch, with a note.
- A picture for attractor density.
- Exports at real size (mm, in, pt or px) that hold what the view shows:
  - **SVG:** groups `veins`, `boundary`, `attractors`, `roots`; one path per vein between forks; stroke widths in mm.
  - **DXF R12:** layers `VEINS`, `BOUNDARY`, `ATTRACTORS`, `ROOTS`.
  - **PNG:** at the sheet's pixels per inch.

**Checks**
- Lint, tests and build.
- Parity tests against Basic's `step()` and BioVessel's `grow()`.
- A save, reopen and continue test that matches an unbroken run bit for bit.
- A worker test that sends one frame at a time.
- Long headless runs of the production build from its `/vein-studio/` subfolder.

## Later (not in 1.0)

- Painting a shape with a brush (BioVessel's mask).
- Vein outlines as cut shapes for lasers (union of the stroked veins).
- Taper along a vein, and artery and vein pairs.
- Moving attractors and a growing domain with deformation.
- A demo video, using the app-demo-videos skill.

## Checklist (§10)

- [x] Vite, React, TypeScript (strict), Vitest and ESLint, with the standard scripts
- [x] Folder layout, `.gitignore` and `local/`
- [x] `base: './'` in `vite.config.ts`
- [ ] Public GitHub repo with MIT license, README and CHANGELOG (Gil: publish after this round passes)
- [ ] `ci.yml` and `pages.yml`, Pages turned on, homepage link set
- [ ] CSS variables for colours, radii and sizes, light and dark, and the accessibility media queries
- [ ] Tooltip layer, modal, tabs, quick start and ? dialog from the start
