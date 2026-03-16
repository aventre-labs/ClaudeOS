import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuildProgress } from "./BuildProgress";

describe("BuildProgress", () => {
  it("renders nothing in idle state", () => {
    const { container } = render(<BuildProgress status="idle" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders progress bar during install", () => {
    render(
      <BuildProgress
        status="installing"
        currentExtension="claudeos-terminal"
        progress={3}
        total={5}
      />,
    );
    expect(screen.getByText("claudeos-terminal")).toBeDefined();
    expect(screen.getByText("(3/5)")).toBeDefined();
  });

  it("shows completion state", () => {
    render(<BuildProgress status="complete" />);
    expect(screen.getByText("Extensions installed")).toBeDefined();
  });

  it("shows error with retry button", async () => {
    const onRetry = vi.fn();
    render(
      <BuildProgress
        status="error"
        error="Install failed"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Install failed")).toBeDefined();
    await userEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });
});
