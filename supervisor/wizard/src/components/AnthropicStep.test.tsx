import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnthropicStep } from "./AnthropicStep";

describe("AnthropicStep", () => {
  it("shows API key and login side by side", () => {
    render(
      <AnthropicStep
        status="idle"
        onSubmitKey={() => {}}
        onStartLogin={() => {}}
      />,
    );
    expect(screen.getByLabelText("Anthropic API Key")).toBeDefined();
    expect(screen.getByText("Validate Key")).toBeDefined();
    expect(screen.getByText("Sign in with Anthropic")).toBeDefined();
  });

  it("shows completed state", () => {
    const onSignOut = vi.fn();
    render(
      <AnthropicStep
        status="complete"
        onSubmitKey={() => {}}
        onStartLogin={() => {}}
        onSignOut={onSignOut}
      />,
    );
    expect(screen.getByText("Anthropic: authenticated")).toBeDefined();
    expect(screen.getByText("Sign Out")).toBeDefined();
  });

  it("shows error with retry", async () => {
    const onStartLogin = vi.fn();
    render(
      <AnthropicStep
        status="error"
        error="Invalid key"
        onSubmitKey={() => {}}
        onStartLogin={onStartLogin}
      />,
    );
    expect(screen.getByText("Invalid key")).toBeDefined();
    await userEvent.click(screen.getByText("Try again"));
    expect(onStartLogin).toHaveBeenCalled();
  });

  it("disables inputs during validation", () => {
    render(
      <AnthropicStep
        status="validating"
        onSubmitKey={() => {}}
        onStartLogin={() => {}}
      />,
    );
    const input = screen.getByLabelText("Anthropic API Key") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText("Validating...")).toBeDefined();
  });
});
