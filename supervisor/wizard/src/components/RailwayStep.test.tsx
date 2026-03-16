import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RailwayStep } from "./RailwayStep";

describe("RailwayStep", () => {
  it("shows sign in button in idle state", () => {
    render(<RailwayStep status="idle" onStart={() => {}} />);
    expect(screen.getByText("Sign in with Railway")).toBeDefined();
    expect(screen.getByText("Use auth token instead")).toBeDefined();
  });

  it("shows pairing code in pairing state", () => {
    render(
      <RailwayStep
        status="pairing"
        pairingCode="ABCD-1234"
        url="https://railway.com/cli-login"
        onStart={() => {}}
      />,
    );
    expect(screen.getByTestId("pairing-code").textContent).toBe("ABCD-1234");
    expect(screen.getByText("Waiting for confirmation...")).toBeDefined();
  });

  it("shows completed state with sign out", () => {
    const onSignOut = vi.fn();
    render(
      <RailwayStep status="complete" onStart={() => {}} onSignOut={onSignOut} />,
    );
    expect(screen.getByText("Railway: signed in")).toBeDefined();
    expect(screen.getByText("Sign Out")).toBeDefined();
  });

  it("shows error with try again button", async () => {
    const onStart = vi.fn();
    render(
      <RailwayStep status="error" error="Connection failed" onStart={onStart} />,
    );
    expect(screen.getByText("Connection failed")).toBeDefined();
    await userEvent.click(screen.getByText("Try again"));
    expect(onStart).toHaveBeenCalled();
  });
});
