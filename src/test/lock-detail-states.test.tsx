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
import { mockWallet } from "./mocks"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockWallet,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/hooks/useLocks", () => ({
  useLock: vi.fn(),
}))

function renderLockDetail() {
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

describe("LockDetail loading and not-found states", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the skeleton while loading", () => {
    vi.mocked(useLock).mockReturnValue({ data: null, loading: true, error: null, reload: vi.fn() } as never)
    const { container } = renderLockDetail()

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument()
    expect(screen.getByText(i18n.t("lockDetail.backToLocks"))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t("lockDetail.notFoundTitle"))).not.toBeInTheDocument()
  })

  it("renders the not-found panel when useLock returns an error", () => {
    vi.mocked(useLock).mockReturnValue({
      data: null,
      loading: false,
      error: new Error("not found"),
      reload: vi.fn(),
    } as never)
    renderLockDetail()

    expect(screen.getByText(i18n.t("lockDetail.notFoundTitle"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: i18n.t("lockDetail.backToLocks") })).toHaveAttribute("href", "/app/locks")
  })

  it("renders the not-found panel when useLock returns no data", () => {
    vi.mocked(useLock).mockReturnValue({ data: null, loading: false, error: null, reload: vi.fn() } as never)
    renderLockDetail()

    expect(screen.getByText(i18n.t("lockDetail.notFoundTitle"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: i18n.t("lockDetail.backToLocks") })).toHaveAttribute("href", "/app/locks")
  })
})
