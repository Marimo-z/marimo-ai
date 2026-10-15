import { session, type WebContents } from 'electron'

/**
 * Electron grants every permission by default. Only the control panel and the pet window may use
 * the microphone (voice input); everything else, including the camera, is denied.
 */
export function restrictPermissions(
  panel: () => WebContents | null,
  pet: () => WebContents | null
): void {
  const allowed = (contents: WebContents | null): boolean =>
    contents !== null && (contents === panel() || contents === pet())

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const types = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(
      permission === 'media' &&
        allowed(contents) &&
        types.length > 0 &&
        types.every((type) => type === 'audio')
    )
  })

  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (permission !== 'media' || !allowed(contents)) return false
    return !('mediaType' in details) || details.mediaType !== 'video'
  })
}
