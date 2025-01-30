import { DocHandle, isValidAutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import {
  createExecutables,
  createMonacoTypeDownloader,
  isUrl,
  Monaco,
  parseHtml,
  resolvePath,
  transformModulePaths,
  type Transform,
} from '@bigmistqke/repl'
import { Split } from '@bigmistqke/solid-grid-split'
import { createDocumentProjection } from 'automerge-repo-solid-primitives'
import { createSelector, createSignal } from 'solid-js'
import ts from 'typescript'
import styles from './App.module.css'
import { Editor } from './editor.tsx'
import { Explorer } from './explorer.tsx'

/**********************************************************************************/
/*                                                                                */
/*                              Initialize Automerge                              */
/*                                                                                */
/**********************************************************************************/

const repo = new Repo({
  network: [
    new BrowserWebSocketClientAdapter('wss://sync.automerge.org'),
    new BroadcastChannelNetworkAdapter(),
  ],
  storage: new IndexedDBStorageAdapter(),
})
const rootDocUrl = document.location.hash.substring(1)

let handle: DocHandle<Record<string, string | null>>
if (isValidAutomergeUrl(rootDocUrl)) {
  handle = repo.find<Record<string, string | null>>(rootDocUrl)
} else {
  handle = repo.create<Record<string, string | null>>({
    'src/main.ts': `import { randomColor } from "./math.ts"
    
function randomBodyColor(){
  document.body.style.background = randomColor()
}    

requestAnimationFrame(randomBodyColor)
setInterval(randomBodyColor, 2000)`,
    'src/math.ts': `export function randomValue(){
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

/**********************************************************************************/
/*                                                                                */
/*                                     HEADING                                    */
/*                                                                                */
/**********************************************************************************/

const typeDownloader = createMonacoTypeDownloader({
  target: Monaco.ScriptTarget.ES2015,
  esModuleInterop: true,
  allowImportingTsExtensions: true,
})

const transformJs: Transform = ({ path, source, executables }) => {
  return transformModulePaths(source, modulePath => {
    if (modulePath.startsWith('.')) {
      // Swap relative module-path out with their respective module-url
      const url = executables.get(resolvePath(path, modulePath))

      if (!url) throw 'url is undefined'

      return url
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

  const fs = createDocumentProjection<Record<string, string | null>>(handle)

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
    <Split class={styles.app}>
      <Split.Pane size="150px" class={styles.explorerPane}>
        <Explorer
          fs={fs}
          onPathSelect={path => {
            selectPath(path)
            addTab(path)
          }}
          selectedPath={selectedPath()}
          isPathSelected={isPathSelected}
          onDirEntCreate={(path, type) => {
            handle.change(doc => (doc[path] = type === 'dir' ? null : ''))
            addTab(path)
            selectPath(path)
          }}
        />
      </Split.Pane>
      <Handle />
      <Editor
        handle={handle}
        isPathSelected={isPathSelected}
        onAddTab={addTab}
        onDeleteTab={deleteTab}
        onSelectPath={selectPath}
        selectedPath={selectedPath()}
        tabs={tabs()}
        tsconfig={typeDownloader.tsconfig()}
      />
      <Handle />
      <Split.Pane>
        <iframe src={executables.get('index.html')} class={styles.frame} />
      </Split.Pane>
    </Split>
  )
}
