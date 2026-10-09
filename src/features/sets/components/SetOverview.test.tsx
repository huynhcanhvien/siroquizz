import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { storageKey } from "@/lib/storage";
import type { StudySet } from "@/lib/types";
import { renderWithProviders } from "@/test/render";
import { SetOverview } from "./SetOverview";

vi.mock("@/features/auth/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/hooks")>()),
  useSession: () => ({ data: { id: "viewer" } }),
}));

const set: StudySet = {
  id: "phonetic-overview",
  ownerId: "owner",
  title: "Fruits",
  description: "",
  termLang: "en",
  definitionLang: "vi",
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  cards: [
    {
      id: "c1",
      term: "apple",
      definition: "quả táo\nmột loại trái cây",
      phonetic: "/ˈæpəl/",
      imageUrl: "/apple.png",
      imageAlt: "Apple image",
    },
    { id: "c2", term: "pear", definition: "quả lê" },
  ],
};

describe("SetOverview phonetic placement", () => {
  it("lets a viewer toggle list and preview together using the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<SetOverview set={set} />);
    expect(screen.queryByRole("link", { name: "Chỉnh sửa" })).not.toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Thuật ngữ trong bộ này (2)" });
    const firstRow = within(list).getAllByRole("listitem")[0];
    const phonetic = within(firstRow).getByText("/ˈæpəl/");
    expect(phonetic.previousElementSibling).toHaveTextContent("apple");
    const visibleFace = () => container.querySelector(".flip-face:not([aria-hidden=true])");
    expect(visibleFace()).toHaveTextContent("/ˈæpəl/");

    screen.getByRole("button", { name: "Phiên âm: dưới thuật ngữ" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toHaveFocus();
    expect(within(firstRow).getByText("/ˈæpəl/").previousElementSibling).toHaveTextContent(
      "quả táo",
    );
    expect(visibleFace()).not.toHaveTextContent("/ˈæpəl/");
    await user.click(screen.getByRole("button", { name: "Lật thẻ" }));
    expect(visibleFace()).toHaveTextContent("/ˈæpəl/");
    const backPhonetic = within(visibleFace() as HTMLElement).getByText("/ˈæpəl/");
    expect(backPhonetic.nextElementSibling).toHaveAttribute("alt", "Apple image");
    expect(window.localStorage.getItem(storageKey(`phonetic-side:${set.id}`))).toBe('"definition"');

    await user.click(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" }));
    expect(within(firstRow).getByText("/ˈæpəl/").previousElementSibling).toHaveTextContent("apple");
    expect(visibleFace()).not.toHaveTextContent("/ˈæpəl/");
    expect(within(list).getAllByRole("listitem")[1].querySelectorAll("p")).toHaveLength(2);
  });

  it("restores the selected placement after remounting", () => {
    window.localStorage.setItem(storageKey(`phonetic-side:${set.id}`), '"definition"');
    const view = renderWithProviders(<SetOverview set={set} />);
    expect(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<SetOverview set={set} />);
    expect(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toBeInTheDocument();
  });

  it("hides the control when no cards have phonetics", () => {
    renderWithProviders(
      <SetOverview
        set={{ ...set, cards: set.cards.map(({ phonetic: _phonetic, ...card }) => card) }}
      />,
    );
    expect(screen.queryByRole("button", { name: /Phiên âm:/ })).not.toBeInTheDocument();
  });
});
