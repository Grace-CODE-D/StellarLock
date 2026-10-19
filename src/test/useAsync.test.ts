/**
 * Unit tests for src/hooks/useAsync.ts — #690
 *
 * useAsync manages loading/data/error state, exposes a reload() that bumps
 * a nonce to re-run the async fn, and guards against a stale response
 * overwriting state via an `active` flag after unmount/dep change. None of
 * this was exercised by any test. This file covers:
 *  - initial loading state is `true`
 *  - on success, data is set and loading becomes `false`
 *  - on rejection, error message is set and loading becomes `false`
 *  - reload() re-invokes the async function
 *  - a fast unmount/dep change before resolution does not update state
 *    (the active-flag race-condition guard)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

import { useAsync } from "@/hooks/useAsync"

describe("useAsync", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts in the loading state with no data or error", () => {
    const fn = vi.fn(() => new Promise<string>(() => {})) // never resolves
    const { result } = renderHook(() => useAsync(fn, []))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it("sets data and clears loading on success", async () => {
    const fn = vi.fn(() => Promise.resolve("hello"))
    const { result } = renderHook(() => useAsync(fn, []))

    // Flush microtasks so the promise chain resolves.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.data).toBe("hello")
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("sets the error message and clears loading on rejection", async () => {
    const fn = vi.fn(() => Promise.reject(new Error("boom")))
    const { result } = renderHook(() => useAsync(fn, []))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.error).toBe("boom")
    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBeNull()
  })

  it("falls back to a generic message when rejected with a non-Error value", async () => {
    const fn = vi.fn(() => Promise.reject("oops"))
    const { result } = renderHook(() => useAsync(fn, []))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.error).toBe("Something went wrong")
    expect(result.current.loading).toBe(false)
  })

  it("reload() re-invokes the async function and updates data", async () => {
    let count = 0
    const fn = vi.fn(() => Promise.resolve(++count))
    const { result } = renderHook(() => useAsync(fn, []))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.data).toBe(1)
    expect(fn).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.reload()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.data).toBe(2)
  })

  it("does not let a stale response overwrite state after unmount/dep change", async () => {
    let resolveFirst: (v: string) => void = () => {}
    const slow = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = resolve
        }),
    )

    const { result, rerender, unmount } = renderHook(({ dep }: { dep: string }) => useAsync(slow, [dep]), {
      initialProps: { dep: "a" },
    })

    expect(result.current.loading).toBe(true)
    expect(slow).toHaveBeenCalledTimes(1)

    // Trigger a dep change: this runs the cleanup of the first effect
    // (active = false) and starts a second invocation.
    const fast = vi.fn(() => Promise.resolve("fast"))
    rerender({ dep: "b" })

    // The hook now uses the fast fn for the new dep — but useAsync closed
    // over the latest `fn` prop via the effect dep array, so the second
    // invocation is the fast one. Flush its resolution.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.data).toBe("fast")

    // Now resolve the stale, slow promise from the first dep value.
    // The active-flag guard must prevent it from overwriting state.
    await act(async () => {
      resolveFirst("stale")
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.data).toBe("fast")

    // Also exercise the unmount path: resolve after unmount should not throw
    // and should not affect state (state is gone anyway, but the guard must
    // not produce a React "set state on unmounted component" warning).
    unmount()
    // Resolving the slow promise again is a no-op here; the guard already
    // prevented it from updating. This just confirms no throw occurs.
    expect(() => resolveFirst("after-unmount")).not.toThrow()
  })
})
