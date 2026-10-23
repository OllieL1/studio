import type { CvDoc } from "./model";

type Raw = Omit<CvDoc, "contact" | "sections"> & { contact: unknown[]; sections: unknown[] };

/**
 * A new master CV: the shape of one with nothing personal in it. The real CV
 * lives only in the database - never in the repository - so this is all a
 * fresh database starts from. Fill it in on the page, or bring a version in
 * with Import JSON.
 */
export const BLANK_CV: Raw = {
  name: "Your name",
  headline: "What you do",
  accent: "#8156d2",
  fit: true,
  scale: 1,
  contact: [
    { stack: true, label: "Email", text: "" },
    { stack: true, label: "Phone", text: "" },
    { stack: true, label: "Location", text: "" },
    { label: "Website", text: "" },
  ],
  sections: [
    { type: "text", title: "Profile", text: "" },
    { type: "entries", title: "Experience", items: [] },
    { type: "skills", title: "Skillset", items: [] },
    { type: "list", title: "Projects", cols: 1, items: [] },
    { type: "entries", title: "Education", items: [] },
  ],
};
