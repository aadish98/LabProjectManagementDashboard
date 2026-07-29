import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ONBOARDING_STATUSES,
  ONBOARDING_STATUS_LABELS,
  type OnboardingStatus
} from "../../domain/onboarding";
import { MemberEditor } from "./MemberEditor";
import { makePerson, type PersonDraft } from "./teamSetupState";

describe("member removal", () => {
  it("delegates removal to the managed confirmation dialog", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <MemberEditor
        person={makePerson({
          name: "Ada Lovelace",
          email: "ada@example.com"
        })}
        issues={[]}
        controlsDisabled={false}
        saveDisabled={true}
        saveText="Saved"
        removalPending={false}
        onUpdate={vi.fn()}
        onRoleChange={vi.fn()}
        onPickWorkbook={vi.fn()}
        onRefreshTabs={vi.fn()}
        onSave={vi.fn()}
        onProvision={vi.fn()}
        onRemove={onRemove}
      />
    );

    await user.click(screen.getByRole("button", { name: "Deactivate Member" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe("member lifecycle status", () => {
  it.each(ONBOARDING_STATUSES)(
    "renders the authoritative %s label, owner, reason, and next action",
    (status) => {
      const person = makePerson({
        name: "Ada Lovelace",
        email: "ada@example.com",
        onboarding: onboarding(status)
      });

      renderEditor(person);

      expect(screen.getByText(ONBOARDING_STATUS_LABELS[status])).toBeInTheDocument();
      expect(screen.getByText("Owner: member")).toBeInTheDocument();
      expect(screen.getByText(`Reason for ${status}`)).toBeInTheDocument();
      expect(screen.getByText(`Next: Next action for ${status}`)).toBeInTheDocument();
    }
  );
});

function onboarding(status: OnboardingStatus) {
  return {
    status,
    owner: "member" as const,
    reason: `Reason for ${status}`,
    nextAction: `Next action for ${status}`,
    updatedAt: "2026-07-15T12:00:00.000Z",
    ...(status === "blocked" ? { blockedFrom: "needsPicker" as const } : {})
  };
}

function renderEditor(person: PersonDraft) {
  return render(
    <MemberEditor
      person={person}
      issues={[]}
      controlsDisabled={false}
      saveDisabled
      saveText="Saved"
      removalPending={false}
      onUpdate={vi.fn()}
      onRoleChange={vi.fn()}
      onPickWorkbook={vi.fn()}
      onRefreshTabs={vi.fn()}
      onSave={vi.fn()}
      onProvision={vi.fn()}
      onRemove={vi.fn()}
    />
  );
}
