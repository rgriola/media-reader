import { useState } from 'react'

type AccordionAccent = 'blue' | 'green' | 'orange' | 'muted'

interface AccordionProps {
  title: string
  defaultOpen?: boolean
  accent?: AccordionAccent
  /** Optional buttons/controls rendered to the right of the title, before the chevron */
  headerActions?: React.ReactNode
  children: React.ReactNode
}

const accentClass: Record<AccordionAccent, string> = {
  blue: 'meta-section-blue',
  green: 'meta-section-green',
  orange: 'meta-section-orange',
  muted: 'meta-section'
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function Accordion({
  title,
  defaultOpen = false,
  accent = 'muted',
  headerActions,
  children
}: AccordionProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={accentClass[accent]}>
      {/* Header row — split into toggle button + optional action buttons */}
      <div className="accordion-header">
        <button
          type="button"
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="section-label">{title}</span>
          <ChevronIcon open={open} />
        </button>
        {!!headerActions && (
          <div className="flex items-center gap-1.5 shrink-0 ml-2">{headerActions}</div>
        )}
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}
