import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { navigation, renderWithProviders, router } from "@/test/render";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

const PASSWORD = "hocvui2026";

async function register(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tên hiển thị"), "Lan Anh");
  await user.type(screen.getByLabelText("Email"), "lan@siroquizz.test");
  await user.type(screen.getByLabelText("Mật khẩu"), PASSWORD);
  await user.type(screen.getByLabelText("Nhập lại mật khẩu"), PASSWORD);
  await user.click(screen.getByLabelText(/Tôi đồng ý/));
  await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
}

describe("RegisterForm", () => {
  beforeEach(() => {
    router.replace.mockClear();
  });

  it("shows translated validation errors for an empty form", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);
    await user.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    expect(await screen.findByText("Mật khẩu cần ít nhất 8 ký tự.")).toBeInTheDocument();
    expect(screen.getByText("Bạn cần đồng ý với điều khoản để tiếp tục.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("creates the account, seeds three sample sets and goes home", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterForm />);
    await register(user);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
    const sets = JSON.parse(window.localStorage.getItem("siroquizz:v1:sets") ?? "[]");
    expect(sets).toHaveLength(3);
  });
});

describe("LoginForm", () => {
  beforeEach(() => {
    router.replace.mockClear();
    navigation.searchParams = new URLSearchParams("next=/library");
  });

  it("shows a generic error for wrong credentials", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "ghost@siroquizz.test");
    await user.type(screen.getByLabelText("Mật khẩu"), "sai-mat-khau-1");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByText("Email hoặc mật khẩu không đúng.")).toBeInTheDocument();
  });

  it("signs in and follows a safe ?next= path", async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<RegisterForm />);
    await register(user);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/home"));
    unmount();
    window.localStorage.removeItem("siroquizz:v1:session");

    renderWithProviders(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "lan@siroquizz.test");
    await user.type(screen.getByLabelText("Mật khẩu"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/library"));
  });
});
