import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabaseServer'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: caseId } = await params
    const supabase = await createServerSupabaseClient()

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'You must be logged in to update cases.' },
        { status: 401 }
      )
    }

    // 2. Authorize user (must be an expert)
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'expert') {
      return NextResponse.json(
        { error: 'Forbidden: Only agricultural experts can modify cases.' },
        { status: 403 }
      )
    }

    // 3. Parse + validate body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body must be valid JSON.' }, { status: 400 })
    }

    const { status, expert_notes } = (body ?? {}) as {
      status?: unknown
      expert_notes?: unknown
    }

    if (status !== 'resolved' && status !== 'pending') {
      return NextResponse.json(
        { error: "Invalid status. Must be 'resolved' or 'pending'." },
        { status: 400 }
      )
    }

    const expertNotesStr = typeof expert_notes === 'string' ? expert_notes.trim() : ''

    // 4. Update the case in the database
    const updatePayload = {
      status,
      expert_notes: expertNotesStr || null,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    }

    const { data: updatedCase, error: updateError } = await supabase
      .from('cases')
      .update(updatePayload)
      .eq('id', caseId)
      .select()
      .single()

    if (updateError || !updatedCase) {
      console.error('Database update error on case:', updateError)
      return NextResponse.json(
        { error: 'Failed to update the case record.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ case: updatedCase })
  } catch (err) {
    console.error('Unhandled error in PATCH /api/cases/[id]:', err)
    return NextResponse.json(
      { error: 'Something went wrong while updating the case.' },
      { status: 500 }
    )
  }
}
