import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

interface RecommendationRow {
  id: string
  crop_name: string | null
  reasoning: string | null
  confidence_score: number | null
  created_at: string
}

interface DiseaseCheckRow {
  id: string
  image_url: string
  diagnosis: string
  confidence_score: number
  treatment_advice: string
  created_at: string
}

interface TimelineItem {
  id: string
  type: 'recommendation' | 'disease_check'
  title: string
  details: string
  confidence_score: number | null
  created_at: string
  image_url?: string
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('You must be logged in to view your history.', 401)
    }

    // Fetch recommendations and disease checks concurrently
    const [recRes, checkRes] = await Promise.all([
      supabase
        .from('recommendations')
        .select('id, crop_name, reasoning, confidence_score, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .returns<RecommendationRow[]>(),
      supabase
        .from('disease_checks')
        .select('id, image_url, diagnosis, confidence_score, treatment_advice, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .returns<DiseaseCheckRow[]>(),
    ])

    const timeline: TimelineItem[] = []

    if (recRes.data) {
      recRes.data.forEach((row) => {
        timeline.push({
          id: row.id,
          type: 'recommendation',
          title: row.crop_name || 'Crop Recommendation',
          details: row.reasoning || '',
          confidence_score: row.confidence_score,
          created_at: row.created_at,
        })
      })
    }

    if (checkRes.data) {
      checkRes.data.forEach((row) => {
        timeline.push({
          id: row.id,
          type: 'disease_check',
          title: row.diagnosis || 'Plant Diagnosis',
          details: row.treatment_advice || '',
          confidence_score: row.confidence_score,
          created_at: row.created_at,
          image_url: row.image_url,
        })
      })
    }

    // Sort combined timeline by newest first
    timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ timeline })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error.'
    console.error('History API error:', message)
    return errorResponse('Something went wrong while loading history.', 500)
  }
}
