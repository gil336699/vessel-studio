import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boxOf } from '../veins/geometry'
import { readSvgDrawing } from './svgImport'

const PT = 25.4 / 72, PX = 25.4 / 96
const box = (d: ReturnType<typeof readSvgDrawing>, i: number) => boxOf([d.paths[i].points]).map(v => Math.round(v * 1000) / 1000)

// Illustrator's Save As SVG with "Preserve Illustrator Editing Capabilities" on, cut down: its private data
// in a <foreignObject> and <i:pgf>, the artwork in the <switch> after it.
const PRESERVED = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 28.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [
	<!ENTITY ns_extend "http://ns.adobe.com/Extensibility/1.0/">
	<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">
	<!ENTITY ns_graphs "http://ns.adobe.com/Graphs/1.0/">
]>
<svg version="1.1" id="Layer_1" xmlns:x="&ns_extend;" xmlns:i="&ns_ai;" xmlns:graph="&ns_graphs;"
	 xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 200 200"
	 style="enable-background:new 0 0 200 200;" xml:space="preserve">
<switch>
	<foreignObject requiredExtensions="&ns_ai;" x="0" y="0" width="1" height="1">
		<i:aipgfRef  xlink:href="#adobe_illustrator_pgf">
		</i:aipgfRef>
	</foreignObject>
	<g i:extraneous="self">
		<rect x="60" y="60" width="80" height="80"/>
	</g>
	<g><rect x="0" y="0" width="5" height="5"/></g>
</switch>
<i:pgf  id="adobe_illustrator_pgf">
	<![CDATA[
	eJzdveuuJbmRLvZ/A+cd9h8Dln7uzJ<path d="M0 0L9 9Z"/>
	]]>
</i:pgf>
</svg>`

describe('reading SVG files', () => {
  it('reads Illustrator files saved with Preserve Illustrator Editing Capabilities', () => {
    const d = readSvgDrawing(PRESERVED)
    expect(d.units).toBe('illustrator')
    // The artwork only: not the switch's second choice, and nothing from Illustrator's own data.
    expect(d.paths).toHaveLength(1)
    expect(box(d, 0)).toEqual([60 * PT, 60 * PT, 140 * PT, 140 * PT].map(v => Math.round(v * 1000) / 1000))
  })

  it('reads Illustrator’s Export As files at 72 points per inch, though they carry no marker but their class names', () => {
    // Exported from Illustrator 2027 with Export As › SVG, default options, from a layer named Art (no space, so
    // no data-name): a 60 × 120 mm rectangle on a 250 × 280 mm artboard.
    const d = readSvgDrawing(readFileSync(new URL('../../test-fixtures/illustrator-export-as.svg', import.meta.url), 'utf8'))
    expect(d.units).toBe('illustrator')
    expect(d.width).toBeCloseTo(250, 2)
    expect(d.height).toBeCloseTo(280, 2)
    const [x0, y0, x1, y1] = boxOf([d.paths[0].points])
    expect(x1 - x0).toBeCloseTo(60, 2)
    expect(y1 - y0).toBeCloseTo(120, 2)
    // A file from elsewhere with no size is still read at 96 per inch.
    expect(readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect class="a" width="96" height="96"/></svg>').units).toBe('css')
  })

  it('draws copies made with <use>, moved by x, y and transform, and symbols fitted to the use', () => {
    const d = readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="100mm" viewBox="0 0 100 100">
      <defs><circle id="hole" cx="0" cy="0" r="5"/><symbol id="tile" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></defs>
      <rect x="10" y="10" width="80" height="80"/>
      <use xlink:href="#hole" x="30" y="40"/>
      <use href="#hole" transform="translate(60 40)"></use>
      <use href="#tile" x="5" y="5" width="20" height="40"/>
      <use href="#missing" x="1" y="1"/>
    </svg>`)
    expect(d.paths).toHaveLength(4)
    expect(box(d, 1)).toEqual([25, 35, 35, 45])
    expect(box(d, 2)).toEqual([55, 35, 65, 45])
    // A 10 by 10 symbol in a 20 by 40 use: twice the size, centred top to bottom.
    expect(box(d, 3)).toEqual([5, 15, 25, 35])
  })

  it('draws symbols, nested pages and switches as a browser does', () => {
    const at = (body: string) => readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">${body}</svg>`)
    // A use with no width or height fills the viewport.
    expect(box(at('<symbol id="s" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol><use href="#s"/>'), 0)).toEqual([0, 0, 100, 100])
    // preserveAspectRatio="none" stretches the symbol to the use.
    expect(box(at('<symbol id="s" viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10"/></symbol><use href="#s" width="20" height="40"/>'), 0)).toEqual([0, 0, 20, 40])
    // A nested page's viewBox maps onto its width and height.
    expect(box(at('<svg x="10" y="10" width="50" height="50" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), 0)).toEqual([10, 10, 60, 60])
    // A switch draws its first child even when that child is hidden, which then draws nothing.
    expect(() => at('<switch><g style="display:none"><rect width="10" height="10"/></g><rect x="50" width="10" height="10"/></switch>')).toThrow(/no paths/)
  })

  it('refuses a file of copies of copies before it fills memory', () => {
    // 50 × 50 × 50 copies of a 5 KB path would be 600 MB, more than a browser can hold as text.
    const path = `<path d="M0 0${' L1 1'.repeat(1000)}Z"/>`
    const uses = (id: string) => Array.from({ length: 50 }, () => `<use href="#${id}"/>`).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><defs><g id="a">${path}</g><g id="b">${uses('a')}</g><g id="c">${uses('b')}</g></defs>${uses('c')}</svg>`
    const t = performance.now()
    expect(() => readSvgDrawing(svg)).toThrow(/too much detail/)
    expect(performance.now() - t).toBeLessThan(5000)
  })

  it('places symbols, nested pages, switches and percentages where Chrome draws them', () => {
    // Each case's box, as Chrome's getBBox gives it on a 100 mm page of 100 user units (Chrome 2026, 15 cases).
    const page = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100mm" height="100mm" viewBox="0 0 100 100">${body}</svg>`
    const symbol = (vb: string, aspect: string, use: string) => page(`<defs><symbol id="s" viewBox="${vb}"${aspect ? ` preserveAspectRatio="${aspect}"` : ''}><rect width="${vb.split(' ')[2]}" height="${vb.split(' ')[3]}"/></symbol></defs><use href="#s" ${use}/>`)
    const cases: [string, string, number[]][] = [
      ['symbol, use without width and height', symbol('0 0 10 10', '', 'x="10" y="10"'), [10, 10, 110, 110]],
      ['symbol, use with width only', symbol('0 0 10 10', '', 'x="10" y="10" width="30"'), [10, 45, 40, 75]],
      ['symbol, none', symbol('0 0 10 10', 'none', 'x="10" y="10" width="20" height="60"'), [10, 10, 30, 70]],
      ['symbol, xMinYMin meet', symbol('0 0 10 20', 'xMinYMin meet', 'width="60" height="60"'), [0, 0, 30, 60]],
      ['symbol, xMaxYMax meet', symbol('0 0 10 20', 'xMaxYMax meet', 'width="60" height="60"'), [30, 0, 60, 60]],
      ['symbol, xMidYMid slice', symbol('0 0 10 20', 'xMidYMid slice', 'width="60" height="60"'), [0, -30, 60, 90]],
      ['symbol, use width 50%', symbol('0 0 10 20', '', 'width="50%" height="50%"'), [12.5, 0, 37.5, 50]],
      ['symbol with x and y (SVG 2)', page('<defs><symbol id="s" x="20" y="20" width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></defs><use href="#s"/>'), [20, 20, 30, 30]],
      ['switch, systemLanguage', page('<switch><rect systemLanguage="xx" x="0" y="0" width="10" height="10"/><rect x="60" y="60" width="10" height="10"/></switch>'), [60, 60, 70, 70]],
      ['nested svg with a viewBox', page('<svg x="10" y="10" width="40" height="40" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), [10, 10, 50, 50]],
      ['nested svg, no width or height', page('<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>'), [0, 0, 50, 50]],
      ['nested svg, width 50%', page('<svg width="50%" height="50%" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'), [0, 0, 50, 50]],
      ['nested svg, xMaxYMid meet', page('<svg width="80" height="40" viewBox="0 0 10 10" preserveAspectRatio="xMaxYMid meet"><rect width="10" height="10"/></svg>'), [40, 0, 80, 40]],
      ['rect in percent', page('<rect x="10%" y="10%" width="50%" height="20%"/>'), [10, 10, 60, 30]],
    ]
    for (const [name, svg, want] of cases) {
      const d = readSvgDrawing(svg)
      const got = boxOf(d.paths.map(p => p.points)).map(v => Math.round(v * 100) / 100)
      expect([name, got]).toEqual([name, want])
    }
    // A hidden first child of a switch is still the one it draws, so nothing is drawn, as in Chrome.
    expect(() => readSvgDrawing(page('<switch><g display="none"><rect width="10" height="10"/></g><rect x="50" y="50" width="20" height="20"/></switch>'))).toThrow(/no paths/)
  })

  it('reads shape sizes given with units', () => {
    const d = readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="200mm" viewBox="0 0 755.906 755.906">
      <rect x="1in" y="0" width="50px" height="20mm"/><circle cx="100" cy="100" r="1cm"/></svg>`)
    expect(d.paths).toHaveLength(2)
    const [x0, y0, x1, y1] = boxOf([d.paths[0].points])
    expect(x0).toBeCloseTo(25.4, 3); expect(y0).toBeCloseTo(0, 6)
    expect(x1 - x0).toBeCloseTo(50 * PX, 3); expect(y1 - y0).toBeCloseTo(20, 3)
    const [cx0, , cx1] = boxOf([d.paths[1].points])
    expect(cx1 - cx0).toBeCloseTo(20, 1)
  })

  it('moves a drawing with no stated size onto its page when it reaches above or left of the origin', () => {
    const d = readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="0" cy="0" r="10"/><rect x="-30" y="5" width="10" height="10"/></svg>')
    // A circle is read as a fine polygon, so its edges sit a hair inside the true circle.
    expect(Math.abs(d.width - 40 * PX)).toBeLessThan(0.05)
    expect(Math.abs(d.height - 25 * PX)).toBeLessThan(0.05)
    for (const p of d.paths) for (const [x, y] of p.points) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(y).toBeGreaterThanOrEqual(-1e-9) }
    // Drawn entirely above and left of the origin, it still gets a page and isn't lost.
    const far = readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg"><rect x="-50" y="-50" width="20" height="10"/></svg>')
    expect(far.width).toBeGreaterThan(0)
    expect(Number.isFinite(far.width) && Number.isFinite(far.height)).toBe(true)
    // With nothing of any area, it says so.
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0 0 10 0 20 0"/></svg>')).toThrow(/no area/)
  })

  it('says to outline live type, which has no shapes to grow in', () => {
    expect(() => readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><text x="10" y="30">Arbore</text></svg>')).toThrow(/Create Outlines/)
    const both = readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><rect width="40" height="40"/><text x="50" y="30">Arbore</text></svg>')
    expect(both.paths).toHaveLength(1)
    expect(both.texts).toBe(1)
  })

  it('counts shapes trimmed by clipping masks, which it reads whole', () => {
    const d = readSvgDrawing(`<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">
      <clipPath id="c"><rect x="0" y="0" width="50" height="100"/></clipPath>
      <circle cx="50" cy="50" r="40" clip-path="url(#c)"/></svg>`)
    expect(d.paths).toHaveLength(1)
    expect(d.clipped).toBe(1)
    expect(readSvgDrawing('<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>').clipped).toBe(0)
  })
})
