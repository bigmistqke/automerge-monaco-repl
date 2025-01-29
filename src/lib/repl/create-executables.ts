import {
  createMemo,
  createEffect as createRenderEffect,
  createSignal,
  mapArray,
  onCleanup,
} from 'solid-js'
import { createStore } from 'solid-js/store'
import { getExtension } from './path.ts'
import type { Executable, Extension } from './types.ts'
import { createAsync } from './utils/create-async.ts'

export function createExecutables(
  fs: Record<string, string | null>,
  extensions: Record<string, Extension>,
) {
  const [executables, setExecutables] = createStore<Record<string, Executable>>({})

  createRenderEffect(
    mapArray(
      () => Object.keys(fs).filter(path => fs[path] !== null),
      path => {
        const extension = getExtension(path)

        const [listen, invalidateUrl] = createSignal<void>(null!, { equals: false })

        const transformed = createAsync(
          async () =>
            extensions[extension].transform?.({ path, source: fs[path]!, executables }) ||
            fs[path]!,
        )

        function createExecutable() {
          const _transformed = transformed()
          if (!_transformed) return
          const blob = new Blob([_transformed], {
            type: `text/${extensions[extension].type}`,
          })
          return URL.createObjectURL(blob)
        }

        const executable = createMemo<string | undefined>(previous => {
          if (previous) URL.revokeObjectURL(previous)
          listen()
          return createExecutable()
        }) as Executable
        executable.new = createExecutable
        executable.invalidate = invalidateUrl

        setExecutables({ [path]: executable })
        onCleanup(() => setExecutables({ [path]: undefined }))
      },
    ),
  )

  return executables
}
