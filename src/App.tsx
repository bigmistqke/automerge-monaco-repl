import { DocHandle, isValidAutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import {
  createExecutables,
  createMonacoTypeDownloader,
  getName,
  isUrl,
  normalizePath,
  parseHtml,
  resolvePath,
  transformModulePaths,
  type Transform,
} from '@bigmistqke/repl'
import { Split } from '@bigmistqke/solid-grid-split'
import { createDocumentProjection } from 'automerge-repo-solid-primitives'
import clsx from 'clsx'
import { languages, Selection } from 'monaco-editor'
import nightOwl from 'monaco-themes/themes/Night Owl.json'
import {
  batch,
  createEffect,
  createMemo,
  createResource,
  createSelector,
  createSignal,
  For,
  Show,
} from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import ts from 'typescript'
import styles from './App.module.css'
import { escape, unescape } from './automonaco.ts'
import { Codicon } from './codicon/index.tsx'
import { Editor } from './editor.tsx'
import { Explorer } from './explorer.tsx'

export interface Tab {
  path: string
  scroll: { top: number; left: number }
  selection: Selection | undefined
}

const typeDownloader = createMonacoTypeDownloader({
  target: languages.typescript.ScriptTarget.ES2015,
  esModuleInterop: true,
  allowImportingTsExtensions: true,
})

const transformJs: Transform = ({ path, source, executables }) => {
  return transformModulePaths(source, modulePath => {
    if (modulePath.startsWith('.')) {
      // Swap relative module-path out with their respective module-url
      const url = executables.get(resolvePath(path, modulePath))

      // if (!url) throw 'url is undefined'

      return url || 'yolo'
    } else if (isUrl(modulePath)) {
      // Return url directly
      return modulePath
    } else {
      typeDownloader.downloadModule(modulePath)
      // Wrap external modules with esm.sh
      return `https://esm.sh/${modulePath}`
    }
  })!
}

function Handle() {
  return (
    <Split.Handle size="0px" class={styles.handle}>
      <div />
    </Split.Handle>
  )
}

export default function App() {
  const [tabs, setTabs] = createStore<Array<Tab>>([
    { path: 'index.html', scroll: { top: 0, left: 0 }, selection: undefined },
  ])
  const [selectedPath, selectPath] = createSignal('index.html')
  const selectedTab = () => tabs.find(tab => tab.path === selectedPath())!

  function deleteTab(path: string) {
    setTabs(tabs => tabs.filter(tab => tab.path !== path))
  }
  function addTab(path: string) {
    if (tabs.find(tab => tab.path === path)) return
    setTabs(produce(tabs => tabs.push({ path, scroll: { top: 0, left: 0 }, selection: undefined })))
  }

  const isPathSelected = createSelector(selectedPath)

  const repo = new Repo({
    network: [new BrowserWebSocketClientAdapter('wss://sync.cyberspatialstudies.org')],
    storage: new IndexedDBStorageAdapter(),
  })

  const [url, setUrl] = createSignal<string>(document.location.hash.substring(1))

  const [handle] = createResource(url, async url => {
    let handle: DocHandle<Record<string, string | null>>
    if (isValidAutomergeUrl(url)) {
      handle = await repo.find<Record<string, string | null>>(url)
    } else {
      handle = repo.create<Record<string, string | null>>({
        [escape('src/main.ts')]: `import { randomColor } from "./math.ts"
        
    function randomBodyColor(){
      document.body.style.background = randomColor()
    }    
    
    requestAnimationFrame(randomBodyColor)
    setInterval(randomBodyColor, 2000)`,
        [escape('src/math.ts')]: `export function randomValue(){
      return 200 + Math.random() * 50
    }
        
    export function randomColor(){
      return \`rgb(\${randomValue()}, \${randomValue()}, \${randomValue()})\`
    }`,
        'index.html': '<script src="./src/main.ts" type="module"></script>',
        src: null,
      })
    }

    document.location.hash = handle.url

    return handle
  })

  const unescapedFs = createDocumentProjection<Record<string, string | null>>(handle)
  const fs = createMemo(() =>
    Object.fromEntries(
      Object.entries(unescapedFs() || {}).map(([key, value]) => [unescape(key), value]),
    ),
  )

  createEffect(() => console.log('Object.keys(unescapedFs)', Object.keys(unescapedFs() || {})))

  const executables = createExecutables(fs, {
    css: { type: 'css' },
    js: {
      type: 'javascript',
      transform: transformJs,
    },
    ts: {
      type: 'javascript',
      transform({ source, ...config }) {
        return transformJs({
          ...config,
          source: ts.transpile(source, typeDownloader.tsconfig()),
        })
      },
    },
    html: {
      type: 'html',
      transform(config) {
        const html = parseHtml(config)
          // Transform content of all `<script type="module" />` elements
          .transformModuleScriptContent(transformJs)
          // Bind relative `src`-attribute of all `<script/>` elements to FileSystem
          .bindScriptSrc()
          // Bind relative `href`-attribute of all `<link/>` elements to FileSystem
          .bindLinkHref()
          .toString()
        return html
      },
    },
  })

  return (
    <Show when={handle()}>
      <Split class={styles.app}>
        <Split.Pane size="150px" class={styles.explorerPane}>
          <Explorer
            fs={fs()}
            onPathSelect={path => {
              batch(() => {
                addTab(path)
                selectPath(path)
              })
            }}
            selectedPath={selectedPath()}
            isPathSelected={isPathSelected}
            onClone={() => {
              const _handle = repo.create(handle()!.doc())
              setUrl(_handle.url)
            }}
            onDirEntCreate={(path, type) => {
              batch(() => {
                handle()?.change(doc => (doc[escape(path)] = type === 'dir' ? null : ''))
                addTab(path)
                selectPath(path)
              })
            }}
            onDirEntRename={(currentPath, newPath) => {
              batch(() => {
                const escapedCurrentPath = escape(currentPath)
                newPath = normalizePath(newPath)
                handle()?.change(doc => {
                  Object.keys(doc).forEach(path => {
                    if (path === escapedCurrentPath || path.startsWith(`${escapedCurrentPath}--`)) {
                      const _path = path.replace(escape(currentPath), escape(newPath))
                      doc[_path] = doc[path]
                      delete doc[path]
                    }
                  })
                })
                setTabs(
                  produce(tabs => {
                    tabs.forEach(tab => {
                      if (tab.path === currentPath || tab.path.startsWith(`${currentPath}/`)) {
                        tab.path = tab.path.replace(currentPath, newPath)
                      }
                    })
                  }),
                )
                if (selectedPath() === currentPath) {
                  selectPath(newPath)
                }
              })
            }}
            onDirEntDelete={path => {
              handle()?.change(doc => {
                delete doc[escape(path)]
              })
            }}
          />
        </Split.Pane>
        <Handle />
        <Split.Pane class={styles.editor}>
          <div class={clsx(styles.tabs, styles.bar)}>
            <For each={tabs}>
              {tab => (
                <span
                  ref={element => {
                    createEffect(() => isPathSelected(tab.path) && element.scrollIntoView())
                  }}
                  class={clsx(styles.tab, isPathSelected(tab.path) && styles.selected)}
                >
                  <button onClick={() => selectPath(tab.path)}>{getName(tab.path)}</button>
                  <button
                    onClick={() => {
                      if (isPathSelected(tab.path)) {
                        const index = tabs.findIndex(tab => tab === tab)
                        selectPath(tabs[index - 1].path)
                      }
                      deleteTab(tab.path)
                    }}
                  >
                    <Codicon kind="close" />
                  </button>
                </span>
              )}
            </For>
          </div>
          <Editor
            handle={handle()}
            path={selectedPath()}
            tabs={tabs}
            tab={selectedTab()}
            tsconfig={typeDownloader.tsconfig()}
            onScroll={scroll =>
              setTabs(
                produce(tabs => {
                  const tab = tabs.find(tab => tab.path === selectedPath())!
                  tab.scroll = scroll
                }),
              )
            }
            onSelect={({ selection }) =>
              setTabs(
                produce(tabs => {
                  const tab = tabs.find(tab => tab.path === selectedPath())!
                  tab.selection = selection
                }),
              )
            }
            onLink={path => {
              if (path.startsWith('http:') || path.startsWith('https:')) {
                window.open(path, '_blank')
              } else {
                path = resolvePath(selectedPath(), path)
                addTab(path)
                selectPath(path)
              }
            }}
            theme={nightOwl}
          />
        </Split.Pane>
        <Handle />
        <Split.Pane>
          <iframe src={executables.get('index.html')} class={styles.frame} />
        </Split.Pane>
      </Split>
    </Show>
  )
}
