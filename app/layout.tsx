import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CEO Dashboard',
  description: 'Panel de control ejecutivo',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  )
}
