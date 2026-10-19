import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import i18n from "@/i18n"
import { HealthPage } from "@/pages/Health"

type FetchOutcome = "ok" | "degraded" | "reject"

// The RPC check hits `${rpcUrl}/health`; the Horizon check hits `${horizonUrl}/`.
function stubFetch({ rpc, horizon }: { rpc: FetchOutcome; horizon: FetchOutcome }) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    const outcome = url.endsWith("/health") ? rpc : horizon
    if (outcome === "reject") return Promise.reject(new TypeError("Failed to fetch"))
    return Promise.resolve(
      outcome === "ok"
        ? { ok: true, status: 200, statusText: "OK" }
        : { ok: false, status: 503, statusText: "Service Unavailable" },
    )
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function setFreighter(present: boolean) {
  const w = window as Window & { freighter?: unknown }
  if (present) w.freighter = {}
  else delete w.freighter
}

async function renderAndWaitForChecks() {
  render(<HealthPage />)
  // Every check renders its own card once Promise.all settles.
  await screen.findByText("Soroban RPC")
  await screen.findByText("Horizon API")
  await screen.findByText("Freighter extension")
}

function overallPill(label: string) {
  const el = screen.getByText(label)
  expect(el.tagName).toBe("SPAN")
  return el
}

describe("HealthPage", () => {
  beforeEach(() => {
    setFreighter(true)
  })

  afterEach(() => {
    setFreighter(false)
    vi.unstubAllGlobals()
  })

  it("reports 'ok' overall when every check is ok", async () => {
    const fetchMock = stubFetch({ rpc: "ok", horizon: "ok" })

    await renderAndWaitForChecks()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(overallPill(i18n.t("health.healthy"))).toHaveClass("bg-emerald-500/15")
    expect(screen.queryByText(i18n.t("health.unhealthy"))).not.toBeInTheDocument()
    expect(screen.getAllByText("200 OK")).toHaveLength(2)
  })

  it("reports 'down' overall when any single check is down", async () => {
    stubFetch({ rpc: "ok", horizon: "reject" })

    await renderAndWaitForChecks()

    expect(overallPill(i18n.t("health.unhealthy"))).toHaveClass("bg-rose-500/15")
    expect(screen.queryByText(i18n.t("health.healthy"))).not.toBeInTheDocument()
  })

  it("reports 'down' over 'degraded' when checks are mixed", async () => {
    stubFetch({ rpc: "degraded", horizon: "reject" })

    await renderAndWaitForChecks()

    expect(overallPill(i18n.t("health.unhealthy"))).toHaveClass("bg-rose-500/15")
  })

  it("reports 'degraded' overall when a check is degraded but none are down", async () => {
    stubFetch({ rpc: "degraded", horizon: "ok" })

    await renderAndWaitForChecks()

    expect(screen.getByText("503 Service Unavailable")).toBeInTheDocument()
    // Degraded shares the amber pill styling, and is neither healthy nor unhealthy.
    expect(overallPill(i18n.t("health.checking"))).toHaveClass("bg-amber-500/15")
    expect(screen.queryByText(i18n.t("health.healthy"))).not.toBeInTheDocument()
    expect(screen.queryByText(i18n.t("health.unhealthy"))).not.toBeInTheDocument()
  })

  it("reports 'degraded' overall when only the Freighter extension is missing", async () => {
    setFreighter(false)
    stubFetch({ rpc: "ok", horizon: "ok" })

    await renderAndWaitForChecks()

    expect(overallPill(i18n.t("health.checking"))).toHaveClass("bg-amber-500/15")
    expect(screen.queryByText(i18n.t("health.healthy"))).not.toBeInTheDocument()
  })

  it("checkUrl reports 'down' with the unreachable label when fetch rejects", async () => {
    stubFetch({ rpc: "reject", horizon: "reject" })

    await renderAndWaitForChecks()

    expect(screen.getAllByText(i18n.t("health.unreachable"))).toHaveLength(2)
    expect(overallPill(i18n.t("health.unhealthy"))).toHaveClass("bg-rose-500/15")
  })
})
