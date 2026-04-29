'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const PrivacyContext = createContext<{ privacy: boolean; toggle: () => void }>({
  privacy: false,
  toggle: () => {},
})

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [privacy, setPrivacy] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('privacy-mode') === '1'
    setPrivacy(stored)
    document.documentElement.classList.toggle('privacy-mode', stored)
  }, [])

  const toggle = () => {
    setPrivacy(prev => {
      const next = !prev
      localStorage.setItem('privacy-mode', next ? '1' : '0')
      document.documentElement.classList.toggle('privacy-mode', next)
      return next
    })
  }

  return (
    <PrivacyContext.Provider value={{ privacy, toggle }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  return useContext(PrivacyContext)
}
