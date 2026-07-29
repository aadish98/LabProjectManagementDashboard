import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabDefinition {
  id: string;
  panelId: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabListProps {
  tabs: TabDefinition[];
  selectedTabId: string;
  onChange: (tabId: string) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  orientation?: "horizontal" | "vertical";
  activationMode?: "automatic" | "manual";
  className?: string;
}

export function TabList({
  tabs,
  selectedTabId,
  onChange,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  orientation = "horizontal",
  activationMode = "automatic",
  className
}: TabListProps) {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const enabledTabs = tabs.filter((tab) => !tab.disabled);
  const selectedIsEnabled = enabledTabs.some((tab) => tab.id === selectedTabId);
  const tabbableId = selectedIsEnabled ? selectedTabId : enabledTabs[0]?.id;

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentId: string,
    offset: number
  ) => {
    if (enabledTabs.length === 0) {
      return;
    }

    const currentIndex = enabledTabs.findIndex((tab) => tab.id === currentId);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + offset + enabledTabs.length) % enabledTabs.length;
    const next = enabledTabs[nextIndex];
    event.preventDefault();
    tabRefs.current.get(next.id)?.focus();
    if (activationMode === "automatic") {
      onChange(next.id);
    }
  };

  const moveToEdge = (
    event: KeyboardEvent<HTMLButtonElement>,
    edge: "start" | "end"
  ) => {
    event.preventDefault();
    const next = edge === "start" ? enabledTabs[0] : enabledTabs[enabledTabs.length - 1];
    if (!next) {
      return;
    }

    tabRefs.current.get(next.id)?.focus();
    if (activationMode === "automatic") {
      onChange(next.id);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tabId: string) => {
    const isRtl = window.getComputedStyle(event.currentTarget).direction === "rtl";
    const previousKey = isRtl ? "ArrowRight" : "ArrowLeft";
    const nextKey = isRtl ? "ArrowLeft" : "ArrowRight";

    if (
      (orientation === "horizontal" && event.key === previousKey) ||
      (orientation === "vertical" && event.key === "ArrowUp")
    ) {
      moveFocus(event, tabId, -1);
    } else if (
      (orientation === "horizontal" && event.key === nextKey) ||
      (orientation === "vertical" && event.key === "ArrowDown")
    ) {
      moveFocus(event, tabId, 1);
    } else if (event.key === "Home") {
      moveToEdge(event, "start");
    } else if (event.key === "End") {
      moveToEdge(event, "end");
    } else if (
      activationMode === "manual" &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      onChange(tabId);
    }
  };

  return (
    <div
      className={["ui-tab-list", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-orientation={orientation}
    >
      {tabs.map((tab) => {
        const selected = tab.id === selectedTabId;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) {
                tabRefs.current.set(tab.id, element);
              } else {
                tabRefs.current.delete(tab.id);
              }
            }}
            id={tab.id}
            className={["ui-tab-list__tab", selected && "ui-tab-list__tab--selected"]
              .filter(Boolean)
              .join(" ")}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            disabled={tab.disabled}
            tabIndex={tab.id === tabbableId ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  tabId: string;
  active: boolean;
  children: ReactNode;
  className?: string;
  tabIndex?: number;
}

export function TabPanel({
  id,
  tabId,
  active,
  children,
  className,
  tabIndex = 0
}: TabPanelProps) {
  return (
    <div
      id={id}
      className={["ui-tab-panel", className].filter(Boolean).join(" ")}
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={!active}
      tabIndex={tabIndex}
    >
      {children}
    </div>
  );
}
