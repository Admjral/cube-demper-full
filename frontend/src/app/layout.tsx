import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import Script from "next/script"
import { Providers } from "@/components/providers"
import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
})

export const metadata: Metadata = {
  metadataBase: new URL("https://cube-demper.shop"),
  title: {
    default: "Demper \u2014 \u0431\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 | \u0414\u0435\u043c\u043f\u0438\u043d\u0433, \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430, WhatsApp",
    template: "%s | Demper",
  },
  description: "\u0411\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430: \u0430\u0432\u0442\u043e\u0434\u0435\u043c\u043f\u0438\u043d\u0433 \u0446\u0435\u043d, \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043f\u0440\u043e\u0434\u0430\u0436, WhatsApp \u0440\u0430\u0441\u0441\u044b\u043b\u043a\u0438 \u0438 \u0418\u0418-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442\u044b. 500+ \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u043e\u0432. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e.",
  keywords: ["\u043a\u0430\u0441\u043f\u0438 \u0431\u043e\u0442", "\u0431\u043e\u0442 \u043a\u0430\u0441\u043f\u0438", "\u043a\u0430\u0441\u043f\u0438 \u0441\u0435\u043b\u043b\u0435\u0440", "\u0434\u0435\u043c\u043f\u0438\u043d\u0433 \u043a\u0430\u0441\u043f\u0438", "\u0431\u043e\u0442 \u0434\u043b\u044f \u043a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430", "\u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u043a\u0430\u0441\u043f\u0438", "\u043a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d \u0431\u043e\u0442", "\u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043a\u0430\u0441\u043f\u0438", "kaspi bot", "demper"],
  authors: [{ name: "Demper" }],
  creator: "Demper",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "https://cube-demper.shop",
    siteName: "Demper",
    title: "Demper \u2014 \u0431\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 | 7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e",
    description: "\u0410\u0432\u0442\u043e\u0434\u0435\u043c\u043f\u0438\u043d\u0433 \u0446\u0435\u043d, \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043f\u0440\u043e\u0434\u0430\u0436, WhatsApp \u0440\u0430\u0441\u0441\u044b\u043b\u043a\u0438 \u0438 \u0418\u0418-\u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043d\u0442\u044b \u0434\u043b\u044f \u0441\u0435\u043b\u043b\u0435\u0440\u043e\u0432 Kaspi.kz. 7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e + 10 \u0434\u043d\u0435\u0439 \u043f\u0440\u0438 \u043e\u043f\u043b\u0430\u0442\u0435 \u043b\u044e\u0431\u043e\u0433\u043e \u0442\u0430\u0440\u0438\u0444\u0430",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Demper \u2014 \u0431\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430, 7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Demper \u2014 \u0431\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430 | 7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e",
    description: "\u0410\u0432\u0442\u043e\u0434\u0435\u043c\u043f\u0438\u043d\u0433 \u0446\u0435\u043d, \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430, WhatsApp \u0438 \u0418\u0418 \u0434\u043b\u044f \u0441\u0435\u043b\u043b\u0435\u0440\u043e\u0432 Kaspi.kz. 7 \u0434\u043d\u0435\u0439 \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e + 10 \u0434\u043d\u0435\u0439 \u043f\u0440\u0438 \u043e\u043f\u043b\u0430\u0442\u0435",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Demper",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0D0D" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-T08F3LQ2WF"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-T08F3LQ2WF');
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Demper",
              url: "https://cube-demper.shop",
              logo: "https://cube-demper.shop/logodark.svg",
              description:
                "\u0411\u043e\u0442 \u0434\u043b\u044f \u041a\u0430\u0441\u043f\u0438 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430: \u0430\u0432\u0442\u043e\u0434\u0435\u043c\u043f\u0438\u043d\u0433 \u0446\u0435\u043d \u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044f \u043f\u0440\u043e\u0434\u0430\u0436 \u043d\u0430 Kaspi.kz",
              contactPoint: {
                "@type": "ContactPoint",
                telephone: "+7-747-611-7623",
                contactType: "customer service",
                availableLanguage: ["Russian", "Kazakh"],
              },
              sameAs: [
                "https://wa.me/77476117623",
                "https://t.me/demper_kz",
                "https://instagram.com/demper.kz",
              ],
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Demper",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description:
                "\u0411\u043e\u0442 \u0434\u043b\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0434\u0435\u043c\u043f\u0438\u043d\u0433\u0430 \u0446\u0435\u043d \u043d\u0430 Kaspi.kz, \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043f\u0440\u043e\u0434\u0430\u0436, WhatsApp \u0440\u0430\u0441\u0441\u044b\u043b\u043a\u0438",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "21990",
                highPrice: "33990",
                priceCurrency: "KZT",
              },
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
