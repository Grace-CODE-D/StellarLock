import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { Landing } from "@/pages/Landing"
import { querySiteStats } from "@/lib/queryLocks"
import { formatUsd } from "@/lib/utils"

vi.mock("@/lib/queryLocks", () => ({
  querySiteStats: vi.fn(),
}))

vi.mock("@/components/explorer/TokenSearchBar", () => ({
  TokenSearchBar: () => null,
}))

function renderLanding() {
  return render(
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      </I18nextProvider>
    </HelmetProvider>,
  )
}

describe("Landing stats strip", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders placeholders when querySiteStats rejects", async () => {
    vi.mocked(querySiteStats).mockRejectedValue(new Error("indexer down"))
    renderLanding()

    expect(await screen.findAllByText("—")).toHaveLength(2)
  })

  it("renders the real numbers when querySiteStats resolves", async () => {
    vi.mocked(querySiteStats).mockResolvedValue({ totalValueLocked: 123456, totalLocks: 789 } as never)
    renderLanding()

    expect(await screen.findByText(formatUsd(123456))).toBeInTheDocument()
    expect(screen.getByText("789")).toBeInTheDocument()
    expect(screen.queryByText("—")).not.toBeInTheDocument()
  })
})
