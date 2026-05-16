import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isInWindow, getKstParts } from './notify-window'

describe('isInWindow', () => {
  it('matches when now is exactly at scheduled time', () => {
    // 09:00 KST = 00:00 UTC
    const now = new Date('2026-05-16T00:00:00Z')
    assert.equal(isInWindow(now, 9, 0), true)
  })

  it('matches 14 minutes after scheduled time', () => {
    const now = new Date('2026-05-16T00:14:00Z')
    assert.equal(isInWindow(now, 9, 0), true)
  })

  it('does NOT match 15 minutes after scheduled time', () => {
    const now = new Date('2026-05-16T00:15:00Z')
    assert.equal(isInWindow(now, 9, 0), false)
  })

  it('does NOT match before scheduled time', () => {
    const now = new Date('2026-05-15T23:59:00Z') // 08:59 KST
    assert.equal(isInWindow(now, 9, 0), false)
  })

  it('matches 09:30 schedule within window', () => {
    assert.equal(isInWindow(new Date('2026-05-16T00:30:00Z'), 9, 30), true)
    assert.equal(isInWindow(new Date('2026-05-16T00:44:00Z'), 9, 30), true)
    assert.equal(isInWindow(new Date('2026-05-16T00:45:00Z'), 9, 30), false)
  })

  it('does NOT match different hour', () => {
    const now = new Date('2026-05-16T01:00:00Z') // 10:00 KST
    assert.equal(isInWindow(now, 9, 0), false)
  })
})

describe('getKstParts', () => {
  it('returns KST year/month/day/hour/minute for a UTC instant', () => {
    // 15:00 UTC == 00:00 KST next day
    const parts = getKstParts(new Date('2026-05-16T15:00:00Z'))
    assert.equal(parts.year, 2026)
    assert.equal(parts.month, 5)
    assert.equal(parts.day, 17)
    assert.equal(parts.hour, 0)
    assert.equal(parts.minute, 0)
  })
})
