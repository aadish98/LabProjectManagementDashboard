import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedControlOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  panelId?: string;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  name?: string;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  orientation = "horizontal",
  disabled = false,
  name,
  className
}: SegmentedControlProps) {
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const enabledOptions = options.filter((option) => !disabled && !option.disabled);
  const selectedIsEnabled = enabledOptions.some((option) => option.value === value);
  const tabbableValue = selectedIsEnabled ? value : enabledOptions[0]?.value;

  const selectAtOffset = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentValue: string,
    offset: number
  ) => {
    if (enabledOptions.length === 0) {
      return;
    }

    const currentIndex = enabledOptions.findIndex((option) => option.value === currentValue);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + offset + enabledOptions.length) % enabledOptions.length;
    const next = enabledOptions[nextIndex];
    event.preventDefault();
    onChange(next.value);
    buttonRefs.current.get(next.value)?.focus();
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentValue: string
  ) => {
    const isRtl = window.getComputedStyle(event.currentTarget).direction === "rtl";
    const previousKey = isRtl ? "ArrowRight" : "ArrowLeft";
    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";

    if (event.key === previousKey || event.key === "ArrowUp") {
      selectAtOffset(event, currentValue, -1);
    } else if (event.key === nextKey || event.key === "ArrowDown") {
      selectAtOffset(event, currentValue, 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? enabledOptions[0]
          : enabledOptions[enabledOptions.length - 1];
      if (next) {
        onChange(next.value);
        buttonRefs.current.get(next.value)?.focus();
      }
    }
  };

  return (
    <div
      className={["ui-segmented-control", className].filter(Boolean).join(" ")}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-orientation={orientation}
      aria-disabled={disabled || undefined}
    >
      {name ? <input type="hidden" name={name} value={value} disabled={disabled} /> : null}
      {options.map((option) => {
        const optionDisabled = disabled || option.disabled;
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            ref={(element) => {
              if (element) {
                buttonRefs.current.set(option.value, element);
              } else {
                buttonRefs.current.delete(option.value);
              }
            }}
            className={[
              "ui-segmented-control__option",
              selected && "ui-segmented-control__option--selected"
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            aria-controls={option.panelId}
            disabled={optionDisabled}
            tabIndex={option.value === tabbableValue ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
