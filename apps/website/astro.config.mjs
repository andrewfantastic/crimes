// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Astro builds a single tree rooted at `/docs/`. The repo's static
// landing page (`landing/`) is copied into `dist/` separately by
// `scripts/build.mjs`, so the two surfaces compose without conflict:
//   /             → static landing page (unchanged)
//   /docs/        → Starlight docs root
//   /docs/...     → docs pages migrated from `<repo>/docs/**/*.md`
// See `DETECTOR_SCORING_COMPLETION_PLAN.md` §11.
export default defineConfig({
  site: "https://crimes.sh",
  base: "/docs",
  trailingSlash: "always",
  // Astro's `base` only rewrites URLs — output file paths stay flat
  // unless we mirror the base in `outDir`. Writing into `dist/docs/...`
  // lets `scripts/build.mjs` drop the landing page into `dist/` on top
  // without collisions.
  outDir: "./dist/docs",
  integrations: [
    starlight({
      title: "crimes docs",
      description:
        "Documentation for `crimes`, the agent-native change & risk scanner for TypeScript / JavaScript repos.",
      logo: {
        light: "./public/favicon.svg",
        dark: "./public/favicon.svg",
        replacesTitle: false,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/andrewfantastic/crimes",
        },
      ],
      // Sidebar built from the migrated `docs/**/*.md` tree. The
      // grouping mirrors the URL plan in §11; new 0.6.0 finding-type
      // categories (structural / dependency / frontend / duplication)
      // get added in Prompt O alongside the new markdown pages.
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Agent usage", slug: "agent-usage" },
            { label: "Configuration", slug: "configuration" },
            { label: "Scoring", slug: "scoring" },
          ],
        },
        {
          label: "Finding types",
          items: [{ autogenerate: { directory: "finding-types" } }],
        },
        {
          label: "Operating",
          items: [
            { label: "CI integration", slug: "ci" },
            { label: "Suppressions", slug: "suppressions" },
            { label: "Explain", slug: "explain" },
            { label: "JSON schema", slug: "json-schema" },
            { label: "Skills", slug: "skills" },
            { label: "Releasing", slug: "releasing" },
          ],
        },
        {
          label: "Releases",
          items: [{ autogenerate: { directory: "releases" } }],
        },
      ],
    }),
  ],
});
