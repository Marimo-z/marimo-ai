/** Sentence enders. A Latin period between digits stays inside the sentence ("1.2"). */
const CJK_END = new Set(['。', '！', '？', '；', ';', '!', '?', '\n'])

export interface SpeechPieces {
  /** Sentences that already end with punctuation. */
  done: string[]
  /** Trailing text that is still unfinished. */
  rest: string
}

function isBoundary(chars: string[], index: number): boolean {
  const ch = chars[index]
  if (!ch) return false
  if (CJK_END.has(ch)) return true
  if (ch !== '.') return false
  const prev = chars[index - 1] ?? ''
  const next = chars[index + 1] ?? ''
  return !(prev >= '0' && prev <= '9' && next >= '0' && next <= '9')
}

/** Splits spoken text on sentence boundaries. The last piece stays in `rest` until it ends. */
export function splitSpeech(text: string): SpeechPieces {
  const chars = Array.from(text)
  const done: string[] = []
  let buf = ''
  for (let i = 0; i < chars.length; i++) {
    buf += chars[i]
    if (!isBoundary(chars, i)) continue
    const piece = buf.trim()
    if (piece) done.push(piece)
    buf = ''
  }
  return { done, rest: buf.trim() }
}

/** Every piece that should be spoken, including a tail that never got punctuation. */
export function speechPieces(text: string): string[] {
  const { done, rest } = splitSpeech(text)
  return rest ? [...done, rest] : done
}

function decodePartialString(body: string): string {
  let out = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      out += body[i]
      continue
    }
    if (i + 1 >= body.length) break
    const next = body[++i]
    if (next === 'n') out += '\n'
    else if (next === 't') out += '\t'
    else if (next === 'r') out += '\r'
    else if (next === 'u') {
      if (i + 4 >= body.length) break
      const code = Number.parseInt(body.slice(i + 1, i + 5), 16)
      out += Number.isNaN(code) ? '' : String.fromCharCode(code)
      i += 4
    } else if (next !== undefined) out += next
  }
  return out
}

function readStringAt(
  source: string,
  quote: number
): { value: string; complete: boolean; end: number } | null {
  if (source[quote] !== '"') return null
  let i = quote + 1
  let escape = false
  while (i < source.length) {
    const ch = source[i]
    if (escape) {
      escape = false
      i++
      continue
    }
    if (ch === '\\') {
      escape = true
      i++
      continue
    }
    if (ch === '"') {
      return { value: decodePartialString(source.slice(quote + 1, i)), complete: true, end: i + 1 }
    }
    i++
  }
  return { value: decodePartialString(source.slice(quote + 1)), complete: false, end: source.length }
}

/**
 * The `text` field of a reply as it is being streamed.
 * Incomplete `<think>` blocks are ignored. Returns null until `"text"` starts.
 */
export function readStreamingReplyText(raw: string): { value: string; complete: boolean } | null {
  const withoutThoughts = raw.replace(/<think>[\s\S]*?<\/think>/gi, '')
  if (/<think\b/i.test(withoutThoughts)) return null

  let i = 0
  while (i < withoutThoughts.length) {
    const quote = withoutThoughts.indexOf('"', i)
    if (quote < 0) return null
    const token = readStringAt(withoutThoughts, quote)
    if (!token) return null
    if (!token.complete) return null
    let cursor = token.end
    while (cursor < withoutThoughts.length && /\s/.test(withoutThoughts[cursor])) cursor++
    if (withoutThoughts[cursor] !== ':') {
      i = token.end
      continue
    }
    cursor++
    while (cursor < withoutThoughts.length && /\s/.test(withoutThoughts[cursor])) cursor++
    if (token.value !== 'text') {
      i = cursor
      continue
    }
    if (withoutThoughts[cursor] !== '"') return null
    const value = readStringAt(withoutThoughts, cursor)
    return value ? { value: value.value, complete: value.complete } : null
  }
  return null
}
