import { getName, getParentPath } from '@bigmistqke/repl'
import { ContextMenu } from '@kobalte/core/context-menu'
import clsx from 'clsx'
import {
  Accessor,
  batch,
  ComponentProps,
  createContext,
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  Index,
  onMount,
  Setter,
  Show,
  splitProps,
  useContext,
  type JSX,
} from 'solid-js'
import styles from './App.module.css'
import { Codicon, CodiconKind } from './codicon/index.tsx'
import { CodiconButton } from './components.tsx'

/**********************************************************************************/
/*                                                                                */
/*                                    Utilities                                   */
/*                                                                                */
/**********************************************************************************/

function createDroppableHandles(onDrop: (path: string) => void) {
  return {
    onDragOver(event: DragEvent) {
      event.preventDefault()
    },
    onDrop(event: DragEvent) {
      const path = event.dataTransfer?.getData('text/plain')
      if (typeof path === 'string') {
        onDrop(path)
      }
    },
  }
}

function createDraggableHandles(path: string, onDrop: (path: string) => void) {
  return {
    draggable: true,
    onDragStart(event: DragEvent) {
      event.dataTransfer?.setData('text/plain', path)
      event.dataTransfer!.dropEffect = 'move'
    },
    ...createDroppableHandles(onDrop),
  }
}

/**********************************************************************************/
/*                                                                                */
/*                                  Use Explorer                                  */
/*                                                                                */
/**********************************************************************************/

const ExplorerContext = createContext<{
  explorerProps: ExplorerProps
  isCursor(path: string): boolean
  hasTemporaryEntry(path: string): boolean
  setCursor: Setter<string>
  cursor: Accessor<string>
  temporaryEntry: Accessor<'dir' | 'file' | undefined>
  setTemporaryEntry: Setter<'dir' | 'file' | undefined>
}>()

function useExplorer() {
  const context = useContext(ExplorerContext)
  if (!context) throw `ExplorerContext is undefined`
  return context
}

/**********************************************************************************/
/*                                                                                */
/*                                    Explorer                                    */
/*                                                                                */
/**********************************************************************************/

interface ExplorerProps {
  fs: Record<string, string | null>
  isPathSelected(path: string): boolean
  onPathSelect(path: string): void
  onRepoCreate(): void
  onRepoFork(): void
  onEntryCreate(path: string, type: 'dir' | 'file'): void
  onEntryRename(currentPath: string, newPath: string): void
  onEntryDelete(path: string): void
  selectedPath: string
  style?: JSX.CSSProperties
  class?: string
}

export function Explorer(explorerProps: ExplorerProps) {
  const [cursor, setCursor] = createSignal<string>('index.html')
  const [temporaryEntry, setTemporaryEntry] = createSignal<'file' | 'dir'>()

  const isCursor = createSelector(cursor)
  const hasTemporaryEntry = createSelector(cursor, (path, cursor) => {
    if (!temporaryEntry()) return false
    if (explorerProps.fs[cursor] === null) {
      return path === cursor
    }
    return path === getParentPath(cursor)
  })

  return (
    <>
      <div class={clsx(styles.bar, styles.explorerBar)}>
        <div>
          <CodiconButton
            kind="repo-create"
            data-blur-block
            onClick={() => explorerProps.onRepoCreate()}
          />
          <CodiconButton
            kind="repo-forked"
            data-blur-block
            onClick={() => explorerProps.onRepoFork()}
          />
        </div>
        <div>
          <CodiconButton
            kind="new-file"
            data-blur-block
            onClick={() => setTemporaryEntry('file')}
          />
          <CodiconButton
            kind="new-folder"
            data-blur-block
            onClick={() => setTemporaryEntry('dir')}
          />
        </div>
      </div>
      <div
        class={styles.explorer}
        {...createDroppableHandles(path => explorerProps.onEntryRename(path, getName(path)))}
      >
        <ExplorerContext.Provider
          value={{
            explorerProps,
            cursor,
            setCursor,
            isCursor,
            hasTemporaryEntry,
            temporaryEntry,
            setTemporaryEntry,
          }}
        >
          <Entries layer={0} path="" />
        </ExplorerContext.Provider>
      </div>
    </>
  )
}

/**********************************************************************************/
/*                                                                                */
/*                                     Entries                                    */
/*                                                                                */
/**********************************************************************************/

function Entries(props: { layer: number; path: string; collapsed?: boolean }) {
  const { hasTemporaryEntry, temporaryEntry, explorerProps } = useExplorer()
  const entries = createMemo(() => {
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
  return (
    <Show when={!props.collapsed}>
      <Show when={temporaryEntry() === 'dir' && hasTemporaryEntry(props.path)}>
        <TemporaryEntry layer={props.layer} parentPath={props.path} type={temporaryEntry()!} />
      </Show>
      <Index each={entries().dirs.sort()}>{dir => <Dir layer={props.layer} path={dir()} />}</Index>
      <Show when={temporaryEntry() === 'file' && hasTemporaryEntry(props.path)}>
        <TemporaryEntry layer={props.layer} parentPath={props.path} type={temporaryEntry()!} />
      </Show>
      <Index each={entries().files}>{file => <File layer={props.layer} path={file()} />}</Index>
    </Show>
  )
}

/**********************************************************************************/
/*                                                                                */
/*                                      Entry                                     */
/*                                                                                */
/**********************************************************************************/

function Entry(
  props: Omit<ComponentProps<'button'>, 'type' | 'style' | 'onClick'> & {
    onClick?(event: MouseEvent): void
    path: string
    layer: number
    kind: CodiconKind
    style?: JSX.CSSProperties
    type: 'dir' | 'file'
  },
) {
  const { temporaryEntry, isCursor, explorerProps, setCursor } = useExplorer()
  const [, buttonProps] = splitProps(props, [
    'class',
    'style',
    'path',
    'layer',
    'kind',
    'type',
    'onClick',
  ])
  const [editable, setEditable] = createSignal(false)
  return (
    <ContextMenu>
      <ContextMenu.Trigger
        class={clsx(
          !temporaryEntry() && isCursor(props.path) && styles.cursor,
          props.type === 'dir' ? styles.dir : styles.file,
          props.class,
        )}
        style={{
          '--layer': props.layer,
          ...props.style,
        }}
        onClick={event => {
          batch(() => {
            props.onClick?.(event)
            setCursor(props.path)
          })
        }}
        {...buttonProps}
      >
        <Codicon style={{ 'margin-left': '-3px' }} kind={props.kind} />
        <Show when={editable()} fallback={<span class={styles.title}>{getName(props.path)}</span>}>
          <Input
            onBlur={() => setEditable(false)}
            onSubmit={path => explorerProps.onEntryRename(props.path, path)}
            initialValue={getName(props.path)}
          />
        </Show>
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenu}>
          <ContextMenu.Item class={styles.contextMenuItem} onClick={() => setEditable(true)}>
            Rename
          </ContextMenu.Item>
          <ContextMenu.Item
            class={styles.contextMenuItem}
            onClick={() => explorerProps.onEntryDelete(props.path)}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )
}

/**********************************************************************************/
/*                                                                                */
/*                                Temporary Entry                                 */
/*                                                                                */
/**********************************************************************************/

function TemporaryEntry(props: { parentPath: string; layer: number; type: 'file' | 'dir' }) {
  const { setTemporaryEntry, explorerProps } = useExplorer()
  return (
    <button
      class={clsx(styles.cursor, props.type === 'dir' ? styles.dir : styles.file)}
      style={{
        '--layer': props.layer,
      }}
    >
      <Codicon kind={props.type === 'dir' ? 'chevron-right' : 'dash'} />
      <Input
        onBlur={setTemporaryEntry}
        onSubmit={path => {
          explorerProps.onEntryCreate(`${props.parentPath}/${path}`, props.type)
          setTemporaryEntry()
        }}
      />
    </button>
  )
}

/**********************************************************************************/
/*                                                                                */
/*                                       File                                     */
/*                                                                                */
/**********************************************************************************/

function File(props: { layer: number; path: string }) {
  const { explorerProps } = useExplorer()
  return (
    <Entry
      class={clsx(explorerProps.isPathSelected(props.path) && styles.selected)}
      kind="dash"
      layer={props.layer}
      path={props.path}
      type="file"
      onClick={() => explorerProps.onPathSelect(props.path)}
      {...createDraggableHandles(props.path, path => {
        const newPath = `${getParentPath(props.path)}/${getName(path)}`
        explorerProps.onEntryRename(path, newPath)
      })}
    />
  )
}

/**********************************************************************************/
/*                                                                                */
/*                                       Dir                                      */
/*                                                                                */
/**********************************************************************************/

function Dir(props: { layer: number; path: string }) {
  const { explorerProps, hasTemporaryEntry } = useExplorer()

  const [collapsed, setCollapsed] = createSignal(false)

  createEffect(() => {
    if (hasTemporaryEntry(props.path)) setCollapsed(false)
  })

  return (
    <>
      <Entry
        class={clsx(styles.dir, styles.hover)}
        kind={collapsed() ? 'chevron-right' : 'chevron-down'}
        layer={props.layer}
        path={props.path}
        type="dir"
        onClick={() => setCollapsed(collapsed => !collapsed)}
        {...createDraggableHandles(props.path, path => {
          const newPath = `${props.path}/${getName(path)}`
          explorerProps.onEntryRename(path, newPath)
        })}
      />
      <Entries collapsed={collapsed()} layer={props.layer + 1} path={props.path} />
    </>
  )
}

/**********************************************************************************/
/*                                                                                */
/*                                      Input                                     */
/*                                                                                */
/**********************************************************************************/

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
