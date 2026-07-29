import { useLayoutEffect, type RefObject } from "react";

interface ElementState {
  inert: boolean;
  ariaHidden: string | null;
}

const modalStack: HTMLElement[] = [];
const changedElements = new Map<HTMLElement, ElementState>();
let observer: MutationObserver | null = null;
let originalBodyOverflow = "";

function restoreElement(element: HTMLElement) {
  const original = changedElements.get(element);
  if (!original) {
    return;
  }

  element.inert = original.inert;
  if (original.ariaHidden === null) {
    element.removeAttribute("aria-hidden");
  } else {
    element.setAttribute("aria-hidden", original.ariaHidden);
  }
  changedElements.delete(element);
}

function isolateTopModal() {
  const topModal = modalStack[modalStack.length - 1];
  if (!topModal) {
    for (const element of Array.from(changedElements.keys())) {
      restoreElement(element);
    }
    return;
  }

  for (const child of Array.from(document.body.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const containsTopModal = child === topModal || child.contains(topModal);
    if (containsTopModal) {
      restoreElement(child);
      continue;
    }

    if (!changedElements.has(child)) {
      changedElements.set(child, {
        inert: child.inert,
        ariaHidden: child.getAttribute("aria-hidden")
      });
    }
    child.inert = true;
    child.setAttribute("aria-hidden", "true");
  }
}

function registerModal(element: HTMLElement) {
  if (modalStack.length === 0) {
    originalBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    observer = new MutationObserver(isolateTopModal);
    observer.observe(document.body, { childList: true });
  }

  modalStack.push(element);
  isolateTopModal();
}

function unregisterModal(element: HTMLElement) {
  const index = modalStack.lastIndexOf(element);
  if (index >= 0) {
    modalStack.splice(index, 1);
  }

  isolateTopModal();
  if (modalStack.length === 0) {
    observer?.disconnect();
    observer = null;
    document.body.style.overflow = originalBodyOverflow;
  }
}

/**
 * Makes the page outside the active modal inert and locks document scrolling.
 */
export function useModalIsolation(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  useLayoutEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    registerModal(container);
    return () => unregisterModal(container);
  }, [active, containerRef]);
}
