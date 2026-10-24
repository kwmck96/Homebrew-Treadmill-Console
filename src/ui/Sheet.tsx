import type { ReactNode } from 'react'
import styles from './Sheet.module.css'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Extra buttons placed beside Close in the header. */
  actions?: ReactNode
}

/** A modal panel over the workout screen. Tapping the backdrop closes it. */
export function Sheet({ title, onClose, children, actions }: SheetProps) {
  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={title}>
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          {actions}
          <button type="button" className={styles.close} onClick={onClose}>
            Close
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  )
}
