import { Skeleton } from '@/components/ui/misc'

/** Route-level loading: a quiet outline of the page, not a wall of skeletons. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6 pt-2" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-28 w-full rounded-[18px]" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skeleton className="h-44 rounded-[18px]" />
        <Skeleton className="h-44 rounded-[18px]" />
      </div>
    </div>
  )
}
