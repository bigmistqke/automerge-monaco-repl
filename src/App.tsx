import { isValidAutomergeUrl, Repo } from '@automerge/automerge-repo'
import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel'
import { BrowserWebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import {
  createExtension,
  createFileSystem,
  createMonacoTypeDownloader,
  isUrl,
  Monaco,
  parseHtml,
  resolvePath,
  transformModulePaths,
  type Transform,
} from '@bigmistqke/repl'
import { default as loader } from '@monaco-editor/loader'
import {
  createEffect,
  createResource,
  createSignal,
  mapArray,
  on,
  onCleanup,
  type Component,
} from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import ts from 'typescript'
import automonaco from './automonaco.ts'

const typeDownloader = createMonacoTypeDownloader({
  target: Monaco.ScriptTarget.ES2015,
  esModuleInterop: true,
})

const transformJs: Transform = ({ path, source, fs }) => {
  return transformModulePaths(source, modulePath => {
    if (modulePath.startsWith('.')) {
      // Swap relative module-path out with their respective module-url
      const url = fs.url(resolvePath(path, modulePath))
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

const repo = new Repo({
  network: [
    new BrowserWebSocketClientAdapter('wss://sync.automerge.org'),
    new BroadcastChannelNetworkAdapter(),
  ],
  storage: new IndexedDBStorageAdapter(),
})
const rootDocUrl = document.location.hash.substring(1)

let handle
if (isValidAutomergeUrl(rootDocUrl)) {
  handle = repo.find<Record<string, string>>(rootDocUrl)
} else {
  handle = repo.create<Record<string, string>>({
    'main.ts': `import { randomColor } from "./math.ts"
    
function randomBodyColor(){
  document.body.style.background = randomColor()
}    

requestAnimationFrame(randomBodyColor)
setInterval(randomBodyColor, 2000)`,
    'math.ts': `export function randomValue(){
  return 200 + Math.random() * 50
}
    
export function randomColor(){
  return \`rgb(\${randomValue()}, \${randomValue()}, \${randomValue()})\`
}`,
    'index.html': '<script src="./main.ts" type="module"></script>',
  })
}

document.location.hash = handle.url

const App: Component = () => {
  let element: HTMLDivElement

  const [currentFile, setCurrentFile] = createSignal('index.html')

  const fs = createFileSystem({
    css: createExtension({ type: 'css' }),
    js: createExtension({
      type: 'javascript',
      transform: transformJs,
    }),
    ts: createExtension({
      type: 'javascript',
      transform({ path, source, fs }) {
        return transformJs({ path, source: ts.transpile(source, typeDownloader.tsconfig()), fs })
      },
    }),
    html: createExtension({
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
    }),
  })

  const [monaco] = createResource(
    async () => await (loader as unknown as (typeof loader)['default']).init(),
  )
  const [doc] = createResource(async () => await handle.doc())

  createEffect(() => {
    const _monaco = monaco()
    const _doc = doc()

    if (!_monaco || !_doc) return

    const [state, setState] = createStore<Record<string, string>>(handle.docSync()!)

    let editor = _monaco.editor.create(element!, {
      value: _doc?.['index.html'],
      language: 'typescript',
      automaticLayout: true,
    })

    handle.on('change', () => setState(reconcile(handle.docSync()!)))

    _monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      allowImportingTsExtensions: true,
    })

    createEffect(
      mapArray(
        () => Object.keys(state),
        key => {
          fs.writeFile(key, state[key])
          createEffect(
            on(
              () => state[key],
              source => requestIdleCallback(() => fs.writeFile(key, source)),
            ),
          )
        },
      ),
    )

    createEffect(() => {
      const cleanup = automonaco(_monaco, editor, handle, currentFile())
      onCleanup(cleanup)
    })
  })
  return (
    <div style={{ display: 'grid', height: '100vh', 'grid-template-columns': 'repeat(2, 1fr)' }}>
      <div style={{ display: 'grid', 'grid-template-rows': 'auto 1fr', overflow: 'hidden' }}>
        <div>
          <button onClick={() => setCurrentFile('index.html')}>index.html</button>
          <button onClick={() => setCurrentFile('main.ts')}>main.ts</button>
          <button onClick={() => setCurrentFile('math.ts')}>math.ts</button>
        </div>
        <div ref={element!} />
      </div>
      <iframe src={fs.url('index.html')} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

export default App
