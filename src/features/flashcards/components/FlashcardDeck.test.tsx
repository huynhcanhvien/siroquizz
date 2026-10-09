import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { StudySet } from "@/lib/types";
import { storageKey } from "@/lib/storage";
import { renderWithProviders } from "@/test/render";
import { FlashcardDeck } from "./FlashcardDeck";

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
  ],
};

const visibleFace = () =>
  document.querySelector(".flip-face:not([aria-hidden=true])")?.textContent ?? "";

describe("FlashcardDeck", () => {
  it("shows a toggle immediately and lets Space change placement without flipping or advancing", async () => {
    const user = userEvent.setup();
    const studySet = { ...set, cards: [{ ...set.cards[0], phonetic: "/ˈæpəl/" }, set.cards[1]] };
    const view = renderWithProviders(<FlashcardDeck set={studySet} />);
    const toggle = screen.getByRole("button", { name: "Phiên âm: dưới thuật ngữ" });
    expect(toggle).toBeVisible();
    expect(visibleFace()).toContain("/ˈæpəl/");
    toggle.focus();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toHaveFocus();
    expect(visibleFace()).toContain("apple");
    expect(visibleFace()).not.toContain("/ˈæpəl/");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(window.localStorage.getItem(storageKey(`phonetic-side:${set.id}`))).toBe('"definition"');
    await user.click(screen.getByRole("button", { name: "Lật thẻ" }));
    expect(visibleFace()).toContain("quả táo");
    expect(visibleFace()).toContain("/ˈæpəl/");
    view.unmount();
    renderWithProviders(<FlashcardDeck set={studySet} />);
    expect(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Phiên âm: dưới nghĩa" }));
    expect(visibleFace()).toContain("/ˈæpəl/");
  });

  it("hides the toggle for sets without phonetics", () => {
    renderWithProviders(<FlashcardDeck set={set} />);
    expect(screen.queryByRole("button", { name: /Phiên âm:/ })).not.toBeInTheDocument();
  });

  it("keeps saved phonetics on the definition side when flipping and changing the front side", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(storageKey(`phonetic-side:${set.id}`), '"definition"');
    renderWithProviders(
      <FlashcardDeck set={{ ...set, cards: [{ ...set.cards[0], phonetic: "/ˈæpəl/" }] }} />,
    );
    expect(visibleFace()).not.toContain("/ˈæpəl/");
    await user.keyboard(" ");
    expect(visibleFace()).toContain("/ˈæpəl/");
    await user.keyboard(" ");
    expect(visibleFace()).toContain("apple");
    await user.click(screen.getByText("Tùy chọn"));
    await user.click(screen.getByRole("radio", { name: "Định nghĩa" }));
    expect(visibleFace()).toContain("quả táo");
    expect(visibleFace()).toContain("/ˈæpəl/");
    await user.click(screen.getByRole("button", { name: "Lật thẻ" }));
    expect(visibleFace()).toContain("apple");
    expect(visibleFace()).not.toContain("/ˈæpəl/");
  });

  it("keeps merged folder sessions on the default phonetic side", () => {
    window.localStorage.setItem(storageKey(`phonetic-side:${set.id}`), '"definition"');
    renderWithProviders(
      <FlashcardDeck
        set={{ ...set, cards: [{ ...set.cards[0], phonetic: "/ˈæpəl/" }] }}
        practice
      />,
    );
    expect(visibleFace()).toContain("/ˈæpəl/");
    expect(screen.queryByRole("button", { name: /Phiên âm:/ })).not.toBeInTheDocument();
  });

  it("flips with Space and hides the back face from assistive tech until then", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FlashcardDeck set={set} />);
    expect(visibleFace()).toContain("apple");
    await user.keyboard(" ");
    expect(visibleFace()).toContain("quả táo");
  });

  it("lets Space activate a focused button instead of flipping the card", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FlashcardDeck set={set} />);
    screen.getByRole("button", { name: "Đã biết" }).focus();
    await user.keyboard(" ");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(visibleFace()).toContain("pear");
  });

  it("marks cards with 1 / 2 and shows the round summary", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FlashcardDeck set={set} />);
    await user.keyboard("1");
    await user.keyboard("2");
    expect(await screen.findByText("Bạn đã học hết một vòng!")).toBeInTheDocument();
    expect(screen.getByText("Đã biết 1 · Đang học 1")).toBeInTheDocument();
  });
});
