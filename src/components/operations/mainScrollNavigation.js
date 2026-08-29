const EDITABLE_TARGETS = "input, textarea, select, [contenteditable='true']";

export function handleMainScrollKey(event) {
  if (
    event.defaultPrevented
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || event.isComposing
    || event.target?.closest?.(EDITABLE_TARGETS)
    || event.target !== event.currentTarget
  ) return;

  const main = event.currentTarget;
  if (!main?.scrollTo) return;
  const mainOverflow = main.ownerDocument?.defaultView?.getComputedStyle?.(main)?.overflowY;
  if (main.style?.overflowY === "hidden" || mainOverflow === "hidden") return;

  const maximum = Math.max(0, main.scrollHeight - main.clientHeight);
  const page = Math.max(240, Math.round(main.clientHeight * 0.85));
  let next;

  if (event.key === "PageDown") next = Math.min(maximum, main.scrollTop + page);
  else if (event.key === "PageUp") next = Math.max(0, main.scrollTop - page);
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = maximum;
  else return;

  event.preventDefault();
  main.scrollTo({ top: next, behavior: "auto" });
}
