import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { Answer, MatchingQuestion } from "../lib/types";
import { MatchingView } from "./MatchingView";

const question: MatchingQuestion = {
  id: "q1",
  type: "matching",
  promptSide: "term",
  pairs: [
    { cardId: "a", prompt: "one", answer: "một" },
    { cardId: "b", prompt: "two", answer: "hai" },
  ],
  answers: [
    { cardId: "b", text: "hai" },
    { cardId: "a", text: "một" },
  ],
};

const onAnswer = vi.fn<(answer: Answer) => void>();
const latest = () => onAnswer.mock.lastCall?.[0];

function Harness() {
  const [answer, setAnswer] = useState<Answer>();
  const handleAnswer = (next: Answer) => {
    setAnswer(next);
    onAnswer(next);
  };
  return (
    <MatchingView
      question={question}
      answer={answer}
      onAnswer={handleAnswer}
      langs={{ termLang: "en", definitionLang: "vi" }}
    />
  );
}

describe("MatchingView", () => {
  beforeEach(() => onAnswer.mockClear());

  it("links prompts to answers and auto-selects the next open prompt", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: /one/ }));
    await user.click(screen.getByRole("button", { name: /một/ }));
    expect(screen.getByRole("button", { name: /two/ })).toHaveAttribute("aria-pressed", "true");

    // Clicking the auto-selected prompt must keep it selected.
    await user.click(screen.getByRole("button", { name: /two/ }));
    await user.click(screen.getByRole("button", { name: /hai/ }));
    expect(latest()).toEqual({ type: "matching", matches: { a: "a", b: "b" } });
  });

  it("keeps answer buttons focusable when nothing is selected", async () => {
    renderWithProviders(<Harness />);
    const answerButton = screen.getByRole("button", { name: /hai/ });
    expect(answerButton).not.toBeDisabled();
    expect(answerButton).toHaveAttribute("aria-disabled", "true");
  });

  it("unlinks a pair when its prompt is clicked again", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole("button", { name: /one/ }));
    await user.click(screen.getByRole("button", { name: /một/ }));
    await user.click(screen.getByRole("button", { name: "Bỏ ghép one" }));
    expect(latest()).toEqual({ type: "matching", matches: {} });
  });
});
