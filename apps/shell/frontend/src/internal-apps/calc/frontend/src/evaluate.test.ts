import { describe, expect, it } from 'vitest'
import { evaluate, format } from './evaluate'

// Pure arithmetic: the calculator's honesty lives here — real precedence,
// postfix %, unary minus, and null (never a guess) for anything incomplete.

describe('evaluate', () => {
  it('does the four operations with real precedence, left to right', () => {
    expect(evaluate('2+3×4')).toBe(14)
    expect(evaluate('10÷4')).toBe(2.5)
    expect(evaluate('2+3-4')).toBe(1)
    expect(evaluate('6÷2×3')).toBe(9)
    expect(evaluate('10-4-3')).toBe(3)
  })

  it('handles unary minus, including after operators', () => {
    expect(evaluate('-5+3')).toBe(-2)
    expect(evaluate('5--3')).toBe(8)
    expect(evaluate('--5')).toBe(5)
    expect(evaluate('2×-3')).toBe(-6)
    expect(evaluate('-')).toBeNull()
  })

  it('treats % as postfix divide-by-100', () => {
    expect(evaluate('50%')).toBe(0.5)
    expect(evaluate('200+10%')).toBeCloseTo(200.1)
  })

  it('reads decimals', () => {
    expect(evaluate('0.5×8')).toBe(4)
    expect(evaluate('..5×8')).toBeNull()
  })

  it('answers null instead of guessing on incomplete input', () => {
    expect(evaluate('5+')).toBeNull()
    expect(evaluate('5+×2')).toBeNull()
    expect(evaluate('')).toBeNull()
    expect(evaluate('abc')).toBeNull()
  })

  it('refuses to answer a division by zero', () => {
    expect(evaluate('1÷0')).toBeNull()
  })
})

describe('format', () => {
  it('trims float noise', () => {
    expect(format(0.1 + 0.2)).toBe('0.3')
    expect(format(100 / 3)).toBe('33.3333333333')
  })

  it('keeps integers plain', () => {
    expect(format(14)).toBe('14')
    expect(format(-2.5)).toBe('-2.5')
  })
})
