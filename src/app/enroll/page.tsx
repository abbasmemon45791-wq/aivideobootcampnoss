'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, User, Wallet, Check,
  Lock, LoaderCircle, Copy, Shield,
  AlertCircle, Star, Sparkles
} from 'lucide-react'

// GA4 event helper (browser-side — for non-purchase events only)
// Purchase is fired server-side via GA4 Measurement Protocol on admin approval

const BASE_PRICE = 1999
const VAULT_PRICE = 499
const META_ADS_PRICE = 999

const EASYPAISA_NUMBER = process.env.NEXT_PUBLIC_EASYPAISA_NUMBER ?? '03458996578'
const JAZZCASH_NUMBER  = process.env.NEXT_PUBLIC_JAZZCASH_NUMBER  ?? '03180236635'
const HBL_ACCOUNT      = process.env.NEXT_PUBLIC_HBL_ACCOUNT      ?? '22567902223303'
const ACCOUNT_TITLE    = process.env.NEXT_PUBLIC_ACCOUNT_TITLE    ?? 'Farman Ali'
const WHATSAPP_SUPPORT = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT ?? '923180298090'

const STEP_LABELS: Record<number, string> = { 1: 'Your Details', 2: 'Send Payment' }

// ── GA4 event helper ──────────────────────────────────────────────────────
function fireGA4Event(eventName: string, params: Record<string, unknown>) {
  if (typeof window === 'undefined' || !(window as any).gtag) return
  ;(window as any).gtag('event', eventName, params)
}

function getGAClientId(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/_ga=(?:GA\d\.\d\.)?(\d+\.\d+)/)
  return match ? match[1] : undefined
}

// ── Step Indicator ─────────────────────────────────────────────────────────
function StepBar({ step }: { step: number }) {
  return (
    <div className="mb-3 hidden sm:flex items-center gap-2">
      {[1, 2].map((s, i) => {
        const done = s < step
        const active = s === step
        return (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold
              ${done ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white' :
                active ? 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-[0_0_16px_rgba(37,99,235,0.4)]' :
                'bg-slate-100 text-slate-400'}`}>
              {done ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-xs font-semibold uppercase tracking-wider
                ${done || active ? 'text-slate-800' : 'text-slate-400'}`}>
                {STEP_LABELS[s]}
              </div>
              {i < 1 && <div className="mt-1 h-px w-full bg-slate-200" />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1 — Details ───────────────────────────────────────────────────────
function Step1({ onDone }: { onDone: (leadId: string, data: { name: string; email: string; whatsapp: string; totalAmount: number; selectedUpsells: string[] }) => void }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [wa, setWa]             = useState('')
  const [selectedUpsells, setSelectedUpsells] = useState<string[]>([])
  const [err, setErr]           = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const toggleUpsell = (key: string) => {
    setSelectedUpsells(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  const hasVault = selectedUpsells.includes('vault')
  const hasMetaAds = selectedUpsells.includes('meta_ads')
  const totalAmount = BASE_PRICE + (hasVault ? VAULT_PRICE : 0) + (hasMetaAds ? META_ADS_PRICE : 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!name.trim() || name.length < 2) return setErr('Please enter your full name.')
    if (!/^\S+@\S+\.\S+$/.test(email))    return setErr('Please enter a valid email address.')
    if (!/^[+\d\s-]{7,20}$/.test(wa))     return setErr('Please enter a valid WhatsApp number.')

    setLoading(true)
    try {
      const params = new URLSearchParams(window.location.search)
      let source = params.get('utm_source') || params.get('ref') || localStorage.getItem('lead_source')

      if (!source && document.referrer) {
        const ref = document.referrer.toLowerCase()
        if (ref.includes('facebook') || ref.includes('fb.com') || ref.includes('instagram')) source = 'facebook'
        else if (ref.includes('google')) source = 'google'
        else if (ref.includes('tiktok')) source = 'tiktok'
        else if (ref.includes('youtube')) source = 'youtube'
      }

      source = source || 'direct'

      const utm_medium   = params.get('utm_medium')   || localStorage.getItem('lead_utm_medium')   || undefined
      const utm_campaign = params.get('utm_campaign') || localStorage.getItem('lead_utm_campaign') || undefined
      const utm_content  = params.get('utm_content')  || localStorage.getItem('lead_utm_content')  || undefined

      const leadEventId = crypto.randomUUID()

      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          whatsapp: wa.trim(),
          total_amount: totalAmount,
          selected_upsells: selectedUpsells,
          source,
          utm_medium,
          utm_campaign,
          utm_content,
          gclid:  localStorage.getItem('lead_gclid')  || undefined,
          fbclid: localStorage.getItem('lead_fbclid') || undefined,
          ga_client_id: getGAClientId(),
          eventId: leadEventId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (typeof window !== 'undefined' && (window as any).fbq) {
        (window as any).fbq('track', 'Lead', { value: totalAmount, currency: 'PKR' }, { eventID: leadEventId })
      }

      // GA4 — fire generate_lead event for audience building
      fireGA4Event('generate_lead', { value: totalAmount, currency: 'PKR' })

      onDone(data.id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        whatsapp: wa.trim(),
        totalAmount,
        selectedUpsells,
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-0.5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="font-['Sora'] text-lg sm:text-2xl font-extrabold leading-tight text-slate-900">
            Reserve Your Seat
          </h2>
          <p className="text-[11px] font-semibold text-blue-600">
            Enroll before price hits Rs {Math.round(BASE_PRICE * 2.75).toLocaleString()}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-black text-blue-700">
            Rs. {BASE_PRICE.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Full Name *</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
            placeholder="e.g. Ali Khan" required
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs sm:text-sm text-slate-800 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200" />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Email *</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255}
            placeholder="you@example.com" required
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs sm:text-sm text-slate-800 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200" />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">WhatsApp Number *</span>
          <input type="tel" value={wa} onChange={e => setWa(e.target.value)} maxLength={20}
            placeholder="03XXXXXXXXX" required
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs sm:text-sm text-slate-800 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-200" />
        </label>
      </div>

      {/* ── Order Bumps / Upgrades ───────────────────────────────────────── */}
      <div className="pt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" /> Exclusive Upgrades (Optional)
          </span>
          <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.2 rounded-full">
            SAVE 80%
          </span>
        </div>

        {/* Upsell 1: AI Creator's Cheat Code Vault */}
        <div
          onClick={() => toggleUpsell('vault')}
          className={`group relative cursor-pointer select-none rounded-xl border p-2 sm:p-2.5 transition-all duration-200 ${
            hasVault
              ? 'border-blue-500 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white shadow-[0_2px_12px_rgba(37,99,235,0.12)] ring-1 ring-blue-500/30'
              : 'border-slate-200/90 bg-white hover:border-blue-300 hover:bg-slate-50/70 shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-md border text-white transition-all ${
              hasVault ? 'border-blue-600 bg-gradient-to-br from-blue-600 to-cyan-500 shadow-2xs' : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'
            }`}>
              {hasVault && <Check className="h-3 w-3 stroke-[3]" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="rounded bg-gradient-to-r from-orange-500 to-amber-500 px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider text-white shadow-2xs">
                    SPECIAL
                  </span>
                  <span className="font-['Sora'] text-xs sm:text-[13px] font-bold text-slate-900 leading-none">
                    AI Cheat Code Vault
                  </span>
                </div>
                <span className="shrink-0 text-xs sm:text-[13px] font-black text-blue-600">
                  +Rs. {VAULT_PRICE}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] sm:text-[11px] leading-tight text-slate-500">
                50+ Midjourney prompts, 5 HD avatars, outreach scripts &amp; blueprints.
              </p>
            </div>
          </div>
        </div>

        {/* Upsell 2: Meta Ads Masterclass */}
        <div
          onClick={() => toggleUpsell('meta_ads')}
          className={`group relative cursor-pointer select-none rounded-xl border p-2 sm:p-2.5 transition-all duration-200 ${
            hasMetaAds
              ? 'border-indigo-500 bg-gradient-to-r from-indigo-50/90 via-purple-50/40 to-white shadow-[0_2px_12px_rgba(99,102,241,0.12)] ring-1 ring-indigo-500/30'
              : 'border-slate-200/90 bg-white hover:border-indigo-300 hover:bg-slate-50/70 shadow-2xs'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`grid h-4.5 w-4.5 shrink-0 place-items-center rounded-md border text-white transition-all ${
              hasMetaAds ? 'border-indigo-600 bg-gradient-to-br from-indigo-600 to-purple-500 shadow-2xs' : 'border-slate-300 bg-slate-50 group-hover:border-slate-400'
            }`}>
              {hasMetaAds && <Check className="h-3 w-3 stroke-[3]" />}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="rounded bg-gradient-to-r from-purple-600 to-indigo-600 px-1.5 py-0.2 text-[8px] font-black uppercase tracking-wider text-white shadow-2xs">
                    PREMIUM
                  </span>
                  <span className="font-['Sora'] text-xs sm:text-[13px] font-bold text-slate-900 leading-none">
                    Meta Ads Masterclass
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-slate-400 line-through hidden xs:inline">Rs 4,999</span>
                  <span className="text-xs sm:text-[13px] font-black text-indigo-600">
                    +Rs. {META_ADS_PRICE}
                  </span>
                </div>
              </div>
              <p className="mt-0.5 text-[10px] sm:text-[11px] leading-tight text-slate-500">
                Master Facebook &amp; Instagram Ads to scale and land high-paying clients.
              </p>
            </div>
          </div>
        </div>
      </div>

      {err && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
        </div>
      )}

      {/* ── Dual-Action Apple/Linear Style Submit Button ─────────────────── */}
      <button type="submit" disabled={loading}
        className="mt-3 group relative inline-flex w-full items-center justify-between overflow-hidden rounded-full p-1 pr-3 sm:pr-4 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70"
        style={{ background: 'linear-gradient(135deg,#2563eb,#06b6d4)' }}>
        
        {/* Dynamic Price Pill on Left */}
        <div className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1.5 text-xs font-extrabold backdrop-blur-md">
          <span>Rs. {totalAmount.toLocaleString()}</span>
          {selectedUpsells.length > 0 && (
            <span className="rounded-full bg-emerald-400 px-1 py-0.2 text-[8px] text-emerald-950 font-black uppercase tracking-wider">
              +{selectedUpsells.length} UP
            </span>
          )}
        </div>

        {/* Action text on Right */}
        <div className="flex items-center gap-1 text-xs sm:text-sm font-bold tracking-wide">
          {loading ? (
            <><LoaderCircle className="h-4 w-4 animate-spin" /> Saving…</>
          ) : (
            <>Continue to Payment <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></>
          )}
        </div>
      </button>

      <p className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-slate-400">
        <Lock className="h-2.5 w-2.5 text-emerald-600" /> 100% Private · Lifetime Access · Instant Verification
      </p>
    </form>
  )
}

// ── BankRow helper ───────────────────────────────────────────────────────
function BankRow({ bank, title, num, colorClass = "text-slate-500" }: { bank: string; title?: string; num: string; colorClass?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(num)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200/60 py-3 last:border-0">
      <div className="min-w-0">
        <div className={`text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>{bank}</div>
        {title && <div className="mt-0.5 text-xs text-slate-500">{title}</div>}
        <div className="mt-0.5 text-xs font-semibold tracking-wide text-slate-800 sm:text-sm">{num}</div>
      </div>
      <button onClick={copy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white shadow-xs px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:border-slate-300">
        {copied ? <><Check className="h-3.5 w-3.5 text-blue-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
      </button>
    </div>
  )
}

// ── Step 2 — Payment + Submit ───────────────────────────────────────────────
function Step2({
  leadId,
  userData,
  onBack,
}: {
  leadId: string
  userData: { name: string; email: string; whatsapp: string; totalAmount: number; selectedUpsells: string[] }
  onBack: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState<string | null>(null)

  const upsellLabels: string[] = []
  if (userData.selectedUpsells?.includes('vault')) upsellLabels.push("AI Cheat Code Vault")
  if (userData.selectedUpsells?.includes('meta_ads')) upsellLabels.push("Meta Ads Masterclass")
  const bundleText = upsellLabels.length > 0 ? ` + ${upsellLabels.join(' + ')}` : ''

  const waMessage = `Hi! I have sent Rs. ${userData.totalAmount.toLocaleString()} for the AI Video Bootcamp${bundleText}.\n\nName: ${userData.name || 'Student'}\nEmail: ${userData.email || ''}\nWhatsApp: ${userData.whatsapp || ''}\n\nI am attaching my payment screenshot below:`
  const waUrl = `https://wa.me/${WHATSAPP_SUPPORT}?text=${encodeURIComponent(waMessage)}`

  const confirmPayment = () => {
    setLoading(true)
    setErr(null)

    try {
      // 1. GA4 funnel tracking
      fireGA4Event('begin_checkout', { value: userData.totalAmount, currency: 'PKR' })

      // 2. Fire backend payment record submission in background with keepalive
      fetch('/api/submit-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          amount: userData.totalAmount,
        }),
        keepalive: true,
      }).catch(e => console.error('[submit-payment error]', e))

      // 3. Instant redirect to WhatsApp without waiting for network roundtrip
      if (typeof window !== 'undefined') {
        window.location.href = waUrl
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-['Sora'] text-lg sm:text-2xl font-extrabold leading-tight text-slate-900">
          Send Your Payment
        </h2>
        <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-black text-blue-700">
          Rs. {userData.totalAmount.toLocaleString()}
        </span>
      </div>

      <p className="flex items-center gap-1 text-xs text-slate-500">
        <Lock className="h-3 w-3 text-blue-600 shrink-0" />
        Send <strong className="text-slate-800 mx-1">exactly Rs. {userData.totalAmount.toLocaleString()}</strong> to any account below:
      </p>

      {/* Selected Items Notice */}
      {upsellLabels.length > 0 && (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-xs text-blue-900">
          <span className="font-bold">Includes:</span> AI Video Bootcamp {bundleText}
        </div>
      )}

      {/* Payment accounts */}
      <div className="mt-2.5 rounded-xl border border-slate-200 bg-white px-3 shadow-2xs">
        <BankRow bank="EasyPaisa" title={ACCOUNT_TITLE} num={EASYPAISA_NUMBER} colorClass="text-emerald-600" />
        {JAZZCASH_NUMBER && <BankRow bank="JazzCash" num={JAZZCASH_NUMBER} colorClass="text-rose-600" />}
        {HBL_ACCOUNT && <BankRow bank="HBL (Bank Transfer)" title={ACCOUNT_TITLE} num={HBL_ACCOUNT} colorClass="text-teal-700" />}
      </div>

      {err && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {err}
        </div>
      )}

      {/* Primary CTA button */}
      <button onClick={confirmPayment} disabled={loading}
        className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.01] hover:bg-[#20bd5a] disabled:opacity-70">
        {loading
          ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Connecting…</>
          : <>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5 shrink-0">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 5.834h-.004c-1.271-.05-2.521-.349-3.67-.877l-.263-.119-2.727.716.73-2.66-.172-.273a7.53 7.53 0 0 1-1.16-4.03c0-4.188 3.406-7.592 7.594-7.592 4.188 0 7.592 3.404 7.592 7.592 0 4.188-3.404 7.593-7.592 7.593m6.743-13.831c-1.807-1.808-4.209-2.804-6.765-2.804-5.27 0-9.56 4.29-9.56 9.56 0 1.683.439 3.321 1.271 4.762l-1.351 4.94 5.051-1.324a9.55 9.55 0 0 0 4.589 1.173c5.27 0 9.56-4.29 9.56-9.56 0-2.556-.996-4.958-2.795-6.767" />
              </svg>
              <span>I&apos;ve Paid — Send Screenshot on WhatsApp</span>
            </>}
      </button>

      <button onClick={onBack}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-full border border-slate-200 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
        <ArrowLeft className="h-3 w-3" /> Back
      </button>
      <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-400">
        <Shield className="h-3 w-3" /> Secure · One-time payment · Lifetime access
      </p>
    </div>
  )
}

// ── Main Enroll Page ───────────────────────────────────────────────────────
export default function EnrollPage() {
  const [step, setStep]   = useState(1)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [userData, setUserDataState] = useState<{
    name: string
    email: string
    whatsapp: string
    totalAmount: number
    selectedUpsells: string[]
  }>({ name: '', email: '', whatsapp: '', totalAmount: BASE_PRICE, selectedUpsells: [] })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ((window as any).fbq) (window as any).fbq('track', 'InitiateCheckout')

      const params = new URLSearchParams(window.location.search)
      const utm = params.get('utm_source') || params.get('ref')
      if (utm) {
        localStorage.setItem('lead_source', utm.toLowerCase())
      } else if (!localStorage.getItem('lead_source') && document.referrer) {
        const ref = document.referrer.toLowerCase()
        if (ref.includes('facebook') || ref.includes('fb.com') || ref.includes('instagram')) localStorage.setItem('lead_source', 'facebook')
        else if (ref.includes('google')) localStorage.setItem('lead_source', 'google')
      }

      const utmMedium = params.get('utm_medium')
      if (utmMedium) localStorage.setItem('lead_utm_medium', utmMedium)
      const utmCampaign = params.get('utm_campaign')
      if (utmCampaign) localStorage.setItem('lead_utm_campaign', utmCampaign)
      const utmContent = params.get('utm_content')
      if (utmContent) localStorage.setItem('lead_utm_content', utmContent)

      const gclid = params.get('gclid')
      if (gclid && !localStorage.getItem('lead_gclid')) {
        localStorage.setItem('lead_gclid', gclid)
        if (!localStorage.getItem('lead_source')) localStorage.setItem('lead_source', 'google')
      }
      const fbclid = params.get('fbclid')
      if (fbclid && !localStorage.getItem('lead_fbclid')) {
        localStorage.setItem('lead_fbclid', fbclid)
        if (!localStorage.getItem('lead_source')) localStorage.setItem('lead_source', 'facebook')
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-800">
      {/* Desktop Header only */}
      <header className="hidden sm:block border-b border-slate-200/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#2563eb,#06b6d4)' }}>AI</div>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight sm:text-base">AI Bootcamp</div>
              <div className="-mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-600">Pakistan</div>
            </div>
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <ArrowLeft className="h-4 w-4" /> Back to Course
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-3 py-2.5 sm:px-6 sm:py-8">
        <div className="overflow-hidden rounded-2xl border border-blue-200/60 bg-white shadow-[0_0_40px_rgba(37,99,235,0.08)]">
          {/* Streamlined Card Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3.5 py-2">
            <Link href="/" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 sm:hidden">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
            </div>
            <div className="text-xs font-bold text-slate-700">
              {step === 1 ? 'Step 1 of 2: Details' : 'Step 2 of 2: Payment'}
            </div>
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
            </div>
          </div>

          <div className="p-3 sm:p-6">
            <StepBar step={step} />

            {step === 1 && (
              <Step1 onDone={(id, data) => {
                setLeadId(id)
                setUserDataState({
                  name: data.name,
                  email: data.email,
                  whatsapp: data.whatsapp,
                  totalAmount: data.totalAmount,
                  selectedUpsells: data.selectedUpsells,
                })
                setStep(2)
              }} />
            )}
            {step === 2 && leadId && (
              <Step2
                leadId={leadId}
                userData={userData}
                onBack={() => setStep(1)}
              />
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Questions or need help?</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            WhatsApp support:{' '}
            <a href={`https://wa.me/${WHATSAPP_SUPPORT}`} target="_blank" rel="noopener noreferrer"
              className="font-bold text-blue-600 hover:underline">
              +{WHATSAPP_SUPPORT}
            </a>
          </p>
        </div>
      </main>

      {/* WhatsApp floating */}
      <a href={`https://wa.me/${WHATSAPP_SUPPORT}`} target="_blank" rel="noopener noreferrer"
        className="fixed bottom-4 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110">
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 5.834h-.004c-1.271-.05-2.521-.349-3.67-.877l-.263-.119-2.727.716.73-2.66-.172-.273a7.53 7.53 0 0 1-1.16-4.03c0-4.188 3.406-7.592 7.594-7.592 4.188 0 7.592 3.404 7.592 7.592 0 4.188-3.404 7.593-7.592 7.593m6.743-13.831c-1.807-1.808-4.209-2.804-6.765-2.804-5.27 0-9.56 4.29-9.56 9.56 0 1.683.439 3.321 1.271 4.762l-1.351 4.94 5.051-1.324a9.55 9.55 0 0 0 4.589 1.173c5.27 0 9.56-4.29 9.56-9.56 0-2.556-.996-4.958-2.795-6.767" />
        </svg>
      </a>
    </div>
  )
}
