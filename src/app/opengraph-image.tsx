import { ImageResponse } from "next/og";
import { SCHOOL } from "@/shared/lib/constants";

export const alt = "NK Public School — Best CBSE School in Jaipur Since 1985";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "72px 80px",
          background:
            "linear-gradient(135deg, #0a1628 0%, #1e3a5f 50%, #0a1628 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 22,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "#fbbf24",
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a1628",
              fontSize: 26,
              fontWeight: 900,
            }}
          >
            NK
          </div>
          <span>CBSE Affiliated · Est. 1985</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Best CBSE School</span>
            <span style={{ color: "#fbbf24" }}>in Jaipur</span>
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#cbd5e1", maxWidth: 900 }}>
            {`${SCHOOL.name} — ${SCHOOL.address.line1}, ${SCHOOL.address.city}`}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid rgba(251,191,36,0.25)",
            paddingTop: 24,
          }}
        >
          <div style={{ display: "flex", gap: 40, fontSize: 22 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 32 }}>
                20,000+
              </span>
              <span style={{ color: "#94a3b8" }}>Students</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 32 }}>
                40+
              </span>
              <span style={{ color: "#94a3b8" }}>Years</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 32 }}>
                Nursery → XII
              </span>
              <span style={{ color: "#94a3b8" }}>Co-educational</span>
            </div>
          </div>
          <div style={{ fontSize: 20, color: "#64748b" }}>
            nkpublicschool.com
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
