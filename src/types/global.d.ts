import type { MarimoBridge } from '../../shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload script; undefined when opened in a plain browser. */
    marimo?: MarimoBridge
  }
}

export {}
