import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HelmetProvider } from "react-helmet-async"
import i18n from "@/i18n"
import { History } from "@/pages/History"
import type { TransactionRecord } from "@/types/transaction"

vi.mock("@/lib/transaction-history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/transaction-history")>()
  return {
    ...actual,
    getTransactions: vi.fn(),
    refreshPendingStatuses: vi.fn(),
    clearTransactions: vi.fn(),
  }
})

const { getTransactions, refreshPendingStatuses, clearTransactions } = await import(
  "@/lib/transaction-history"
)
const mockGetTransactions = getTransactions as ReturnType<typeof vi.fn>
const mockRefreshPendingStatuses = refreshPendingStatuses as ReturnType<typeof vi.fn>
const mockClearTransactions = clearTransactions as ReturnType<typeof vi.fn>

function makeRecord(prefix: string, overrides: Partial<TransactionRecord>): TransactionRecord {
  return {
    hash: prefix.padEnd(64, "0"),
    type: "create_lock",
    status: "success",
    timestamp: Date.now(),
    network: "testnet",
    ...overrides,
  }
}

const CREATE_OK = makeRecord("createok", { type: "create_lock", status: "success" })
const CREATE_FAIL = makeRecord("createfl", { type: "create_lock", status: "failed" })
const WITHDRAW_OK = makeRecord("withdrok", { type: "withdraw", status: "success" })
const EXTEND_PENDING = makeRecord("extendpd", { type: "extend", status: "pending" })
const RECORDS = [CREATE_OK, CREATE_FAIL, WITHDRAW_OK, EXTEND_PENDING]

// Mirrors TxRow's truncated hash display.
function shortHash(record: TransactionRecord) {
  return `${record.hash.slice(0, 8)}…${record.hash.slice(-6)}`
}

function expectVisible(visible: TransactionRecord[]) {
  for (const record of RECORDS) {
    if (visible.includes(record)) {
      expect(screen.getByText(shortHash(record))).toBeInTheDocument()
    } else {
      expect(screen.queryByText(shortHash(record))).not.toBeInTheDocument()
    }
  }
}

async function renderHistory(records: TransactionRecord[]) {
  mockGetTransactions.mockReturnValue(records)
  mockRefreshPendingStatuses.mockResolvedValue(records)
  render(
    <HelmetProvider>
      <History />
    </HelmetProvider>,
  )
  // Wait for the mount-time refreshPendingStatuses() to settle.
  await waitFor(() => expect(screen.queryByText("Checking statuses…")).not.toBeInTheDocument())
}

describe("History page", () => {
  beforeEach(() => {
    mockGetTransactions.mockReset()
    mockRefreshPendingStatuses.mockReset()
    mockClearTransactions.mockReset()
  })

  it("lists every seeded record when no filters are applied", async () => {
    await renderHistory(RECORDS)

    expectVisible(RECORDS)
    expect(screen.getAllByRole("button", { name: i18n.t("history.copyHash") })).toHaveLength(4)
  })

  it("narrows the list by type filter", async () => {
    const user = userEvent.setup()
    await renderHistory(RECORDS)

    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterType")), "create_lock")
    expectVisible([CREATE_OK, CREATE_FAIL])

    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterType")), "withdraw")
    expectVisible([WITHDRAW_OK])
  })

  it("narrows the list by status filter", async () => {
    const user = userEvent.setup()
    await renderHistory(RECORDS)

    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterStatus")), "success")
    expectVisible([CREATE_OK, WITHDRAW_OK])

    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterStatus")), "pending")
    expectVisible([EXTEND_PENDING])
  })

  it("applies type and status filters together", async () => {
    const user = userEvent.setup()
    await renderHistory(RECORDS)

    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterType")), "create_lock")
    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterStatus")), "failed")

    expectVisible([CREATE_FAIL])
  })

  it("shows the filtered-to-empty message when filters exclude every record", async () => {
    const user = userEvent.setup()
    await renderHistory(RECORDS)

    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterType")), "withdraw")
    await user.selectOptions(screen.getByLabelText(i18n.t("history.filterStatus")), "failed")

    expectVisible([])
    expect(screen.getByRole("heading", { name: "No results match your filters" })).toBeInTheDocument()
    expect(screen.getByText("Try changing the type or status filter.")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: i18n.t("history.empty") })).not.toBeInTheDocument()
    // Filters and Clear all stay available since records still exist.
    expect(screen.getByLabelText(i18n.t("history.filterType"))).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Clear all/ })).toBeInTheDocument()
  })

  it("shows the no-transactions message when there are no records", async () => {
    await renderHistory([])

    expect(screen.getByRole("heading", { name: i18n.t("history.empty") })).toBeInTheDocument()
    expect(screen.getByText(i18n.t("history.emptyDesc"))).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "No results match your filters" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText(i18n.t("history.filterType"))).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Clear all/ })).not.toBeInTheDocument()
  })

  it("clears all records via Clear all", async () => {
    const user = userEvent.setup()
    await renderHistory(RECORDS)

    await user.click(screen.getByRole("button", { name: /Clear all/ }))

    expect(mockClearTransactions).toHaveBeenCalledTimes(1)
    expectVisible([])
    expect(screen.getByRole("heading", { name: i18n.t("history.empty") })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Clear all/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(i18n.t("history.filterType"))).not.toBeInTheDocument()
  })
})
