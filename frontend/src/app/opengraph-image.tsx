import { ImageResponse } from "next/og"

export const runtime = "edge"

export const alt = "Demper \u2014 \u0431\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 | 7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0D0D0D 0%, #1a1a2e 50%, #16213e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            marginBottom: 16,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          Demper
        </div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: "#e0e0e0",
            marginBottom: 32,
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: 900,
          }}
        >
          {"\u0411\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 \u2014 \u0430\u0432\u0442\u043e\u0434\u0435\u043c\u043f\u0438\u043d\u0433 \u0446\u0435\u043d"}
        </div>
        <div
          style={{
            display: "flex",
            gap: 32,
            fontSize: 20,
            color: "#a0a0a0",
            marginBottom: 40,
          }}
        >
          <span>{"\u0414\u0435\u043c\u043f\u0438\u043d\u0433"}</span>
          <span>{"\u00B7"}</span>
          <span>{"\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430"}</span>
          <span>{"\u00B7"}</span>
          <span>WhatsApp</span>
          <span>{"\u00B7"}</span>
          <span>{"\u0418\u0418-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442\u044b"}</span>
        </div>
        {/* CTA Button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            padding: "16px 40px",
            borderRadius: 12,
            fontSize: 24,
            fontWeight: 700,
            color: "#ffffff",
          }}
        >
          {"7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e + 10 \u0434\u043d\u0435\u0439 \u043f\u0440\u0438 \u043e\u043f\u043b\u0430\u0442\u0435"}
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 40,
            fontSize: 20,
            color: "#666",
          }}
        >
          cube-demper.shop
        </div>
      </div>
    ),
    { ...size }
  )
}
