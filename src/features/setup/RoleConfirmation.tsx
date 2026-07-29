import type { RoleCapability } from "../../domain/access";
import { roleLabel, type RoleFlags } from "./teamSetupState";

interface RoleConfirmationProps {
  id: string;
  personName: string;
  roles: RoleFlags;
  error?: string;
  disabled: boolean;
  onChange: (role: RoleCapability, checked: boolean) => void;
}

export function RoleConfirmation({
  id,
  personName,
  roles,
  error,
  disabled,
  onChange
}: RoleConfirmationProps) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      className="field lab-member__tasklog"
      aria-invalid={error ? true : undefined}
      aria-describedby={errorId}
    >
      <legend>Access role</legend>
      <div
        id={id}
        className="role-checkbox-row"
        role="group"
        aria-label={`${personName || "Member"} Access roles`}
        tabIndex={-1}
      >
        {(["employee", "manager", "pi"] as const).map((role) => (
          <label className="role-checkbox" key={role}>
            <input
              type="checkbox"
              checked={roles[role]}
              disabled={disabled}
              onChange={(event) => onChange(role, event.target.checked)}
            />
            <span>{roleLabel(role)}</span>
          </label>
        ))}
      </div>
      {error ? (
        <div id={errorId} className="ui-form-field__error" role="alert">
          {error}
        </div>
      ) : null}
    </fieldset>
  );
}
