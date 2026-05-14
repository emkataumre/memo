import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "memo",
    short_name: "memo",
    description: "private. two of us. forever.",
    start_url: "/canvas",
    display: "standalone",
    background_color: "#F2E8D5",
    theme_color: "#181615",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon1",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
