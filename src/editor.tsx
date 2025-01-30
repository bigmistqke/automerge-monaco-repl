import { DocHandle } from '@automerge/automerge-repo'
import { getName, Monaco, resolvePath } from '@bigmistqke/repl'
import { Split } from '@bigmistqke/solid-grid-split'
import loader from '@monaco-editor/loader'
import clsx from 'clsx'
import nightOwl from 'monaco-themes/themes/Night Owl.json'
import { createEffect, createResource, For, onCleanup } from 'solid-js'
import styles from './App.module.css'
import automonaco from './automonaco.ts'
import { Codicon } from './codicon/index.tsx'

export function Editor(props: {
  isPathSelected(path: string): boolean
  onSelectPath(path: string): void
  tabs: Array<string>
  onDeleteTab(path: string): void
  onAddTab(path: string): void
  handle: DocHandle<Record<string, string | null>>
  selectedPath: string
  tsconfig: Monaco.CompilerOptions
}) {
  const [doc] = createResource(async () => await props.handle.doc())

  let element: HTMLDivElement

  const [monaco] = createResource(async () => {
    const monaco = await (loader as unknown as (typeof loader)['default']).init()
    nightOwl.colors['editor.background'] = '#00000000'
    monaco.editor.defineTheme('nightOwl', nightOwl)
    monaco.editor.setTheme('nightOwl')
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
        const path = resolvePath(props.selectedPath, relativePath)!
        props.onAddTab(path)
        props.onSelectPath(path)
      }
    })

    createEffect(() =>
      _monaco.languages.typescript.typescriptDefaults.setCompilerOptions(props.tsconfig),
    )

    createEffect(() => {
      const cleanup = automonaco(_monaco, editor, props.handle, props.selectedPath)
      onCleanup(cleanup)
    })
  })

  return (
    <Split.Pane class={styles.editor}>
      <div class={clsx(styles.tabs, styles.bar)}>
        <For each={props.tabs}>
          {path => (
            <span
              class={clsx(styles.tab, props.isPathSelected(path) && styles.selected, styles.hover)}
            >
              <button onClick={() => props.onSelectPath(path)}>{getName(path)}</button>
              <button
                class={styles.hover}
                onClick={() => {
                  if (props.isPathSelected(path)) {
                    const index = props.tabs.findIndex(tab => tab === path)
                    props.onSelectPath(props.tabs[index - 1])
                  }
                  props.onDeleteTab(path)
                }}
              >
                <Codicon kind="close" />
              </button>
            </span>
          )}
        </For>
      </div>
      <div ref={element!} class={styles.monaco} />
    </Split.Pane>
  )
}
