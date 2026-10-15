/** One reading of the machine the pet is sitting on. Ratios are 0–1; `gpu` is null when unknown. */
export interface SystemSample {
  cpu: number
  memory: number
  gpu: number | null
}

export interface CpuTimes {
  user: number
  nice: number
  sys: number
  idle: number
  irq: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** CPU busy ratio between two `os.cpus()` snapshots. */
export function cpuUsage(previous: CpuTimes[], next: CpuTimes[]): number {
  let idle = 0
  let total = 0
  const count = Math.min(previous.length, next.length)
  for (let i = 0; i < count; i++) {
    const before = previous[i]
    const after = next[i]
    if (!before || !after) continue
    const idleDelta = after.idle - before.idle
    const totalDelta =
      after.user -
      before.user +
      (after.nice - before.nice) +
      (after.sys - before.sys) +
      idleDelta +
      (after.irq - before.irq)
    idle += idleDelta
    total += totalDelta
  }
  if (total <= 0) return 0
  return clamp01(1 - idle / total)
}

export function memoryUsage(freeBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0
  return clamp01(1 - freeBytes / totalBytes)
}

/** A line printed by the GPU sampler. Negative or blank means the counter is missing. */
export function parseGpuLine(line: string): number | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return clamp01(value / 100)
}
