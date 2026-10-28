import { screen, waitFor } from "@testing-library/react";
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
  cardCount: 2,
  cards: [
    { id: "one", term: "学习", definition: "học tập", phonetic: "old" },
    { id: "two", term: "谢谢", definition: "cảm ơn", phonetic: "xiè xie" },
  ],
};
beforeEach(() => {
  request.mockReset();
  mutate.mockReset();
});

it.each(["empty", "mixed", "complete"] as const)(
  "requests all cards for a %s set from the main button",
  async (state) => {
    const current = {
      ...set,
      cards: set.cards.map((card, index) => ({
        ...card,
        phonetic: state === "empty" || (state === "mixed" && index === 1) ? " " : card.phonetic,
      })),
    };
    request.mockResolvedValue({
      data: { cards: current.cards.map((card) => ({ id: card.id, text: "AI reading" })) },
    });
    renderWithProviders(<AiSetTools set={current} />);
    await userEvent.setup().click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
    expect(request).toHaveBeenCalledWith("/api/v1/ai/phonetics", expect.anything(), {
      method: "POST",
      body: { setId: set.id, scope: "all" },
    });
    const choices = await screen.findAllByRole("checkbox");
    choices.forEach((choice, index) => {
      expect(choice).toHaveProperty("checked", !current.cards[index].phonetic?.trim());
    });
    expect(screen.queryByRole("button", { name: messages.ai.reviewPhonetics })).toBeNull();
  },
);

it("discards the comparison when closed without saving", async () => {
  request.mockResolvedValue({ data: { cards: [{ id: "one", text: "xué xí" }] } });
  renderWithProviders(<AiSetTools set={set} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  await user.click(await screen.findByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: messages.common.close }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
});

it("keeps the edited suggestion and selection after a save error so it can be retried", async () => {
  request.mockResolvedValue({ data: { cards: [{ id: "one", text: "xuè xǐ" }] } });
  mutate.mockImplementationOnce((_updated, callbacks) =>
    callbacks.onError(new Error("Save failed")),
  );
  renderWithProviders(<AiSetTools set={set} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  const input = await screen.findByRole("textbox");
  await user.clear(input);
  await user.type(input, "xué xí");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: messages.ai.applyPhonetics }));
  expect(input).toHaveValue("xué xí");
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(screen.getByRole("button", { name: messages.ai.applyPhonetics }));
  expect(mutate).toHaveBeenCalledTimes(2);
  expect(mutate.mock.calls[1][0]).toEqual(mutate.mock.calls[0][0]);
});

it("leaves saved cards untouched when AI fails", async () => {
  request.mockRejectedValue(new Error("AI failed"));
  renderWithProviders(<AiSetTools set={set} />);
  await userEvent.setup().click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: messages.ai.fillPhonetics })).toBeEnabled(),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
});

it.each([" ", "a".repeat(201)])("blocks saving an invalid selected suggestion", async (text) => {
  request.mockResolvedValue({ data: { cards: [{ id: "one", text }] } });
  renderWithProviders(<AiSetTools set={set} />);
  await userEvent.setup().click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  await userEvent.setup().click(await screen.findByRole("checkbox"));
  expect(screen.getByRole("button", { name: messages.ai.applyPhonetics })).toBeDisabled();
  expect(mutate).not.toHaveBeenCalled();
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

it("lets the user edit and save examples without changing phonetics or other cards", async () => {
  request.mockResolvedValue({ data: { cards: [{ id: "one", text: "我学习中文。" }] } });
  renderWithProviders(<AiSetTools set={set} />);
  await userEvent.setup().click(screen.getByRole("button", { name: messages.ai.createExamples }));
  const input = await screen.findByRole("textbox", {
    name: `${messages.ai.exampleSentence}: 学习`,
  });
  expect(input).toHaveValue("我学习中文。");
  expect(input).toHaveAttribute("translate", "no");
  expect(screen.queryByRole("button", { name: messages.ai.applyPhonetics })).toBeNull();
  expect(mutate).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.clear(input);
  const save = screen.getByRole("button", { name: messages.ai.applyExamples });
  expect(save).toBeDisabled();
  await user.type(input, "我学习中文。 Tôi học tiếng Trung.");
  await user.click(save);
  expect(mutate.mock.calls[0][0]).toEqual({
    ...set,
    cards: [{ ...set.cards[0], example: "我学习中文。 Tôi học tiếng Trung." }, set.cards[1]],
  });
});

it("compares all phonetics again after adding a word and keeps unselected transcriptions", async () => {
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
  request.mockResolvedValueOnce({
    data: {
      cards: [
        { id: "one", text: "different reading" },
        { id: "two", text: "xiè xie" },
        { id: added.id, text: "péng you" },
      ],
    },
  });
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
  expect(
    await screen.findByRole("textbox", { name: `${messages.editor.phonetic}: 朋友` }),
  ).toHaveValue("péng you");
  expect(screen.getAllByRole("textbox")).toHaveLength(3);
  const choices = screen.getAllByRole("checkbox");
  expect(choices[0]).not.toBeChecked();
  expect(choices[1]).not.toBeChecked();
  expect(choices[2]).toBeChecked();
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
  await user.click(screen.getByRole("button", { name: messages.ai.fillPhonetics }));
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
