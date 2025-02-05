import { Accessor, createMemo, createSignal, Signal } from 'solid-js'

export function createWritable<T>(fn: Accessor<T>) {
  const computed = createMemo(() => createSignal(fn()))
  return [() => computed()[0](), (v: T) => computed()[1](v)] as Signal<T>
}
