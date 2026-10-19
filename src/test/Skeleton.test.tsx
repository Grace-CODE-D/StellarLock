/**
 * Unit tests for src/components/ui/Skeleton.tsx — #689
 *
 * Skeleton, SkeletonLockCard, SkeletonStatCard, SkeletonLockDetail and
 * SkeletonTokenHeader act as the loading placeholders shown to every user
 * before data arrives (MyLocks.tsx, LockDetail.tsx, Explorer.tsx,
 * Discover.tsx, Analytics.tsx). A structural break would fail silently
 * until manually observed in the browser. These tests render each
 * exported variant and assert it mounts without throwing and contains the
 * expected number of pulse placeholders (`.animate-pulse`).
 */
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import type { ReactNode } from "react"

import {
  Skeleton,
  SkeletonLockCard,
  SkeletonStatCard,
  SkeletonLockDetail,
  SkeletonTokenHeader,
} from "@/components/ui/Skeleton"

/** Counts rendered pulse-placeholder elements (`.animate-pulse`). */
function pulseCount(container: HTMLElement): number {
  return container.querySelectorAll(".animate-pulse").length
}

describe("Skeleton", () => {
  it("renders a single pulse placeholder without throwing", () => {
    const { container } = render(<Skeleton />)

    expect(container.firstChild).toBeInTheDocument()
    expect(pulseCount(container)).toBe(1)
  })

  it("applies the custom className alongside the base classes", () => {
    const { container } = render(<Skeleton className="h-6 w-48" />)

    const first = container.firstChild as HTMLElement
    expect(first).toHaveClass("animate-pulse")
    expect(first).toHaveClass("h-6")
    expect(first).toHaveClass("w-48")
  })
})

describe("SkeletonLockCard", () => {
  it("mounts without throwing", () => {
    const { container } = render(<SkeletonLockCard />)

    expect(container.firstChild).toBeInTheDocument()
  })

  it("renders the expected number of pulse placeholders (11)", () => {
    const { container } = render(<SkeletonLockCard />)

    expect(pulseCount(container)).toBe(11)
  })
})

describe("SkeletonStatCard", () => {
  it("mounts without throwing", () => {
    const { container } = render(<SkeletonStatCard />)

    expect(container.firstChild).toBeInTheDocument()
  })

  it("renders the expected number of pulse placeholders (3)", () => {
    const { container } = render(<SkeletonStatCard />)

    expect(pulseCount(container)).toBe(3)
  })
})

describe("SkeletonLockDetail", () => {
  it("mounts without throwing", () => {
    const { container } = render(<SkeletonLockDetail />)

    expect(container.firstChild).toBeInTheDocument()
  })

  it("renders the expected number of pulse placeholders (16)", () => {
    const { container } = render(<SkeletonLockDetail />)

    // 8 direct placeholders + 4 grid items × 2 each = 16
    expect(pulseCount(container)).toBe(16)
  })
})

describe("SkeletonTokenHeader", () => {
  it("mounts without throwing", () => {
    const { container } = render(<SkeletonTokenHeader />)

    expect(container.firstChild).toBeInTheDocument()
  })

  it("renders the expected number of pulse placeholders (9)", () => {
    const { container } = render(<SkeletonTokenHeader />)

    // 3 direct placeholders + 3 stat columns × 2 each = 9
    expect(pulseCount(container)).toBe(9)
  })
})

describe("Skeleton variants together", () => {
  it("renders all variants without throwing when composed", () => {
    const { container } = render(
      <>
        <SkeletonLockCard />
        <SkeletonStatCard />
        <SkeletonLockDetail />
        <SkeletonTokenHeader />
      </> as ReactNode,
    )

    // 11 + 3 + 16 + 9 = 39
    expect(pulseCount(container)).toBe(39)
  })
})
