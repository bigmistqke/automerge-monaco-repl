import { getName, getParentPath } from '@bigmistqke/repl'
import { ContextMenu } from '@kobalte/core/context-menu'
import clsx from 'clsx'
import {
  batch,
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  Index,
  onMount,
  ParentProps,
  Show,
  type JSX,
} from 'solid-js'
import styles from './App.module.css'
import { Codicon } from './codicon/index.tsx'
import { CodiconButton } from './components.tsx'

function DirEntContextMenu(
  props: ParentProps<{ path: string; onEditable(): void; onDelete(): void }>,
) {
  return (
    <ContextMenu>
      <ContextMenu.Trigger>{props.children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenu}>
          <ContextMenu.Item class={styles.contextMenuItem} onClick={() => props.onEditable()}>
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onClick={() => props.onDelete()}>
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )
}

function Input(props: {
  class?: string
  initialValue?: string
  onBlur(event: FocusEvent): void
  onSubmit(name: string): void
  style?: JSX.CSSProperties
}) {
  const [name, setName] = createSignal(props.initialValue || '')
  return (
    <input
      ref={element =>
        onMount(() => {
          setTimeout(() => {
            element.focus()
            element.select()
          }, 0)
        })
      }
      value={name()}
      class={clsx(styles.input, props.class)}
      style={props.style}
      spellcheck={false}
      onBlur={props.onBlur}
      onKeyDown={e => {
        if (e.code === 'Enter') {
          props.onSubmit(name())
        }
      }}
      onInput={e => setName(e.currentTarget.value)}
    />
  )
}

export function Explorer(explorerProps: {
  fs: Record<string, string | null>
  isPathSelected(path: string): boolean
  onPathSelect(path: string): void
  onDirEntCreate(path: string, type: 'dir' | 'file'): void
  onDirEntRename(currentPath: string, newPath: string): void
  onDirEntDelete(path: string): void
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
        <Input
          onBlur={e => {
            if (
              e.relatedTarget instanceof HTMLElement &&
              e.relatedTarget.getAttribute('data-blur-block')
            ) {
              return
            }
            setTemporaryDirEnt()
          }}
          onSubmit={name => {
            batch(() => {
              const path = props.parentPath ? `${props.parentPath}/${name}` : name
              explorerProps.onDirEntCreate(path, props.type)
              setTemporaryDirEnt()
              setCursor(path)
            })
          }}
        />
      </div>
    )
  }

  createEffect(() => console.log('explorerProps.fs', Object.keys(explorerProps.fs)))

  function Dir(props: { layer: number; path: string }) {
    const [editable, setEditable] = createSignal(false)
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
          <DirEntContextMenu
            path={props.path}
            onEditable={() => setEditable(true)}
            onDelete={() => explorerProps.onDirEntDelete(props.path)}
          >
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
              <Show when={editable()} fallback={<span>{getName(props.path)}</span>}>
                <Input
                  initialValue={getName(props.path)}
                  onSubmit={name => {
                    explorerProps.onDirEntRename(props.path, `${getParentPath(props.path)}/${name}`)
                    setEditable(false)
                  }}
                  onBlur={() => setEditable(false)}
                />
              </Show>
            </button>
          </DirEntContextMenu>
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
    const [editable, setEditable] = createSignal(false)

    return (
      <Show
        when={editable()}
        fallback={
          <DirEntContextMenu
            path={props.path}
            onEditable={() => setEditable(true)}
            onDelete={() => explorerProps.onDirEntDelete(props.path)}
          >
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
          </DirEntContextMenu>
        }
      >
        <Input
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
          initialValue={getName(props.path)}
          onSubmit={name => {
            explorerProps.onDirEntRename(props.path, `${getParentPath(props.path)}/${name}`)
            setEditable(false)
          }}
          onBlur={() => setEditable(false)}
        />
      </Show>
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
