/** A keyboard shortcut written for people: "⌘↵", "?", ":". */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[18px] items-center justify-center rounded border border-n-200 bg-n-0 px-1 font-num text-[10.5px] font-medium leading-[16px] text-n-600">
      {children}
    </kbd>
  );
}
