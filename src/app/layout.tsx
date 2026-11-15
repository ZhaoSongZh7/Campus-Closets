import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { AppProvider } from "@/components/app-provider"

import "./globals.css"

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Campus Closet — rent outfits from closets nearby",
  description:
    "A local, peer-to-peer clothing rental marketplace. Try outfits on in person, reserve your dates, and pick up nearby.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
