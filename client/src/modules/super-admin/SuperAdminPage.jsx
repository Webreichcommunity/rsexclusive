import {
  ArrowLeft,
  Activity,
  Ban,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  ImagePlus,
  LogOut,
  Pencil,
  Power,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { StatusPill } from '../../components/ui/StatusPill.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { uploadImageToCloudinary } from '../../services/cloudinaryUpload.js'
import { logoDisplayUrl } from '../../utils/logoUrl.js'
import { logout } from '../auth/firebaseClient.js'
import { buildHotelUrl, formatHotelHost } from '../tenant/resolveTenant.js'

const HOTEL_LIMIT = 3
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const activityArchiveKey = 'rs-exclusive-super-admin-activities'

const emptyHotel = {
  name: '',
  legalName: '',
  slug: '',
  subdomain: '',
  description: '',
  line1: '',
  city: '',
  state: '',
  country: 'India',
  email: '',
  phones: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  linkedin: '',
  twitter: '',
  checkIn: '14:00',
  checkOut: '11:00',
  logoUrl: '',
  logoPublicId: '',
  heroImageUrl: '',
  heroImages: [],
  showcaseImages: [],
  diningImage: null,
  youtubeEmbedUrl: '',
  gallery: [],
  paymentRoutingType: 'primary',
  razorpayLinkedAccountId: '',
}

const emptyAdmin = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  hotelIds: [],
}

export function SuperAdminPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [mode, setMode] = useState('list')
  const [selectedHotelId, setSelectedHotelId] = useState('')
  const [hotelForm, setHotelForm] = useState(emptyHotel)
  const [adminForm, setAdminForm] = useState(emptyAdmin)
  const [activityArchive, setActivityArchive] = useState(readActivityArchive)
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)

  const overview = useAsync(() => apiFetch('/super-admin/overview'), refreshKey)
  const detail = useAsync(
    () => (mode === 'detail' && selectedHotelId ? apiFetch(`/super-admin/hotels/${selectedHotelId}`) : Promise.resolve(null)),
    `${mode}:${selectedHotelId}:${refreshKey}`,
  )
  const activities = useAsync(
    () => (mode === 'activities' ? apiFetch('/super-admin/activities?limit=300') : Promise.resolve({ activities: [] })),
    `${mode}:${refreshKey}`,
  )

  const hotels = useMemo(() => overview.data?.hotels || [], [overview.data?.hotels])
  const canCreateHotel = hotels.length < HOTEL_LIMIT
  const selectedHotel = detail.data?.hotel || hotels.find((hotel) => hotel.id === selectedHotelId)
  const visibleActivities = useMemo(
    () => mergeActivities(activities.data?.activities || [], activityArchive),
    [activities.data?.activities, activityArchive],
  )
  const totals = useMemo(
    () => ({
      hotels: hotels.length,
      admins: hotels.reduce((sum, hotel) => sum + Number(hotel.admins?.length || 0), 0),
      customers: hotels.reduce((sum, hotel) => sum + Number(hotel.customers || 0), 0),
      revenue: hotels.reduce((sum, hotel) => sum + Number(hotel.revenue || 0), 0),
    }),
    [hotels],
  )

  function updateHotel(field, value) {
    if (field === 'youtubeEmbedUrl' && value && hotelForm.heroImages.length) {
      setNotice({ type: 'error', message: 'Remove uploaded hero images before using a YouTube or video URL.' })
      return
    }
    setHotelForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'name' && !current.slug ? { slug: slugify(value) } : {}),
      ...(field === 'name' && !current.subdomain ? { subdomain: slugify(value).slice(0, 28) } : {}),
    }))
  }

  function openCreate() {
    if (!canCreateHotel) {
      setNotice({ type: 'error', message: 'Your plan includes 3 hotels. Contact WebReich to add another hotel.' })
      return
    }
    setSelectedHotelId('')
    setHotelForm(emptyHotel)
    setNotice(null)
    setMode('create')
  }

  function openEdit(hotel) {
    setSelectedHotelId(hotel.id)
    setHotelForm(toHotelForm(hotel))
    setNotice(null)
    setMode('edit')
  }

  function openDetail(hotel) {
    setSelectedHotelId(hotel.id)
    setNotice(null)
    setMode('detail')
  }

  async function uploadHotelImage(field, file, folder) {
    if (!file) return
    if (file.size > MAX_IMAGE_SIZE) {
      setNotice({ type: 'error', message: `${file.name} is larger than 10 MB. Please choose a smaller image.` })
      return
    }
    if (field === 'heroImages' && hotelForm.youtubeEmbedUrl) {
      setNotice({ type: 'error', message: 'Remove the YouTube or video URL before uploading hero images.' })
      return
    }
    setSaving(true)
    try {
      const image = await uploadImageToCloudinary(file, {
        signatureUrl: selectedHotelId ? `/super-admin/hotels/${selectedHotelId}/media/signature` : '/super-admin/media/signature',
        folder,
      })
      const media = { url: image.secureUrl, publicId: image.publicId, alt: file.name.replace(/\.[^.]+$/, '') }
      if (field === 'logoUrl') {
        setHotelForm((current) => ({ ...current, logoUrl: image.secureUrl, logoPublicId: image.publicId }))
      } else if (field === 'diningImage') {
        setHotelForm((current) => ({ ...current, diningImage: media }))
      } else if (['heroImages', 'showcaseImages', 'gallery'].includes(field)) {
        const limits = { heroImages: 3, showcaseImages: 3, gallery: 5 }
        setHotelForm((current) => ({
          ...current,
          [field]: [...current[field], media].slice(0, limits[field]),
          ...(field === 'heroImages' ? { heroImageUrl: current.heroImageUrl || image.secureUrl } : {}),
        }))
      } else {
        setHotelForm((current) => ({ ...current, [field]: image.secureUrl }))
      }
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function uploadHotelImages(field, files, folder, limit) {
    if (limit < 1) {
      setNotice({ type: 'error', message: 'Image limit reached for this section. Remove an image before uploading another.' })
      return
    }
    const selectedFiles = Array.from(files || []).slice(0, limit)
    for (const file of selectedFiles) {
      await uploadHotelImage(field, file, folder)
    }
  }

  function removeHotelMedia(field, index = 0) {
    setHotelForm((current) => {
      if (field === 'logoUrl') return { ...current, logoUrl: '', logoPublicId: '' }
      if (field === 'diningImage') return { ...current, diningImage: null }
      const nextItems = current[field].filter((_, itemIndex) => itemIndex !== index)
      return {
        ...current,
        [field]: nextItems,
        ...(field === 'heroImages' ? { heroImageUrl: nextItems[0]?.url || '' } : {}),
      }
    })
  }

  async function saveHotel(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const body = toHotelPayload(hotelForm)
      if (mode === 'edit') {
        await apiFetch(`/super-admin/hotels/${selectedHotelId}`, { method: 'PATCH', body })
        setNotice({ type: 'success', message: 'Hotel details updated.' })
        setMode('detail')
      } else {
        const created = await apiFetch('/super-admin/hotels', { method: 'POST', body })
        setSelectedHotelId(created.hotel.id)
        setNotice({ type: 'success', message: 'Hotel created. Add hotel admins from the detail page.' })
        setMode('detail')
      }
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function deleteHotel(hotel) {
    if (!window.confirm(`Delete ${hotel.name}? This permanently removes the hotel, bookings, guests, admins assigned only to this hotel, rooms, payments, feedback, offers, amenities, and media records. This cannot be undone.`)) return
    setSaving(true)
    try {
      await apiFetch(`/super-admin/hotels/${hotel.id}`, { method: 'DELETE' })
      setMode('list')
      setSelectedHotelId('')
      setRefreshKey((value) => value + 1)
      setNotice({ type: 'success', message: `${hotel.name} and its hotel data were deleted.` })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!activities.data?.activities?.length) return
    setActivityArchive((current) => {
      const next = mergeActivities(activities.data.activities, current)
      writeActivityArchive(next)
      return next
    })
  }, [activities.data?.activities])

  async function toggleHotelStatus(hotel) {
    const status = hotel.status === 'active' ? 'inactive' : 'active'
    await apiFetch(`/super-admin/hotels/${hotel.id}/status`, { method: 'PATCH', body: { status } })
    setRefreshKey((value) => value + 1)
  }

  async function createAdmin(event) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      await apiFetch('/super-admin/admins', {
        method: 'POST',
        body: {
          ...adminForm,
          hotelIds: adminForm.hotelIds.length ? adminForm.hotelIds : selectedHotelId ? [selectedHotelId] : [],
          permissions: ['bookings', 'rooms', 'payments', 'content'],
        },
      })
      setAdminForm(emptyAdmin)
      setRefreshKey((value) => value + 1)
      setNotice({ type: 'success', message: 'Hotel admin created and assigned.' })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

  async function removeAdmin(admin, hotelId = selectedHotelId) {
    if (!window.confirm(`Remove ${admin.email} from this hotel?`)) return
    await apiFetch(`/super-admin/hotels/${hotelId}/admins/${admin.id}`, { method: 'DELETE' })
    setRefreshKey((value) => value + 1)
  }

  async function deleteAdmin(admin) {
    if (!window.confirm(`Delete ${admin.email} from Firebase Auth and Neon?`)) return
    await apiFetch(`/super-admin/admins/${admin.id}`, { method: 'DELETE' })
    setRefreshKey((value) => value + 1)
  }

  if (overview.loading) return <LoadingState label="Loading platform control" />

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="bg-charcoal text-white">
        <div className="container-page py-8">
          <FadeIn viewport={false} className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">Super admin</p>
              <h1 className="mt-2 text-5xl font-semibold leading-none md:text-6xl">Platform console</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">Hotels, branding, admins, tenant reports, and publishing controls in one compact workspace.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-dark" type="button" onClick={() => setMode('activities')}><Activity size={18} /> Activities</button>
              <button className="btn-dark" type="button" onClick={openCreate} disabled={!canCreateHotel || saving}><Plus size={18} /> Add New Hotel</button>
              <button className="btn-dark text-red-700" type="button" onClick={logout}><LogOut size={18} /> Logout</button>
            </div>
          </FadeIn>
        </div>
      </section>

      <div className="container-page -mt-6 pb-12">
        {overview.error ? <Notice type="error" message={overview.error.message} /> : null}
        {notice ? <Notice type={notice.type} message={notice.message} /> : null}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metric icon={Building2} label="Hotels" value={`${totals.hotels}/${HOTEL_LIMIT}`} />
          <Metric icon={ShieldCheck} label="Admins" value={totals.admins} />
          <Metric icon={UsersRound} label="Guest users" value={totals.customers} />
          <Metric icon={BarChart3} label="Revenue" value={`Rs ${totals.revenue.toLocaleString('en-IN')}`} />
        </section>
        {!canCreateHotel ? (
          <Notice type="error" message="Your plan includes 3 hotels. Contact WebReich to add another hotel." />
        ) : null}

        {mode === 'list' ? <HotelList hotels={hotels} onDetail={openDetail} onStatus={toggleHotelStatus} onDelete={deleteHotel} saving={saving} /> : null}
        {mode === 'activities' ? <ActivitiesPage activities={visibleActivities} loading={activities.loading} onBack={() => setMode('list')} /> : null}
        {['create', 'edit'].includes(mode) ? (
          <HotelForm
            mode={mode}
            form={hotelForm}
            saving={saving}
            onBack={() => setMode(selectedHotelId ? 'detail' : 'list')}
            onChange={updateHotel}
            onSubmit={saveHotel}
            onUpload={uploadHotelImage}
            onUploadMany={uploadHotelImages}
            onRemoveMedia={removeHotelMedia}
          />
        ) : null}
        {mode === 'detail' ? (
          <HotelDetail
            hotel={selectedHotel}
            loading={detail.loading}
            detail={detail.data}
            hotels={hotels}
            adminForm={adminForm}
            saving={saving}
            onBack={() => setMode('list')}
            onEdit={() => selectedHotel && openEdit(selectedHotel)}
            onDelete={() => selectedHotel && deleteHotel(selectedHotel)}
            onAdminChange={setAdminForm}
            onCreateAdmin={createAdmin}
            onRemoveAdmin={removeAdmin}
            onDeleteAdmin={deleteAdmin}
          />
        ) : null}
      </div>
    </main>
  )
}

function HotelList({ hotels, onDetail, onStatus, onDelete, saving }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft">
      <div className="grid grid-cols-[1.2fr_0.7fr_0.6fr_0.6fr_160px] gap-4 border-b border-stone-200 bg-stone-100 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500 max-lg:hidden">
        <span>Hotel</span><span>Admins</span><span>Users</span><span>Status</span><span>Actions</span>
      </div>
      <Stagger>
        {hotels.map((hotel) => (
          <StaggerItem key={hotel.id} className="grid gap-4 border-b border-stone-100 p-4 lg:grid-cols-[1.2fr_0.7fr_0.6fr_0.6fr_160px] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={hotel.branding?.logoUrl ? logoDisplayUrl(hotel.branding.logoUrl) : hotel.hero_image_url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80'}
                alt={hotel.name}
                className={`h-12 w-12 ${hotel.branding?.logoUrl ? 'object-contain' : 'rounded-md object-cover'}`}
              />
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold">{hotel.name}</p>
                <p className="truncate text-xs font-bold text-stone-500">{formatHotelHost(hotel)} / {hotel.slug}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-stone-600">{hotel.admins?.length || 0} assigned</p>
            <p className="text-sm font-semibold text-stone-600">{hotel.customers || 0} guests</p>
            <button type="button" onClick={() => onStatus(hotel)} disabled={saving}><StatusPill status={hotel.status} /></button>
            <div className="flex flex-wrap gap-2">
              <IconButton label="View" onClick={() => onDetail(hotel)} icon={Eye} />
              <IconButton label={hotel.status === 'active' ? 'Suspend hotel' : 'Resume hotel'} onClick={() => onStatus(hotel)} icon={hotel.status === 'active' ? Ban : Power} />
              <IconButton label="Delete" onClick={() => onDelete(hotel)} icon={Trash2} danger />
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      {!hotels.length ? <p className="p-8 text-center text-sm font-semibold text-stone-500">No hotels yet. Add the first hotel to begin onboarding.</p> : null}
    </section>
  )
}

function HotelForm({ mode, form, saving, onBack, onChange, onSubmit, onUpload, onUploadMany, onRemoveMedia }) {
  return (
    <FadeIn className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-panel">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="eyebrow">{mode === 'edit' ? 'Update hotel' : 'New hotel'}</p>
          <h2 className="mt-1 text-4xl font-semibold">{mode === 'edit' ? form.name : 'Create hotel profile'}</h2>
        </div>
        <button className="btn-secondary" type="button" onClick={onBack}><ArrowLeft size={18} /> Back</button>
      </div>
      <form onSubmit={onSubmit} className="grid gap-6">
        <FormBlock title="Identity">
          <Field label="Hotel name"><input className="input" value={form.name} onChange={(event) => onChange('name', event.target.value)} required /></Field>
          <Field label="Legal name"><input className="input" value={form.legalName} onChange={(event) => onChange('legalName', event.target.value)} /></Field>
          <Field label="Slug"><input className="input" value={form.slug} onChange={(event) => onChange('slug', slugify(event.target.value))} required /></Field>
          <Field label="Subdomain"><input className="input" value={form.subdomain} onChange={(event) => onChange('subdomain', slugify(event.target.value))} required /></Field>
          <Field label="Description"><textarea className="input min-h-28 py-3" value={form.description} onChange={(event) => onChange('description', event.target.value)} required /></Field>
        </FormBlock>

        <FormBlock title="Razorpay payment routing">
          <Field label="Settlement account">
            <select className="input" value={form.paymentRoutingType} onChange={(event) => onChange('paymentRoutingType', event.target.value)}>
              <option value="primary">Primary Razorpay account</option>
              <option value="linked">Route linked account</option>
            </select>
          </Field>
          <Field label="Linked account ID">
            <input
              className="input"
              value={form.razorpayLinkedAccountId}
              onChange={(event) => onChange('razorpayLinkedAccountId', event.target.value.trim())}
              placeholder="acc_..."
              disabled={form.paymentRoutingType !== 'linked'}
              required={form.paymentRoutingType === 'linked'}
            />
          </Field>
          <p className="rounded-md bg-stone-50 p-3 text-sm font-semibold leading-6 text-stone-600 md:col-span-2">
            Use primary for Hotel Ranjeet. Use linked account for RS Exclusive Stay and Fine Dine or RG Exclusive Stay and Fine Dine so Razorpay Route settles that hotel's bookings into its mapped bank account.
          </p>
        </FormBlock>

        <FormBlock title="Contact and socials">
          <Field label="Address"><input className="input" value={form.line1} onChange={(event) => onChange('line1', event.target.value)} /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={(event) => onChange('city', event.target.value)} required /></Field>
          <Field label="State"><input className="input" value={form.state} onChange={(event) => onChange('state', event.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} /></Field>
          <Field label="Phone numbers"><input className="input" placeholder="+91..., +91..." value={form.phones} onChange={(event) => onChange('phones', event.target.value)} /></Field>
          <Field label="WhatsApp number"><input className="input" placeholder="919876543210" value={form.whatsapp} onChange={(event) => onChange('whatsapp', event.target.value)} /></Field>
          <Field label="Instagram link"><input className="input" value={form.instagram} onChange={(event) => onChange('instagram', event.target.value)} /></Field>
          <Field label="Facebook link"><input className="input" value={form.facebook} onChange={(event) => onChange('facebook', event.target.value)} /></Field>
          <Field label="LinkedIn URL"><input className="input" value={form.linkedin} onChange={(event) => onChange('linkedin', event.target.value)} /></Field>
          <Field label="Twitter / X URL"><input className="input" value={form.twitter} onChange={(event) => onChange('twitter', event.target.value)} /></Field>
        </FormBlock>

        <FormBlock title="Branding and media">
          <UploadField label="Hotel logo" value={form.logoUrl ? 'Logo uploaded' : ''} onFile={(file) => onUpload('logoUrl', file, 'hotel-logo')} />
          <MediaList items={form.logoUrl ? [{ url: form.logoUrl, alt: 'Logo' }] : []} singular="logo" onRemove={() => onRemoveMedia('logoUrl')} />
          <UploadField label="Hero images (max 3, up to 10 MB each)" multiple disabled={Boolean(form.youtubeEmbedUrl)} value={`${form.heroImages.length}/3 uploaded`} onFiles={(files) => onUploadMany('heroImages', files, 'hotel-hero', 3 - form.heroImages.length)} />
          <MediaList items={form.heroImages} singular="hero image" onRemove={(index) => onRemoveMedia('heroImages', index)} />
          <Field label="YouTube embed or video URL">
            <input className="input" value={form.youtubeEmbedUrl} disabled={form.heroImages.length > 0} onChange={(event) => onChange('youtubeEmbedUrl', event.target.value)} placeholder="https://www.youtube.com/embed/..." />
          </Field>
          <UploadField label="Showcase images (max 3, up to 10 MB each)" multiple value={`${form.showcaseImages.length}/3 uploaded`} onFiles={(files) => onUploadMany('showcaseImages', files, 'hotel-showcase', 3 - form.showcaseImages.length)} />
          <MediaList items={form.showcaseImages} singular="showcase image" onRemove={(index) => onRemoveMedia('showcaseImages', index)} />
          <UploadField label="Dining image (1 image, up to 10 MB)" value={form.diningImage?.url ? 'Dining image uploaded' : ''} onFile={(file) => onUpload('diningImage', file, 'hotel-dining')} />
          <MediaList items={form.diningImage ? [form.diningImage] : []} singular="dining image" onRemove={() => onRemoveMedia('diningImage')} />
          <UploadField label="Gallery images (max 5, up to 10 MB each)" multiple value={`${form.gallery.length}/5 uploaded`} onFiles={(files) => onUploadMany('gallery', files, 'hotel-gallery', 5 - form.gallery.length)} />
          <MediaList items={form.gallery} singular="gallery image" onRemove={(index) => onRemoveMedia('gallery', index)} />
          <Field label="Check-in"><input className="input" value={form.checkIn} onChange={(event) => onChange('checkIn', event.target.value)} /></Field>
          <Field label="Check-out"><input className="input" value={form.checkOut} onChange={(event) => onChange('checkOut', event.target.value)} /></Field>
        </FormBlock>

        <button className="btn-primary w-full md:w-fit" disabled={saving} type="submit">{saving ? 'Saving...' : mode === 'edit' ? 'Update hotel' : 'Create hotel'}</button>
      </form>
    </FadeIn>
  )
}

function HotelDetail({ hotel, loading, detail, hotels, adminForm, saving, onBack, onEdit, onDelete, onAdminChange, onCreateAdmin, onRemoveAdmin, onDeleteAdmin }) {
  const [showAdminForm, setShowAdminForm] = useState(false)

  useEffect(() => {
    setShowAdminForm(false)
  }, [hotel?.id])

  if (loading || !hotel) return <LoadingState label="Loading hotel report" />
  const bookings = detail?.bookings || []
  const rooms = detail?.rooms || []
  const payments = detail?.payments || []
  const capturedPayments = payments.find((payment) => payment.status === 'captured')
  const createdPayments = payments.reduce((sum, payment) => sum + Number(payment.count || 0), 0)
  const performanceRows = [
    { icon: CalendarDays, label: 'Bookings', value: hotel.bookings || 0 },
    { icon: UsersRound, label: 'Guest users', value: hotel.customers || 0 },
    { icon: BarChart3, label: 'Revenue', value: `Rs ${Number(hotel.revenue || 0).toLocaleString('en-IN')}` },
    { icon: BedIcon, label: 'Room types', value: rooms.length },
    { icon: ShieldCheck, label: 'Hotel admins', value: hotel.admins?.length || 0 },
    { icon: CheckCircle2, label: 'Captured payments', value: capturedPayments?.count || 0 },
    { icon: BarChart3, label: 'Payment value', value: `Rs ${Number(capturedPayments?.amount || 0).toLocaleString('en-IN')}` },
    { icon: Activity, label: 'Payment attempts', value: createdPayments },
  ]
  const detailHeroIsLogo = !hotel.hero_image_url && hotel.branding?.logoUrl

  return (
    <FadeIn className="mt-6 grid gap-4">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-panel">
        <div className="relative h-48 sm:h-56">
          <img
            src={hotel.hero_image_url || (hotel.branding?.logoUrl ? logoDisplayUrl(hotel.branding.logoUrl) : '') || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80'}
            alt={hotel.name}
            className={`h-full w-full ${detailHeroIsLogo ? 'object-contain p-8' : 'object-cover'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal/70 to-transparent" />
          <div className="absolute bottom-5 left-5 text-white">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/70">Hotel report</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">{hotel.name}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={18} /> Portfolio</button>
          <button className="btn-secondary" onClick={onEdit}><Pencil size={18} /> Edit</button>
          <a className="btn-secondary" href={buildHotelUrl(hotel)} target="_blank" rel="noreferrer"><Eye size={18} /> Open hotel page</a>
          <button className="btn-secondary text-red-700" onClick={onDelete}><Trash2 size={18} /> Delete</button>
        </div>
      </div>

      <HotelPerformance rows={performanceRows} />

      <section className="grid gap-4">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <SectionTitle icon={ShieldCheck} title="Hotel admins" />
            <button className="btn-secondary w-full sm:w-fit" type="button" onClick={() => setShowAdminForm((value) => !value)}>
              <UserPlus size={18} /> {showAdminForm ? 'Close form' : 'Add admin'}
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {(hotel.admins || []).map((admin) => (
              <div key={admin.id} className="flex flex-col justify-between gap-3 rounded-md border border-stone-200 p-3 sm:flex-row sm:items-center">
                <div>
                  <p className="font-extrabold">{admin.fullName || admin.email}</p>
                  <p className="text-sm text-stone-500">{admin.email} / {admin.phone || 'No phone'}</p>
                </div>
                <div className="flex gap-2">
                  <IconButton label="Remove from hotel" icon={Trash2} onClick={() => onRemoveAdmin(admin, hotel.id)} />
                  <IconButton label="Delete user" icon={Trash2} onClick={() => onDeleteAdmin(admin)} danger />
                </div>
              </div>
            ))}
            {!hotel.admins?.length ? <p className="text-sm font-semibold text-stone-500">No admins assigned.</p> : null}
          </div>
        </div>

        {showAdminForm ? (
          <form onSubmit={onCreateAdmin} className="rounded-lg border border-amberline/25 bg-white p-5 shadow-soft">
            <SectionTitle icon={UserPlus} title="Add hotel admin" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Full name"><input className="input" value={adminForm.fullName} onChange={(event) => onAdminChange({ ...adminForm, fullName: event.target.value })} required /></Field>
              <Field label="Email"><input className="input" type="email" value={adminForm.email} onChange={(event) => onAdminChange({ ...adminForm, email: event.target.value })} required /></Field>
              <Field label="Phone"><input className="input" value={adminForm.phone} onChange={(event) => onAdminChange({ ...adminForm, phone: event.target.value })} /></Field>
              <Field label="Temporary password"><input className="input" type="password" minLength={8} value={adminForm.password} onChange={(event) => onAdminChange({ ...adminForm, password: event.target.value })} required /></Field>
              <Field label="Assign hotels">
                <select
                  className="input min-h-28 py-2"
                  multiple
                  value={adminForm.hotelIds.length ? adminForm.hotelIds : [hotel.id]}
                  onChange={(event) => onAdminChange({ ...adminForm, hotelIds: Array.from(event.target.selectedOptions).map((option) => option.value) })}
                >
                  {hotels.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <div className="flex items-end">
                <button className="btn-primary w-full" disabled={saving}><UserPlus size={18} /> Add admin</button>
              </div>
            </div>
          </form>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ReportTable title="Recent bookings" rows={bookings} />
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft">
          <SectionTitle icon={Building2} title="Room types" />
          <div className="mt-4 grid gap-3">
            {rooms.map((room) => (
              <div key={room.id} className="flex justify-between gap-4 rounded-md bg-stone-50 p-3">
                <span className="font-bold">{room.name}</span>
                <span className="text-sm font-bold text-stone-500">Rs {Number(room.base_price).toLocaleString('en-IN')}</span>
              </div>
            ))}
            {!rooms.length ? <p className="text-sm font-semibold text-stone-500">No rooms created yet.</p> : null}
          </div>
        </div>
      </section>
    </FadeIn>
  )
}

function ReportTable({ title, rows }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft">
      <SectionTitle icon={BarChart3} title={title} />
      <div className="mt-4 grid gap-3">
        {rows.map((booking) => (
          <div key={booking.booking_reference} className="rounded-md border border-stone-100 p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-bold">{booking.guest_name}</p>
              <StatusPill status={booking.status} />
            </div>
            <p className="mt-1 text-sm text-stone-500">{booking.room_type_name} / {booking.check_in} to {booking.check_out}</p>
          </div>
        ))}
        {!rows.length ? <p className="text-sm font-semibold text-stone-500">No booking activity yet.</p> : null}
      </div>
    </div>
  )
}

function HotelPerformance({ rows }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <SectionTitle icon={Activity} title="Hotel performance" />
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-stone-400">Live report</p>
      </div>
      <div className="mt-3 grid overflow-hidden rounded-md border border-stone-100 md:grid-cols-2 xl:grid-cols-4">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex min-h-14 items-center justify-between gap-4 border-b border-stone-100 px-3 py-2 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+4)]:border-b-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-stone-100 text-amberline"><Icon size={16} /></span>
              <p className="min-w-0 truncate text-sm font-bold text-stone-600">{label}</p>
            </div>
            <p className="shrink-0 text-right text-base font-extrabold text-charcoal">{value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FormBlock({ title, children }) {
  return (
    <fieldset className="grid gap-4 rounded-lg border border-stone-200 p-4 md:grid-cols-2">
      <legend className="px-2 text-xs font-extrabold uppercase tracking-[0.16em] text-stone-500">{title}</legend>
      {children}
    </fieldset>
  )
}

function ActivitiesPage({ activities, loading, onBack }) {
  return (
    <FadeIn className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-panel">
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="eyebrow">Activity monitor</p>
          <h2 className="mt-1 text-4xl font-semibold">Hotel admin activities</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">Recent admin actions are cached for the super-admin console and mirrored in this browser for quick review.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" type="button" onClick={() => exportActivities(activities)}><Download size={18} /> Export CSV</button>
          <button className="btn-secondary" type="button" onClick={onBack}><ArrowLeft size={18} /> Back</button>
        </div>
      </div>
      {loading ? <p className="rounded-md bg-bone p-4 text-sm font-semibold text-stone-600">Loading activities...</p> : null}
      <div className="grid gap-3">
        {activities.map((activity) => (
          <article key={activity.id} className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-4 md:grid-cols-[1fr_190px_180px] md:items-center">
            <div>
              <p className="font-extrabold text-charcoal">{formatAction(activity.action)}</p>
              <p className="mt-1 text-sm font-semibold text-stone-600">{activity.actorEmail || 'Unknown admin'} / {activity.hotelName || 'Platform'}</p>
            </div>
            <p className="text-sm font-bold text-stone-500">{activity.entityType}</p>
            <p className="text-sm font-bold text-stone-500">{formatDateTime(activity.createdAt)}</p>
          </article>
        ))}
        {!activities.length && !loading ? <p className="rounded-md bg-bone p-6 text-center text-sm font-semibold text-stone-500">No admin activities captured yet.</p> : null}
      </div>
    </FadeIn>
  )
}

function MediaList({ items, singular, onRemove }) {
  if (!items.length) return null
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div key={`${item.url || item}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-charcoal">{capitalize(singular)} {items.length > 1 ? index + 1 : ''}</p>
            <p className="truncate text-xs font-semibold text-stone-500">{item.alt || getFileName(item.url || item) || 'Uploaded to Cloudinary'}</p>
          </div>
          <button type="button" title={`Remove ${singular}`} onClick={() => onRemove(index)} className="btn-secondary !min-h-9 shrink-0 !px-3 text-red-700">
            Remove
          </button>
        </div>
      ))}
    </div>
  )
}

function UploadField({ label, value, multiple, disabled = false, onFile, onFiles }) {
  return (
    <label>
      <span className="label">{label}</span>
      <div className={`flex min-h-12 items-center gap-3 rounded-md border border-stone-300 bg-white px-3 ${disabled ? 'opacity-55' : ''}`}>
        <ImagePlus size={18} className="text-amberline" />
        <input
          className="min-w-0 flex-1 text-sm"
          type="file"
          accept="image/*"
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            if (onFiles) onFiles(event.target.files)
            else onFile?.(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      {value ? <p className="mt-2 truncate text-xs font-semibold text-stone-500">{value}</p> : null}
    </label>
  )
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amberline text-white"><Icon size={16} /></span>
        <p className="min-w-0 truncate text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{label}</p>
      </div>
      <p className="mt-2 truncate text-lg font-extrabold leading-tight text-charcoal sm:text-xl">{value}</p>
    </div>
  )
}

function SectionTitle({ icon: Icon, title }) {
  return <h2 className="flex items-center gap-2 text-lg font-extrabold"><Icon size={19} className="text-amberline" /> {title}</h2>
}

function IconButton({ label, icon: Icon, onClick, danger }) {
  return (
    <button type="button" title={label} onClick={onClick} className={`grid h-9 w-9 place-items-center rounded-md border border-stone-200 bg-white ${danger ? 'text-red-700' : 'text-stone-700'} hover:border-amberline/30`}>
      <Icon size={16} />
    </button>
  )
}

function Notice({ type, message }) {
  const Icon = type === 'success' ? CheckCircle2 : CircleAlert
  const tone = type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
  return <p className={`mt-4 flex items-start gap-2 rounded-md border p-3 text-sm font-semibold ${tone}`}><Icon size={17} className="mt-0.5 shrink-0" /> {message}</p>
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function BedIcon(props) {
  return <Building2 {...props} />
}

function toHotelPayload(form) {
  const phones = splitList(form.phones)
  const heroImages = form.heroImages.slice(0, 3)
  const showcaseImages = form.showcaseImages.slice(0, 3)
  const gallery = form.gallery.slice(0, 5)
  return {
    name: form.name,
    slug: form.slug,
    subdomain: form.subdomain,
    legalName: form.legalName || undefined,
    description: form.description,
    address: { line1: form.line1, city: form.city, state: form.state, country: form.country },
    contact: {
      email: form.email,
      phones,
      phone: phones[0] || '',
      whatsapp: form.whatsapp,
      social: {
        instagram: form.instagram,
        facebook: form.facebook,
        linkedin: form.linkedin,
        twitter: form.twitter,
      },
    },
    policies: { checkIn: form.checkIn, checkOut: form.checkOut, cancellation: 'Configured by hotel admin.' },
    paymentConfig: {
      routingType: form.paymentRoutingType,
      linkedAccountId: form.paymentRoutingType === 'linked' ? form.razorpayLinkedAccountId : '',
    },
    branding: {
      logoText: form.name,
      logoUrl: form.logoUrl,
      logoPublicId: form.logoPublicId,
      heroImages,
      showcaseImages,
      showcaseImageUrl: showcaseImages[0]?.url || '',
      diningImage: form.diningImage,
      diningImageUrl: form.diningImage?.url || '',
      youtubeEmbedUrl: form.youtubeEmbedUrl,
      gallery,
      accent: '#7f1d1d',
      tone: 'Independent luxury hotel',
    },
    heroImageUrl: heroImages[0]?.url || '',
  }
}

function toHotelForm(hotel) {
  return {
    ...emptyHotel,
    name: hotel.name || '',
    legalName: hotel.legal_name || '',
    slug: hotel.slug || '',
    subdomain: hotel.subdomain || '',
    description: hotel.description || '',
    line1: hotel.address?.line1 || '',
    city: hotel.address?.city || '',
    state: hotel.address?.state || '',
    country: hotel.address?.country || 'India',
    email: hotel.contact?.email || '',
    phones: (hotel.contact?.phones || [hotel.contact?.phone].filter(Boolean)).join(', '),
    whatsapp: hotel.contact?.whatsapp || '',
    instagram: hotel.contact?.social?.instagram || '',
    facebook: hotel.contact?.social?.facebook || '',
    linkedin: hotel.contact?.social?.linkedin || '',
    twitter: hotel.contact?.social?.twitter || hotel.contact?.social?.x || '',
    checkIn: hotel.policies?.checkIn || '14:00',
    checkOut: hotel.policies?.checkOut || '11:00',
    logoUrl: hotel.branding?.logoUrl || '',
    logoPublicId: hotel.branding?.logoPublicId || '',
    heroImageUrl: hotel.hero_image_url || '',
    heroImages: normalizeMediaItems(hotel.branding?.heroImages || [hotel.hero_image_url].filter(Boolean)),
    showcaseImages: normalizeMediaItems(hotel.branding?.showcaseImages || [hotel.branding?.showcaseImageUrl].filter(Boolean)).slice(0, 3),
    diningImage: normalizeMediaItems([hotel.branding?.diningImage || hotel.branding?.diningImageUrl].filter(Boolean))[0] || null,
    youtubeEmbedUrl: hotel.branding?.youtubeEmbedUrl || '',
    gallery: normalizeMediaItems(hotel.branding?.gallery || []).slice(0, 5),
    paymentRoutingType: hotel.payment_config?.routingType || hotel.payment_config?.routing_type || 'primary',
    razorpayLinkedAccountId: hotel.payment_config?.linkedAccountId || hotel.payment_config?.linked_account_id || '',
  }
}

function normalizeMediaItems(items) {
  return (items || [])
    .map((item) => (typeof item === 'string' ? { url: item, publicId: '', alt: '' } : { url: item.url || item.secureUrl || '', publicId: item.publicId || item.cloudinaryPublicId || '', alt: item.alt || '' }))
    .filter((item) => item.url)
}

function readActivityArchive() {
  try {
    return JSON.parse(window.localStorage.getItem(activityArchiveKey) || '[]')
  } catch {
    return []
  }
}

function writeActivityArchive(activities) {
  try {
    window.localStorage.setItem(activityArchiveKey, JSON.stringify(activities.slice(0, 500)))
  } catch {
    // Local storage may be unavailable in private browsing.
  }
}

function mergeActivities(primary, secondary) {
  const seen = new Set()
  return [...primary, ...secondary].filter((activity) => {
    if (!activity?.id || seen.has(activity.id)) return false
    seen.add(activity.id)
    return true
  }).slice(0, 500)
}

function exportActivities(activities) {
  const header = ['Date', 'Hotel', 'Admin', 'Action', 'Entity']
  const rows = activities.map((activity) => [
    formatDateTime(activity.createdAt),
    activity.hotelName || '',
    activity.actorEmail || '',
    formatAction(activity.action),
    activity.entityType || '',
  ])
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `hotel-activities-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function csvCell(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`
}

function formatAction(value) {
  return String(value || 'activity').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function capitalize(value) {
  return String(value || '').replace(/^\w/, (letter) => letter.toUpperCase())
}

function getFileName(value) {
  try {
    const path = new URL(value).pathname
    return decodeURIComponent(path.split('/').filter(Boolean).pop() || '')
  } catch {
    return String(value || '').split('/').filter(Boolean).pop() || ''
  }
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
