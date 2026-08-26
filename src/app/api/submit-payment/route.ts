import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Mark lead as payment_submitted — NO conversion event fired here.
// Purchase conversion is fired server-side when admin APPROVES via /api/admin/leads.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leadId, amount } = body

    if (!leadId) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    // Verify lead exists
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, status')
      .eq('id', leadId)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }

    // Check if a payment already exists for this lead
    const { data: existingPayment } = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle()

    if (existingPayment) {
      await supabaseAdmin
        .from('payments')
        .update({ amount: Number(amount) || 1999 })
        .eq('id', existingPayment.id)
    } else {
      const { error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          lead_id: leadId,
          amount: Number(amount) || 1999,
          ai_verified: false,
        })

      if (paymentError) throw paymentError
    }

    // Update lead status to payment_submitted
    await supabaseAdmin
      .from('leads')
      .update({ status: 'payment_submitted' })
      .eq('id', leadId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/submit-payment]', err)
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 })
  }
}
