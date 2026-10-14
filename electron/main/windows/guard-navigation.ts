import type { WebContents } from 'electron'

/**
 * Stops the page from navigating away. In development, reloads of the Vite origin are allowed:
 * blocking them leaves the control panel on a stale router (new routes then fall through to 总览).
 */
export function guardNavigation(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (!devUrl) {
      event.preventDefault()
      return
    }
    try {
      if (new URL(url).origin === new URL(devUrl).origin) return
    } catch {
      // Not a URL we should follow.
    }
    event.preventDefault()
  })
}
