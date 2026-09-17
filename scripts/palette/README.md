# Palette validation

`validate_palette.js` is vendored from the Claude `dataviz` skill so the course
palette stays reproducible — the skill's own path changes between sessions.

The course colours in `prisma/seed.ts` were **computed, not chosen**: a search
over OKLCH space for the most muted set that still passes every check. Re-run it
whenever a course is added:

```bash
node scripts/palette/validate_palette.js "#8A4430,#B28944,…" --mode light
```

Six checks: lightness band, chroma floor, colourblind (CVD) separation of
adjacent pairs, normal-vision separation, and contrast against the surface.
Adjacent pairs are what's checked, so **colours are assigned in course order** —
two courses next to each other in a legend are exactly the pairs verified.
