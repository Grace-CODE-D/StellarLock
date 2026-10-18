import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter, Routes, Route } from "react-router-dom"
import i18n from "@/i18n"
import { AnnouncerProvider } from "@/hooks/AnnouncerProvider"
import { LockDetail } from "@/pages/LockDetail"
import { useLock } from "@/hooks/useLocks"
import { mockLock, mockWallet, VALID_PUBLIC_KEY } from "./mocks"

const OTHER_ADDRESS = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const THIRD_ADDRESS = "GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC"

const unlockedLock = { ...mockLock, unlockAt: Date.now() - 86400000, metadata: {} }
const stillLockedLock = { ...mockLock, unlockAt: Date.now() + 86400000 * 30, metadata: {} }

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useLocks", () => ({
  useLock: vi.fn(),
}))

vi.mock("@/hooks/useVerifiedToken", () => ({
  useVerifiedToken: () => true,
}))

vi.mock("@/lib/token-locker", () => ({
  withdrawLock: vi.fn(),
  extendLock: vi.fn(),
  transferBeneficiary: vi.fn(),
}))

vi.mock("@/lib/lp-locker", () => ({
  withdrawLpLock: vi.fn(),
  extendLpLock: vi.fn(),
  transferLpBeneficiary: vi.fn(),
}))

vi.mock("@/lib/pdf-report", () => ({
  downloadLockReport: vi.fn(),
}))

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}))

function renderWithLock(lock: object) {
  vi.mocked(useLock).mockReturnValue({ data: lock, loading: false, error: null, reload: vi.fn() } as never)
  return render(
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/app/lock/token/1"]}>
          <AnnouncerProvider>
            <Routes>
              <Route path="/app/lock/token/:id" element={<LockDetail />} />
            </Routes>
          </AnnouncerProvider>
        </MemoryRouter>
      </I18nextProvider>
    </HelmetProvider>,
  )
}

const withdrawButton = () => screen.queryByRole("button", { name: i18n.t("lockDetail.withdraw") })
const extendButton = () => screen.queryByRole("button", { name: i18n.t("lockDetail.extendLock") })
const transferButton = () => screen.queryByRole("button", { name: i18n.t("lockDetail.transferBeneficiary") })

describe("LockDetail permission-gated action buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows only Extend when the wallet is the creator but not the beneficiary", () => {
    renderWithLock({ ...unlockedLock, creator: VALID_PUBLIC_KEY, beneficiary: OTHER_ADDRESS })

    expect(extendButton()).toBeInTheDocument()
    expect(withdrawButton()).not.toBeInTheDocument()
    expect(transferButton()).not.toBeInTheDocument()
  })

  it("shows Withdraw and Transfer when the wallet is the beneficiary but not the creator", () => {
    renderWithLock({ ...unlockedLock, creator: OTHER_ADDRESS, beneficiary: VALID_PUBLIC_KEY })

    expect(withdrawButton()).toBeInTheDocument()
    expect(transferButton()).toBeInTheDocument()
    expect(extendButton()).not.toBeInTheDocument()
  })

  it("shows no action buttons when the wallet is neither creator nor beneficiary", () => {
    renderWithLock({ ...unlockedLock, creator: OTHER_ADDRESS, beneficiary: THIRD_ADDRESS })

    expect(withdrawButton()).not.toBeInTheDocument()
    expect(extendButton()).not.toBeInTheDocument()
    expect(transferButton()).not.toBeInTheDocument()
  })

  it("hides Withdraw for an owner while the lock is still locked", () => {
    renderWithLock({ ...stillLockedLock, creator: VALID_PUBLIC_KEY, beneficiary: VALID_PUBLIC_KEY })

    expect(withdrawButton()).not.toBeInTheDocument()
    expect(extendButton()).toBeInTheDocument()
    expect(transferButton()).toBeInTheDocument()
  })
})
