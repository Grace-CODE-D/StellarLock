import { createRef } from "react"
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Input, Label } from "@/components/ui/Input"

describe("Input", () => {
  it("forwards its ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>()

    render(<Input ref={ref} aria-label="Token name" />)

    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Token name" }))
  })

  it("applies the disabled attribute and styling when disabled", () => {
    render(<Input disabled aria-label="Token name" />)

    const input = screen.getByRole("textbox", { name: "Token name" })
    expect(input).toBeDisabled()
    expect(input).toHaveClass("disabled:opacity-50")
  })
})

describe("Label", () => {
  it("renders its children and associates with the given input", () => {
    render(
      <>
        <Label htmlFor="token-name">Token name</Label>
        <Input id="token-name" />
      </>,
    )

    const label = screen.getByText("Token name")
    expect(label).toHaveAttribute("for", "token-name")
    expect(screen.getByLabelText("Token name")).toBe(screen.getByRole("textbox"))
  })
})
