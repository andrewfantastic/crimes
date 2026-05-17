// Tailwind config establishes the design-token scale; the hex literals
// in src/Card.tsx escape it, which design_token_escape should flag.
export default {
  theme: {
    colors: {
      brand: "#0050ff",
      surface: "#f7f7fa",
      ink: "#111111",
    },
  },
};
