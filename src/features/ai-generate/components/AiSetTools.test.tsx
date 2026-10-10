import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { StudySet } from "@/lib/types";
import messages from "../../../../messages/vi.json";
import { AiSetTools } from "./AiSetTools";

const { request, mutate } = vi.hoisted(() => ({ request: vi.fn(), mutate: vi.fn() }));
vi.mock("@/lib/http-client", () => ({ createHttpClient: () => ({ request }) }));
vi.mock("@/features/sets/hooks", () => ({
  useUpdateSet: () => ({ mutate, isPending: false }),
}));
const set: StudySet = {
  id: "set",
  ownerId: "user",
  title: "HSK",
  description: "",
  termLang: "zh",
  definitionLang: "vi",
  source: "manual",
  createdAt: "",
  updatedAt: "",
  cards: [
    { id: "one", term: "学习", definition: "học tập", phonetic: "old" },
    { id: "two", term: "谢谢", definition: "cảm ơn", phonetic: "xiè xie" },
  ],
};
beforeEach(() => {
  request.mockReset();
  mutate.mockReset();
});

it("lets the user correct a transcription before applying it and preserves other cards", async () => {
  request.mockResolvedValue({ data: { cards: [{ id: "one", text: "xuè xǐ" }] } });
  renderWithProviders(<AiSetTools set={set} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  const input = await screen.findByRole("textbox", { name: `${messages.editor.phonetic}: 学习` });
  expect(input).toHaveAttribute("translate", "no");
  await user.clear(input);
  await user.type(input, "xué xí");
  expect(screen.getByRole("button", { name: messages.ai.applyPhonetics })).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: messages.ai.useSuggestedPhonetic }));
  await user.click(screen.getByRole("button", { name: messages.ai.applyPhonetics }));
  expect(mutate.mock.calls[0][0]).toEqual({
    ...set,
    cards: [{ ...set.cards[0], phonetic: "xué xí" }, set.cards[1]],
  });
});

it("keeps examples as read-only sentences without an apply-phonetics action", async () => {
  request.mockResolvedValue({ data: { cards: [{ id: "one", text: "我学习中文。" }] } });
  renderWithProviders(<AiSetTools set={set} />);
  await userEvent.setup().click(screen.getByRole("button", { name: messages.ai.createExamples }));
  expect(await screen.findByText("我学习中文。")).toHaveAttribute("translate", "no");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: messages.ai.applyPhonetics })).toBeNull();
});

it("applies phonetics again after adding a word and keeps previously saved transcriptions", async () => {
  const completed = { ...set, cards: [{ ...set.cards[0], phonetic: "xué xí" }, set.cards[1]] };
  const added = { id: "three", term: "朋友", definition: "bạn bè" };
  function Harness() {
    const [current, setCurrent] = useState(completed);
    mutate.mockImplementation((updated, callbacks) => {
      setCurrent(updated);
      callbacks.onSuccess();
    });
    return (
      <>
        <button onClick={() => setCurrent({ ...current, cards: [...current.cards, added] })}>
          Add word
        </button>
        <AiSetTools set={current} />
      </>
    );
  }
  request.mockResolvedValueOnce({
    data: {
      cards: [
        { id: "one", text: "xué xí" },
        { id: "two", text: "xiè xie" },
      ],
    },
  });
  renderWithProviders(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  for (const checkbox of await screen.findAllByRole("checkbox")) await user.click(checkbox);
  await user.click(await screen.findByRole("button", { name: messages.ai.applyPhonetics }));
  await user.click(screen.getByRole("button", { name: "Add word" }));
  request.mockResolvedValueOnce({ data: { cards: [{ id: added.id, text: "péng you" }] } });
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  expect(
    await screen.findByRole("textbox", { name: `${messages.editor.phonetic}: 朋友` }),
  ).toHaveValue("péng you");
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: messages.ai.applyPhonetics }));
  expect(mutate.mock.calls[1][0].cards).toEqual([
    ...completed.cards,
    { ...added, phonetic: "péng you" },
  ]);
  expect(request).toHaveBeenCalledTimes(2);
});

it("reviews all cards in a mixed set and saves only the suggestions the user selects", async () => {
  const mixed = {
    ...set,
    cards: [...set.cards, { id: "three", term: "朋友", definition: "bạn bè" }],
  };
  request.mockResolvedValue({
    data: {
      cards: [
        { id: "one", text: "xué xí" },
        { id: "two", text: "xiè xie" },
        { id: "three", text: "péng you" },
      ],
    },
  });
  renderWithProviders(<AiSetTools set={mixed} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: messages.ai.reviewPhonetics }));
  expect(request).toHaveBeenCalledWith("/api/v1/ai/phonetics", expect.anything(), {
    method: "POST",
    body: { setId: set.id, scope: "all" },
  });
  const choices = await screen.findAllByRole("checkbox");
  expect(choices[0]).not.toBeChecked();
  expect(choices[1]).not.toBeChecked();
  expect(choices[2]).toBeChecked();
  expect(screen.getByText("old")).toHaveAttribute("translate", "no");
  await user.click(choices[2]);
  expect(screen.getByRole("button", { name: messages.ai.applyPhonetics })).toBeDisabled();
  await user.click(choices[0]);
  await user.click(screen.getByRole("button", { name: messages.ai.applyPhonetics }));
  expect(mutate.mock.calls[0][0].cards).toEqual([
    { ...set.cards[0], phonetic: "xué xí" },
    set.cards[1],
    mixed.cards[2],
  ]);
});
