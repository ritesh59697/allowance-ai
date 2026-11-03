import * as React from 'react'
import { cn } from '@/lib/utils'

const fieldClass =
  'rounded-md border border-input bg-card px-3 font-mono text-sm outline-none transition-colors duration-150 placeholder:text-faint focus-visible:border-ring/60 focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-50'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      className={cn('h-10 w-full min-w-0', fieldClass, className)}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      className={cn('min-h-20 w-full py-2', fieldClass, className)}
      {...props}
    />
  )
}

/** Label above a control, with an optional hint below it. */
export function Field({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  )
}
