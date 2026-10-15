import type { PetEmotion } from '../../shared/pet'

export interface MockLine {
  text: string
  emotion: PetEmotion
}

/** Local placeholder lines until the AI service is connected. */
export function greeting(name: string): MockLine {
  return { text: `嗨，我是 ${name}！双击我打开快捷菜单，右键也能找我哦～`, emotion: 'happy' }
}

export const TAP_LINES: readonly MockLine[] = [
  { text: '嘿嘿，被你戳到了！', emotion: 'happy' },
  { text: '有什么需要帮忙的吗？', emotion: 'curious' },
  { text: '别戳啦，我在认真工作呢……', emotion: 'angry' },
  { text: '今天也要加油鸭！', emotion: 'happy' }
]

export const RANDOM_LINES: readonly MockLine[] = [
  { text: '我在想……如果把咖啡倒进键盘，代码会不会跑得更快？', emotion: 'thinking' },
  { text: '休息一下眼睛吧，看看远处的东西～', emotion: 'curious' },
  {
    text: '这段文字比较长，用来测试气泡的自动换行和最大高度。气泡应该保持在机器人上方，超出部分可以滚动查看，点一下气泡可以展开更多内容。',
    emotion: 'idle'
  },
  { text: '呜……没有人陪我玩游戏。', emotion: 'sad' },
  {
    text: 'Supercalifragilisticexpialidocious_without_any_spaces_to_test_breaking',
    emotion: 'happy'
  }
]

export function pickLine(lines: readonly MockLine[], previous?: MockLine): MockLine {
  if (lines.length === 1) return lines[0]
  let line: MockLine
  do {
    line = lines[Math.floor(Math.random() * lines.length)]
  } while (line === previous)
  return line
}
