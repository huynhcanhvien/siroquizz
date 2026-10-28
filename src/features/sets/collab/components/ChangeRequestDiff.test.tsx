import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { ChangeRequestDetail } from "../schemas";
import { ChangeRequestDiff } from "./ChangeRequestDiff";

const request: ChangeRequestDetail = {
  id: "r",
  setId: "s",
  classId: null,
  status: "pending",
  note: "",
  reviewNote: "",
  opCount: 4,
  titleChanged: true,
  title: "Động vật",
  author: { id: "u", name: "Cô Mai", avatarColor: "rose" },
  createdAt: "",
  reviewedAt: null,
  stale: true,
  cards: [
    { op: "add", card: { term: "cat", definition: "mèo" } },
    {
      op: "edit",
      cardId: "c1",
      before: { id: "c1", term: "dog", definition: "cho" },
      card: { term: "dog", definition: "chó" },
    },
    { op: "delete", cardId: "c2", before: { id: "c2", term: "fish", definition: "cá" } },
    { op: "delete", cardId: "c3", before: null },
  ],
};

it("shows additions, old → new edits, deletions and the stale warning", () => {
  renderWithProviders(<ChangeRequestDiff request={request} />);
  expect(screen.getByText("Tiêu đề mới: Động vật")).toBeInTheDocument();
  expect(screen.getByText(/Bộ thẻ đã thay đổi sau khi/)).toHaveAttribute("role", "status");
  expect(screen.getByText("Thêm").closest("li")).toHaveTextContent("cat — mèo");
  const edit = screen.getByText("Sửa").closest("li");
  expect(edit?.querySelector("del")).toHaveTextContent("dog — cho");
  expect(edit).toHaveTextContent("dog — chó");
  const [deleted, gone] = screen.getAllByText("Xoá").map((badge) => badge.closest("li"));
  expect(deleted?.querySelector("del")).toHaveTextContent("fish — cá");
  expect(gone).toHaveTextContent("Thẻ đã bị xoá");
});
