import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { AiJobIndicator } from "./AiJobIndicator";

const link = () => screen.getByRole("link");

describe("AiJobIndicator", () => {
  it("stays hidden while nothing is generating", () => {
    renderWithProviders(<AiJobIndicator phase={{ name: "compose" }} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("shows the stage and progress of a running generation, linking to the generator", () => {
    renderWithProviders(
      <AiJobIndicator
        phase={{ name: "generating", stage: "generating", progress: { completed: 3, total: 12 } }}
      />,
    );
    expect(link()).toHaveAttribute("href", "/sets/new/ai");
    expect(link()).toHaveTextContent("AI đang tạo thẻ");
    expect(link()).toHaveTextContent("Tạo thẻ · 3/12 phần");
  });
  it("shows the queue position and the free-quota wait", () => {
    const view = renderWithProviders(
      <AiJobIndicator
        phase={{ name: "generating", stage: "queued", progress: { queuePosition: 2 } }}
      />,
    );
    expect(link()).toHaveTextContent("Đang xếp hàng · còn 2 lượt");
    view.unmount();
    renderWithProviders(
      <AiJobIndicator
        phase={{ name: "generating", stage: "reading", progress: { waiting: true } }}
      />,
    );
    expect(link()).toHaveTextContent("Chờ hạn mức AI miễn phí");
  });
  it("asks for the go-ahead and announces a finished set", () => {
    const view = renderWithProviders(
      <AiJobIndicator
        phase={{ name: "confirm", estimate: {} as never, decide: () => undefined }}
      />,
    );
    expect(link()).toHaveTextContent("Cần bạn xác nhận");
    view.unmount();
    renderWithProviders(
      <AiJobIndicator
        phase={{
          name: "review",
          cards: [],
          title: "x",
          notice: null,
          options: { termLang: "zh", definitionLang: "vi", cardCount: 5, includePhonetic: true },
        }}
      />,
    );
    expect(link()).toHaveTextContent("Bộ thẻ AI đã sẵn sàng");
    expect(link()).toHaveTextContent("Xem lại và lưu");
  });
});
