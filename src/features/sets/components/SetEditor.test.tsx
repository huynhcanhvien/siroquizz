import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { StudySet } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SetEditor } from "./SetEditor";

const set: StudySet = {
  id: "s1",
  ownerId: "u1",
  title: "HSK",
  description: "",
  termLang: "zh",
  definitionLang: "vi",
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  cardCount: 2,
  cards: [
    { id: "c1", term: "你好", definition: "xin chào", phonetic: "nǐ hǎo" },
    { id: "c2", term: "谢谢", definition: "cảm ơn", phonetic: "xièxie" },
  ],
};

const terms = () => screen.getAllByLabelText("Thuật ngữ", { exact: true }) as HTMLTextAreaElement[];
const definitions = () =>
  screen.getAllByLabelText("Định nghĩa", { exact: true }) as HTMLTextAreaElement[];

describe("SetEditor", () => {
  it("swaps cards and their languages together and clears old phonetics", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetEditor set={set} />);
    await user.click(screen.getByRole("button", { name: "Đảo thuật ngữ ↔ định nghĩa" }));

    expect(terms()[0]).toHaveValue("xin chào");
    expect(definitions()[0]).toHaveValue("你好");
    expect(screen.getByLabelText("Ngôn ngữ thuật ngữ")).toHaveValue("vi");
    expect(screen.getByLabelText("Ngôn ngữ định nghĩa")).toHaveValue("zh");
    expect(
      (screen.getAllByLabelText("Phiên âm") as HTMLTextAreaElement[]).every(
        (field) => field.value === "",
      ),
    ).toBe(true);
  });

  it("adds a row when tabbing out of a filled last row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetEditor set={set} />);
    await user.click(definitions()[1]);
    await user.tab();
    expect(terms()).toHaveLength(3);
    expect(terms()[2]).toHaveFocus();
  });

  it("does not trap Tab on an empty last row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetEditor />);
    await user.click(definitions()[2]);
    await user.tab();
    expect(terms()).toHaveLength(3);
    expect(definitions()[2]).not.toHaveFocus();
  });

  it("requires two filled cards before saving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetEditor />);
    await user.type(screen.getByLabelText("Tiêu đề"), "Một thẻ");
    await user.type(terms()[0], "apple");
    await user.type(definitions()[0], "táo");
    await user.click(screen.getAllByRole("button", { name: "Tạo bộ thẻ" })[0]);
    expect(await screen.findByText("Bộ thẻ cần ít nhất 2 thẻ.")).toBeInTheDocument();
  });
});
