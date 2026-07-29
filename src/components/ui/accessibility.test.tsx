import { useRef, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Dialog,
  FormField,
  SegmentedControl,
  StatusBanner,
  TabList,
  TabPanel
} from ".";

describe("accessible UI primitives", () => {
  it("labels, traps, closes, and restores focus for dialogs", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      const initialRef = useRef<HTMLInputElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open editor
          </button>
          <Dialog
            open={open}
            title="Edit task"
            description="Update the selected task."
            onClose={() => setOpen(false)}
            initialFocusRef={initialRef}
          >
            <input ref={initialRef} aria-label="Task name" />
            <button type="button">Save</button>
          </Dialog>
        </>
      );
    }

    const { container } = render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open editor" });
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Edit task" });
    expect(dialog).toHaveAccessibleDescription(
      "Update the selected task."
    );
    const taskName = screen.getByRole("textbox", { name: "Task name" });
    const save = screen.getByRole("button", { name: "Save" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(taskName).toHaveFocus();
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveProperty("inert", true);

    save.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(save).toHaveFocus();

    trigger.focus();
    expect(taskName).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(container.inert).not.toBe(true);
  });

  it("connects field errors and exposes dismissible live status semantics", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <>
        <FormField id="project" label="Project" error="Project is required" required>
          <input />
        </FormField>
        <StatusBanner tone="success" onDismiss={onDismiss}>Saved</StatusBanner>
        <StatusBanner tone="error">Could not save</StatusBanner>
      </>
    );

    const field = screen.getByRole("textbox", { name: /Project/ });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Project is required");
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(
      screen.getAllByRole("alert").find((alert) => alert.textContent === "Could not save")
    ).toBeInTheDocument();
  });

  it("supports arrow-key tabs and selected view semantics", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [tab, setTab] = useState("tab-one");
      const [view, setView] = useState("kanban");
      return (
        <>
          <TabList
            aria-label="Task tabs"
            selectedTabId={tab}
            onChange={setTab}
            tabs={[
              { id: "tab-one", panelId: "panel-one", label: "One" },
              { id: "tab-two", panelId: "panel-two", label: "Two" }
            ]}
          />
          <TabPanel id="panel-one" tabId="tab-one" active={tab === "tab-one"}>
            First
          </TabPanel>
          <TabPanel id="panel-two" tabId="tab-two" active={tab === "tab-two"}>
            Second
          </TabPanel>
          <SegmentedControl
            aria-label="Workspace view"
            value={view}
            onChange={setView}
            options={[
              { value: "kanban", label: "Kanban", panelId: "workspace-panel" },
              { value: "gantt", label: "Gantt", panelId: "workspace-panel" }
            ]}
          />
          <section id="workspace-panel" aria-label="Selected workspace view">
            {view}
          </section>
        </>
      );
    }

    render(<Harness />);
    const firstTab = screen.getByRole("tab", { name: "One" });
    expect(firstTab).toHaveAttribute("aria-controls", "panel-one");
    expect(screen.getByRole("tabpanel", { name: "One" })).toHaveAttribute(
      "aria-labelledby",
      "tab-one"
    );
    firstTab.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(firstTab).toHaveAttribute("aria-selected", "true");

    const kanban = screen.getByRole("radio", { name: "Kanban" });
    expect(kanban).toHaveAttribute("aria-controls", "workspace-panel");
    kanban.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Gantt" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("region", { name: "Selected workspace view" })).toHaveTextContent(
      "gantt"
    );
  });
});
