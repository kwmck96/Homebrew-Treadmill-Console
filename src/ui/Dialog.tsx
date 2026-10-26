import type { ReactNode } from 'react'
import styles from './Dialog.module.css'

export interface DialogAction {
  label: string
  onClick: () => void
  tone?: 'primary' | 'danger' | 'plain'
}

/** A modal question with up to three answers. The backdrop does nothing. */
export function Dialog(props: {
  title: string
  children?: ReactNode
  actions: DialogAction[]
  tone?: 'warning'
}) {
  return (
    <div className={styles.backdrop}>
      <section
        className={styles.dialog}
        data-tone={props.tone}
        role="alertdialog"
        aria-modal="true"
        aria-label={props.title}
      >
        <h2 className={styles.title}>{props.title}</h2>
        {props.children && <div className={styles.body}>{props.children}</div>}
        <div className={styles.actions}>
          {props.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={styles.action}
              data-tone={a.tone ?? 'plain'}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
