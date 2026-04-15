"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from "react"

interface Business {
  id: string
  name: string
  description: string
  service_type: string
  color: string
  icon: string
  status: string
}

interface BusinessContextType {
  selectedBusiness: Business | null
  setSelectedBusiness: (b: Business | null) => void
  businessId: string | null
}

const BusinessContext = createContext<BusinessContextType>({
  selectedBusiness: null,
  setSelectedBusiness: () => {},
  businessId: null,
})

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [selectedBusiness, setSelectedBusinessState] = useState<Business | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("selected_business")
    if (stored) {
      try { setSelectedBusinessState(JSON.parse(stored)) } catch {}
    }
  }, [])

  const setSelectedBusiness = (b: Business | null) => {
    setSelectedBusinessState(b)
    if (b) {
      localStorage.setItem("selected_business", JSON.stringify(b))
    } else {
      localStorage.removeItem("selected_business")
    }
  }

  return (
    <BusinessContext.Provider value={{ selectedBusiness, setSelectedBusiness, businessId: selectedBusiness?.id || null }}>
      {children}
    </BusinessContext.Provider>
  )
}

export const useBusiness = () => useContext(BusinessContext)
