import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    // 1. Authenticate the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to access escalated cases.' },
        { status: 401 }
      )
    }

    // 2. Authorize the user (must be an expert)
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'expert') {
      return NextResponse.json(
        { error: 'Forbidden: Only agricultural experts can access this page.' },
        { status: 403 }
      )
    }

    // 3. Fetch cases with associated disease checks and farmer profiles
    const { data: cases, error: casesError } = await supabase
      .from('cases')
      .select(`
        id,
        status,
        expert_notes,
        resolved_at,
        created_at,
        disease_checks (
          id,
          image_url,
          diagnosis,
          confidence_score,
          treatment_advice,
          users (
            id,
            name
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (casesError) {
      console.error('Error fetching cases:', casesError)
      return NextResponse.json(
        { error: 'Failed to fetch escalated cases.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ cases })
  } catch (err) {
    console.error('Unhandled error in GET /api/cases:', err)
    return NextResponse.json(
      { error: 'Something went wrong while retrieving escalated cases.' },
      { status: 500 }
    )
  }
}
