import type { MetadataRoute } from "next";

// Web app manifest — makes Warmap installable as a PWA (issue #3 / #5.1).
// Next.js automatically injects the <link rel="manifest"> tag for this route.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Warmap — Real-time Conflict Intelligence",
    short_name: "Warmap",
    description:
      "Live map of war-related events aggregated from trusted news sources, geolocated and classified automatically.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["news", "navigation", "utilities"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
