import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { LockCreated } from "@/pages/LockCreated"
import { VALID_CONTRACT_ADDRESS, VALID_PUBLIC_KEY } from "./mocks"

const mockNavigate = vi.fn()

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom")
  return { ...actual, useNavigate: () => mockNavigate }
})

const baseState = {
  lockId: "42",
  lockKind: "token" as const,
  txHash: "abc123",
  tokenAddress: VALID_CONTRACT_ADDRESS,
  tokenSymbol: "USDC",
  amount: "1000",
  beneficiary: VALID_PUBLIC_KEY,
  creator: VALID_PUBLIC_KEY,
  unlockAt: Date.now() + 86400000 * 30,
}

function renderLockCreated(state?: object) {
  return render(
    <HelmetProvider>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[{ pathname: "/app/lock-created", state }]}>
          <LockCreated />
        </MemoryRouter>
      </I18nextProvider>
    </HelmetProvider>,
  )
}

describe("LockCreated", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("redirects to /app/create when there is no router state", () => {
    renderLockCreated()

    expect(mockNavigate).toHaveBeenCalledWith("/app/create", { replace: true })
  })

  it("hides the vesting and created-at rows when those fields are absent", () => {
    renderLockCreated(baseState)

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.queryByText(i18n.t("lockCreated.vesting"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("lockCreated.createdAt"))).not.toBeInTheDocument()
  })

  it("shows the vesting and created-at rows when those fields are provided", () => {
    renderLockCreated({ ...baseState, vesting: true, timestamp: Date.now() })

    expect(screen.getByText(i18n.t("lockCreated.vesting"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("lockCreated.createdAt"))).toBeInTheDocument()
  })
})
