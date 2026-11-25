// The page's side of the growth worker. Every message is fire-and-forget; frames and stops come back through
// the callback.
import type { GrowthParams } from '../veins/engine'
import type { FromRunner, Load, ToRunner } from './runner'

export class GrowthClient {
  private worker: Worker
  private runs = 0

  constructor(onMessage: (message: FromRunner) => void) {
    this.worker = new Worker(new URL('./veins.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (event: MessageEvent<FromRunner>) => onMessage(event.data)
    this.worker.onerror = event => onMessage({ kind: 'error', message: event.message || 'The growth worker stopped.' })
  }

  private send(message: ToRunner, transfer: Transferable[] = []) { this.worker.postMessage(message, transfer) }

  load(load: Load) { this.send({ kind: 'load', load: { ...load, attractors: load.attractors.slice() } }) }
  params(params: GrowthParams) { this.send({ kind: 'params', params }) }
  root(x: number, y: number, system = 0) { this.send({ kind: 'root', x, y, system }) }
  play(steps: number | null, perBatch: number): number { this.send({ kind: 'play', run: ++this.runs, steps, perBatch }); return this.runs }
  speed(perBatch: number) { this.send({ kind: 'speed', perBatch }) }
  stop() { this.send({ kind: 'stop' }) }
  ack() { this.send({ kind: 'ack' }) }
  dispose() { this.worker.terminate() }
}
