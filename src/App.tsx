import { DocHandle, isValidAutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel'
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
import { languages } from 'monaco-editor'
import nightOwl from 'monaco-themes/themes/Night Owl.json'
import {
  createEffect,
  createMemo,
  createResource,
  createSelector,
  createSignal,
  For,
  Show,
} from 'solid-js'
import ts from 'typescript'
import styles from './App.module.css'
import { escape, unescape } from './automonaco.ts'
import { Codicon } from './codicon/index.tsx'
import { Editor } from './editor.tsx'
import { Explorer } from './explorer.tsx'

/**********************************************************************************/
/*                                                                                */
/*                              Initialize Automerge                              */
/*                                                                                */
/**********************************************************************************/

/**********************************************************************************/
/*                                                                                */
/*                                     HEADING                                    */
/*                                                                                */
/**********************************************************************************/

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
  const [tabs, setTabs] = createSignal<Array<string>>(['index.html'])
  const [selectedPath, selectPath] = createSignal('index.html')

  function deleteTab(path: string) {
    setTabs(tabs => tabs.filter(tab => tab !== path))
  }
  function addTab(path: string) {
    if (tabs().includes(path)) return
    setTabs(tabs => [...tabs, path])
  }

  const isPathSelected = createSelector(selectedPath)

  const repo = new Repo({
    network: [
      new BrowserWebSocketClientAdapter('wss://sync.cyberspatialstudies.org'),
      new BroadcastChannelNetworkAdapter(),
    ],
    storage: new IndexedDBStorageAdapter(),
  })
  const rootDocUrl = document.location.hash.substring(1)

  const [handle] = createResource(async () => {
    let handle: DocHandle<Record<string, string | null>>
    if (isValidAutomergeUrl(rootDocUrl)) {
      handle = await repo.find<Record<string, string | null>>(rootDocUrl)
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
              selectPath(path)
              addTab(path)
            }}
            selectedPath={selectedPath()}
            isPathSelected={isPathSelected}
            onDirEntCreate={(path, type) => {
              handle()?.change(doc => (doc[escape(path)] = type === 'dir' ? null : ''))
              addTab(path)
              selectPath(path)
            }}
            onDirEntRename={(currentPath, newPath) => {
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
              setTabs(tabs =>
                tabs.map(tab =>
                  tab === currentPath || tab.startsWith(`${currentPath}/`)
                    ? tab.replace(currentPath, newPath)
                    : tab,
                ),
              )
              if (selectedPath() === currentPath) {
                selectPath(newPath)
              }
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
            <For each={tabs()}>
              {path => (
                <span
                  ref={element => {
                    createEffect(() => isPathSelected(path) && element.scrollIntoView())
                  }}
                  class={clsx(styles.tab, isPathSelected(path) && styles.selected)}
                >
                  <button onClick={() => selectPath(path)}>{getName(path)}</button>
                  <button
                    onClick={() => {
                      if (isPathSelected(path)) {
                        const index = tabs().findIndex(tab => tab === path)
                        selectPath(tabs()[index - 1])
                      }
                      deleteTab(path)
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
            tsconfig={typeDownloader.tsconfig()}
            onLink={path => {
              addTab(path)
              selectPath(path)
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
