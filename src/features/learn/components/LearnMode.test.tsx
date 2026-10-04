import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RepositoryError } from "@/lib/repository-error";
import type { StudySet } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { LearnMode } from "./LearnMode";

const save = vi.hoisted(() => vi.fn<(input: unknown) => Promise<unknown>>());
vi.mock("@/features/progress/hooks", () => ({
  useSaveCardStatus: () => ({ mutateAsync: save, isPending: false }),
}));

const set: StudySet = {
  id: "s1",
  ownerId: "u1",
  title: "Fruits",
  description: "",
  termLang: "en",
  definitionLang: "vi",
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  cards: [
    { id: "c1", term: "apple", definition: "quả táo" },
    { id: "c2", term: "pear", definition: "quả lê" },
    { id: "c3", term: "plum", definition: "quả mận" },
    { id: "c4", term: "grape", definition: "quả nho" },
  ],
};
const feedback = /Chính xác!|Chưa đúng/;

async function answerFirstQuestion() {
  const user = userEvent.setup();
  renderWithProviders(<LearnMode set={set} />);
  await user.click(screen.getByRole("button", { name: "Bắt đầu học" }));
  await user.click(screen.getAllByRole("radio")[0]);
  await user.click(screen.getByRole("button", { name: "Kiểm tra đáp án" }));
}

describe("LearnMode answer checking", () => {
  beforeEach(() => {
    save.mockReset();
  });

  it("shows the result immediately instead of waiting for the save round trip", async () => {
    save.mockReturnValue(new Promise(() => {}));
    await answerFirstQuestion();
    expect(screen.getByText(feedback)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tiếp tục" })).toBeEnabled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("retries a transient save failure with the same payload, silently", async () => {
    save
      .mockImplementationOnce(async () => {
        throw new RepositoryError("NETWORK");
      })
      .mockResolvedValueOnce(null);
    await answerFirstQuestion();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(screen.queryByText("Không thể kết nối. Hãy kiểm tra mạng và thử lại.")).toBeNull();
  });

  it("keeps the feedback and reports a save that cannot succeed", async () => {
    save.mockImplementation(async () => {
      throw new RepositoryError("VALIDATION");
    });
    await answerFirstQuestion();
    expect(screen.getByText(feedback)).toBeInTheDocument();
    expect(await screen.findByText("Dữ liệu chưa hợp lệ.")).toBeInTheDocument();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
