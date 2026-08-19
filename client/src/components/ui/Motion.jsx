import { motion, useReducedMotion } from 'framer-motion'

const ease = [0.22, 1, 0.36, 1]

export function FadeIn({ children, className = '', delay = 0, as = 'div', viewport = true, ...props }) {
  const prefersReducedMotion = useReducedMotion()
  const Component = motion[as] || motion.div

  return (
    <Component
      className={className}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
      whileInView={viewport && !prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
      animate={!viewport && !prefersReducedMotion ? { opacity: 1, y: 0 } : undefined}
      viewport={viewport ? { once: true, margin: '-80px' } : undefined}
      transition={{ duration: 0.65, ease, delay }}
      {...props}
    >
      {children}
    </Component>
  )
}

export function Stagger({ children, className = '', as = 'div' }) {
  const prefersReducedMotion = useReducedMotion()
  const Component = motion[as] || motion.div

  return (
    <Component
      className={className}
      initial={prefersReducedMotion ? false : 'hidden'}
      whileInView={prefersReducedMotion ? undefined : 'show'}
      viewport={{ once: true, margin: '-80px' }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 } },
      }}
    >
      {children}
    </Component>
  )
}

export function StaggerItem({ children, className = '', as = 'div' }) {
  const Component = motion[as] || motion.div

  return (
    <Component
      className={className}
      variants={{
        hidden: { opacity: 0, y: 18 },
        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
      }}
    >
      {children}
    </Component>
  )
}
