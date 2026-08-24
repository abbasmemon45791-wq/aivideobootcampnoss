import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import crypto from 'crypto'

const hashData = (data: string) => crypto.createHash('sha256').update(data).digest('hex')

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { leadId, eventId, amount } = body

    if (!leadId) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    // Verify lead exists
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id, name, email, whatsapp, status')
      .eq('id', leadId)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 })
    }

    // Insert payment record (no screenshot)
    const { error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        lead_id: leadId,
        amount: amount ?? 2900,
        ai_verified: false,
      })

    if (paymentError) throw paymentError

    // Update lead status
    await supabaseAdmin
      .from('leads')
      .update({ status: 'payment_submitted' })
      .eq('id', leadId)

    // Send Facebook CAPI Purchase Event (server-side, guaranteed delivery)
    try {
      const PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID
      const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN
      if (PIXEL_ID && ACCESS_TOKEN && lead.email && lead.whatsapp) {
        const hashedEmail = hashData(lead.email.toLowerCase().trim())
        const digitsOnly  = lead.whatsapp.replace(/\D/g, '')
        const hashedPhone = digitsOnly ? hashData(digitsOnly) : undefined

        const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown'
        const cookieHeader = req.headers.get('cookie') ?? ''
        const fbc = cookieHeader.match(/_fbc=([^;]+)/)?.[1]
        const fbp = cookieHeader.match(/_fbp=([^;]+)/)?.[1]

        await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'website',
              event_source_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/enroll`,
              ...(eventId && { event_id: eventId }),
              user_data: {
                em: [hashedEmail],
                ...(hashedPhone && { ph: [hashedPhone] }),
                client_ip_address: ip,
                client_user_agent: req.headers.get('user-agent') ?? '',
                ...(fbc && { fbc }),
                ...(fbp && { fbp }),
              },
              custom_data: {
                currency: 'PKR',
                value: amount ?? 2900,
              },
            }],
          }),
        })
      }
    } catch (fbErr) {
      console.error('FB CAPI Error (Purchase):', fbErr)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/submit-payment]', err)
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 })
  }
}
