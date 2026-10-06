import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { creditsForCards } from "../lib/credits";
import type { CreditEstimate } from "../schemas";
import { ConfirmEstimate } from "./ConfirmEstimate";

const chunkTokens = Array.from({ length: 20 }, () => 2500);
const estimate = (available: number): CreditEstimate => ({
  credits: creditsForCards(40),
  usedCredits: 2,
  cardCount: 40,
  chunkTokens,
  quota: {
    dailyLimit: 20,
    dailyUsed: 20 - available,
    dailyRemaining: available,
    earned: 0,
    reserved: 0,
    available,
    resetsAt: "2026-10-05T17:00:00.000Z",
  },
  maxJobCredits: 50,
});

describe("ConfirmEstimate", () => {
  it("prices the requested cards and goes ahead with the chosen count", async () => {
    const onDecide = vi.fn();
    renderWithProviders(<ConfirmEstimate estimate={estimate(40)} onDecide={onDecide} />);
    const total = creditsForCards(40) + 2;
    await userEvent.click(screen.getByRole("button", { name: `Tạo thẻ (${total} credit)` }));
    expect(onDecide).toHaveBeenCalledWith(40);
    expect(screen.getByText(/Đã dùng 2 credit để máy chủ đọc/)).toBeInTheDocument();
  });

  it("blocks a request the user cannot afford until fewer cards are asked for", async () => {
    const onDecide = vi.fn();
    renderWithProviders(<ConfirmEstimate estimate={estimate(8)} onDecide={onDecide} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không đủ credit");
    expect(screen.getByRole("button", { name: /Tạo thẻ/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Số thẻ"), { target: { value: "5" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Tạo thẻ/ }));
    expect(onDecide).toHaveBeenCalledWith(5);
  });

  it("explains the per-generation limit", () => {
    renderWithProviders(
      <ConfirmEstimate
        estimate={{ ...estimate(400), cardCount: 200, usedCredits: 5 }}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Vượt giới hạn 50 credit");
  });

  it("cancels", async () => {
    const onDecide = vi.fn();
    renderWithProviders(<ConfirmEstimate estimate={estimate(40)} onDecide={onDecide} />);
    await userEvent.click(screen.getByRole("button", { name: "Hủy" }));
    expect(onDecide).toHaveBeenCalledWith(null);
  });
});
