import { DocHandle } from '@automerge/automerge-repo'
import { resolvePath } from '@bigmistqke/repl'
import loader from '@monaco-editor/loader'
import type { editor, languages } from 'monaco-editor'
import { createEffect, createResource, onCleanup } from 'solid-js'
import styles from './App.module.css'
import automonaco from './automonaco.ts'

export function Editor(props: {
  handle: DocHandle<Record<string, string | null>>
  path: string
  onLink(path: string): void
  theme: editor.IStandaloneThemeData
  tsconfig: languages.typescript.CompilerOptions
}) {
  const [doc] = createResource(async () => await props.handle.doc())

  let element: HTMLDivElement

  const [monaco] = createResource(async () => {
    const monaco = await loader.init()
    props.theme.colors['editor.background'] = '#00000000'
    monaco.editor.defineTheme('theme', props.theme)
    monaco.editor.setTheme('theme')
    return monaco
  })

  createEffect(async () => {
    const _monaco = monaco()
    const _doc = doc()

    if (!_monaco || !_doc) return

    let editor = _monaco.editor.create(element!, {
      value: _doc?.['index.html'] || '',
      language: 'typescript',
      automaticLayout: true,
      fontFamily: 'geist-mono',
    })

    editor.onMouseDown(event => {
      const relativePath =
        event.target.type === 6
          ? event.target.element?.innerText
          : event.target.element?.dataset?.href
      if (relativePath && event.event.metaKey) {
        props.onLink(resolvePath(props.path, relativePath)!)
      }
    })

    createEffect(() =>
      _monaco.languages.typescript.typescriptDefaults.setCompilerOptions(props.tsconfig),
    )

    createEffect(() => {
      const cleanup = automonaco(_monaco, editor, props.handle, props.path)
      onCleanup(cleanup)
    })
  })

  return <div ref={element!} class={styles.monaco} />
}
