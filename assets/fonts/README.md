Fonts used by the PDF export (lib/pdf). All are under the SIL Open Font
License 1.1 and are redistributable:

- Inter (Rasmus Andersson) — non-note body text (schedule, papers, stats, footers)
- Inter Italic - emphasis in that same non-note text
- Roboto Mono (Christian Robertson) - code
- Fraunces (Undercase Type) - headings
- Lato (Łukasz Dziedzic) - note/prose body text, regular and bold, in the live
  notes renderer, the editor itself, and the PDF export
- Lato Italic - emphasis within note body text
- Noto Sans JP (Google / Adobe), regular and bold - used instead of the above for
  any string containing Japanese/CJK (lib/pdf/doc.ts), since none of them have
  those glyphs. Full OTF files, ~4.5 MB each

Roboto Mono is here rather than JetBrains Mono (which the UI uses for numbers)
because fontkit, inside pdfkit, throws "Offset is outside the bounds of the
DataView" when it lays out JetBrains Mono's coding ligatures - "->" and ">=" in
a code block were enough to fail the whole export.

They're committed rather than fetched at build time so the export works
offline, including when Studio is running from the USB stick.
