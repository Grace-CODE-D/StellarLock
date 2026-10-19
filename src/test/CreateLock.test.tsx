import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { CreateLock } from "@/pages/CreateLock"
import { mockWallet } from "./mocks"

/**
 * Issue #700: CreateLock's simple/wizard mode toggle and token/LP tab switch
 * have no page-level test — only the inner forms are tested directly.
 *
 * Strategy: render the real CreateLock page behind a connected ConnectGate,
 * with the three heavy form components stubbed so the test only exercises
 * the page's own mode/tab state.
 */

const mockUseWallet = vi.fn()

vi.mock("@/hooks/useWallet", () => ({
  useWallet: () => mockUseWallet() as unknown as Record<string, unknown>,
}))

vi.mock("@/hooks/WalletProvider", () => ({
  WalletProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/components/locks/CreateTokenLockForm", () => ({
  CreateTokenLockForm: () => <div data-testid="token-lock-form" />,
}))

vi.mock("@/components/locks/CreateLpLockForm", () => ({
  CreateLpLockForm: () => <div data-testid="lp-lock-form" />,
}))

vi.mock("@/components/locks/wizard/LockCreationWizard", () => ({
  LockCreationWizard: () => <div data-testid="lock-creation-wizard" />,
}))

describe("CreateLock page", () => {
  beforeEach(() => {
    mockUseWallet.mockReturnValue({ ...mockWallet, isConnected: true, connecting: false })
  })

  it("defaults to simple mode with the token lock form", () => {
    render(<CreateLock />)

    expect(screen.getByRole("button", { name: "Simple" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("tab", { name: "Token Lock" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("token-lock-form")).toBeInTheDocument()
    expect(screen.queryByTestId("lp-lock-form")).not.toBeInTheDocument()
    expect(screen.queryByTestId("lock-creation-wizard")).not.toBeInTheDocument()
  })

  it("renders LockCreationWizard when the wizard toggle is clicked", async () => {
    const user = userEvent.setup()
    render(<CreateLock />)

    await user.click(screen.getByRole("button", { name: "Wizard" }))

    expect(screen.getByRole("button", { name: "Wizard" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Simple" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("lock-creation-wizard")).toBeInTheDocument()
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.queryByTestId("token-lock-form")).not.toBeInTheDocument()
    expect(screen.queryByTestId("lp-lock-form")).not.toBeInTheDocument()
  })

  it("renders CreateLpLockForm instead of the token form when the LP tab is clicked", async () => {
    const user = userEvent.setup()
    render(<CreateLock />)

    await user.click(screen.getByRole("tab", { name: "LP Lock" }))

    expect(screen.getByRole("tab", { name: "LP Lock" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Token Lock" })).toHaveAttribute("aria-selected", "false")
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-lp")
    expect(screen.getByTestId("lp-lock-form")).toBeInTheDocument()
    expect(screen.queryByTestId("token-lock-form")).not.toBeInTheDocument()
  })

  it("returns to the tabbed forms when switching from wizard back to simple", async () => {
    const user = userEvent.setup()
    render(<CreateLock />)

    await user.click(screen.getByRole("tab", { name: "LP Lock" }))
    await user.click(screen.getByRole("button", { name: "Wizard" }))
    await user.click(screen.getByRole("button", { name: "Simple" }))

    expect(screen.queryByTestId("lock-creation-wizard")).not.toBeInTheDocument()
    // Tab selection survives the round-trip through wizard mode.
    expect(screen.getByTestId("lp-lock-form")).toBeInTheDocument()
  })

  it("hides the mode toggle and forms behind ConnectGate when disconnected", () => {
    mockUseWallet.mockReturnValue({ isConnected: false, connecting: false, connect: vi.fn() })
    render(<CreateLock />)

    expect(screen.queryByRole("button", { name: "Wizard" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("token-lock-form")).not.toBeInTheDocument()
  })
})
