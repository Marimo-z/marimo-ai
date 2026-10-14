/**
 * Deep copy of JSON-shaped data that also strips Vue reactive proxies.
 * structuredClone and IPC serialization both reject proxies, so anything handed to
 * the bridge from reactive state must pass through here first.
 */
export function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
