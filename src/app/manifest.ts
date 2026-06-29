import type { MetadataRoute } from "next";

// TIM-1786: PWA web manifest. Icons are the coloured Groundwork brick mark
// (favicon source 1db9c4d0). theme_color is the Groundwork sage brand token
// (#76b39d, prompt-recipe.ts COLOR_VARIANTS.muted) — do not hard-code a new value.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Groundwork",
    short_name: "Groundwork",
    description:
      "An AI-powered planning platform to go from coffee shop idea to open doors.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#76b39d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
