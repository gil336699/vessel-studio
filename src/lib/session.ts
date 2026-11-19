// The live design kept in the browser between visits, so a reload or a closed tab never loses work. When it
// can't be kept (too big for local storage, or the browser refuses), the old copy is removed, so a reload never
// brings back an older design as if it were the last one.
export type Store = { set: (key: string, value: string) => boolean; remove: (key: string) => void }
export type Kept = 'kept' | 'too-big' | 'failed'

// text can be given as a function, with an estimate of its length: a copy surely too big then isn't written out at
// all, which for a design of 400,000 vein points saves building 18 MB every few seconds while it grows.
export function keepSession(store: Store, key: string, flagKey: string, text: string | (() => string), unsaved: boolean, limit: number, estimate = 0): Kept {
  const drop = () => { store.remove(key); store.remove(flagKey) }
  if (estimate > limit) { drop(); return 'too-big' }
  const body = typeof text === 'function' ? text() : text
  if (body.length > limit) { drop(); return 'too-big' }
  if (!store.set(key, body) || !store.set(flagKey, unsaved ? '1' : '0')) { drop(); return 'failed' }
  return 'kept'
}
