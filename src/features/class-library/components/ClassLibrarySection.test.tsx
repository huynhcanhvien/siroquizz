import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { ClassLibraryItem } from "../schemas";
import { ClassLibrarySection } from "./ClassLibrarySection";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/http-client")>()),
  createHttpClient: () => ({ request }),
}));

const item = (overrides: Partial<ClassLibraryItem>): ClassLibraryItem => ({
  id: "li1",
  itemType: "set",
  itemId: "s1",
  title: "Animals",
  cardCount: 12,
  setCount: null,
  audience: "class",
  sharedAt: "2026-10-29T00:00:00.000Z",
  sharedBy: { id: "u1", name: "An", avatarColor: "indigo" },
  canRemove: false,
  ...overrides,
});

beforeEach(() => request.mockReset());

it("lists shared items and offers removal only where allowed", async () => {
  request.mockImplementation(async (path: string) => {
    if (path === "/api/v1/classes/k1/library")
      return {
        data: [
          item({}),
          item({
            id: "li2",
            itemType: "folder",
            itemId: "f1",
            title: "Unit 2",
            cardCount: null,
            setCount: 3,
            audience: "teachers",
            canRemove: true,
          }),
        ],
      };
    return { data: null };
  });
  renderWithProviders(<ClassLibrarySection classId="k1" />);
  const rows = await screen.findAllByRole("listitem");
  expect(rows).toHaveLength(2);
  const [set, folder] = rows;
  expect(within(set).getByRole("link", { name: "Animals" })).toHaveAttribute("href", "/sets/s1");
  expect(within(set).getByText("12 thẻ", { exact: false })).toBeInTheDocument();
  expect(within(set).getByRole("button", { name: "Sao chép vào thư viện" })).toBeInTheDocument();
  expect(within(set).queryByRole("button", { name: "Gỡ" })).not.toBeInTheDocument();
  expect(within(folder).getByRole("link", { name: "Unit 2" })).toHaveAttribute(
    "href",
    "/folders/f1",
  );
  expect(within(folder).getByText("Chỉ giáo viên")).toBeInTheDocument();
  await userEvent.setup().click(within(folder).getByRole("button", { name: "Gỡ" }));
  expect(request).toHaveBeenCalledWith("/api/v1/classes/k1/library/li2", expect.anything(), {
    method: "DELETE",
  });
});

it("says when the library is empty", async () => {
  request.mockResolvedValue({ data: [] });
  renderWithProviders(<ClassLibrarySection classId="k1" />);
  expect(await screen.findByText("Chưa có gì trong thư viện lớp.")).toBeInTheDocument();
});
