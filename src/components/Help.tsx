import { touchFirst } from '../lib/touch'
import { Modal } from './Modal'

// The quick start card and the ? dialog with every shortcut.

export function QuickStart({ onClose }: { onClose: () => void }) {
  return <section className="quick-start glass" aria-labelledby="quick-start-title">
    <h2 id="quick-start-title">Quick start</h2>
    <ol>
      {touchFirst()
        ? <li><b>Grow:</b> tap Grow and watch veins grow from the root toward the attractors that fill the leaf. Try a preset on the Grow tab.</li>
        : <li><b>Grow:</b> press <kbd>Space</kbd> and watch veins grow from the root toward the attractors that fill the leaf. Try a preset on the Grow tab.</li>}
      <li><b>Shape:</b> pick a shape or import an SVG outline, and {touchFirst() ? 'tap' : 'click'} with the Roots tool to add more roots.</li>
      <li><b>File:</b> export SVG or DXF at real size for Illustrator, plotters and lasers, or a PNG.</li>
    </ol>
    <p>{touchFirst() ? 'Tap a greyed-out control to see why it can’t be used yet.' : 'Hover over any control to see what it does.'}</p>
    <button type="button" className="primary" data-tip="Hide this guide. Reopen it from the ? button." onClick={onClose}>Got it</button>
  </section>
}

const SHORTCUTS: [string, string][] = [
  ['Space', 'Grow or pause'],
  ['S', 'Grow one step'],
  ['R', 'Reset to the roots'],
  ['O  H', 'Roots and Pan tools'],
  ['Alt + click', 'Remove a root (on touch: press and hold it)'],
  ['Space + drag', 'Pan with any tool'],
  ['Scroll, pinch', 'Zoom'],
  ['+  −  F', 'Zoom in, out, fit'],
  ['1  2  3  4', 'Show veins, attractors, outline, roots'],
  ['⌘Z  ⇧⌘Z', 'Undo, redo'],
  ['⌘S  ⌘O', 'Save, open project'],
  ['Esc', 'Close, or back to Roots'],
  ['?', 'This list'],
]

export function HelpDialog({ onClose, onQuickStart }: { onClose: () => void; onQuickStart: () => void }) {
  return <Modal labelledBy="help-title" onClose={onClose}>
    <h2 id="help-title">Keyboard shortcuts</h2>
    <dl>{SHORTCUTS.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}</dl>
    <p className="hint">On touch screens, one finger adds or moves roots and two fingers pan and zoom. On Windows, use Ctrl for ⌘.</p>
    <p className="hint">Vessel Studio grows veins by space colonization (Runions et al. 2005 and 2007): attractors fill the shape, each pulls on its nearest vein, and veins grow toward them until every one is reached.</p>
    <div className="confirm-actions">
      <button type="button" data-tip="Show the three-step guide again." onClick={onQuickStart}>Show quick start</button>
      <button type="button" className="primary" data-autofocus onClick={onClose}>Close</button>
    </div>
  </Modal>
}

export type Pending = { title: string; body: string; confirm: string; run: () => void }

export function ConfirmDialog({ pending, onCancel }: { pending: Pending; onCancel: () => void }) {
  return <Modal role="alertdialog" labelledBy="confirm-title" describedBy="confirm-body" onClose={onCancel}>
    <h2 id="confirm-title">{pending.title}</h2>
    <p id="confirm-body" className="hint">{pending.body}</p>
    <div className="confirm-actions">
      <button type="button" data-autofocus data-tip="Keep the current design." onClick={onCancel}>Cancel</button>
      <button type="button" className="primary" data-tip="Continue. Undo can bring the current design back during this session." onClick={() => { onCancel(); pending.run() }}>{pending.confirm}</button>
    </div>
  </Modal>
}
