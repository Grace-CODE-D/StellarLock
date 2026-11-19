// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk"

const tempDir = mkdtempSync(join(tmpdir(), "stellarlock-indexer-api-"))
process.env.LOCK_INDEX_DB_PATH = join(tempDir, "integration.sqlite")
process.env.TOKEN_LOCKER_CONTRACT = "CTOKENLOCKERINTEGRATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
process.env.LP_LOCKER_CONTRACT = "CLPLOCKERINTEGRATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

const indexer = await import("../indexer/index")
const database = await import("../indexer/db")
const statsHandler = (await import("./indexer-stats")).default
const locksHandler = (await import("./indexer-locks")).default

const creator = Keypair.random().publicKey()
const beneficiary = Keypair.random().publicKey()
const token = Keypair.random().publicKey()
const amount = 1234n
const unlockAt = Math.floor(Date.now() / 1000) + 86_400

function event() {
  return {
    id: "integration-lock-created-1",
    ledger: 500,
    ledgerClosedAt: new Date().toISOString(),
    topic: [
      xdr.ScVal.scvSymbol("lock_created"),
      nativeToScVal(1n, { type: "u64" }),
      nativeToScVal(creator, { type: "address" }),
      nativeToScVal(token, { type: "address" }),
      nativeToScVal(amount, { type: "i128" }),
      nativeToScVal(beneficiary, { type: "address" }),
      nativeToScVal(BigInt(unlockAt), { type: "u64" }),
    ],
    value: xdr.ScVal.scvVoid(),
  }
}

function responseRecorder() {
  const calls: { status?: number; payload?: unknown } = {}
  const chain = {
    json(payload: unknown) {
      calls.payload = payload
      return chain
    },
  }
  return {
    calls,
    response: {
      status(code: number) {
        calls.status = code
        return chain
      },
    },
  }
}

describe("indexer to API integration", () => {
  beforeAll(async () => {
    const server = {
      getLatestLedger: async () => ({ sequence: 500 }),
      getEvents: async () => ({ latestLedger: 500, cursor: "integration-cursor", events: [event()] }),
    }
    await indexer.pollOnce(server)
  })

  afterAll(() => {
    database.db.close()
    rmSync(tempDir, { recursive: true, force: true })
    vi.resetModules()
  })

  it("serves pollOnce data through indexer-stats and indexer-locks handlers", () => {
    const stats = responseRecorder()
    statsHandler({}, stats.response)
    expect(stats.calls.status).toBe(200)
    expect(stats.calls.payload).toMatchObject({
      totalLocks: 1,
      totalValue: amount.toString(),
      uniqueTokens: 1,
      recentLocks: [expect.objectContaining({ id: "token:1", amount: amount.toString() })],
    })

    const locks = responseRecorder()
    locksHandler({ query: { token } }, locks.response)
    expect(locks.calls.status).toBe(200)
    expect(locks.calls.payload).toEqual({
      total: 1,
      locks: [expect.objectContaining({ id: "token:1", token, amount: amount.toString() })],
    })
  })
})
