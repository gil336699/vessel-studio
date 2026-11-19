// The live design kept in the browser between visits, so a reload or a closed tab never loses work. When it
// can't be kept (too big for local storage, or the browser refuses), the old copy is removed, so a reload never
// brings back an older design as if it were the last one.
export type Store = { set: (key: string, value: string) => boolean; remove: (key: string) => void }
export type Kept = 'kept' | 'too-big' | 'failed'

export function keepSession(store: Store, key: string, flagKey: string, text: string, unsaved: boolean, limit: number): Kept {
  const drop = () => { store.remove(key); store.remove(flagKey) }
  if (text.length > limit) { drop(); return 'too-big' }
  if (!store.set(key, text) || !store.set(flagKey, unsaved ? '1' : '0')) { drop(); return 'failed' }
  return 'kept'
}
