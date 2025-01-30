import { getName, getParentPath } from '@bigmistqke/repl'
import clsx from 'clsx'
import {
  batch,
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  Index,
  onMount,
  Show,
  type JSX,
} from 'solid-js'
import styles from './App.module.css'
import { Codicon } from './codicon/index.tsx'
import { CodiconButton } from './components.tsx'

export function Explorer(explorerProps: {
  fs: Record<string, string | null>
  isPathSelected: (path: string) => boolean
  onPathSelect: (path: string) => void
  onDirEntCreate: (path: string, type: 'dir' | 'file') => void
  selectedPath: string
  style?: JSX.CSSProperties
  class?: string
}) {
  const [cursor, setCursor] = createSignal<string>('index.html')
  const [temporaryDirEnt, setTemporaryDirEnt] = createSignal<'file' | 'dir'>()

  const hasTemporaryDirEnt = createSelector(cursor, (path, cursor) => {
    if (!temporaryDirEnt()) return false
    if (explorerProps.fs[cursor] === null) {
      return path === cursor
    }
    return path === getParentPath(cursor)
  })

  const isCursor = createSelector(cursor)

  function TemporaryDirEnt(props: { parentPath: string; layer: number; type: 'file' | 'dir' }) {
    function Input() {
      const [name, setName] = createSignal('')
      return (
        <input
          ref={element => onMount(() => element.focus())}
          class={styles.input}
          onBlur={e => {
            if (
              e.relatedTarget instanceof HTMLElement &&
              e.relatedTarget.getAttribute('data-blur-block')
            ) {
              return
            }
            setTemporaryDirEnt()
          }}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              batch(() => {
                const path = props.parentPath ? `${props.parentPath}/${name()}` : name()
                explorerProps.onDirEntCreate(path, props.type)
                setTemporaryDirEnt()
                setCursor(path)
              })
            }
          }}
          onInput={e => setName(e.currentTarget.value)}
          value={name()}
        />
      )
    }

    return (
      <div
        class={clsx(styles.dirEnt, styles.cursor, props.type === 'dir' ? styles.dir : styles.file)}
        style={{
          '--layer': props.layer,
        }}
      >
        <Show when={props.type === 'dir'}>
          <Codicon kind="chevron-right" />
        </Show>
        <Input />
      </div>
    )
  }

  function Dir(props: { layer: number; path: string }) {
    const [collapsed, setCollapsed] = createSignal(false)

    const dirEnts = createMemo(() => {
      const files = new Array<string>()
      const dirs = new Array<string>()

      for (const [path, value] of Object.entries(explorerProps.fs)) {
        if (!path.includes(props.path) || path === props.path) continue

        const parent = getParentPath(path)

        if (parent !== props.path) continue

        if (value === null) dirs.push(path)
        else files.push(path)
      }

      return {
        files,
        dirs,
      }
    })

    createEffect(() => {
      if (hasTemporaryDirEnt(props.path)) {
        setCollapsed(false)
      }
    })

    return (
      <>
        <Show when={props.path}>
          <button
            onClick={() => {
              setCollapsed(collapsed => !collapsed)
              setCursor(props.path)
            }}
            class={clsx(
              styles.dirEnt,
              styles.dir,
              styles.hover,
              !temporaryDirEnt() && isCursor(props.path) && styles.cursor,
            )}
            style={{
              '--layer': props.layer - 1,
            }}
          >
            <Codicon
              style={{ width: `var(--explorer-layer-offset)` }}
              as="span"
              kind={collapsed() ? 'chevron-right' : 'chevron-down'}
            />
            <span>{getName(props.path)}</span>
          </button>
        </Show>

        <Show when={!collapsed()}>
          <Show when={temporaryDirEnt() === 'dir' && hasTemporaryDirEnt(props.path)}>
            <TemporaryDirEnt
              parentPath={props.path}
              layer={props.layer}
              type={temporaryDirEnt()!}
            />
          </Show>
          <Index each={dirEnts().dirs}>{dir => <Dir layer={props.layer + 1} path={dir()} />}</Index>
          <Show when={temporaryDirEnt() === 'file' && hasTemporaryDirEnt(props.path)}>
            <TemporaryDirEnt
              parentPath={props.path}
              layer={props.layer}
              type={temporaryDirEnt()!}
            />
          </Show>
          <Index each={dirEnts().files}>{file => <File layer={props.layer} path={file()} />}</Index>
        </Show>
      </>
    )
  }

  function File(props: { layer: number; path: string }) {
    return (
      <button
        class={clsx(
          styles.dir,
          styles.file,
          styles.hover,
          !temporaryDirEnt() && isCursor(props.path) && styles.cursor,
        )}
        style={{
          'padding-left': `calc(${props.layer} * 10px + var(--margin))`,
          'text-decoration': explorerProps.isPathSelected(props.path) ? 'underline' : 'none',
        }}
        onClick={() => {
          explorerProps.onPathSelect(props.path)
          setCursor(props.path)
        }}
      >
        {getName(props.path)}
      </button>
    )
  }

  return (
    <>
      <div class={clsx(styles.bar, styles.explorerBar)}>
        <CodiconButton kind="new-file" data-blur-block onClick={() => setTemporaryDirEnt('file')} />
        <CodiconButton
          kind="new-folder"
          data-blur-block
          onClick={() => setTemporaryDirEnt('dir')}
        />
      </div>
      <div class={styles.explorer}>
        <Dir path="" layer={0} />
      </div>
    </>
  )
}
