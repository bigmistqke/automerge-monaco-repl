import { DocHandle } from '@automerge/automerge-repo'
import loader from '@monaco-editor/loader'
import type { editor, languages, Selection } from 'monaco-editor'
import { createEffect, createResource, onCleanup } from 'solid-js'
import styles from './App.module.css'
import { Tab } from './App.tsx'
import automonaco from './automonaco.ts'

export function Editor(props: {
  tab: Tab
  handle: DocHandle<Record<string, string | null>>
  onLink(path: string): void
  theme: editor.IStandaloneThemeData
  tsconfig: languages.typescript.CompilerOptions
  onScroll(event: { top: number; left: number }): void
  onSelect(event: { selection: Selection }): void
}) {
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
    const doc = props.handle.doc()

    if (!_monaco || !doc) return

    let editor = _monaco.editor.create(element!, {
      value: doc?.['index.html'] || '',
      language: 'typescript',
      automaticLayout: true,
      fontFamily: 'geist-mono',
    })

    editor.onMouseDown(event => {
      const path =
        event.target.type === 6
          ? event.target.element?.innerText
          : event.target.element?.dataset?.href
      if (path) {
        props.onLink(path)
      }
    })

    createEffect(() =>
      _monaco.languages.typescript.typescriptDefaults.setCompilerOptions(props.tsconfig),
    )

    editor.onDidScrollChange(event =>
      props.onScroll({ top: event.scrollTop, left: event.scrollLeft }),
    )
    editor.onDidChangeCursorSelection(event => props.onSelect({ selection: event.selection }))

    createEffect(() => {
      const cleanup = automonaco(_monaco, editor, props.handle, props.tab.path)
      editor.setScrollTop(props.tab.scroll.top)
      editor.setScrollLeft(props.tab.scroll.left)
      if (props.tab.selection) {
        editor.setSelection(props.tab.selection)
      }
      onCleanup(cleanup)
    })
  })

  return <div ref={element!} class={styles.monaco} />
}
