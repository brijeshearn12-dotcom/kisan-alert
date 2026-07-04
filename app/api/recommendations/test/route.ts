import { NextResponse } from 'next/server'
import { handleRecommendationGeneration } from '../route'

export async function POST(request: Request) {
  const isDev = process.env.NODE_ENV === 'development'
  if (!isDev) {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
  }
  return handleRecommendationGeneration(request, true)
}
