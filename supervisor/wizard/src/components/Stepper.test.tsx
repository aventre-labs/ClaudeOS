import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "./Stepper";

const defaultSteps = [
  { key: "railway", label: "Railway", completed: false, active: true },
  { key: "anthropic", label: "Claude", completed: false, active: false },
  { key: "launch", label: "Launch", completed: false, active: false },
];

describe("Stepper", () => {
  it("renders all step labels", () => {
    render(<Stepper steps={defaultSteps} onStepClick={() => {}} />);
    expect(screen.getByText("Railway")).toBeDefined();
    expect(screen.getByText("Claude")).toBeDefined();
    expect(screen.getByText("Launch")).toBeDefined();
  });

  it("highlights active step", () => {
    render(<Stepper steps={defaultSteps} onStepClick={() => {}} />);
    const activeButton = screen.getByText("Railway").closest("button");
    expect(activeButton?.className).toContain("active");
  });

  it("shows checkmark for completed steps", () => {
    const steps = [
      { key: "railway", label: "Railway", completed: true, active: false },
      { key: "anthropic", label: "Claude", completed: false, active: true },
      { key: "launch", label: "Launch", completed: false, active: false },
    ];
    render(<Stepper steps={steps} onStepClick={() => {}} />);
    const completedButton = screen.getByText("Railway").closest("button");
    expect(completedButton?.className).toContain("completed");
    expect(completedButton?.textContent).toContain("\u2713");
  });

  it("calls onStepClick when step is clicked", async () => {
    const onClick = vi.fn();
    render(<Stepper steps={defaultSteps} onStepClick={onClick} />);
    await userEvent.click(screen.getByText("Claude"));
    expect(onClick).toHaveBeenCalledWith("anthropic");
  });
});
