import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }) {
  return <div className={cn('animate-pulse-soft rounded-md bg-secondary', className)} {...props} />
}
