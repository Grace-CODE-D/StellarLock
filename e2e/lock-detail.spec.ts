import { test, expect, type Page } from "@playwright/test"
import { xdr } from "@stellar/stellar-sdk"
import { holdRequests } from "./hold-requests"
import { LockDetailPage } from "./pages/lock-detail.page"
import { RPC_URL, mockSorobanRpc, scLock } from "./rpc-mock"
import { MOCK_WALLET_ADDRESS, mockConnectedWallet } from "./wallet-mock"

const DAY_SECS = 86_400
const nowSecs = Math.floor(Date.now() / 1000)

// Mock token metadata (see rpc-mock DEFAULT_RESULTS) gives this the symbol MOCK.
const MOCK_LOCK = scLock({
  id: 1,
  token: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
  amount: 1000,
  creator: MOCK_WALLET_ADDRESS,
  beneficiary: MOCK_WALLET_ADDRESS,
  unlockAt: nowSecs + 30 * DAY_SECS,
  createdAt: nowSecs - DAY_SECS,
})

// A lock whose unlock date is in the past — the frontend classifies this as
// "unlockable" and shows the Withdraw button to the beneficiary.
const PAST_LOCK = scLock({
  id: 2,
  token: "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR",
  amount: 500,
  creator: MOCK_WALLET_ADDRESS,
  beneficiary: MOCK_WALLET_ADDRESS,
  unlockAt: nowSecs - DAY_SECS,   // already past → "unlockable"
  createdAt: nowSecs - 31 * DAY_SECS,
})

/** Serves lock #2 (unlockable) from get_lock; any other id fails. */
function mockLockTwo(page: Page) {
  return mockSorobanRpc(page, {
    results: {
      get_lock: (args) => (args[0].u64().toString() === "2" ? PAST_LOCK : null),
      // withdraw returns void — scvVoid is the correct no-value sentinel.
      withdraw: xdr.ScVal.scvVoid(),
    },
  })
}

/** Serves lock #1 from get_lock; any other id fails, as a missing lock does on-chain. */
function mockLockOne(page: Page) {
  return mockSorobanRpc(page, {
    results: {
      get_lock: (args) => (args[0].u64().toString() === "1" ? MOCK_LOCK : null),
      // extend returns void.
      extend: xdr.ScVal.scvVoid(),
      // transfer_beneficiary returns void.
      transfer_beneficiary: xdr.ScVal.scvVoid(),
    },
  })
}

test.describe("Lock Detail Page", () => {
  test("Lock detail page shows skeleton while loading", async ({ page }) => {
    await mockLockOne(page)
    const release = await holdRequests(page, RPC_URL)
    const detail = new LockDetailPage(page)
    await detail.goto("1")
    await expect(detail.loadingSkeleton()).toBeVisible()
    await expect(detail.tokenHeading("MOCK")).toHaveCount(0)

    release()
    await expect(detail.tokenHeading("MOCK")).toBeVisible()
    await expect(detail.loadingSkeleton()).toHaveCount(0)
  })

  test("Lock information displays after loading", async ({ page }) => {
    await mockLockOne(page)
    const detail = new LockDetailPage(page)
    await detail.goto("1")
    await expect(detail.tokenHeading("MOCK")).toBeVisible()
    await expect(detail.field("Locked amount")).toContainText(/1,000\s+MOCK/)
    await expect(detail.field("Lock ID")).toContainText("#1")
    await expect(detail.notFoundHeading()).toHaveCount(0)
    // MOCK_LOCK has a future unlock date, so its status badge should read "Locked".
    expect(await detail.getStatus()).toBe("Locked")
  })

  test("Back button navigation works", async ({ page }) => {
    await mockLockOne(page)
    const detail = new LockDetailPage(page)
    await page.goto("/app/history")
    await detail.goto("1")
    await expect(detail.tokenHeading("MOCK")).toBeVisible()
    await detail.clickBack()
    await expect(page).toHaveURL(/\/app\/history$/)
  })

  test("Responsive layout on mobile viewport", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    })
    const page = await context.newPage()
    await mockLockOne(page)
    const detail = new LockDetailPage(page)
    await detail.goto("1")
    await expect(detail.tokenHeading("MOCK")).toBeVisible()
    await expect(detail.field("Locked amount")).toBeInViewport({ ratio: 1 })
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflows).toBe(false)
    await context.close()
  })

  test("Shows error for invalid lock ID", async ({ page }) => {
    await mockLockOne(page)
    const detail = new LockDetailPage(page)
    await detail.goto("invalid-id")
    await expect(detail.notFoundHeading()).toBeVisible()
    await expect(page.getByText("We couldn't find a lock with id #invalid-id.")).toBeVisible()
  })

  test("Withdraw button submits transaction and status becomes Withdrawn", async ({ page }) => {
    // Set up the mocked wallet before navigation so addInitScript fires in time.
    await mockConnectedWallet(page)
    const invoked = await mockLockTwo(page)
    const detail = new LockDetailPage(page)
    await detail.goto("2")
    await expect(detail.tokenHeading("MOCK")).toBeVisible()
    // The lock is past its unlock date, so the badge starts as "Unlockable".
    expect(await detail.getStatus()).toBe("Unlockable")
    // The Withdraw button is visible because the connected wallet is the beneficiary.
    await expect(page.getByRole("button", { name: /Withdraw/i })).toBeVisible()
    await detail.clickWithdraw()
    // The optimistic update flips the badge to "Withdrawn" immediately, before
    // the RPC round-trip completes.
    await expect(page.getByText("Withdrawn")).toBeVisible()
    expect(await detail.getStatus()).toBe("Withdrawn")
    // Confirm the "withdraw" contract function was actually invoked via the RPC mock.
    expect(invoked).toContain("withdraw")
  })

  test("Extend button opens panel and submits transaction with new unlock date", async ({ page }) => {
    await mockConnectedWallet(page)
    const invoked = await mockLockOne(page)
    const detail = new LockDetailPage(page)
    await detail.goto("1")
    await expect(detail.tokenHeading("MOCK")).toBeVisible()
    // Lock #1 has a future unlock date — status is "Locked".
    expect(await detail.getStatus()).toBe("Locked")
    // The Extend button is visible because the connected wallet is the creator.
    await expect(page.getByRole("button", { name: /Extend/i })).toBeVisible()
    await detail.clickExtend()
    // The inline extend panel should now be visible.
    await expect(page.getByRole("region", { name: /Extend/i })).toBeVisible()
    // Pick a date strictly after the current unlock date (60 days from now).
    const newUnlock = new Date((nowSecs + 60 * DAY_SECS) * 1000).toISOString().split("T")[0]
    await page.fill("#new-unlock", newUnlock)
    await page.getByRole("button", { name: /Confirm Extension/i }).click()
    // After confirmation the panel closes and the "extend" contract function was called.
    await expect(page.getByRole("region", { name: /Extend/i })).toHaveCount(0)
    expect(invoked).toContain("extend")
  })

  test("Beneficiary can transfer the lock and sees the updated UI", async ({ page }) => {
    const newBeneficiary = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF"
    await mockConnectedWallet(page)
    const invoked = await mockLockOne(page)
    const detail = new LockDetailPage(page)
    await detail.goto("1")
    await expect(detail.tokenHeading("MOCK")).toBeVisible()

    // The connected wallet is MOCK_LOCK's beneficiary, so it can transfer the lock.
    await expect(page.getByRole("button", { name: /Transfer beneficiary/i })).toBeVisible()
    await page.getByRole("button", { name: /Transfer beneficiary/i }).click()
    const transferPanel = page.getByRole("region", { name: /Transfer beneficiary/i })
    await expect(transferPanel).toBeVisible()
    await page.getByLabel(/New beneficiary address/i).fill(newBeneficiary)
    await page.getByRole("button", { name: /Confirm transfer/i }).click()

    // A successful transfer closes the panel and announces the updated state.
    await expect(transferPanel).toHaveCount(0)
    await expect(page.locator('[role="status"][aria-live="polite"]')).toContainText("Beneficiary transferred.")
    expect(invoked).toContain("transfer_beneficiary")
  })
})
