import { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  icon?: string
  actions?: ReactNode
  children: ReactNode
}

export default function PageShell({ title, subtitle, icon, actions, children }: Props) {
  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h2 className="font-serif text-sol-base02 text-3xl flex items-center gap-3">
            {icon && <i className={`ti ${icon} text-sol-yellow text-2xl`} />}
            {title}
          </h2>
          {subtitle && (
            <p className="text-sol-base1 text-sm mt-1 font-light">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 mt-1">{actions}</div>
        )}
      </div>
      {children}
    </div>
  )
}
