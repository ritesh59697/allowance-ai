import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Fades its children up the first time they enter the viewport (styles: `.reveal` in index.css). */
export function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} data-shown={shown} style={{ transitionDelay: `${delay}ms` }} className={cn('reveal', className)}>
      {children}
    </div>
  )
}

type Phrase = { text: string; accent?: boolean }

/**
 * A large statement whose words light up one by one, in reading order, as the
 * section scrolls past a line in the lower part of the viewport.
 */
export function TaglineReveal({ lines, className }: { lines: Phrase[][]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const words = lines.map((line) => line.flatMap((p) => p.text.split(' ').map((w) => ({ w, accent: !!p.accent }))))
  const total = words.reduce((n, line) => n + line.length, 0)
  const [still] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [lit, setLit] = useState(still ? total : 0)

  useEffect(() => {
    const el = ref.current
    if (!el || still) return
    let frame = 0
    const measure = () => {
      frame = 0
      const { top, height } = el.getBoundingClientRect()
      const vh = window.innerHeight
      // 0 when the block's top reaches 85% of the viewport, 1 when its bottom reaches 45%
      const progress = (vh * 0.85 - top) / (height + vh * 0.4)
      setLit(Math.round(Math.min(1, Math.max(0, progress)) * total))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [total, still])

  let index = 0
  return (
    <p ref={ref} className={cn('text-balance', className)}>
      <span className="sr-only">{lines.map((line) => line.map((p) => p.text).join(' ')).join(' ')}</span>
      <span aria-hidden>
        {words.map((line, l) => (
          <span key={l} className="block">
            {line.map(({ w, accent }) => {
              const on = index++ < lit
              return (
                <span
                  key={index}
                  className={cn(
                    'transition-colors duration-700 ease-(--ease-fluid)',
                    on ? (accent ? 'text-warning' : 'text-foreground') : 'text-foreground/25',
                  )}
                >
                  {w}{' '}
                </span>
              )
            })}
          </span>
        ))}
      </span>
    </p>
  )
}
