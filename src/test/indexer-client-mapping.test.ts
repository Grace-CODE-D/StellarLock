/**
 * Unit tests for indexer-client.ts's DTO → frontend mapping — #697, #698
 *
 * mapIndexerLocks derives Lock.status ("withdrawn" / "unlockable" / "locked")
 * and falls back to 7 decimals + an address-slice symbol when on-chain token
 * metadata can't be resolved. mapIndexerLocksPageToSummary drops LP rows,
 * returns null when no token locks remain, and aggregates totals only over
 * active (non-withdrawn) token locks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { OnChainTokenMeta } from "@/lib/token-metadata"
import { getOnChainTokenMeta } from "@/lib/token-metadata"
import {
  mapIndexerLocks,
  mapIndexerLocksPageToSummary,
  type IndexerLockDTO,
} from "@/lib/indexer-client"

vi.mock("@/lib/token-metadata", () => ({
  getOnChainTokenMeta: vi.fn(),
}))

const mockGetOnChainTokenMeta = vi.mocked(getOnChainTokenMeta)

const NOW_MS = Date.UTC(2026, 0, 1)
const NOW_S = NOW_MS / 1000

const KNOWN_TOKEN = "CKNOWNTOKENAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const UNKNOWN_TOKEN = "CUNKNWTOKENAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const POOL_SHARE = "CPOOLSHAREAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

const KNOWN_META: OnChainTokenMeta = { symbol: "USDC", name: "USD Coin", decimals: 6 }

function dto(overrides: Partial<IndexerLockDTO> = {}): IndexerLockDTO {
  return {
    id: "1",
    kind: "token",
    creator: "GCREATOR",
    beneficiary: "GBENEFICIARY",
    token: KNOWN_TOKEN,
    amount: "1000000",
    unlockAt: NOW_S + 86_400,
    status: "locked",
    createdAt: NOW_S - 86_400,
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
  mockGetOnChainTokenMeta.mockReset()
  mockGetOnChainTokenMeta.mockImplementation(async (addr: string) =>
    addr === KNOWN_TOKEN ? KNOWN_META : (undefined as unknown as OnChainTokenMeta),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe("mapIndexerLocks status derivation (#697)", () => {
  it('maps status "withdrawn" to withdrawn even when the unlock time is in the future', async () => {
    const [lock] = await mapIndexerLocks([dto({ status: "withdrawn", unlockAt: NOW_S + 86_400 })])
    expect(lock.status).toBe("withdrawn")
  })

  it("maps withdrawn: true to withdrawn even when status is still \"locked\"", async () => {
    const [lock] = await mapIndexerLocks([dto({ status: "locked", withdrawn: true, unlockAt: NOW_S - 86_400 })])
    expect(lock.status).toBe("withdrawn")
  })

  it("maps a non-withdrawn lock whose unlock time has passed to unlockable", async () => {
    const [lock] = await mapIndexerLocks([dto({ unlockAt: NOW_S - 1 })])
    expect(lock.status).toBe("unlockable")
  })

  it("treats an unlock time exactly equal to now as unlockable", async () => {
    const [lock] = await mapIndexerLocks([dto({ unlockAt: NOW_S })])
    expect(lock.status).toBe("unlockable")
  })

  it("maps a non-withdrawn lock with a future unlock time to locked", async () => {
    const [lock] = await mapIndexerLocks([dto({ unlockAt: NOW_S + 1 })])
    expect(lock.status).toBe("locked")
  })
})

describe("mapIndexerLocks token metadata (#697)", () => {
  it("uses resolved on-chain metadata and scales amount by its decimals", async () => {
    const [lock] = await mapIndexerLocks([dto({ amount: "2500000" })])

    expect(lock.token).toEqual({ address: KNOWN_TOKEN, symbol: "USDC", name: "USD Coin", decimals: 6 })
    expect(lock.amount).toBe(2.5)
  })

  it("falls back to 7 decimals and an address-slice symbol/name when metadata is missing", async () => {
    const [lock] = await mapIndexerLocks([dto({ token: UNKNOWN_TOKEN, amount: "25000000" })])

    expect(lock.token).toEqual({
      address: UNKNOWN_TOKEN,
      symbol: UNKNOWN_TOKEN.slice(0, 6),
      name: UNKNOWN_TOKEN.slice(0, 6),
      decimals: 7,
    })
    expect(lock.amount).toBe(2.5)
  })

  it("resolves metadata once per unique token", async () => {
    await mapIndexerLocks([dto({ id: "1" }), dto({ id: "2" }), dto({ id: "3", token: UNKNOWN_TOKEN })])

    expect(mockGetOnChainTokenMeta).toHaveBeenCalledTimes(2)
  })

  it("converts timestamps to ms and defaults extendedCount to 0", async () => {
    const [lock] = await mapIndexerLocks([dto()])

    expect(lock.createdAt).toBe((NOW_S - 86_400) * 1000)
    expect(lock.unlockAt).toBe((NOW_S + 86_400) * 1000)
    expect(lock.extendedCount).toBe(0)
    expect(lock.usdValue).toBe(0)
  })
})

describe("mapIndexerLocksPageToSummary (#698)", () => {
  it("returns null for a page containing only LP locks", async () => {
    const summary = await mapIndexerLocksPageToSummary({
      total: 2,
      locks: [dto({ id: "lp1", kind: "lp", token: POOL_SHARE }), dto({ id: "lp2", kind: "lp", token: POOL_SHARE })],
    })

    expect(summary).toBeNull()
  })

  it("returns null for an empty page", async () => {
    await expect(mapIndexerLocksPageToSummary({ total: 0, locks: [] })).resolves.toBeNull()
  })

  it("excludes LP rows and aggregates only active token locks from a mixed page", async () => {
    const soonest = NOW_S + 3_600
    const later = NOW_S + 86_400

    const summary = await mapIndexerLocksPageToSummary({
      total: 6,
      locks: [
        dto({ id: "t-locked-later", amount: "1000000", unlockAt: later }),
        dto({ id: "t-locked-soon", amount: "2000000", unlockAt: soonest }),
        dto({ id: "t-unlockable", amount: "4000000", unlockAt: NOW_S - 60 }),
        // Withdrawn with the earliest future unlock — must not drive nextUnlockAt or totals.
        dto({ id: "t-withdrawn", amount: "8000000", unlockAt: NOW_S + 60, status: "withdrawn" }),
        dto({ id: "t-withdrawn-flag", amount: "16000000", unlockAt: NOW_S + 30, withdrawn: true }),
        // LP row with an even earlier unlock and a huge amount — must be excluded entirely.
        dto({ id: "lp-1", kind: "lp", token: KNOWN_TOKEN, amount: "999000000", unlockAt: NOW_S + 10 }),
      ],
    })

    expect(summary).not.toBeNull()
    expect(summary!.locks.map((l) => l.id)).toEqual([
      "t-locked-later",
      "t-locked-soon",
      "t-unlockable",
      "t-withdrawn",
      "t-withdrawn-flag",
    ])
    expect(summary!.locks.every((l) => l.kind === "token")).toBe(true)

    // 1 + 2 + 4 (6-decimal token); withdrawn rows and the LP row are ignored.
    expect(summary!.totalLocked).toBe(7)
    expect(summary!.activeLocks).toBe(3)
    // Earliest unlock among still-locked token locks only (unlockable excluded too).
    expect(summary!.nextUnlockAt).toBe(soonest * 1000)
    expect(summary!.token).toEqual({ address: KNOWN_TOKEN, symbol: "USDC", name: "USD Coin", decimals: 6 })
    expect(summary!.totalUsdValue).toBe(0)
  })

  it("returns nextUnlockAt null when no active token lock is still locked", async () => {
    const summary = await mapIndexerLocksPageToSummary({
      total: 2,
      locks: [
        dto({ id: "t-unlockable", unlockAt: NOW_S - 60 }),
        dto({ id: "t-withdrawn", unlockAt: NOW_S + 60, status: "withdrawn" }),
      ],
    })

    expect(summary!.activeLocks).toBe(1)
    expect(summary!.nextUnlockAt).toBeNull()
  })

  it("reports zero totals when every token lock is withdrawn", async () => {
    const summary = await mapIndexerLocksPageToSummary({
      total: 1,
      locks: [dto({ status: "withdrawn" })],
    })

    expect(summary).not.toBeNull()
    expect(summary!.totalLocked).toBe(0)
    expect(summary!.activeLocks).toBe(0)
    expect(summary!.nextUnlockAt).toBeNull()
  })
})
