import { Mail, MapPin, MessageCircle, Phone, Send, Star } from 'lucide-react'
import { useState } from 'react'
import { FadeIn } from '../ui/Motion.jsx'

const defaultForm = { name: '', email: '', phone: '', rating: '5', message: '' }

export function ContactPanel({ hotel }) {
  const [form, setForm] = useState(defaultForm)
  const [status, setStatus] = useState({ loading: false, message: '', type: '' })
  const accessKey = hotel?.contact?.web3formsAccessKey || hotel?.branding?.web3formsAccessKey || import.meta.env.VITE_WEB3FORMS_ACCESS_KEY
  const hotelEmail = hotel?.contact?.email || hotel?.contact?.emails?.[0] || 'bookings@example.com'
  const phones = hotel?.contact?.phones?.length ? hotel.contact.phones : [hotel?.contact?.phone].filter(Boolean)

  async function submit(event) {
    event.preventDefault()
    if (!accessKey) {
      setStatus({ loading: false, type: 'error', message: 'Inquiry form is not configured yet. Please email the hotel directly.' })
      return
    }

    setStatus({ loading: true, type: '', message: '' })
    try {
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
      const payload = await response.json()
      if (!response.ok || payload.success === false) throw new Error(payload.message || 'Inquiry could not be sent.')
      setForm(defaultForm)
      setStatus({ loading: false, type: 'success', message: 'Thanks. Your feedback has been sent to the hotel team.' })
    } catch (error) {
      setStatus({ loading: false, type: 'error', message: error.message })
    }
  }

  return (
    <FadeIn id="contact" as="section" className="border-t border-mist bg-white">
      <div className="container-page grid gap-8 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="eyebrow">Feedback and contact</p>
          <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">Share feedback or speak with the hotel team.</h2>
          <div className="mt-6 grid gap-3 text-sm text-stone-600">
            <span className="flex items-center gap-2"><Mail size={17} className="text-amberline" /> {hotelEmail}</span>
            {phones[0] ? <span className="flex items-center gap-2"><Phone size={17} className="text-amberline" /> {phones[0]}</span> : null}
            <span className="flex items-center gap-2"><MapPin size={17} className="text-amberline" /> {[hotel?.address?.line1, hotel?.address?.city, hotel?.address?.state].filter(Boolean).join(', ') || 'India'}</span>
          </div>
          {!accessKey ? (
            <a className="btn-secondary mt-6" href={`mailto:${hotelEmail}`}>
              <MessageCircle size={18} /> Email hotel
            </a>
          ) : null}
        </div>

        <form onSubmit={submit} className="grid gap-4 rounded-lg border border-mist bg-bone/60 p-4 shadow-soft md:grid-cols-2">
          <Field label="Name"><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></Field>
          <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Rating">
            <select className="input" value={form.rating} onChange={(event) => setForm({ ...form, rating: event.target.value })}>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Needs attention</option>
              <option value="1">1 - Poor</option>
            </select>
          </Field>
          <label className="md:col-span-2">
            <span className="label">Feedback</span>
            <textarea className="input min-h-28 py-3" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required />
          </label>
          {status.message ? (
            <p className={`rounded-md border p-3 text-sm font-semibold md:col-span-2 ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
              {status.message}
            </p>
          ) : null}
          <button className="btn-primary md:col-span-2" disabled={status.loading} type="submit">
            {status.loading ? <Send size={18} /> : <Star size={18} />} {status.loading ? 'Sending...' : 'Send feedback'}
          </button>
        </form>
      </div>
    </FadeIn>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}
