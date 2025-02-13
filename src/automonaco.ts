import {
  DocHandleChangePayload,
  Patch,
  splice,
  type Doc,
  type DocHandle,
} from '@automerge/automerge-repo/slim'
import { Monaco } from '@monaco-editor/loader'
import type { editor } from 'monaco-editor/esm/vs/editor/editor.api.d.ts'

export function escape(path: string) {
  return path.replaceAll('/', '--')
}
export function unescape(path: string) {
  return path.replaceAll('--', '/')
}

export default function automonaco(
  monaco: Monaco,
  editor: editor.IStandaloneCodeEditor,
  handle: DocHandle<Record<string, string | null>>,
  path: string,
) {
  function getUri(path: string) {
    return monaco.Uri.parse(`file:///${path}`)
  }
  function createModel(path: string) {
    return monaco.editor.createModel(handle.doc()?.[escape(path)] || '', undefined, getUri(path))
  }
  function getModel(path: string) {
    return monaco.editor.getModel(getUri(path))
  }
  function getOrCreateModel(path: string) {
    const uri = getUri(path)
    return (
      monaco.editor.getModel(uri) ||
      monaco.editor.createModel(handle.doc()?.[escape(path)] || '', undefined, uri)
    )
  }

  const model = getOrCreateModel(path)
  editor.setModel(model)

  let sending = false
  let receiving = false

  function onLocalChange(event: editor.IModelContentChangedEvent) {
    if (!event.changes.length) return
    if (receiving) return
    sending = true
    handle.change(doc => {
      for (let change of event.changes) {
        let { rangeOffset, rangeLength, text } = change
        splice(doc as Doc<unknown>, [escape(path)], rangeOffset, rangeLength, text)
      }
    })
    sending = false
  }

  function onRemoteChange(payload: DocHandleChangePayload<unknown>) {
    if (sending) {
      return
    }
    receiving = true

    const patchesMap: Record<string, Array<Patch>> = {}

    for (const patch of payload.patches) {
      if (!patch.path) {
        console.error('path is undefined', [...patch.path])
        return
      }

      let [path] = patch.path

      if (typeof path !== 'string') {
        console.error('path is not a string', path, [...patch.path])
        return
      }

      path = escape(path)

      if (patchesMap[path] === undefined) {
        patchesMap[path] = []
      }
      patchesMap[path].push(patch)
    }

    for (const [path, patches] of Object.entries(patchesMap)) {
      const model = getModel(unescape(path))

      if (model) {
        // Delete the path from the filesystem
        if (patches.find(patch => patch.action === 'del' && patch.path.length === 1)) {
          model.dispose()
          return
        }

        model.applyEdits(
          patches
            .filter(patch => ['del', 'splice'].includes(patch.action))
            .map(patch => {
              let startOffset = patch.path[patch.path.length - 1] as number
              let endOffset =
                patch.action == 'del' ? startOffset + (patch.length ?? 1) : startOffset

              let startPosition = model.getPositionAt(startOffset)!
              let endPosition = model.getPositionAt(endOffset)!
              return {
                range: {
                  startColumn: startPosition?.column,
                  startLineNumber: startPosition?.lineNumber,
                  endColumn: endPosition?.column,
                  endLineNumber: endPosition?.lineNumber,
                },
                text: patch.action == 'splice' ? patch.value : '',
              }
            }),
        )
      } else {
        createModel(unescape(path))
      }
    }

    receiving = false
  }

  let localChangeHandler = model.onDidChangeContent(onLocalChange)
  handle.on('change', onRemoteChange)

  // Initialize all models
  Object.keys(handle.doc() || {}).forEach(getOrCreateModel)

  return () => {
    localChangeHandler.dispose()
    handle.off('change', onRemoteChange)
  }
}
