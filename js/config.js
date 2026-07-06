/* =========================================================
   config.js  —  EDIT YOUR STUFF HERE
   =========================================================
   Each group has:  title, view, color, links[]
   view = which tab it shows on: "home" | "projects" | "learning" | "personal"
   Each link:  name, url   (icon letter auto-made from name)
   Add / remove / rename freely.
   ========================================================= */

const SETTINGS = {
  // your city for weather (leave "" to skip)
  city: "Rabat",
  // greeting shown in footer
  name: "Kyros",
};

const GROUPS = [
  // ---------------- HOME ----------------
  {
    title: "Work",
    col: 1,
    view: "home",
    color: "#e01e2b",
    links: [
      { name: "Notion", url: "https://notion.so" },
      { name: "Figma", url: "https://figma.com" },
      { name: "Gmail", url: "https://mail.google.com" },
      { name: "Slack", url: "https://slack.com" },
      { name: "Zoom", url: "https://zoom.us" },
      { name: "LinkedIn", url: "https://linkedin.com" },
      { name: "Google Calendar", url: "https://calendar.google.com" },
      { name: "Google Drive", url: "https://drive.google.com" },
    ],
  },
  {
    title: "News",
    col: 2,
    view: "home",
    color: "#c8412c",
    links: [
      { name: "NY Times", url: "https://nytimes.com" },
      { name: "Bloomberg", url: "https://bloomberg.com" },
      { name: "The Verge", url: "https://theverge.com" },
      { name: "Hacker News", url: "https://news.ycombinator.com" },
    ],
  },
  {
    title: "Money",
    col: 3,
    view: "home",
    color: "#b8352a",
    links: [
      { name: "Chase", url: "https://chase.com" },
      { name: "PayPal", url: "https://paypal.com" },
      { name: "Wise", url: "https://wise.com" },
      { name: "Binance", url: "https://binance.com" },
    ],
  },
  {
    title: "Sports",
    col: 3,
    view: "home",
    color: "#e01e2b",
    links: [
      { name: "ESPN", url: "https://espn.com" },
      { name: "NBA", url: "https://nba.com" },
      { name: "NFL", url: "https://nfl.com" },
      { name: "Bleacher Report", url: "https://bleacherreport.com" },
    ],
  },
  {
    title: "Social",
    col: 4,
    view: "home",
    color: "#e01e2b",
    links: [
      { name: "Instagram", url: "https://instagram.com" },
      { name: "X", url: "https://x.com" },
      { name: "TikTok", url: "https://tiktok.com" },
      { name: "Reddit", url: "https://reddit.com" },
      { name: "Discord", url: "https://discord.com/app" },
      { name: "YouTube", url: "https://youtube.com" },
    ],
  },
  {
    title: "AI",
    col: 1,
    view: "home",
    color: "#ff4d55",
    links: [
      { name: "Claude", url: "https://claude.ai" },
      { name: "ChatGPT", url: "https://chatgpt.com" },
      { name: "Gemini", url: "https://gemini.google.com" },
      { name: "Perplexity", url: "https://perplexity.ai" },
      { name: "Grok", url: "https://grok.com" },
    ],
  },
  {
    title: "Shopping",
    col: 3,
    view: "home",
    color: "#c8412c",
    links: [
      { name: "Amazon", url: "https://amazon.com" },
      { name: "AliExpress", url: "https://aliexpress.com" },
      { name: "eBay", url: "https://ebay.com" },
    ],
  },

  // ---------------- PROJECTS ----------------
  {
    title: "NullStudio",
    col: 1,
    view: "projects",
    color: "#e01e2b",
    links: [
      { name: "GitHub", url: "https://github.com/RDXFGXY1" },
      { name: "DrawSpy", url: "https://drawspy.xyz" },
      { name: "Vercel", url: "https://vercel.com/dashboard" },
      { name: "Hostinger", url: "https://hpanel.hostinger.com" },
      { name: "itch.io", url: "https://itch.io/dashboard" },
    ],
  },
  {
    title: "Dev Tools",
    col: 2,
    view: "projects",
    color: "#b8352a",
    links: [
      { name: "Godot Docs", url: "https://docs.godotengine.org" },
      { name: "Rust Docs", url: "https://doc.rust-lang.org" },
      { name: "MDN", url: "https://developer.mozilla.org" },
      { name: "crates.io", url: "https://crates.io" },
      { name: "npm", url: "https://npmjs.com" },
    ],
  },

  // ---------------- LEARNING ----------------
  {
    title: "Learn",
    col: 1,
    view: "learning",
    color: "#c8412c",
    links: [
      { name: "YouTube", url: "https://youtube.com" },
      { name: "freeCodeCamp", url: "https://freecodecamp.org" },
      { name: "Stack Overflow", url: "https://stackoverflow.com" },
      { name: "Blender Docs", url: "https://docs.blender.org" },
    ],
  },

  // ---------------- PERSONAL ----------------
  {
    title: "Personal",
    col: 1,
    view: "personal",
    color: "#ff4d55",
    links: [
      { name: "Spotify", url: "https://open.spotify.com" },
      { name: "Netflix", url: "https://netflix.com" },
      { name: "Photos", url: "https://photos.google.com" },
    ],
  },
];

/* pinned links shown in the Alt+D dock (max 8) */
const DOCK = [
  { name: "Claude", url: "https://claude.ai" },
  { name: "GitHub", url: "https://github.com" },
  { name: "YouTube", url: "https://youtube.com" },
  { name: "Gmail", url: "https://mail.google.com" },
  { name: "Discord", url: "https://discord.com/app" },
  { name: "Reddit", url: "https://reddit.com" },
];
