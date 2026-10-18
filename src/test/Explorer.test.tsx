import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import i18n from "@/i18n"
import { Explorer } from "@/pages/Explorer"
import type { TokenLockSummary } from "@/types/lock"
import { mockLock, VALID_CONTRACT_ADDRESS } from "./mocks"

vi.mock("@/hooks/useLocks", () => ({
  useLocksByToken: vi.fn(),
  useLockCountByToken: vi.fn(),
}))

// Keep the page under test isolated from children that do their own fetching.
vi.mock("@/components/explorer/TokenSearchBar", () => ({
  TokenSearchBar: () => <div data-testid="token-search-bar" />,
}))
vi.mock("@/components/explorer/TokenLockList", () => ({
  TokenLockList: ({ locks }: { locks: unknown[] }) => (
    <div data-testid="token-lock-list">{locks.length} locks</div>
  ),
}))
vi.mock("@/components/explorer/LockBadge", () => ({
  LockBadge: () => <div data-testid="lock-badge" />,
}))
vi.mock("@/components/ui/TokenAvatar", () => ({
  TokenAvatar: ({ symbol }: { symbol: string }) => <span aria-hidden>{symbol}</span>,
}))

const { useLocksByToken, useLockCountByToken } = await import("@/hooks/useLocks")
const mockUseLocksByToken = useLocksByToken as ReturnType<typeof vi.fn>
const mockUseLockCountByToken = useLockCountByToken as ReturnType<typeof vi.fn>

const summary: TokenLockSummary = {
  token: mockLock.token,
  totalLocked: 2000,
  totalUsdValue: 2000,
  activeLocks: 2,
  nextUnlockAt: mockLock.unlockAt,
  locks: [mockLock, { ...mockLock, id: "2" }],
}

function renderExplorer() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/explore/${VALID_CONTRACT_ADDRESS}`]}>
        <Routes>
          <Route path="/explore/:token" element={<Explorer />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  )
}

function expectNoDataView() {
  expect(screen.queryByText(i18n.t("explorer.verifiedLocked"))).not.toBeInTheDocument()
  expect(screen.queryByTestId("token-lock-list")).not.toBeInTheDocument()
}

describe("Explorer page", () => {
  beforeEach(() => {
    mockUseLocksByToken.mockReset()
    mockUseLockCountByToken.mockReset()
    mockUseLockCountByToken.mockReturnValue({ data: 2, loading: false, error: null })
  })

  it("queries locks for the token in the route", () => {
    mockUseLocksByToken.mockReturnValue({ data: null, loading: true, error: null })

    renderExplorer()

    expect(mockUseLocksByToken).toHaveBeenCalledWith(VALID_CONTRACT_ADDRESS, 0, 20)
    expect(mockUseLockCountByToken).toHaveBeenCalledWith(VALID_CONTRACT_ADDRESS)
  })

  it("renders the skeleton while loading", () => {
    mockUseLocksByToken.mockReturnValue({ data: null, loading: true, error: null })

    const { container } = renderExplorer()

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
    expect(
      screen.queryByRole("heading", { name: i18n.t("explorer.noLocksTitle") }),
    ).not.toBeInTheDocument()
    expectNoDataView()
  })

  it("renders the not-found panel when the query errors", () => {
    mockUseLocksByToken.mockReturnValue({ data: null, loading: false, error: new Error("boom") })

    const { container } = renderExplorer()

    expect(
      screen.getByRole("heading", { name: i18n.t("explorer.noLocksTitle") }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: i18n.t("explorer.createLock") })).toHaveAttribute(
      "href",
      "/app/create",
    )
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0)
    expectNoDataView()
  })

  it("renders the not-found panel when there is no data", () => {
    mockUseLocksByToken.mockReturnValue({ data: null, loading: false, error: null })

    renderExplorer()

    expect(
      screen.getByRole("heading", { name: i18n.t("explorer.noLocksTitle") }),
    ).toBeInTheDocument()
    expectNoDataView()
  })

  it("renders the full token header, stats and lock list on success", () => {
    mockUseLocksByToken.mockReturnValue({ data: summary, loading: false, error: null })

    const { container } = renderExplorer()

    expect(screen.getByRole("heading", { level: 1, name: "USD Coin" })).toBeInTheDocument()
    expect(screen.getByText(i18n.t("explorer.verifiedLocked"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("explorer.activeLocks"))).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: i18n.t("explorer.allLocks", { count: 2 }) }),
    ).toBeInTheDocument()
    expect(screen.getByTestId("token-lock-list")).toHaveTextContent("2 locks")
    expect(
      screen.queryByRole("heading", { name: i18n.t("explorer.noLocksTitle") }),
    ).not.toBeInTheDocument()
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0)
  })
})
