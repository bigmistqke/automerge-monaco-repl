import clsx from 'clsx'
import { ComponentProps } from 'solid-js'
import styles from './App.module.css'
import { Codicon, CodiconKind } from './codicon/index.tsx'

export function Button(props: ComponentProps<'button'>) {
  return <button {...props} class={clsx(styles.button, styles.hover, props.class)} />
}

export function CodiconButton(props: ComponentProps<'button'> & { kind: CodiconKind }) {
  return <Codicon {...props} as={Button} />
}
