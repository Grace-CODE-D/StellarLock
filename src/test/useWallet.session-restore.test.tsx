/**
 * Unit tests for useWallet's persisted-session restore/reconciliation effect — #692
 *
 * On mount, useWallet reads STORAGE_KEY/WALLET_ID_KEY from localStorage,
 * calls kit.getAddress() and either restores the address if it matches, or
 * clears both keys if the wallet returns a mismatched/empty address or
 * throws. Nothing previously tested this restore-or-clear behavior. These
 * tests mock kit.getAddress() to cover:
 *  - matching saved address restores state (address + isConnected)
 *  - mismatched address clears storage (keys removed, no restore)
 *  - empty address clears storage
 *  - a rejected getAddress() clears storage
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { Networks } from "@stellar/stellar-sdk"
import type { ReactNode } from "react"

const getAddressMock = vi.fn()
const getNetworkMock = vi.fn()
const setWalletMock = vi.fn()

vi.mock("@creit.tech/stellar-wallets-kit", () => ({
  StellarWalletsKit: vi.fn().mockImplementation(() => ({
    getAddress: getAddressMock,
    getNetwork: getNetworkMock,
    setWallet: setWalletMock,
    openModal: vi.fn(),
    signTransaction: vi.fn(),
  })),
  WalletNetwork: { PUBLIC: "PUBLIC", TESTNET: "TESTNET" },
  allowAllModules: vi.fn(() => []),
}))

import { WalletProvider } from "@/hooks/WalletProvider"
import { useWallet } from "@/hooks/useWallet"

const WALLET_ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const OTHER_ADDRESS = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const STORAGE_KEY = "stellarlock:wallet"
const WALLET_ID_KEY = "stellarlock:wallet-id"

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>
}

// Flushes the microtask queue so the mount-time getAddress() promise
// chain resolves without needing a real timer.
async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe("useWallet — persisted-session restore/reconciliation (#692)", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    getAddressMock.mockReset()
    getNetworkMock.mockReset()
    setWalletMock.mockReset()
    getNetworkMock.mockResolvedValue({ network: "TESTNET", networkPassphrase: Networks.TESTNET })
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it("restores the saved address when kit.getAddress() returns a matching address", async () => {
    localStorage.setItem(STORAGE_KEY, WALLET_ADDRESS)
    localStorage.setItem(WALLET_ID_KEY, "freighter")
    getAddressMock.mockResolvedValue({ address: WALLET_ADDRESS })

    const { result } = renderHook(() => useWallet(), { wrapper })

    // Before the mount-time effect resolves, the wallet is not yet restored.
    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)

    await flush()

    expect(result.current.address).toBe(WALLET_ADDRESS)
    expect(result.current.isConnected).toBe(true)
    // Storage is preserved, not cleared.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(WALLET_ADDRESS)
    expect(localStorage.getItem(WALLET_ID_KEY)).toBe("freighter")
    // The kit was told to use the saved wallet id before calling getAddress().
    expect(setWalletMock).toHaveBeenCalledWith("freighter")
  })

  it("clears storage when kit.getAddress() returns a mismatched address", async () => {
    localStorage.setItem(STORAGE_KEY, WALLET_ADDRESS)
    localStorage.setItem(WALLET_ID_KEY, "freighter")
    getAddressMock.mockResolvedValue({ address: OTHER_ADDRESS })

    const { result } = renderHook(() => useWallet(), { wrapper })

    await flush()

    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
    // Both keys must be removed.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(WALLET_ID_KEY)).toBeNull()
  })

  it("clears storage when kit.getAddress() returns an empty address", async () => {
    localStorage.setItem(STORAGE_KEY, WALLET_ADDRESS)
    localStorage.setItem(WALLET_ID_KEY, "freighter")
    getAddressMock.mockResolvedValue({ address: "" })

    const { result } = renderHook(() => useWallet(), { wrapper })

    await flush()

    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(WALLET_ID_KEY)).toBeNull()
  })

  it("clears storage when kit.getAddress() rejects", async () => {
    localStorage.setItem(STORAGE_KEY, WALLET_ADDRESS)
    localStorage.setItem(WALLET_ID_KEY, "freighter")
    getAddressMock.mockRejectedValue(new Error("wallet locked"))

    const { result } = renderHook(() => useWallet(), { wrapper })

    await flush()

    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(WALLET_ID_KEY)).toBeNull()
  })

  it("does nothing when there is no persisted session (no STORAGE_KEY)", async () => {
    // Only WALLET_ID_KEY is set but STORAGE_KEY is absent — should early-return.
    localStorage.setItem(WALLET_ID_KEY, "freighter")
    getAddressMock.mockResolvedValue({ address: WALLET_ADDRESS })

    const { result } = renderHook(() => useWallet(), { wrapper })

    await flush()

    // No restore happens without both keys.
    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
    // getAddress should not have been called because the effect returns early.
    expect(getAddressMock).not.toHaveBeenCalled()
  })

  it("does nothing when there is no persisted session (no WALLET_ID_KEY)", async () => {
    localStorage.setItem(STORAGE_KEY, WALLET_ADDRESS)
    getAddressMock.mockResolvedValue({ address: WALLET_ADDRESS })

    const { result } = renderHook(() => useWallet(), { wrapper })

    await flush()

    expect(result.current.address).toBeNull()
    expect(result.current.isConnected).toBe(false)
    expect(getAddressMock).not.toHaveBeenCalled()
  })
})
