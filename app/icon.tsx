import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#F2E8D5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Georgia, serif",
          color: "#FF5C39",
          fontSize: 170,
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
