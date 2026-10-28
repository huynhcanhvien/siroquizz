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
  cardCount: 2,
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

describe("SetOverview access", () => {
  it("offers a classmate who sees a shared set to suggest edits or copy it", () => {
    renderWithProviders(
      <SetOverview
        set={{
          ...set,
          id: "shared-overview",
          access: {
            isOwner: false,
            canEdit: false,
            acceptsContributions: true,
            sharedIn: { classId: "k1", className: "10A", sharedByName: "An", audience: "class" },
          },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "Đề xuất chỉnh sửa" })).toHaveAttribute(
      "href",
      "/sets/shared-overview/propose?class=k1",
    );
    expect(screen.getByRole("link", { name: "Chia sẻ trong lớp 10A bởi An" })).toHaveAttribute(
      "href",
      "/classes/k1",
    );
    expect(screen.getByRole("button", { name: "Sao chép vào thư viện" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Chia sẻ/ })).not.toBeInTheDocument();
  });

  it("hides the suggestion when the owner closed contributions", () => {
    renderWithProviders(
      <SetOverview
        set={{ ...set, access: { isOwner: false, canEdit: false, acceptsContributions: false } }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Đề xuất chỉnh sửa" })).not.toBeInTheDocument();
  });

  it("hides the suggestion from a viewer who only has the link", () => {
    renderWithProviders(
      <SetOverview
        set={{
          ...set,
          access: { isOwner: false, canEdit: false, acceptsContributions: true, canPropose: false },
        }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Đề xuất chỉnh sửa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sao chép vào thư viện" })).toBeInTheDocument();
  });

  it("lets a collaborator edit but not share or delete", () => {
    renderWithProviders(
      <SetOverview
        set={{ ...set, access: { isOwner: false, canEdit: true, acceptsContributions: true } }}
      />,
    );
    expect(screen.getByRole("link", { name: "Chỉnh sửa" })).toHaveAttribute(
      "href",
      `/sets/${set.id}/edit`,
    );
    expect(screen.queryByRole("button", { name: "Tùy chọn khác" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đề xuất chỉnh sửa" })).not.toBeInTheDocument();
  });
});
