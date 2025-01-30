import { getName, getParentPath } from '@bigmistqke/repl'
import clsx from 'clsx'
import {
  batch,
  createEffect,
  createMemo,
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
  const [temporaryDirEnt, setTemporaryDirEnt] = createSignal<'file' | 'dir'>()

  function TemporaryDirEnt(props: { parentPath: string; layer: number; type: 'file' | 'dir' }) {
    function Input() {
      const [name, setName] = createSignal('')
      return (
        <input
          ref={element => onMount(() => element.focus())}
          class={styles.input}
          onBlur={() => setTemporaryDirEnt()}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              batch(() => {
                explorerProps.onDirEntCreate(
                  props.parentPath ? `${props.parentPath}/${name()}` : name(),
                  props.type,
                )
                setTemporaryDirEnt()
              })
            }
          }}
          onInput={e => setName(e.currentTarget.value)}
          value={name()}
        />
      )
    }
    return (
      <Show
        when={props.type === 'dir'}
        fallback={
          <div
            class={clsx(styles.dirEnt, styles.file)}
            style={{
              '--layer': props.layer,
            }}
          >
            <Input />
          </div>
        }
      >
        <div
          class={clsx(styles.dirEnt, styles.dir)}
          style={{
            '--layer': props.layer,
          }}
        >
          <Codicon kind="chevron-right" />
          <Input />
        </div>
      </Show>
    )
  }

  function Dir(props: { layer: number; path: string }) {
    const [collapsed, setCollapsed] = createSignal(false)

    const dirEnts = createMemo(() => {
      const files = new Array<string>()
      const dirs = new Array<string>()

      for (const [path, value] of Object.entries(explorerProps.fs)) {
        if (!path.includes(props.path) || path === props.path) continue

        const relativePath = props.path ? path.slice(props.path.length + 1) : path

        if (relativePath.split('/').length > 1) continue

        if (value === null) dirs.push(path)
        else files.push(path)
      }

      return {
        files,
        dirs,
      }
    })

    const hasTemporaryDirEnt = () =>
      temporaryDirEnt() && getParentPath(explorerProps.selectedPath) === props.path

    createEffect(() => {
      if (hasTemporaryDirEnt()) {
        setCollapsed(false)
      }
    })

    return (
      <>
        <Show when={props.path}>
          <button
            onClick={() => setCollapsed(collapsed => !collapsed)}
            class={clsx(styles.dirEnt, styles.dir, styles.hover)}
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
          <Index each={dirEnts().dirs}>{dir => <Dir layer={props.layer + 1} path={dir()} />}</Index>
          <Show when={hasTemporaryDirEnt()}>
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
        class={clsx(styles.dir, styles.file, styles.hover)}
        style={{
          'padding-left': `calc(${props.layer} * 10px + var(--margin))`,
          'text-decoration': explorerProps.isPathSelected(props.path) ? 'underline' : 'none',
        }}
        onClick={() => explorerProps.onPathSelect(props.path)}
      >
        {getName(props.path)}
      </button>
    )
  }

  return (
    <>
      <div class={clsx(styles.bar, styles.explorerBar)}>
        <CodiconButton kind="new-file" onClick={() => setTemporaryDirEnt('file')} />
        <CodiconButton kind="new-folder" onClick={() => setTemporaryDirEnt('dir')} />
      </div>
      <div class={styles.explorer}>
        <Dir path="" layer={0} />
      </div>
    </>
  )
}
