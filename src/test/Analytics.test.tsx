import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import { render } from "./utils"
import { Analytics } from "@/pages/Analytics"
import { getLockVolumeByDay, getTvlOverTime } from "@/lib/dashboardStats"
import { mockLock } from "./mocks"

/**
 * Issue #699: Analytics dedupes recentLocks + upcomingUnlocks by id before
 * building chart series, and swaps the three charts for a "noData" card when
 * there are no locks. Neither branch had a test.
 *
 * Strategy: mock useDiscoverStats, and wrap the real dashboardStats series
 * builders in spies so the test can inspect exactly which locks were plotted.
 */

const mockUseDiscoverStats = vi.fn()

vi.mock("@/hooks/useLocks", () => ({
  useDiscoverStats: () => mockUseDiscoverStats() as unknown as Record<string, unknown>,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/lib/dashboardStats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dashboardStats")>()
  return {
    ...actual,
    getTvlOverTime: vi.fn(actual.getTvlOverTime),
    getLockVolumeByDay: vi.fn(actual.getLockVolumeByDay),
  }
})

// jsdom has no layout (or ResizeObserver), so give charts a fixed-size box
// instead of Recharts' measuring ResponsiveContainer.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  }
})

const mockGetTvlOverTime = vi.mocked(getTvlOverTime)
const mockGetLockVolumeByDay = vi.mocked(getLockVolumeByDay)

const NO_DATA = "No lock activity to display yet."

function stats(overrides: Record<string, unknown> = {}) {
  return {
    source: "indexer" as const,
    totalLocks: 0,
    totalValueLocked: 0,
    uniqueTokens: 0,
    recentLocks: [],
    upcomingUnlocks: [],
    tokenGroups: [],
    ...overrides,
  }
}

describe("Analytics page", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the noData card instead of the charts when totalLocks is 0", () => {
    mockUseDiscoverStats.mockReturnValue({ data: stats(), loading: false, error: null })

    render(<Analytics />)

    expect(screen.getByText(NO_DATA)).toBeInTheDocument()
    expect(screen.queryByText("TVL Over Time")).not.toBeInTheDocument()
  })

  it("does not show the noData card while stats are still loading", () => {
    mockUseDiscoverStats.mockReturnValue({ data: null, loading: true, error: null })

    render(<Analytics />)

    expect(screen.queryByText(NO_DATA)).not.toBeInTheDocument()
  })

  it("plots a lock present in both recentLocks and upcomingUnlocks only once", () => {
    const shared = { ...mockLock, id: "shared", usdValue: 500 }
    const recentOnly = { ...mockLock, id: "recent-only", usdValue: 200 }
    const upcomingOnly = { ...mockLock, id: "upcoming-only", usdValue: 300 }

    mockUseDiscoverStats.mockReturnValue({
      data: stats({
        totalLocks: 3,
        totalValueLocked: 1000,
        uniqueTokens: 1,
        recentLocks: [shared, recentOnly],
        upcomingUnlocks: [shared, upcomingOnly],
        tokenGroups: [{ token: mockLock.token, count: 3, totalValue: 1000 }],
      }),
      loading: false,
      error: null,
    })

    render(<Analytics />)

    expect(screen.queryByText(NO_DATA)).not.toBeInTheDocument()
    expect(screen.getByText("TVL Over Time")).toBeInTheDocument()

    const tvlInput = mockGetTvlOverTime.mock.calls.at(-1)?.[0] ?? []
    const volumeInput = mockGetLockVolumeByDay.mock.calls.at(-1)?.[0] ?? []

    expect(tvlInput.map((l) => l.id)).toEqual(["shared", "recent-only", "upcoming-only"])
    expect(volumeInput.map((l) => l.id)).toEqual(["shared", "recent-only", "upcoming-only"])

    // All three locks share a createdAt day, so the series collapses to one
    // point whose value would be inflated if "shared" were counted twice.
    const tvlSeries = mockGetTvlOverTime.mock.results.at(-1)?.value as { tvl: number }[]
    const volumeSeries = mockGetLockVolumeByDay.mock.results.at(-1)?.value as { count: number }[]
    expect(tvlSeries.at(-1)?.tvl).toBe(1000)
    expect(volumeSeries.reduce((sum, p) => sum + p.count, 0)).toBe(3)
  })
})
