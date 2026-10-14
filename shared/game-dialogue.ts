import type { GameEventType, GameOutcome, PlayableGameId } from './game'
import type { PetEmotion } from './pet'
import type { GameSettings } from './settings'

export interface GameLine {
  text: string
  emotion: PetEmotion
}

const GAP_MS: Record<GameSettings['dialogueFrequency'], number> = {
  low: 14_000,
  normal: 6_000,
  high: 2_500
}

const ALWAYS = new Set<GameEventType>(['game_started', 'player_win', 'player_lose', 'game_over'])

const LINES: Record<GameEventType, GameLine[][]> = {
  game_started: [
    [{ text: '来下棋吧，我轻轻的～', emotion: 'curious' }],
    [{ text: '好呀，这局我可不会放水哦。', emotion: 'happy' }],
    [{ text: '放马过来，输了可别找借口。', emotion: 'angry' }],
    [{ text: '嘿嘿，准备被我虐一局吧。', emotion: 'happy' }]
  ],
  turn_started: [
    [{ text: '轮到你啦。', emotion: 'idle' }],
    [{ text: '想好再下哦。', emotion: 'curious' }],
    [{ text: '别磨蹭，我等着呢。', emotion: 'angry' }],
    [{ text: '快点，我都替你想好三步了。', emotion: 'thinking' }]
  ],
  player_good_move: [
    [{ text: '这步不错嘛。', emotion: 'happy' }],
    [{ text: '嗯，有点意思。', emotion: 'curious' }],
    [{ text: '哼，运气好而已。', emotion: 'angry' }],
    [{ text: '行啊你，终于开窍了？', emotion: 'happy' }]
  ],
  player_mistake: [
    [{ text: '哎呀，这步好像漏了。', emotion: 'curious' }],
    [{ text: '要不要我装没看见？', emotion: 'happy' }],
    [{ text: '送上门的机会，我不客气啦。', emotion: 'happy' }],
    [{ text: '就这？我闭着眼都能赢。', emotion: 'angry' }]
  ],
  player_damaged: [
    [{ text: '小心，你受伤了。', emotion: 'sad' }],
    [{ text: '哎呀，挨了一下。', emotion: 'curious' }],
    [{ text: '躲都不会躲？', emotion: 'angry' }],
    [{ text: '就这血量？再来一炮。', emotion: 'happy' }]
  ],
  player_win: [
    [{ text: '你赢啦！好厉害～', emotion: 'happy' }],
    [{ text: '哇，被你打败了。再来一局？', emotion: 'happy' }],
    [{ text: '哼，这局算你厉害。下一局我认真了。', emotion: 'angry' }],
    [{ text: '……再来。这次不会让你了。', emotion: 'angry' }]
  ],
  player_lose: [
    [{ text: '我赢了。再试一次？我可以温柔一点。', emotion: 'happy' }],
    [{ text: '嘿嘿，这局是我的。要不要再来？', emotion: 'happy' }],
    [{ text: '轻松拿下。不服气就再下一盘。', emotion: 'angry' }],
    [{ text: '认输吧，桌宠是不会手下留情的。', emotion: 'angry' }]
  ],
  game_paused: [
    [{ text: '先歇一会儿～', emotion: 'idle' }],
    [{ text: '暂停就暂停，棋盘我可记得。', emotion: 'curious' }],
    [{ text: '怕了？暂停也算一种策略。', emotion: 'happy' }],
    [{ text: '逃不掉的，棋还在这儿。', emotion: 'angry' }]
  ],
  game_over: [
    [{ text: '平局！棋逢对手。', emotion: 'thinking' }],
    [{ text: '握手言和？下一局决胜负。', emotion: 'curious' }],
    [{ text: '平了啊，下次可不会这么客气。', emotion: 'angry' }],
    [{ text: '平局也算你走运。再来一盘。', emotion: 'happy' }]
  ]
}

export function shouldSpeakGameEvent(
  type: GameEventType,
  frequency: GameSettings['dialogueFrequency'],
  lastAt: Map<GameEventType, number>,
  now: number
): boolean {
  if (ALWAYS.has(type)) return true
  const gap = GAP_MS[frequency]
  const previous = lastAt.get(type)
  if (previous !== undefined && now - previous < gap) return false
  lastAt.set(type, now)
  return true
}

const TANK_START: GameLine[][] = [
  [{ text: '战场准备好了，我罩着你。', emotion: 'curious' }],
  [{ text: '敌人来了，别站着挨打。', emotion: 'happy' }],
  [{ text: '炮弹不长眼，躲好再开枪。', emotion: 'angry' }],
  [{ text: '嘿嘿，看你能撑几炮。', emotion: 'happy' }]
]

export function pickGameLine(
  type: GameEventType,
  tauntLevel: number,
  outcome: GameOutcome | undefined,
  rng: () => number,
  gameId?: PlayableGameId
): GameLine | null {
  const level = Math.min(3, Math.max(0, Math.round(tauntLevel)))
  if (type === 'game_over' && outcome && outcome !== 'draw') return null
  const pool = (type === 'game_started' && gameId === 'tank' ? TANK_START : LINES[type])?.[level]
  if (!pool || pool.length === 0) return null
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]
}
