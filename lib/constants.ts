
export const SOIL_TYPES = [
  { id: 'sandy',        label: 'Sandy',        icon: '🏖️' },
  { id: 'loamy',        label: 'Loamy',        icon: '🌱' },
  { id: 'clayey',       label: 'Clayey',       icon: '🧱' },
  { id: 'black_cotton', label: 'Black Cotton', icon: '🌾' },
  { id: 'red',          label: 'Red Soil',     icon: '🍂' },
  { id: 'laterite',     label: 'Laterite',     icon: '🧱' },
] as const

export type SoilTypeId = (typeof SOIL_TYPES)[number]['id']