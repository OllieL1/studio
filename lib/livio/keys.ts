/** True when a key press belongs to a text field, not to the page's shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (target as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(type);
}


/**
 * For inputs that are commands or cell edits, never form fields. Chrome
 * ignores autocomplete="off" when it guesses a field wants an email - and a
 * placeholder mentioning "cold email" was enough - so this also gives it a
 * name it can't match and tells password managers to stay out.
 */
export const NO_AUTOFILL = {
  name: "livio-command",
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
} as const;
