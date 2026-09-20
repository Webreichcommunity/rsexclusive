import { Link } from 'react-router-dom'
import { HelpCircle, Mail, MapPin, Phone, Scale, ShieldCheck } from 'lucide-react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { Seo } from '../../components/seo/Seo.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { logoDisplayUrl } from '../../utils/logoUrl.js'
import { buildTenantPath, resolveTenantFromLocation } from '../tenant/resolveTenant.js'

const termsVersion = '2026-09-20'

const terms = [
  'Unmarried couples are not permitted to check in. Guests with local city identification from the same city as the hotel may also be refused check-in, subject to hotel policy and applicable law.',
  'The primary guest must be at least 18 years of age to be able to check into the hotel.',
  'It is mandatory for guests to present valid photo identification at the time of check-in. According to government regulations, a valid Photo ID has to be carried by every person above the age of 18 staying at the hotel. The identification proofs accepted are Aadhar Card, Driving License, Voter ID Card, and Passport. Without original copy of valid ID the guest will not be allowed to check-in.',
  'Should any action by a guest be deemed inappropriate by the hotel, or if any inappropriate behaviour is brought to the attention of the hotel, the hotel reserves the right, after the allegations have been investigated, to take action against the guest.',
  'Every hotel may have different policies for specific times during the year.',
  'Guests shall be liable for any damage, except normal wear and tear to hotel assets. Guests shall keep the hotel room in good condition and maintain hygiene and cleanliness.',
  'Certain policies are booking specific and are informed to the customer while making the booking.',
  'Guests may be contacted closer to their check-in date to confirm the arrival status or arrival time through calls or messages. In case we do not receive a response from the guest after multiple attempts, the booking may be put on hold or cancelled. In case of availability, the hotel will try to reinstate your booking when you contact us back or make a payment through our payment options.',
  'As we continue to strive to improve our services, we may reach out to guests to get feedback about their experience through calls or messages.',
  'Management does not take responsibility for guests valuables. Lockers are available in rooms.',
  'I agree to abide by the terms and conditions during my/our stay in the hotel.',
  'By accessing this website and/or submitting any personal or digital information, including but not limited to name, contact details, identification documents, payment information, browsing data, and preferences, the guest expressly consents to the collection, storage, processing, and use of such Guest Data.',
  'The hotels reserve the right to use, retain, analyze, and process the Guest Data at their sole discretion, for purposes including but not limited to reservation management, guest services, marketing and promotional communications, service improvement, analytics, and any other business purpose the hotels may deem fit from time to time, whether now known or hereafter devised.',
  'The guest acknowledges and agrees that by providing such data, they authorize the hotels to use the same in the manner the hotels consider appropriate, without further notice or consent, except where applicable law requires otherwise.',
  'By submitting any personal or digital information on this website, the guest expressly consents to its collection, storage, and processing by RG Exclusive, RS Exclusive, and Ranjeet Hotel, members of the Ranjeet Group of Hotels, for purposes including reservations, guest services, marketing, and record-keeping. The guest further agrees that such data may be shared with and used by Ranjeet Hotel, as the group head entity, and any other hotel presently or hereafter forming part of the group, without requiring separate consent for each property.',
]

const fallbackFaqs = [
  { question: 'What documents are required at check-in?', answer: 'Every guest above 18 years must carry an original government-approved photo ID such as Aadhar Card, Driving License, Voter ID Card, or Passport.' },
  { question: 'Can I contact the hotel before arrival?', answer: 'Yes. Please use the phone, email, or WhatsApp details shown on this page for booking support and arrival coordination.' },
  { question: 'Is advance payment required?', answer: 'The booking flow may offer full payment or advance payment options depending on the hotel policy shown at checkout.' },
]

export function TermsPage() {
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'))
  if (loading) return <LoadingState label="Opening terms" />
  if (error) return <PolicyError error={error} />
  return <PolicyLayout hotel={data.hotel} title="Terms and Conditions" eyebrow="Guest policy" icon={Scale}><TermsContent hotel={data.hotel} /></PolicyLayout>
}

export function FaqPage() {
  const { data, loading, error } = useAsync(() => apiFetch('/tenant'))
  if (loading) return <LoadingState label="Opening FAQ" />
  if (error) return <PolicyError error={error} />
  const faqs = data.faqs?.length ? data.faqs : fallbackFaqs
  return (
    <PolicyLayout hotel={data.hotel} title="Frequently Asked Questions" icon={HelpCircle} showBrand={false}>
      <FaqContent faqs={faqs} />
    </PolicyLayout>
  )
}

function PolicyLayout({ hotel, title, eyebrow, icon: Icon, children, showBrand = true }) {
  const tenantMode = resolveTenantFromLocation()
  const logoUrl = hotel?.branding?.logoUrl
  const heroImage = getHotelHeroImages(hotel)[0] || hotel?.hero_image_url
  return (
    <main className="bg-ivory">
      <Seo title={`${hotel.name} | ${title}`} description={`${title} for ${hotel.name}`} image={heroImage} />
      <section className="relative overflow-hidden bg-charcoal text-white">
        {heroImage ? <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/62 to-black/24" />
        <div className="container-page relative py-14 md:py-20">
          <FadeIn viewport={false} className="max-w-4xl">
            {showBrand ? (
              <div className="flex items-center gap-3">
                <BrandMark hotel={hotel} logoUrl={logoUrl} />
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-amber-100">{eyebrow}</p>
                  <p className="mt-1 text-sm font-bold text-white/70">{hotel.name}</p>
                </div>
              </div>
            ) : null}
            <h1 className={`${showBrand ? 'mt-8' : ''} text-5xl font-semibold leading-none md:text-7xl`}>{title}</h1>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/78">{showBrand ? `Official guest information for direct bookings at ${hotel.name}.` : 'All published answers for planning your stay and booking directly.'}</p>
            <Link to={buildTenantPath('/book', tenantMode)} className="btn-primary mt-7 w-full sm:w-auto"><Icon size={18} /> Book Your Stay</Link>
          </FadeIn>
        </div>
      </section>
      {children}
    </main>
  )
}

function TermsContent({ hotel }) {
  return (
    <section className="container-page py-10 md:py-16">
      <FadeIn viewport={false} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <article className="panel overflow-hidden">
          <div className="border-b border-mist bg-white p-5">
            <p className="eyebrow">Version {termsVersion}</p>
            <h2 className="mt-2 text-3xl font-black text-charcoal">{hotel.name} Terms and Conditions</h2>
          </div>
          <ol className="grid gap-3 p-4 sm:p-5">
            {terms.map((term, index) => (
              <li key={term.slice(0, 32)} className="grid gap-3 rounded-md border border-mist bg-white p-4 text-sm font-semibold leading-7 text-stone-600 sm:grid-cols-[44px_1fr]">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-charcoal text-sm font-black text-white">{index + 1}</span>
                <span>{term}</span>
              </li>
            ))}
          </ol>
        </article>
        <SupportCard hotel={hotel} />
      </FadeIn>
    </section>
  )
}

function FaqContent({ faqs }) {
  return (
    <section className="container-page py-10 md:py-16">
      <FadeIn viewport={false}>
        <div className="panel overflow-hidden">
          <div className="border-b border-mist bg-white p-5">
            <p className="eyebrow">FAQ</p>
            <h2 className="mt-2 text-3xl font-black text-charcoal">Questions Before Your Stay</h2>
          </div>
          <Stagger className="grid gap-3 p-4 sm:p-5">
            {faqs.map((faq, index) => (
              <StaggerItem key={faq.id || `${faq.question}-${index}`} as="article" className="rounded-md border border-mist bg-white p-4 shadow-sm">
                <p className="flex items-start gap-3 text-lg font-extrabold text-charcoal"><HelpCircle className="mt-1 shrink-0 text-amberline" size={20} /> {faq.question}</p>
                <p className="mt-3 text-sm font-semibold leading-7 text-stone-600">{faq.answer}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </FadeIn>
    </section>
  )
}

function SupportCard({ hotel }) {
  const phones = hotelPhones(hotel)
  return (
    <aside className="panel sticky top-24 overflow-hidden">
      <div className="bg-charcoal p-5 text-white">
        <ShieldCheck className="text-amber-100" size={28} />
        <h2 className="mt-3 text-2xl font-black">Hotel Support</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/72">For booking, arrival, document, or policy questions, contact {hotel.name} directly.</p>
      </div>
      <div className="grid gap-3 p-5 text-sm font-semibold text-stone-700">
        {phones.length ? <ContactLine icon={Phone} label="Phone" value={phones.join(', ')} /> : null}
        {hotel?.contact?.email ? <ContactLine icon={Mail} label="Email" value={hotel.contact.email} /> : null}
        <ContactLine icon={MapPin} label="Address" value={formatAddress(hotel)} />
      </div>
    </aside>
  )
}

function ContactLine({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3 rounded-md border border-mist bg-white p-3">
      <Icon className="mt-0.5 shrink-0 text-amberline" size={18} />
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-stone-500">{label}</p>
        <p className="mt-1 break-words text-charcoal">{value || '-'}</p>
      </div>
    </div>
  )
}

function BrandMark({ hotel, logoUrl }) {
  if (logoUrl) return <img src={logoDisplayUrl(logoUrl)} alt={`${hotel.name} logo`} className="h-14 w-14 object-contain" />
  return <span className="grid h-14 w-14 place-items-center rounded-md border border-white/20 bg-white/10 text-lg font-black text-white">{initials(hotel.name)}</span>
}

function PolicyError({ error }) {
  return (
    <main className="container-page grid min-h-[70vh] place-items-center py-12">
      <div className="panel max-w-xl p-7 text-center">
        <h1 className="text-3xl font-bold">Hotel page unavailable</h1>
        <p className="mt-3 text-stone-600">{error.message}</p>
      </div>
    </main>
  )
}

function initials(value) {
  return String(value || 'Hotel').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

function hotelPhones(hotel) {
  return [...new Set([...(hotel?.contact?.phones || []), hotel?.contact?.phone, hotel?.contact?.whatsapp].filter(Boolean))]
}

function formatAddress(hotel) {
  const address = hotel?.address || {}
  return [address.line1, address.city, address.state, address.country].filter(Boolean).join(', ') || 'Akola, Maharashtra'
}

function getHotelHeroImages(hotel) {
  const uploaded = Array.isArray(hotel?.branding?.heroImages)
    ? hotel.branding.heroImages.map((item) => (typeof item === 'string' ? item : item?.url || item?.secureUrl)).filter(Boolean)
    : []
  return [...uploaded, hotel?.hero_image_url].filter(Boolean)
}
