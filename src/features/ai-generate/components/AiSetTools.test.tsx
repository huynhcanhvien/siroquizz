import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
