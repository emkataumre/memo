import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FF5C39",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, serif",
          color: "#F2E8D5",
          fontSize: 160,
          fontWeight: 900,
          letterSpacing: "-0.05em",
          lineHeight: 1,
          paddingBottom: 18,
        }}
      >
        m
      </div>
    ),
    { ...size },
  );
}
