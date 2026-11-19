// Parity with Gil's older pages. Each reference below is the old page's growth step, copied as it was. Only its
// inputs changed: the page's sliders and variables are passed in, and Math.random is the engine's seeded
// generator. The engine must grow the same vein points, to within 1e-6 mm, for 120 steps.
import { describe, expect, it } from 'vitest'
import { Engine, type GrowthParams } from './engine'
import { Rng } from './random'

type OldNode = { x: number; y: number; parent: OldNode | null }

// ---- Space Colonization – Basic (HomeMadeTools/SCA_2/SCA.html), step(), lines 394–480 ----
function basicPage(attractorList: { x: number; y: number }[], roots: { x: number; y: number }[], sliders: { influence: number; kill: number; segment: number }) {
  const ui = { influenceRadius: { value: String(sliders.influence) }, killRadius: { value: String(sliders.kill) }, segmentLength: { value: String(sliders.segment) } }
  let attractors: { x: number; y: number }[] = attractorList.map(a => ({ ...a }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nodes: any[] = roots.map(r => ({ x: r.x, y: r.y, parent: null, children: [], thickness: 1 }))
  let iteration = 0
  function step() {
    const influenceRadius = parseFloat(ui.influenceRadius.value);
    const killRadius = parseFloat(ui.killRadius.value);
    const segmentLength = parseFloat(ui.segmentLength.value);

    if (attractors.length === 0) return false;

    // Reset growth direction for each node
    for (const node of nodes) {
      node.growDirX = 0;
      node.growDirY = 0;
      node.growCount = 0;
    }

    // 1) Associate attractors to closest nodes within influenceRadius
    const remainingAttractors = [];

    for (const a of attractors) {
      let closestNode = null;
      let closestDistSq = Infinity;

      for (const n of nodes) {
        const dx = a.x - n.x;
        const dy = a.y - n.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < closestDistSq) {
          closestDistSq = distSq;
          closestNode = n;
        }
      }

      const dist = Math.sqrt(closestDistSq);

      if (dist < killRadius) {
        // attractor is "consumed" – do not keep it
        continue;
      }

      if (dist < influenceRadius) {
        // Influence this node
        const dirX = (a.x - closestNode.x) / dist;
        const dirY = (a.y - closestNode.y) / dist;
        closestNode.growDirX += dirX;
        closestNode.growDirY += dirY;
        closestNode.growCount++;
      }

      // Keep attractor if not killed
      remainingAttractors.push(a);
    }

    attractors = remainingAttractors;

    // 2) Create new nodes
    const newNodes = [];

    for (const n of nodes) {
      if (n.growCount > 0) {
        const dirX = n.growDirX / n.growCount;
        const dirY = n.growDirY / n.growCount;
        const len = Math.hypot(dirX, dirY) || 1;
        const nx = n.x + (dirX / len) * segmentLength;
        const ny = n.y + (dirY / len) * segmentLength;

        const newNode = {
          x: nx,
          y: ny,
          parent: n,
          children: [],
          thickness: 1,
        };

        n.children.push(newNode);
        newNodes.push(newNode);
      }
    }

    if (newNodes.length === 0) {
      // no more growth
      return false;
    }

    nodes = nodes.concat(newNodes);
    iteration++;
    return true;
  }
  return { step, nodes: (): OldNode[] => nodes, iteration: () => iteration }
}

// ---- BioVessel Pro (HomeMadeTools/BackUp/SCA/sca.html), class Node (lines 267–312, drawing left out) and
// grow() (lines 392–443, the status and counter display lines left out) ----
function bioVesselPage(leafList: { x: number; y: number }[], seeds: { x: number; y: number }[], config: { attractionDistance: number; killDistance: number; segmentLength: number; inertia: number; wiggle: number; murrayFactor: number }, random: () => number) {
  // The page's Math, with the seeded random in place of Math.random (its other methods are inherited).
  const Math: typeof globalThis.Math = Object.create(globalThis.Math, { random: { value: random } })
  class Node {
    x: number; y: number; parent: Node | null; children: Node[]; dir: { x: number; y: number }; velocity: { x: number; y: number }; count: number; thickness: number
    constructor(x: number, y: number, parent: Node | null = null) {
      this.x = x; this.y = y; this.parent = parent;
      this.children = [];
      this.dir = { x: 0, y: 0 };
      this.velocity = { x: 0, y: 0 };
      if (parent) {
        const dx = x - parent.x;
        const dy = y - parent.y;
        const mag = Math.hypot(dx, dy);
        this.velocity = { x: dx / (mag||1), y: dy / (mag||1) };
      }
      this.count = 0;
      this.thickness = 1.0;
      if (parent) parent.children.push(this);
    }

    reset() { this.dir = { x: 0, y: 0 }; this.count = 0; }

    updateThickness() {
      if (this.children.length === 0) {
        this.thickness = 1.0;
      } else {
        let sum = 0;
        for (const child of this.children) {
          child.updateThickness();
          sum += Math.pow(child.thickness, config.murrayFactor);
        }
        this.thickness = Math.pow(sum, 1 / config.murrayFactor);
      }
    }
  }
  const leaves = leafList.map(l => ({ ...l }))
  let nodes: Node[] = seeds.map(s => new Node(s.x, s.y))
  const isGrowing = true
  let stopped = false
  function grow() {
    if (!isGrowing || leaves.length === 0 || nodes.length === 0) return;

    for (const node of nodes) node.reset();

    // Find closest nodes to leaves
    for (let i = leaves.length - 1; i >= 0; i--) {
      const leaf = leaves[i];
      let closest = null, minDist = config.attractionDistance;
      for (const node of nodes) {
        const d = Math.hypot(leaf.x - node.x, leaf.y - node.y);
        if (d < config.killDistance) { leaves.splice(i, 1); closest = null; break; }
        if (d < minDist) { minDist = d; closest = node; }
      }
      if (closest) {
        const d = Math.hypot(leaf.x - closest.x, leaf.y - closest.y);
        closest.dir.x += (leaf.x - closest.x) / d;
        closest.dir.y += (leaf.y - closest.y) / d;
        closest.count++;
      }
    }

    const newNodes = [];
    for (const node of nodes) {
      if (node.count > 0) {
        const targetX = node.dir.x / node.count;
        const targetY = node.dir.y / node.count;

        let vx = (targetX * (1 - config.inertia)) + (node.velocity.x * config.inertia);
        let vy = (targetY * (1 - config.inertia)) + (node.velocity.y * config.inertia);

        vx += (Math.random() - 0.5) * config.wiggle;
        vy += (Math.random() - 0.5) * config.wiggle;

        const mag = Math.hypot(vx, vy);
        const nx = node.x + (vx / (mag||1)) * config.segmentLength;
        const ny = node.y + (vy / (mag||1)) * config.segmentLength;

        newNodes.push(new Node(nx, ny, node));
      }
    }

    if (newNodes.length > 0) {
      nodes = nodes.concat(newNodes);
      nodes.filter(n => !n.parent).forEach(root => root.updateThickness());
    } else {
      stopped = true
    }
  }
  return { grow, nodes: (): OldNode[] => nodes, stopped: () => stopped }
}

// ---- helpers ----
const base: GrowthParams = { segment: 6, kill: 10, attraction: 60, topology: 'open', inertia: 0, wiggle: 0, pull: 0, pullMode: 'up', crowd: 0, leafSteps: 0, minLoop: 8, maxPoints: 1e9, seed: 1 }

function discPoints(count: number, cx: number, cy: number, r: number, seed: number) {
  const rng = new Rng(seed)
  const out: { x: number; y: number }[] = []
  while (out.length < count) {
    const x = cx + (rng.next() * 2 - 1) * r, y = cy + (rng.next() * 2 - 1) * r
    if (Math.hypot(x - cx, y - cy) <= r) out.push({ x, y })
  }
  return out
}
const flat = (pts: { x: number; y: number }[]) => Float64Array.from(pts.flatMap(p => [p.x, p.y]))

function compare(old: OldNode[], engine: Engine) {
  expect(engine.points).toBe(old.length)
  const index = new Map(old.map((n, i) => [n, i]))
  let worst = 0
  old.forEach((n, i) => {
    worst = Math.max(worst, Math.abs(n.x - engine.x[i]), Math.abs(n.y - engine.y[i]))
    expect(engine.parent[i]).toBe(n.parent ? index.get(n.parent) : -1)
  })
  expect(worst).toBeLessThan(1e-6)
  return worst
}

describe('parity with the older pages', () => {
  it('grows exactly what Space Colonization – Basic grew, for 120 steps', () => {
    const attractors = discPoints(700, 600, 400, 330, 11)
    const roots = [{ x: 600, y: 400 }]
    const page = basicPage(attractors, roots, { influence: 60, kill: 10, segment: 6 })
    const engine = new Engine(null, flat(attractors), { ...base }, { roots: roots.map(r => [r.x, r.y]) })
    for (let i = 0; i < 120; i++) {
      const more = page.step()
      const change = engine.stepOnce()
      expect(more).toBe(true)
      expect(change).not.toBeNull()
    }
    expect(page.iteration()).toBe(120)
    compare(page.nodes(), engine)
    // Growth really branched, so the test covers forks and not just one line.
    const kids = new Int32Array(engine.points)
    for (const p of engine.parent) if (p >= 0) kids[p]++
    expect(kids.filter(k => k >= 2).length).toBeGreaterThan(20)
  })

  it('grows exactly what BioVessel Pro grew, with its inertia and wiggle, for 120 steps', () => {
    const leaves = discPoints(900, 500, 500, 420, 23)
    const seeds = [{ x: 500, y: 920 }, { x: 140, y: 500 }]
    const config = { attractionDistance: 60, killDistance: 12, segmentLength: 6, inertia: 0.6, wiggle: 0.2, murrayFactor: 2.8 }
    const rng = new Rng(77)
    const page = bioVesselPage(leaves, seeds, config, () => rng.next())
    const engine = new Engine(null, flat(leaves), { ...base, kill: 12, inertia: 0.6, wiggle: 0.2, seed: 77, headingEndsOnly: false }, { roots: seeds.map(s => [s.x, s.y]) })
    for (let i = 0; i < 120; i++) {
      page.grow()
      expect(engine.stepOnce()).not.toBeNull()
    }
    expect(page.stopped()).toBe(false)
    compare(page.nodes(), engine)
    expect(engine.rngState).toBe(rng.state)
  })
})
