import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { GameRecord } from '../../shared/game'
import { gameBridge } from '../app/settings/bridge'

export function useGameRecords() {
  const records = ref<GameRecord[]>([])

  async function load(): Promise<void> {
    records.value = await gameBridge.getRecords()
  }

  const off = gameBridge.onRecordsChanged((next) => {
    records.value = next
  })
  onMounted(() => void load())
  onBeforeUnmount(off)

  return { records }
}
