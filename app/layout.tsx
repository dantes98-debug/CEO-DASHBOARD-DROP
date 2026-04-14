import type { Metadata, Viewport } from 'next'
import './globals.css'
import PushSetup from '@/components/PushSetup'

export const metadata: Metadata = {
  title: 'Drop Dashboard',
  description: 'CEO Dashboard — Drop Griferías',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Drop',
  },
  icons: {
    apple: '/icon.svg',
    icon: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon.svg" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Drop" />
      </head>
      <body className="bg-background text-text-primary antialiased">
        {children}
        <PushSetup />
      </body>
    </html>
  )
}
