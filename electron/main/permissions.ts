import { session, type WebContents } from 'electron'

/**
 * Electron grants every permission by default. Only the control panel may use the microphone
 * (for voice input); everything else, including the camera, is denied.
 */
export function restrictPermissions(panel: () => WebContents | null): void {
  const fromPanel = (contents: WebContents | null): boolean =>
    contents !== null && contents === panel()

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(
      permission === 'media' &&
        fromPanel(contents) &&
        types.length > 0 &&
        types.every((type) => type === 'audio')
    )
  })

  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (permission !== 'media' || !fromPanel(contents)) return false
    return !('mediaType' in details) || details.mediaType !== 'video'
  })
}
