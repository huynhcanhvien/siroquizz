import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudySet } from "@/lib/types";
import { RepositoryError } from "@/lib/repository-error";
import { renderWithProviders, router } from "@/test/render";
import { SetEditor } from "./SetEditor";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http-client")>()),
  createHttpClient: () => ({ request }),
}));

const set: StudySet = {
  id: "s1",
  ownerId: "owner",
  title: "HSK",
  description: "",
  termLang: "zh",
  definitionLang: "vi",
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  cardCount: 2,
  cards: [
    { id: "c1", term: "你好", definition: "xin chào" },
    { id: "c2", term: "谢谢", definition: "cảm ơn" },
  ],
};
const definitions = () =>
  screen.getAllByLabelText("Định nghĩa", { exact: true }) as HTMLTextAreaElement[];

beforeEach(() => {
  request.mockReset();
  router.push.mockReset();
});

describe("SetEditor in propose mode", () => {
  it("refuses to send a proposal without changes and makes no request", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SetEditor set={set} mode="propose" />);
    expect(screen.getByRole("heading", { name: "Đề xuất chỉnh sửa" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Gửi đề xuất" })[0]);
    expect(await screen.findByText("Bạn chưa thay đổi gì so với bộ thẻ.")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("sends only the changed card with the note, base version and class", async () => {
    request.mockResolvedValue({ data: { id: "r1" } });
    const user = userEvent.setup();
    renderWithProviders(<SetEditor set={set} mode="propose" classId="k1" />);
    await user.clear(definitions()[1]);
    await user.type(definitions()[1], "cám ơn");
    await user.type(screen.getByLabelText("Ghi chú cho chủ bộ thẻ"), "Chính tả");
    await user.click(screen.getAllByRole("button", { name: "Gửi đề xuất" })[0]);
    await waitFor(() => expect(request).toHaveBeenCalled());
    expect(request).toHaveBeenCalledWith("/api/v1/sets/s1/change-requests", expect.anything(), {
      method: "POST",
      body: {
        ops: {
          cards: [{ op: "edit", cardId: "c2", card: { term: "谢谢", definition: "cám ơn" } }],
        },
        note: "Chính tả",
        baseUpdatedAt: set.updatedAt,
        classId: "k1",
      },
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/sets/s1"));
  });

  it("shows a proposal error from the server", async () => {
    request.mockRejectedValue(new RepositoryError("CONTRIBUTIONS_CLOSED"));
    const user = userEvent.setup();
    renderWithProviders(<SetEditor set={set} mode="propose" />);
    await user.type(definitions()[0], "!");
    await user.click(screen.getAllByRole("button", { name: "Gửi đề xuất" })[0]);
    expect(await screen.findByText("Chủ bộ thẻ đang tắt nhận đóng góp.")).toBeInTheDocument();
  });
});
