'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

interface EntranceAnimationProps extends HTMLMotionProps<'div'> {
  children: ReactNode
}

export function EntranceAnimation({ children, ...props }: EntranceAnimationProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      {...props}
    >
      {children}
    </motion.div>
  )
}
