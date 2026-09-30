'use client'

import { ThemeProvider, useTheme } from 'next-themes'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

function ThemedToaster() {
  const { resolvedTheme } = useTheme()
  return (
    <Toaster
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      position="bottom-center"
      offset={88}
      mobileOffset={96}
      toastOptions={{
        classNames: {
          toast: '!rounded-[14px] !border-border !bg-surface-elevated !text-fg !shadow-md !font-sans',
          description: '!text-fg-muted',
          actionButton: '!bg-primary !text-primary-fg !rounded-[8px]',
        },
      }}
    />
  )
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="prumo-theme" disableTransitionOnChange>
      {children}
      <ThemedToaster />
    </ThemeProvider>
  )
}
