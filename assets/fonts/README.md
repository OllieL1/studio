Fonts used by the PDF export (lib/pdf). Both are under the SIL Open Font
License 1.1 and are redistributable:

- Inter (Rasmus Andersson) — body text
- Inter Italic - emphasis in notes
- Roboto Mono (Christian Robertson) - code
- Fraunces (Undercase Type) - headings

Roboto Mono is here rather than JetBrains Mono (which the UI uses for numbers)
because fontkit, inside pdfkit, throws "Offset is outside the bounds of the
DataView" when it lays out JetBrains Mono's coding ligatures - "->" and ">=" in
a code block were enough to fail the whole export.

They're committed rather than fetched at build time so the export works
offline, including when Studio is running from the USB stick.
