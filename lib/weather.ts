/**
 * weather.ts
 * -----------------------------------------------------------------------------
 * The project's single Open-Meteo client. Every feature that needs weather
 * (crop recommendations, the dashboard, …) goes through here so the request
 * URL, caching policy, and parsing live in exactly one place.
 *
 * No API key is required. Responses are cached for 30 minutes via Next's fetch
 * caching (`revalidate`), so multiple callers for the same coordinates share a
 * single upstream request.
 * -----------------------------------------------------------------------------
 */
import type { WeatherSummary } from '@/lib/gemini'

/** Days of Open-Meteo forecast we request (covers the dry-spell window). */
const FORECAST_DAYS = 7

/** Total weekly rainfall (mm) at or below which we flag a dry spell (MVP rule). */
const DRY_SPELL_RAINFALL_THRESHOLD_MM = 10

/** One day of the forecast, normalised for UI consumption. */
export interface DailyForecast {
  date: string
  temperature_max: number
  temperature_min: number
  precipitation: number
}

/** Current conditions plus the daily forecast window, for the dashboard. */
export interface CurrentWeather {
  temperature: number
  humidity: number
  rainfall: number
  forecast: DailyForecast[]
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    relative_humidity_2m?: number
    precipitation?: number
  }
  daily?: {
    time?: string[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
  }
}

/** Round to one decimal place for clean, human-friendly numbers. */
function roundOne(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Low-level fetch of the Open-Meteo forecast. Requests current conditions plus
 * the daily window in a single call; callers derive whichever view they need.
 */
async function fetchOpenMeteo(
  latitude: number,
  longitude: number,
): Promise<OpenMeteoResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&forecast_days=${FORECAST_DAYS}&timezone=auto`

  const response = await fetch(url, { next: { revalidate: 1800 } })
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`)
  }

  return (await response.json()) as OpenMeteoResponse
}

/**
 * Reduce the forecast to the weather summary the recommendation engine needs:
 * the average daily mean temperature and total expected rainfall.
 */
export async function fetchWeatherSummary(
  latitude: number,
  longitude: number,
): Promise<WeatherSummary> {
  const data = await fetchOpenMeteo(latitude, longitude)
  const maxTemps = data.daily?.temperature_2m_max ?? []
  const minTemps = data.daily?.temperature_2m_min ?? []
  const rainfall = data.daily?.precipitation_sum ?? []

  if (maxTemps.length === 0 || minTemps.length === 0) {
    throw new Error('Open-Meteo returned no temperature data')
  }

  // Average daily mean temperature across the forecast window.
  const dailyMeans = maxTemps.map(
    (max, index) => (max + (minTemps[index] ?? max)) / 2,
  )
  const averageTemperature =
    dailyMeans.reduce((sum, value) => sum + value, 0) / dailyMeans.length

  const expectedRainfall = rainfall.reduce((sum, value) => sum + value, 0)

  return {
    averageTemperature: roundOne(averageTemperature),
    expectedRainfall: roundOne(expectedRainfall),
    isDrySpell: expectedRainfall <= DRY_SPELL_RAINFALL_THRESHOLD_MM,
  }
}

/**
 * Build the current-conditions + daily-forecast view used by the dashboard.
 * Falls back to the first forecast day when a `current` field is unavailable so
 * the response always has usable numbers.
 */
export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
): Promise<CurrentWeather> {
  const data = await fetchOpenMeteo(latitude, longitude)
  const dates = data.daily?.time ?? []
  const maxTemps = data.daily?.temperature_2m_max ?? []
  const minTemps = data.daily?.temperature_2m_min ?? []
  const rainfall = data.daily?.precipitation_sum ?? []

  const forecast: DailyForecast[] = dates.map((date, index) => ({
    date,
    temperature_max: roundOne(maxTemps[index] ?? 0),
    temperature_min: roundOne(minTemps[index] ?? 0),
    precipitation: roundOne(rainfall[index] ?? 0),
  }))

  return {
    temperature: roundOne(data.current?.temperature_2m ?? maxTemps[0] ?? 0),
    humidity: Math.round(data.current?.relative_humidity_2m ?? 0),
    rainfall: roundOne(data.current?.precipitation ?? rainfall[0] ?? 0),
    forecast,
  }
}
