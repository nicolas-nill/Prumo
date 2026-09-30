'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import type { TransactionReference } from '@/features/transactions/reference'
import { TransactionDialog } from './transaction-dialog'

/** Opens the "Nova movimentação" dialog when the page is reached with ?nova=1. */
export function AutoOpenTransactionDialog({ reference }: { reference: TransactionReference }) {
  const [open, setOpen] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  return (
    <TransactionDialog
      reference={reference}
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) router.replace(pathname, { scroll: false })
      }}
    />
  )
}
