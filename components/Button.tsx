import { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  children: ReactNode
}

const variants = {
  primary:   'bg-sol-yellow text-sol-base3 hover:bg-sol-yellow/90 shadow-sm',
  secondary: 'bg-sol-base2 text-sol-base01 hover:bg-sol-base1/20 border border-sol-base1/30',
  ghost:     'text-sol-base01 hover:bg-sol-base2 hover:text-sol-base02',
  danger:    'bg-sol-red text-white hover:bg-sol-red/90',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}: Props) {
  return (
    <button
      {...props}
      className={`
        inline-flex items-center font-medium rounded-[8px]
        transition-all duration-200 cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98]
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
    >
      {icon && <i className={`ti ${icon} text-[1.1em]`} />}
      {children}
    </button>
  )
}
