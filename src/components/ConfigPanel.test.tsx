import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfigPanel } from "./ConfigPanel";

const picker = vi.hoisted(() => vi.fn());
vi.mock("../services/googleDrivePicker", () => ({
  openSpreadsheetPicker: picker
}));

describe("admin workbook switching", () => {
  it("keeps the current workbook until the switch is explicitly confirmed", async () => {
    picker.mockResolvedValue([{
      id: "new-admin",
      name: "New admin",
      url: "https://docs.google.com/spreadsheets/d/new-admin/edit"
    }]);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfigPanel
        config={{
          adminSpreadsheetId: "https://docs.google.com/spreadsheets/d/current-admin/edit",
          googleClientId: "client",
          googleApiKey: "key",
          googleAppId: "app"
        }}
        session={{
          email: "manager@example.com",
          name: "Manager",
          accessToken: "token"
        }}
        onChange={onChange}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Change Admin workbook" }));
    expect(await screen.findByText("Change the Admin workbook?")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep current workbook" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies the selected workbook only after explicit confirmation", async () => {
    picker.mockResolvedValue([{
      id: "new-admin",
      name: "New admin",
      url: "https://docs.google.com/spreadsheets/d/new-admin/edit"
    }]);
    const config = {
      adminSpreadsheetId: "https://docs.google.com/spreadsheets/d/current-admin/edit",
      googleClientId: "client",
      googleApiKey: "key",
      googleAppId: "app"
    };
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfigPanel
        config={config}
        session={{
          email: "manager@example.com",
          name: "Manager",
          accessToken: "token"
        }}
        onChange={onChange}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Change Admin workbook" }));
    await user.click(await screen.findByRole("button", { name: "Confirm switch" }));

    expect(onChange).toHaveBeenCalledWith({
      ...config,
      adminSpreadsheetId: "https://docs.google.com/spreadsheets/d/new-admin/edit"
    });
  });

  it("links configuration errors and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    render(
      <ConfigPanel
        config={{
          adminSpreadsheetId: "",
          googleClientId: "",
          googleApiKey: "",
          googleAppId: ""
        }}
        onChange={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save and close" }));

    const adminButton = screen.getByRole("button", { name: "Choose from Drive" });
    expect(adminButton).toHaveFocus();
    expect(adminButton).toHaveAttribute("aria-invalid", "true");
    expect(adminButton).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining("config-admin-workbook-error")
    );
    expect(
      screen.getAllByRole("alert").some((alert) =>
        alert.textContent?.includes("Admin workbook is required")
      )
    ).toBe(true);
  });
});
