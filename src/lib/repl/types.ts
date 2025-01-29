import { Accessor } from 'solid-js'

export type FileType = 'javascript' | 'css' | 'html' | 'wasm' | 'unknown'
export interface Executable {
  (): string
  new: Accessor<string | undefined>
  invalidate: () => void
}
export interface Extension {
  transform?: Transform
  type: FileType
}
export interface TransformConfig {
  path: string
  source: string
  executables: Record<string, Executable>
}
export type Transform = (config: TransformConfig) => string

export type Match = (glob: string) => (paths: Array<string>) => Array<string>
