export type Project = {
  id: string;
  title: string;
  blurb: string;
  url: string;
  color: string;
};

// Edit this list to change what the town shows. Each project gets one house, placed in src/town.ts.
export const projects: Project[] = [
  {
    id: "radio",
    title: "Radio",
    blurb: "A small internet radio.",
    url: "https://radio.zhoucai.me",
    color: "#f2c4a8",
  },
  {
    id: "studio",
    title: "Studio",
    blurb: "My creative studio.",
    url: "https://studio.zhoucai.me",
    color: "#b8cbe6",
  },
  {
    id: "reading",
    title: "Reading Companion",
    blurb: "Read with Claude beside you.",
    url: "https://read.zhoucai.me",
    color: "#f3dc9c",
  },
  {
    id: "home",
    title: "Main Site",
    blurb: "The desktop-style portfolio.",
    url: "https://zhoucai.me",
    color: "#eab3c0",
  },
];

export const projectById = (id: Project["id"]) => projects.find((p) => p.id === id)!;
