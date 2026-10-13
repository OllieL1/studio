/** Moodle's orange. */
export const MOODLE_ORANGE = "#ea7208";

// The supplied logo is a black glyph on an opaque white 900x768 canvas, with a
// lot of empty margin. The glyph occupies this box inside it.
const SRC = { w: 900, h: 768, gx: 163, gy: 168, gw: 575, gh: 409 };

/**
 * Moodle's logo - a white mark on an orange tile, or (`plain`) just the glyph
 * in the text colour. The PNG has no transparency, so it's blended onto what
 * is behind it: inverted and screened onto the orange (the white canvas becomes
 * black and vanishes, the black glyph becomes white), or multiplied onto the
 * page (white vanishes, black stays) - flipped in the dark theme, see
 * `--moodle-mono-*` in globals.css.
 */
export function MoodleIcon({
  size = 18,
  rounded = "rounded-[5px]",
  plain = false,
}: {
  size?: number;
  rounded?: string;
  plain?: boolean;
}) {
  const k = (size * (plain ? 0.9 : 0.74)) / SRC.gw;
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 overflow-hidden ${plain ? "" : rounded}`}
      style={plain ? { width: size, height: size } : { width: size, height: size, background: MOODLE_ORANGE, isolation: "isolate" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/moodle-icon.png"
        alt=""
        draggable={false}
        className="absolute max-w-none"
        style={{
          width: SRC.w * k,
          height: SRC.h * k,
          left: (size - SRC.gw * k) / 2 - SRC.gx * k,
          top: (size - SRC.gh * k) / 2 - SRC.gy * k,
          filter: plain ? "var(--moodle-mono-filter)" : "invert(1)",
          mixBlendMode: plain ? ("var(--moodle-mono-blend)" as "multiply") : "screen",
        }}
      />
    </span>
  );
}
