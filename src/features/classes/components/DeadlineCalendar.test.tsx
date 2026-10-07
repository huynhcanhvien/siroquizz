import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/en.json";
import type { DeadlineSet } from "../lib/deadline-calendar";
import { DeadlineCalendar } from "./DeadlineCalendar";

function assignment(id: string, day: number, hour = 23): DeadlineSet {
  return {
    setId: id,
    title: `Vocabulary ${id}`,
    cardCount: 5,
    dueAt: new Date(2026, 9, day, hour).toISOString(),
    assignedAt: "2026-10-01T00:00:00Z",
  };
}
function calendar(sets: DeadlineSet[]) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <DeadlineCalendar sets={sets} />
    </NextIntlClientProvider>
  );
}

describe("DeadlineCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 7, 12));
  });
  afterEach(() => vi.useRealTimers());

  it("renders a placeholder on the server instead of server-local dates", () => {
    expect(renderToString(calendar([]))).not.toContain("October");
  });

  it("selects today, shows multiple deadlines, and opens the correct set", () => {
    render(
      calendar([assignment("a", 7), assignment("b", 7), assignment("c", 7), assignment("past", 6)]),
    );
    const today = screen.getByRole("button", { name: /October 7, 2026.*Today.*3 deadlines/ });
    expect(today).toHaveAttribute("aria-pressed", "true");
    expect(today).toHaveAttribute("aria-current", "date");
    expect(within(today).getByText("+1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Study Vocabulary c" })).toHaveAttribute(
      "href",
      "/sets/c",
    );
    fireEvent.click(screen.getByRole("button", { name: /October 6, 2026.*1 deadlines/ }));
    const detail = screen.getByRole("region", { name: /October 6, 2026/ });
    expect(within(detail).getByText("Past due")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Study Vocabulary a" })).not.toBeInTheDocument();
  });

  it("changes month and year, resets selection, and returns to today", () => {
    render(calendar([]));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("table", { name: "January 2027" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /January 1, 2027/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("table", { name: "December 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByRole("table", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /October 7, 2026.*Today/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("No deadlines on this day.")).toBeInTheDocument();
  });

  it("reflects assignments being added, deadlines changed, and assignments removed", () => {
    const undated = { ...assignment("none", 7), dueAt: null };
    const view = render(calendar([undated]));
    expect(screen.getByText(/No deadlines yet/)).toBeInTheDocument();
    view.rerender(calendar([undated, assignment("a", 7)]));
    expect(screen.getByRole("link", { name: "Study Vocabulary a" })).toBeInTheDocument();
    view.rerender(calendar([assignment("a", 8)]));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /October 8, 2026.*1 deadlines/ }));
    expect(screen.getByRole("link", { name: "Study Vocabulary a" })).toBeInTheDocument();
    view.rerender(calendar([]));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("refreshes deadline status while the page stays open", () => {
    render(calendar([assignment("a", 7, 12)]));
    const detail = screen.getByRole("region", { name: /October 7, 2026/ });
    expect(within(detail).getByText("Within 48 hours")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(60_000));
    expect(within(detail).getByText("Past due")).toBeInTheDocument();
  });
});
