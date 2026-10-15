import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import os from 'node:os'
import {
  cpuUsage,
  memoryUsage,
  parseGpuLine,
  type CpuTimes,
  type SystemSample
} from '../../../shared/monitor'

function snapshotCpu(): CpuTimes[] {
  return os.cpus().map((cpu) => cpu.times)
}

const SAMPLE_MS = 1000

/**
 * One PowerShell loop. `Get-Counter` blocks for about a second, then prints the busiest
 * 3D engine as 0–100, or -1 when this machine has no GPU performance counters.
 */
const GPU_SCRIPT = `
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
while ($true) {
  $max = -1
  try {
    $samples = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples |
      Where-Object { $_.InstanceName -like '*engtype_3D*' }
    if ($samples) { $max = [int][math]::Round(($samples | Measure-Object CookedValue -Maximum).Maximum) }
  } catch { $max = -1 }
  Write-Output $max
}
`

/** Samples CPU, memory and (on Windows) GPU while something is listening. */
export class SystemMonitor {
  private timer: ReturnType<typeof setInterval> | null = null
  private previous = snapshotCpu()
  private gpu: number | null = null
  private gpuProcess: ChildProcessWithoutNullStreams | null = null
  private gpuBuffer = ''
  private enabled = false

  constructor(private readonly onSample: (sample: SystemSample) => void) {}

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled
    if (!enabled) {
      this.stopSampler()
      return
    }
    this.previous = snapshotCpu()
    this.timer = setInterval(() => this.tick(), SAMPLE_MS)
    this.startGpu()
    this.tick()
  }

  stop(): void {
    this.enabled = false
    this.stopSampler()
  }

  private stopSampler(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.gpuProcess?.kill()
    this.gpuProcess = null
    this.gpuBuffer = ''
    this.gpu = null
  }

  private tick(): void {
    const next = snapshotCpu()
    const sample: SystemSample = {
      cpu: cpuUsage(this.previous, next),
      memory: memoryUsage(os.freemem(), os.totalmem()),
      gpu: this.gpu
    }
    this.previous = next
    this.onSample(sample)
  }

  private startGpu(): void {
    if (process.platform !== 'win32' || this.gpuProcess) return
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', GPU_SCRIPT],
      { windowsHide: true }
    )
    this.gpuProcess = child
    child.stdout.on('data', (chunk: Buffer) => this.takeGpu(chunk))
    child.on('exit', () => {
      if (this.gpuProcess === child) this.gpuProcess = null
    })
  }

  private takeGpu(chunk: Buffer): void {
    const text = chunk.includes(0) ? chunk.toString('utf16le') : chunk.toString('utf8')
    this.gpuBuffer += text
    const lines = this.gpuBuffer.split(/\r?\n/)
    this.gpuBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const parsed = parseGpuLine(line)
      if (parsed !== null || line.trim() === '-1') this.gpu = parsed
    }
  }
}
