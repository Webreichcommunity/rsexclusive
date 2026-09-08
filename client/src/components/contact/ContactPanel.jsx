import { Mail, MapPin, MessageCircle, Phone, Send, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FadeIn } from '../ui/Motion.jsx'
import { apiFetch } from '../../services/apiClient.js'
import { useAuth } from '../../modules/auth/authContext.js'
import { useAppUser } from '../../modules/auth/useAppUser.js'

const defaultForm = { name: '', email: '', phone: '', rating: '5', message: '' }

export function ContactPanel({ hotel }) {
  const { firebaseUser, isAuthenticated } = useAuth()
  const appUser = useAppUser()
  const user = appUser.data?.user
  const profileName = user?.fullName || firebaseUser?.displayName || ''
  const profileEmail = user?.email || firebaseUser?.email || ''
  const profilePhone = user?.phone || ''
  const [form, setForm] = useState(defaultForm)
  const [status, setStatus] = useState({ loading: false, message: '', type: '' })
  const accessKey = hotel?.contact?.web3formsAccessKey || hotel?.branding?.web3formsAccessKey || import.meta.env.VITE_WEB3FORMS_ACCESS_KEY
  const hotelEmail = hotel?.contact?.email || hotel?.contact?.emails?.[0] || 'bookings@example.com'
  const phones = hotel?.contact?.phones?.length ? hotel.contact.phones : [hotel?.contact?.phone].filter(Boolean)

  useEffect(() => {
    if (!isAuthenticated) return
    setForm((current) => ({
      ...current,
      name: current.name || profileName,
      email: current.email || profileEmail,
      phone: current.phone || profilePhone,
    }))
  }, [isAuthenticated, profileName, profileEmail, profilePhone])

  async function submit(event) {
    event.preventDefault()
    setStatus({ loading: true, type: '', message: '' })
    try {
      await apiFetch('/feedback', { method: 'POST', body: form })
      if (accessKey) {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            access_key: accessKey,
            subject: `New hotel feedback - ${hotel?.name || 'R.S. Exclusive'}`,
            from_name: form.name,
            name: form.name,
            email: form.email,
            phone: form.phone,
            rating: form.rating,
            message: form.message,
            hotel: hotel?.name || 'R.S. Exclusive',
            hotel_email: hotelEmail,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload.success === false) throw new Error(payload.message || 'Feedback was saved, but the email alert could not be sent.')
      }
      setForm({ ...defaultForm, name: profileName || '', email: profileEmail || '', phone: profilePhone || '' })
      setStatus({ loading: false, type: 'success', message: 'Thanks. Your feedback is saved for the hotel team.' })
    } catch (error) {
      setStatus({ loading: false, type: 'error', message: error.message })
    }
  }

  return (
    <FadeIn id="feedback" as="section" className="relative z-10 border-t border-mist bg-[#f7f7f7]">
      <div id="contact" className="container-page grid gap-8 py-14 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:py-20">
        <div>
          <p className="eyebrow">Feedback and contact</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight md:text-5xl">Share a stay note with the hotel team.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600 md:text-base">Rate your experience and send a clear message to the property team. Logged-in guest details are filled automatically.</p>
          <div className="mt-6 grid gap-3 text-sm font-semibold text-stone-600">
            <span className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-4"><Mail size={17} className="text-amberline" /> {hotelEmail}</span>
            {phones[0] ? <span className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-4"><Phone size={17} className="text-amberline" /> {phones.join(', ')}</span> : null}
            <span className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-4"><MapPin size={17} className="text-amberline" /> {formatAddress(hotel)}</span>
          </div>
          {!accessKey ? (
            <a className="btn-secondary mt-6" href={`mailto:${hotelEmail}`}>
              <MessageCircle size={18} /> Email hotel
            </a>
          ) : null}
        </div>

        <form onSubmit={submit} className="grid gap-4 rounded-lg border border-stone-200 bg-[linear-gradient(145deg,#ffffff_0%,#fff7ed_100%)] p-4 shadow-panel sm:p-6 md:grid-cols-2">
          <Field label="Name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={isAuthenticated ? '' : 'Your name'} required /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder={isAuthenticated ? '' : 'you@example.com'} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Optional" /></Field>
          <Field label="Rating">
            <StarRating value={Number(form.rating)} onChange={(rating) => setForm({ ...form, rating: String(rating) })} />
          </Field>
          <label className="md:col-span-2">
            <span className="label">Feedback</span>
            <textarea className="input min-h-32 resize-y py-3 leading-6" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Tell us what felt excellent or what needs attention." required />
          </label>
          {status.message ? (
            <p className={`rounded-md border p-3 text-sm font-semibold md:col-span-2 ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
              {status.message}
            </p>
          ) : null}
          <button className="btn-primary md:col-span-2" disabled={status.loading} type="submit">
            <Send size={18} /> {status.loading ? 'Sending...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </FadeIn>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function StarRating({ value, onChange }) {
  return (
    <div className="flex h-12 items-center gap-1 rounded-md border border-mist bg-white px-3">
      {[1, 2, 3, 4, 5].map((rating) => {
        const active = rating <= value
        return (
          <button
            key={rating}
            type="button"
            aria-label={`${rating} star rating`}
            className={`grid h-9 w-9 place-items-center rounded-md transition hover:bg-amber-50 ${active ? 'text-amber-500' : 'text-stone-300'}`}
            onClick={() => onChange(rating)}
          >
            <Star size={23} fill={active ? 'currentColor' : 'none'} strokeWidth={2.2} />
          </button>
        )
      })}
    </div>
  )
}

function formatAddress(hotel) {
  const line = String(hotel?.address?.line1 || '').replace(/\s+/g, ' ').trim()
  if (line) return line
  return [cleanCity(hotel?.address?.city), hotel?.address?.state, hotel?.address?.country].filter(Boolean).join(', ') || 'India'
}

function cleanCity(value) {
  const city = String(value || '').replace(/\s+/g, ' ').trim()
  if (!city || /exlusive|exclusive|fine dine|stay/i.test(city)) return 'Akola'
  return city
}
