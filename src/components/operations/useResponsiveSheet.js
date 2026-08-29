import { useEffect, useRef, useState } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useResponsiveSheet({
  open,
  onClose,
  mediaQuery = "(max-width: 900px)",
  initialFocusSelector = "[data-sheet-autofocus='true']",
} = {}) {
  const [isSheet, setIsSheet] = useState(() => (
    typeof window !== "undefined" && Boolean(window.matchMedia?.(mediaQuery).matches)
  ));
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia(mediaQuery);
    const update = () => setIsSheet(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, [mediaQuery]);

  useEffect(() => {
    if (!isSheet || !open) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.documentElement.style.overflow;
    const mainContent = document.querySelector(".main");
    const previousMainOverflow = mainContent?.style.overflow;
    document.documentElement.style.overflow = "hidden";
    if (mainContent) mainContent.style.overflow = "hidden";
    const animationFrame = window.requestAnimationFrame(() => {
      const target = panel.querySelector(initialFocusSelector)
        || panel.querySelector(FOCUSABLE_SELECTOR)
        || panel;
      target.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.documentElement.style.overflow = previousOverflow;
      if (mainContent) mainContent.style.overflow = previousMainOverflow || "";
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) {
        window.requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
      }
    };
  }, [initialFocusSelector, isSheet, open]);

  const handleKeyDown = event => {
    if (!isSheet || !open) return;
    const panel = panelRef.current;
    if (!panel) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose?.(event);
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)]
      .filter(element => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panel.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return {
    isSheet,
    panelRef,
    panelProps: {
      ref: panelRef,
      role: isSheet ? "dialog" : undefined,
      "aria-modal": isSheet && open ? "true" : undefined,
      "aria-hidden": isSheet && !open ? "true" : undefined,
      inert: isSheet && !open ? true : undefined,
      tabIndex: isSheet ? -1 : undefined,
      "data-sheet-mode": isSheet ? "true" : undefined,
      onKeyDown: handleKeyDown,
    },
    backdropProps: {
      type: "button",
      tabIndex: -1,
      "aria-label": "Fechar dossiê",
      "aria-hidden": !isSheet || !open ? "true" : undefined,
      onClick: event => {
        if (event.target === event.currentTarget) onClose?.(event);
      },
    },
  };
}
