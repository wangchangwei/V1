// Catalog of UI styles users can pin to a project at creation time.
// Curated from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
// (which catalogs 67 styles). Each entry has a dense, concrete promptInjection
// prepended to the first chat message so the LLM builds with that visual
// language from the start.
//
// `name` is shown in the home page dropdown and is the value passed in the
// `&style=...` URL param. `promptInjection` is empty for the Default entry,
// meaning the user's prompt is sent untouched.
//
// Schema version: v1. If fields are added (e.g. `description`, `icon`, `tags`),
// bump this marker and version the consumer (e.g. a server-side mirror for
// analytics) so old clients and new clients agree on the contract.

export interface Style {
  name: string;
  promptInjection: string;
}

export const STYLES: Style[] = [
  {
    name: "Default",
    promptInjection: "",
  },
  {
    name: "Minimalism",
    promptInjection:
      "Apply a minimalist / Swiss-style visual language: generous whitespace, tight typographic hierarchy with one neutral sans-serif family, monochrome palette with a single restrained accent, no decorative shadows or gradients, hairline 1px borders, ample line-height, content sits on a near-white (#fafafa) surface in light mode. Icons via lucide-react at 16-20px, never emoji. Reject any ornament that does not serve information.",
  },
  {
    name: "Glassmorphism",
    promptInjection:
      "Apply a glassmorphism visual language: frosted-glass surfaces via backdrop-blur (12-20px) and translucent fills (white/5 to white/10), soft layered shadows, vibrant gradient backgrounds (e.g. blue-500 to purple-600 to pink-500) sitting behind the glass so blur has something to diffuse, 1px translucent white/20 borders, 16-24px corner radius, large display typography, content cards float above the gradient. Icons via lucide-react, never emoji. Strong contrast between glass surface and the gradient behind it.",
  },
  {
    name: "Brutalism",
    promptInjection:
      "Apply a brutalist / raw visual language: high-contrast monochrome (pure black #000 and pure white #fff, occasional single hot accent like #ff3300), no shadows, no rounded corners (radius 0), system or monospace typography, thick 2-4px solid black borders, oversized headings, asymmetric / grid-breaking layouts, exposed structure (visible grid lines, no decorative chrome), uppercase labels with wide letter-spacing. Icons via lucide-react at 20-24px, never emoji. Embrace roughness and tension.",
  },
  {
    name: "Neubrutalism",
    promptInjection:
      "Apply a neubrutalism visual language: bright, saturated colors (yellow-300, blue-500, pink-400, green-400), thick 2-3px solid black borders on every card and button, hard offset shadows (e.g. 4px 4px 0 0 #000, no blur), zero or small corner radius (rounded-md or rounded-none), bold sans-serif headings, playful but structured layouts, hover state translates the element by the shadow offset to create a 'press' feel. Icons via lucide-react, never emoji. Background is a soft pastel or off-white.",
  },
  {
    name: "Bento Grid",
    promptInjection:
      "Apply a bento-grid visual language: a CSS grid of cards with varied sizes (1x1, 2x1, 1x2, 2x2) packed tightly with small consistent gap (12-16px), each card has its own surface treatment (subtle gradient, soft border, glass, or solid color), cards are self-contained 'moments' that combine a stat / chart / illustration / callout, generous internal padding (24-32px), large display number or short label per card, 16-20px corner radius. Icons via lucide-react at 24-32px, never emoji. Mobile collapses to single column.",
  },
  {
    name: "Dark OLED",
    promptInjection:
      "Apply a dark-mode / OLED visual language: pure black (#000) backgrounds, no off-black, no gray wash — let OLED pixels turn off, text in white with secondary in zinc-400, single saturated accent (cyan-400, violet-500, or emerald-400) used sparingly for primary actions and active states, no drop shadows (use subtle 1px white/10 borders instead), high contrast, glow effects on primary CTAs only (e.g. box-shadow with the accent color at 30% opacity), generous use of negative space. Icons via lucide-react, never emoji. Avoid mid-gray surfaces — go pure black or full white.",
  },
  {
    name: "Neumorphism",
    promptInjection:
      "Apply a neumorphism visual language: soft, monochromatic surfaces (e.g. background #e0e5ec, cards the same color as background), each interactive element has dual shadows — a light shadow top-left (#ffffff at 70%) and a dark shadow bottom-right (#a3b1c6 at 70%) — to create an extruded / pressed feel, no borders, large corner radius (12-20px), low-contrast typography (slate-600 on the soft background), accent color used very sparingly (one or two buttons total), icons via lucide-react with the same soft-shadow treatment. Avoid using neumorphism for primary CTAs — they should be solid color for clarity.",
  },
  {
    name: "Editorial",
    promptInjection:
      "Apply an editorial / magazine visual language: serif body type (e.g. ui-serif, Georgia, or a humanist serif) at 17-19px, narrow measure (60-75 characters per line, max-w-prose or max-w-2xl), generous line-height (1.7+), high-contrast typography (slate-900 on near-white), sectioned by horizontal rules or large display headings, drop caps on the first paragraph of an article, pull quotes with oversized serif type, asymmetric image placement (bleed left, sit right), restrained color (black, white, one accent), icons via lucide-react at 16px for inline use only. Layout prioritizes reading rhythm over density.",
  },
  {
    name: "Cyberpunk",
    promptInjection:
      "Apply a cyberpunk / HUD visual language: near-black background (#0a0a0f) with high-saturation neon accents (cyan-400 #00f0ff, magenta-500 #ff00aa, yellow-300 #fff200) used for active states, links, and key data, monospace typography for data and labels (ui-monospace or JetBrains Mono), sans-serif for display headings, sharp 90-degree corners or very small radius (0-4px), 1px glowing borders (border with low-opacity color + box-shadow with the same color), subtle scanline or grid texture on the background, uppercase tracking-wide labels, icons via lucide-react with a thin stroke. Avoid skeuomorphic chrome — keep it flat and tech-forward.",
  },
  {
    name: "Soft UI",
    promptInjection:
      "Apply a soft-UI / claymorphism visual language: large rounded corners (16-24px) on every surface, soft pastel palette (rose-100, sky-100, violet-100, amber-100, mint-100 backgrounds with deeper pastel accents like rose-400 and sky-400 for action), layered soft shadows (e.g. shadow-lg with low opacity and large blur), no hard borders, gentle 200-300ms ease-out transitions on hover and press, oversized friendly type (rounded sans like Nunito or Inter at 16-18px), icons via lucide-react at 20-24px with rounded line caps. Surfaces feel padded and tactile, like clay.",
  },
  {
    name: "AI-Native",
    promptInjection:
      "Apply an AI-native / conversational visual language: chat surfaces dominate the layout (large message list, streaming-feel typing indicator, message bubbles with role-based color treatment — user right-aligned with subtle accent background, assistant left-aligned with neutral surface), generous padding inside messages, markdown rendering with code blocks in monospace and collapsible, copy button on every code block, suggested follow-up prompts as chip buttons below the latest assistant message, model selector visible, subtle 'thinking' affordance, dark or light surface with high text contrast. Outside the chat, supporting UI (sidebar, header) is minimal and neutral. Icons via lucide-react, never emoji.",
  },
];

export const DEFAULT_STYLE_NAME = "Default";

export function findStyleByName(name: string | null | undefined): Style | null {
  if (!name) return null;
  return STYLES.find((s) => s.name === name) ?? null;
}

// Returns the user's prompt with the style's promptInjection prepended (if any),
// separated by a `---` rule. When `style` is null or its `promptInjection` is
// empty (the Default entry), the original prompt is returned untouched.
//
// Centralized here so future call sites — system prompt injection, container
// setup, mid-flight re-application — all share one prepending rule without
// touching the consumer that calls it.
export function prependStyle(prompt: string, style: Style | null): string {
  if (!style || !style.promptInjection) return prompt;
  return `${style.promptInjection}\n\n---\n\n${prompt}`;
}
