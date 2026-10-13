/** Moodle's orange. */
export const MOODLE_ORANGE = "#f98012";

// The supplied logo is a black glyph on an opaque white 900x768 canvas, with a
// lot of empty margin. The glyph occupies this box inside it.
const SRC = { w: 900, h: 768, gx: 163, gy: 168, gw: 575, gh: 409 };

/**
 * Moodle's logo as a white mark on an orange tile. The PNG has no
 * transparency, so it's inverted and screen-blended onto the orange: the
 * white canvas becomes black (and vanishes), the black glyph becomes white.
 */
export function MoodleIcon({ size = 18, rounded = "rounded-[5px]" }: { size?: number; rounded?: string }) {
  const k = (size * 0.74) / SRC.gw;
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 overflow-hidden ${rounded}`}
      style={{ width: size, height: size, background: MOODLE_ORANGE, isolation: "isolate" }}
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
          filter: "invert(1)",
          mixBlendMode: "screen",
        }}
      />
    </span>
  );
}
