/**
 * A made-up CV in the old builder's shape - every kind of section, a role
 * with skill tags - for testing the CV model without anyone's real details.
 */
export const SAMPLE_CV = {
  name: "Alex Example",
  headline: "Engineer · Writer",
  accent: "#3d6bff",
  fit: true,
  scale: 1,
  contact: [
    { stack: true, label: "Email", text: "alex@example.com" },
    { stack: true, label: "Phone", text: "+44 0000 000000" },
    { stack: true, label: "Location", text: "Somewhere" },
    { label: "Website", text: "example.com" },
  ],
  sections: [
    { type: "text", title: "Profile", text: "Builds careful software." },
    {
      type: "stats",
      title: "Highlights",
      items: [
        { value: "3", label: "Products shipped" },
        { value: "1st", label: "Class degree" },
      ],
    },
    {
      type: "entries",
      title: "Experience",
      items: [
        {
          title: "Software Engineer",
          org: "Acme Ltd",
          date: "2024 - 2026",
          tags: "TypeScript, React, SQL",
          bullets: [
            { t: "Built the billing service" },
            { t: "Cut page load time in half" },
            { t: "Led a team of four" },
          ],
        },
        {
          title: "Intern",
          org: "Widget Co",
          date: "2023",
          tags: "Python",
          bullets: [{ t: "Wrote the data pipeline" }],
        },
      ],
    },
    {
      type: "skills",
      title: "Skillset",
      items: [
        { label: "Languages", text: "TypeScript, Python, SQL" },
        { label: "Tools", text: "React, Git" },
      ],
    },
    {
      type: "list",
      title: "Projects",
      cols: 1,
      items: [
        { title: "Planner", text: "A study planner" },
        { on: false, title: "Old site", text: "A personal website" },
      ],
    },
    {
      type: "entries",
      title: "Education",
      items: [{ title: "BSc Computing", org: "A University", date: "2020 - 2024", bullets: [{ t: "First" }] }],
    },
  ],
};
