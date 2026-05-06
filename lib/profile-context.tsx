'use client'

import { createContext, useContext } from 'react'
import type { UserProfile } from '@/lib/permisos'

const ProfileContext = createContext<UserProfile | null>(null)

export function ProfileProvider({ profile, children }: { profile: UserProfile; children: React.ReactNode }) {
  return (
    <ProfileContext.Provider value={profile}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  return useContext(ProfileContext)
}
