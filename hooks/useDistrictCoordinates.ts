import { useMemo } from 'react'

export interface District {
  id: string
  name: string
  state: string
  latitude: number | null
  longitude: number | null
}

/**
 * Hook to retrieve and memoize coordinate values (latitude & longitude) for a district.
 * 
 * @param districts Bounding list of all available districts fetched from Supabase.
 * @param districtId Target district ID to query.
 * @returns Coordinates of the targeted district, or null values if not found.
 */
export function useDistrictCoordinates(districts: District[], districtId: string) {
  return useMemo(() => {
    const found = districts.find((d) => d.id === districtId)
    if (!found) {
      return { latitude: null, longitude: null }
    }
    return { latitude: found.latitude, longitude: found.longitude }
  }, [districts, districtId])
}
