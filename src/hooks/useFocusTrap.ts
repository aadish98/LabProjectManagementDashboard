import { useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

const focusTrapStack: HTMLElement[] = [];

function isAvailable(element: HTMLElement) {
  if (
    element.hidden ||
    element.getAttribute("aria-hidden") === "true" ||
    element.closest("[inert], [aria-hidden='true']")
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && isAvailable(element)
  );
}

function getInitialTarget(
  container: HTMLElement,
  requestedTarget?: HTMLElement | null
) {
  if (
    requestedTarget &&
    container.contains(requestedTarget) &&
    !requestedTarget.matches(":disabled") &&
    isAvailable(requestedTarget)
  ) {
    return requestedTarget;
  }
  const declaredTarget = container.querySelector<HTMLElement>("[data-dialog-initial-focus]");
  if (
    declaredTarget &&
    !declaredTarget.matches(":disabled") &&
    isAvailable(declaredTarget)
  ) {
    return declaredTarget;
  }
  return getFocusableElements(container)[0] ?? container;
}

interface UseFocusTrapOptions {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onEscape?: () => void;
  restoreFocus?: boolean;
}

/**
 * Contains keyboard and programmatic focus inside a surface while it is active.
 */
export function useFocusTrap({
  active,
  containerRef,
  initialFocusRef,
  onEscape,
  restoreFocus = true
}: UseFocusTrapOptions) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusTrapStack.push(container);
    const initialTarget = getInitialTarget(container, initialFocusRef?.current);
    initialTarget.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (focusTrapStack[focusTrapStack.length - 1] !== container) {
        return;
      }

      if (event.key === "Escape" && onEscapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !container.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !container.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (focusTrapStack[focusTrapStack.length - 1] !== container) {
        return;
      }

      if (event.target instanceof Node && !container.contains(event.target)) {
        const fallback = getInitialTarget(container, initialFocusRef?.current);
        fallback.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      const stackIndex = focusTrapStack.lastIndexOf(container);
      if (stackIndex >= 0) {
        focusTrapStack.splice(stackIndex, 1);
      }

      if (restoreFocus && previouslyFocused) {
        queueMicrotask(() => {
          if (previouslyFocused.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [active, containerRef, initialFocusRef, restoreFocus]);
}
