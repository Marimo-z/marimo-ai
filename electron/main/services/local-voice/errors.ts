/** A local voice failure whose message is safe to show to the user. */
export class LocalEngineError extends Error {
  override name = 'LocalEngineError'
}
