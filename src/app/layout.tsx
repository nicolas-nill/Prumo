import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import { Providers } from '@/components/providers'
import './globals.css'

const dmSans = localFont({
  src: './fonts/DMSans-Variable.woff2',
  variable: '--font-dm-sans',
  weight: '100 1000',
  display: 'swap',
})

const manrope = localFont({
  src: './fonts/Manrope-Variable.woff2',
  variable: '--font-manrope',
  weight: '200 800',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'PRUMO', template: '%s · PRUMO' },
  description: 'Seu dinheiro no prumo. Registre gastos pelo WhatsApp e acompanhe tudo com clareza — sozinho ou a dois.',
  applicationName: 'PRUMO',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1613' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${dmSans.variable} ${manrope.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
