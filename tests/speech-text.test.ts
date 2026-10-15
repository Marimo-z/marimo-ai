import { describe, expect, it } from 'vitest'
import { readStreamingReplyText, speechPieces, splitSpeech } from '../shared/speech-text'

describe('splitSpeech', () => {
  it('keeps punctuation on the finished sentence and leaves an unfinished tail', () => {
    expect(splitSpeech('第一句。第二句还没')).toEqual({
      done: ['第一句。'],
      rest: '第二句还没'
    })
  })

  it('does not split a decimal point', () => {
    expect(speechPieces('版本 1.2 很好。')).toEqual(['版本 1.2 很好。'])
  })

  it('reads the text field while the JSON is still arriving', () => {
    expect(readStreamingReplyText('{"text":"第一句。')).toEqual({
      value: '第一句。',
      complete: false
    })
    expect(readStreamingReplyText('{"emotion":"happy","text":"在呢"}')).toEqual({
      value: '在呢',
      complete: true
    })
  })

  it('ignores an unfinished think block', () => {
    expect(readStreamingReplyText('<think>还在想')).toBeNull()
  })
})