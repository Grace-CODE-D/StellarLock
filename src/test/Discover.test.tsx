import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import i18n from "@/i18n"
import { Discover } from "@/pages/Discover"
import type { DiscoverStats } from "@/hooks/useLocks"
import { mockLock, VALID_CONTRACT_ADDRESS } from "./mocks"

vi.mock("@/hooks/useLocks", () => ({
  useDiscoverStats: vi.fn(),
}))

// Keep the page under test isolated from children that do their own fetching.
vi.mock("@/components/explorer/TokenSearchBar", () => ({
  TokenSearchBar: () => <div data-testid="token-search-bar" />,
}))
vi.mock("@/components/discover/RecentActivity", () => ({
  RecentActivity: () => <div data-testid="recent-activity" />,
}))
vi.mock("@/components/ui/TokenAvatar", () => ({
  TokenAvatar: ({ symbol }: { symbol: string }) => <span aria-hidden>{symbol}</span>,
}))

const { useDiscoverStats } = await import("@/hooks/useLocks")
const mockUseDiscoverStats = useDiscoverStats as ReturnType<typeof vi.fn>

function makeStats(overrides: Partial<DiscoverStats> = {}): DiscoverStats {
  return {
    source: "indexer",
    totalLocks: 0,
    totalValueLocked: 0,
    uniqueTokens: 0,
    recentLocks: [],
    upcomingUnlocks: [],
    tokenGroups: [],
    ...overrides,
  }
}

function renderDiscover() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Discover />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe("Discover page", () => {
  beforeEach(() => {
    mockUseDiscoverStats.mockReset()
  })

  it("renders skeleton placeholders while loading", () => {
    mockUseDiscoverStats.mockReturnValue({ data: null, loading: true, error: null })

    const { container } = renderDiscover()

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
    expect(screen.queryByText(i18n.t("discover.totalLocks"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("discover.noRecentLocks"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("discover.noUpcomingUnlocks"))).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("renders empty states and no featured-tokens section when loaded with empty arrays", () => {
    mockUseDiscoverStats.mockReturnValue({ data: makeStats(), loading: false, error: null })

    const { container } = renderDiscover()

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0)
    expect(screen.getByText(i18n.t("discover.totalLocks"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("discover.noRecentLocks"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("discover.noUpcomingUnlocks"))).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: i18n.t("discover.featuredTokens") }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("renders recent lock, upcoming unlock and featured token links when loaded with data", () => {
    const recent = { ...mockLock, id: "11" }
    const upcoming = { ...mockLock, id: "22", kind: "lp" as const }
    mockUseDiscoverStats.mockReturnValue({
      data: makeStats({
        totalLocks: 2,
        uniqueTokens: 1,
        recentLocks: [recent],
        upcomingUnlocks: [upcoming],
        tokenGroups: [{ token: mockLock.token, count: 2, totalValue: 2000 }],
      }),
      loading: false,
      error: null,
    })

    const { container } = renderDiscover()

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0)
    expect(screen.queryByText(i18n.t("discover.noRecentLocks"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("discover.noUpcomingUnlocks"))).not.toBeInTheDocument()

    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"))
    expect(hrefs).toContain("/app/lock/token/11")
    expect(hrefs).toContain("/app/lock/lp/22")
    expect(hrefs).toContain(`/explore/${VALID_CONTRACT_ADDRESS}`)

    expect(
      screen.getByRole("heading", { name: i18n.t("discover.featuredTokens") }),
    ).toBeInTheDocument()
    expect(screen.getByText("2 locks")).toBeInTheDocument()
  })
})
