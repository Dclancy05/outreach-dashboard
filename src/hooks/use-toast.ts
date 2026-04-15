import { useState, useCallback } from 'react'

interface Toast {
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
}

export function useToast() {
  const toast = useCallback((t: Toast) => {
    // Simple console-based toast for now
    if (t.variant === 'destructive') {
      console.error(`[Toast] ${t.title}: ${t.description}`)
    } else {
      console.log(`[Toast] ${t.title}: ${t.description}`)
    }
  }, [])

  return { toast }
}
