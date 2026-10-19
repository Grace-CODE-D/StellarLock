/**
 * Unit tests for useWallet's connect() retry-with-exponential-backoff loop — #691
 *
 * connect() retries openModal failures up to 4 times with exponential
 * backoff (1s, 2s, 4s), setting connectState to "retrying" and connectError
 * to a countdown message before finally settling to "failed" on the last
 * attempt. No test previously covered this flow. These tests mock
 * StellarWalletsKit.openModal to reject N times then resolve/reject finally,
 * using fake timers to assert the connectState transitions
 * idle → connecting → retrying → (success|failed) and that
 * connectError/connectHelp are set per attempt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { Networks } from "@stellar/stellar-sdk"
import type { ReactNode } from "react"

import { getConnectHelp, getFriendlyError } from "@/lib/wallet-errors"

const openModalMock = vi.fn()
const getAddressMock = vi.fn()
const getNetworkMock = vi.fn()
const setWalletMock = vi.fn()

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    getAddress: getAddressMock,
    getNetwork: getNetworkMock,
    setWallet: setWalletMock,
    openModal: openModalMock,
    signTransaction: vi.fn(),
  })),
  WalletNetwork: { PUBLIC: "PUBLIC", TESTNET: "TESTNET" },
  allowAllModules: vi.fn(() => []),
}))

import { WalletProvider } from "@/hooks/WalletProvider"
import { useWallet } from "@/hooks/useWallet"

const WALLET_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const STORAGE_KEY = "stellarlock:wallet"
const WALLET_ID_KEY = "stellarlock:wallet-id"

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}

/**
 * Drives openModal to call onWalletSelected synchronously so each attempt
 * proceeds to getAddress(). The per-attempt outcome is controlled by the
 * getAddressMock queue (mockRejectedValueOnce / mockResolvedValueOnce).
 */
function openModalSelectsWallet() {
  openModalMock.mockImplementation(({ onWalletSelected }: { onWalletSelected: (o: { id: string }) => void }) => {
    onWalletSelected({ id: "freighter" })
  })
}

describe("useWallet — connect() retry/backoff (#691)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    openModalMock.mockReset()
    getAddressMock.mockReset()
    getNetworkMock.mockReset()
    setWalletMock.mockReset()
    getNetworkMock.mockResolvedValue({ network: "TESTNET", networkPassphrase: Networks.TESTNET })
    // No persisted session so the restore-on-mount effect returns early and
    // does not consume any queued getAddress rejections.
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(WALLET_ID_KEY)
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it("transitions idle→connecting→retrying→success across 3 failures then a 4th success", async () => {
    // Attempts 1–3 fail with genuine errors; attempt 4 succeeds.
    getAddressMock
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"))
      .mockResolvedValueOnce({ address: WALLET_ADDRESS })
    openModalSelectsWallet()

    const { result } = renderHook(() => useWallet(), { wrapper })

    expect(result.current.connectState).toBe("idle")

    let connectPromise!: Promise<void>
    act(() => {
      connectPromise = result.current.connect()
    })

    // Synchronously set at the start of connect().
    expect(result.current.connectState).toBe("connecting")
    expect(result.current.connecting).toBe(true)

    // Attempt 1 fails → retrying, backoff 1s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.connectState).toBe("retrying")
    expect(result.current.connectError).toBe("Retrying in 1s…")
    expect(result.current.connectHelp).toBe(getConnectHelp("fail 1"))

    // Advance 1s → attempt 2 fails → retrying, backoff 2s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(openModalMock).toHaveBeenCalledTimes(2)
    expect(result.current.connectState).toBe("retrying")
    expect(result.current.connectError).toBe("Retrying in 2s…")
    expect(result.current.connectHelp).toBe(getConnectHelp("fail 2"))

    // Advance 2s → attempt 3 fails → retrying, backoff 4s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(openModalMock).toHaveBeenCalledTimes(3)
    expect(result.current.connectState).toBe("retrying")
    expect(result.current.connectError).toBe("Retrying in 4s…")
    expect(result.current.connectHelp).toBe(getConnectHelp("fail 3"))

    // Advance 4s → attempt 4 succeeds → success.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })
    await act(async () => {
      await connectPromise
    })

    expect(openModalMock).toHaveBeenCalledTimes(4)
    expect(result.current.connectState).toBe("success")
    expect(result.current.connecting).toBe(false)
    expect(result.current.address).toBe(WALLET_ADDRESS)
    expect(result.current.isConnected).toBe(true)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(WALLET_ADDRESS)
    expect(localStorage.getItem(WALLET_ID_KEY)).toBe("freighter")
  })

  it("uses exponential backoff delays of 1s, 2s, 4s between retries", async () => {
    getAddressMock
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce({ address: WALLET_ADDRESS })
    openModalSelectsWallet()

    const { result } = renderHook(() => useWallet(), { wrapper })

    let connectPromise!: Promise<void>
    act(() => {
      connectPromise = result.current.connect()
    })

    // After attempt 1 fails, the countdown must read 1s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.connectError).toBe("Retrying in 1s…")

    // Advancing less than 1s must NOT yet trigger attempt 2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999)
    })
    expect(openModalMock).toHaveBeenCalledTimes(1)

    // The remaining 1ms completes the 1s backoff → attempt 2.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(openModalMock).toHaveBeenCalledTimes(2)
    expect(result.current.connectError).toBe("Retrying in 2s…")

    // Advancing less than 2s must NOT yet trigger attempt 3.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999)
    })
    expect(openModalMock).toHaveBeenCalledTimes(2)

    // The remaining 1ms completes the 2s backoff → attempt 3 (succeeds).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await act(async () => {
      await connectPromise
    })
    expect(openModalMock).toHaveBeenCalledTimes(3)
    expect(result.current.connectState).toBe("success")
  })

  it("settles to failed with friendly error/help after all 4 attempts reject", async () => {
    const errorMsg = "network error"
    getAddressMock
      .mockRejectedValueOnce(new Error(errorMsg))
      .mockRejectedValueOnce(new Error(errorMsg))
      .mockRejectedValueOnce(new Error(errorMsg))
      .mockRejectedValueOnce(new Error(errorMsg))
    openModalSelectsWallet()

    const { result } = renderHook(() => useWallet(), { wrapper })

    let connectPromise!: Promise<void>
    act(() => {
      connectPromise = result.current.connect()
    })
    expect(result.current.connectState).toBe("connecting")

    // Attempt 1 → retrying (1s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.connectState).toBe("retrying")
    expect(result.current.connectError).toBe("Retrying in 1s…")

    // Attempt 2 → retrying (2s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.connectError).toBe("Retrying in 2s…")

    // Attempt 3 → retrying (4s).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.connectError).toBe("Retrying in 4s…")

    // Attempt 4 (last) → failed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })
    await act(async () => {
      await connectPromise
    })

    expect(openModalMock).toHaveBeenCalledTimes(4)
    expect(result.current.connectState).toBe("failed")
    expect(result.current.connecting).toBe(false)
    expect(result.current.connectError).toBe(getFriendlyError(errorMsg))
    expect(result.current.connectHelp).toBe(getConnectHelp(errorMsg))
    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
  })

  it("does not retry more than 4 times", async () => {
    getAddressMock.mockRejectedValue(new Error("always fails"))
    openModalSelectsWallet()

    const { result } = renderHook(() => useWallet(), { wrapper })

    let connectPromise!: Promise<void>
    act(() => {
      connectPromise = result.current.connect()
    })

    // Run through all backoffs (1+2+4 = 7s) plus a generous margin.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    await act(async () => {
      await connectPromise
    })

    // Exactly 4 attempts — never a 5th.
    expect(openModalMock).toHaveBeenCalledTimes(4)
    expect(result.current.connectState).toBe("failed")
  })
})
