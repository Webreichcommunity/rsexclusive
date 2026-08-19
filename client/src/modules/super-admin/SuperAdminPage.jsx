import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Eye,
  ImagePlus,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { StatusPill } from '../../components/ui/StatusPill.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { uploadImageToCloudinary } from '../../services/cloudinaryUpload.js'

const emptyHotel = {
  name: '',
  legalName: '',
  slug: '',
  subdomain: '',
  customDomain: '',
  description: '',
  line1: '',
  city: '',
  state: '',
  country: 'India',
  email: '',
  web3formsAccessKey: '',
  phones: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  checkIn: '14:00',
  checkOut: '11:00',
  amenities: '',
  logoUrl: '',
  heroImageUrl: '',
  showcaseImageUrl: '',
  youtubeEmbedUrl: '',
  gallery: [],
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
  const [notice, setNotice] = useState(null)
  const [saving, setSaving] = useState(false)

  const overview = useAsync(() => apiFetch('/super-admin/overview'), refreshKey)
  const detail = useAsync(
    () => (mode === 'detail' && selectedHotelId ? apiFetch(`/super-admin/hotels/${selectedHotelId}`) : Promise.resolve(null)),
    `${mode}:${selectedHotelId}:${refreshKey}`,
  )

  const hotels = useMemo(() => overview.data?.hotels || [], [overview.data?.hotels])
  const selectedHotel = detail.data?.hotel || hotels.find((hotel) => hotel.id === selectedHotelId)
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
    setHotelForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'name' && !current.slug ? { slug: slugify(value) } : {}),
      ...(field === 'name' && !current.subdomain ? { subdomain: slugify(value).slice(0, 28) } : {}),
    }))
  }

  function openCreate() {
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
    setSaving(true)
    try {
      const image = await uploadImageToCloudinary(file, {
        signatureUrl: selectedHotelId ? `/super-admin/hotels/${selectedHotelId}/media/signature` : '/super-admin/media/signature',
        folder,
      })
      if (field === 'gallery') {
        setHotelForm((current) => ({ ...current, gallery: [...current.gallery, image.secureUrl] }))
      } else {
        setHotelForm((current) => ({ ...current, [field]: image.secureUrl }))
      }
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
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
    if (!window.confirm(`Delete ${hotel.name}? Hotels with bookings should be deactivated instead.`)) return
    setSaving(true)
    try {
      await apiFetch(`/super-admin/hotels/${hotel.id}`, { method: 'DELETE' })
      setMode('list')
      setSelectedHotelId('')
      setRefreshKey((value) => value + 1)
      setNotice({ type: 'success', message: 'Hotel deleted.' })
    } catch (error) {
      setNotice({ type: 'error', message: error.message })
    } finally {
      setSaving(false)
    }
  }

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
            <button className="btn-dark" onClick={openCreate}><Plus size={18} /> Add New Hotel</button>
          </FadeIn>
        </div>
      </section>

      <div className="container-page -mt-6 pb-12">
        {overview.error ? <Notice type="error" message={overview.error.message} /> : null}
        {notice ? <Notice type={notice.type} message={notice.message} /> : null}

        <section className="grid gap-3 md:grid-cols-4">
          <Metric icon={Building2} label="Hotels" value={totals.hotels} />
          <Metric icon={ShieldCheck} label="Admins" value={totals.admins} />
          <Metric icon={UsersRound} label="Guest users" value={totals.customers} />
          <Metric icon={BarChart3} label="Revenue" value={`Rs ${totals.revenue.toLocaleString('en-IN')}`} />
        </section>

        {mode === 'list' ? <HotelList hotels={hotels} onDetail={openDetail} onEdit={openEdit} onStatus={toggleHotelStatus} onDelete={deleteHotel} saving={saving} /> : null}
        {['create', 'edit'].includes(mode) ? (
          <HotelForm
            mode={mode}
            form={hotelForm}
            saving={saving}
            onBack={() => setMode(selectedHotelId ? 'detail' : 'list')}
            onChange={updateHotel}
            onSubmit={saveHotel}
            onUpload={uploadHotelImage}
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

function HotelList({ hotels, onDetail, onEdit, onStatus, onDelete, saving }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft">
      <div className="grid grid-cols-[1.2fr_0.7fr_0.6fr_0.6fr_160px] gap-4 border-b border-stone-200 bg-stone-100 px-4 py-3 text-xs font-extrabold uppercase tracking-[0.12em] text-stone-500 max-lg:hidden">
        <span>Hotel</span><span>Admins</span><span>Users</span><span>Status</span><span>Actions</span>
      </div>
      <Stagger>
        {hotels.map((hotel) => (
          <StaggerItem key={hotel.id} className="grid gap-4 border-b border-stone-100 p-4 lg:grid-cols-[1.2fr_0.7fr_0.6fr_0.6fr_160px] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <img src={hotel.branding?.logoUrl || hotel.hero_image_url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=300&q=80'} alt={hotel.name} className="h-12 w-12 rounded-md object-cover" />
              <div className="min-w-0">
                <p className="truncate text-2xl font-semibold">{hotel.name}</p>
                <p className="truncate text-xs font-bold text-stone-500">{hotel.subdomain}.domain.com / {hotel.slug}</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-stone-600">{hotel.admins?.length || 0} assigned</p>
            <p className="text-sm font-semibold text-stone-600">{hotel.customers || 0} guests</p>
            <button type="button" onClick={() => onStatus(hotel)} disabled={saving}><StatusPill status={hotel.status} /></button>
            <div className="flex flex-wrap gap-2">
              <IconButton label="View" onClick={() => onDetail(hotel)} icon={Eye} />
              <IconButton label="Edit" onClick={() => onEdit(hotel)} icon={Pencil} />
              <IconButton label="Delete" onClick={() => onDelete(hotel)} icon={Trash2} danger />
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      {!hotels.length ? <p className="p-8 text-center text-sm font-semibold text-stone-500">No hotels yet. Add the first hotel to begin onboarding.</p> : null}
    </section>
  )
}

function HotelForm({ mode, form, saving, onBack, onChange, onSubmit, onUpload }) {
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
          <Field label="Custom domain"><input className="input" value={form.customDomain} onChange={(event) => onChange('customDomain', event.target.value)} /></Field>
          <Field label="Description"><textarea className="input min-h-28 py-3" value={form.description} onChange={(event) => onChange('description', event.target.value)} required /></Field>
        </FormBlock>

        <FormBlock title="Contact and socials">
          <Field label="Address"><input className="input" value={form.line1} onChange={(event) => onChange('line1', event.target.value)} /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={(event) => onChange('city', event.target.value)} required /></Field>
          <Field label="State"><input className="input" value={form.state} onChange={(event) => onChange('state', event.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} /></Field>
          <Field label="Web3Forms access key"><input className="input" value={form.web3formsAccessKey} onChange={(event) => onChange('web3formsAccessKey', event.target.value)} placeholder="Hotel inquiry inbox key" /></Field>
          <Field label="Phone numbers"><input className="input" placeholder="+91..., +91..." value={form.phones} onChange={(event) => onChange('phones', event.target.value)} /></Field>
          <Field label="WhatsApp"><input className="input" value={form.whatsapp} onChange={(event) => onChange('whatsapp', event.target.value)} /></Field>
          <Field label="Instagram link"><input className="input" value={form.instagram} onChange={(event) => onChange('instagram', event.target.value)} /></Field>
          <Field label="Facebook link"><input className="input" value={form.facebook} onChange={(event) => onChange('facebook', event.target.value)} /></Field>
        </FormBlock>

        <FormBlock title="Branding and media">
          <UploadField label="Hotel logo" value={form.logoUrl} onFile={(file) => onUpload('logoUrl', file, 'hotel-logo')} />
          <UploadField label="Front / hero image" value={form.heroImageUrl} onFile={(file) => onUpload('heroImageUrl', file, 'hotel-hero')} />
          <UploadField label="Showcase photo" value={form.showcaseImageUrl} onFile={(file) => onUpload('showcaseImageUrl', file, 'hotel-showcase')} />
          <Field label="YouTube embed or video URL"><input className="input" value={form.youtubeEmbedUrl} onChange={(event) => onChange('youtubeEmbedUrl', event.target.value)} placeholder="https://www.youtube.com/embed/..." /></Field>
          <UploadField label="Gallery images" multiple value={`${form.gallery.length} uploaded`} onFile={(file) => onUpload('gallery', file, 'hotel-gallery')} />
          <Field label="Amenities"><input className="input" value={form.amenities} onChange={(event) => onChange('amenities', event.target.value)} placeholder="Spa, pool, rooftop dining" /></Field>
          <Field label="Check-in"><input className="input" value={form.checkIn} onChange={(event) => onChange('checkIn', event.target.value)} /></Field>
          <Field label="Check-out"><input className="input" value={form.checkOut} onChange={(event) => onChange('checkOut', event.target.value)} /></Field>
        </FormBlock>

        <button className="btn-primary w-full md:w-fit" disabled={saving} type="submit">{saving ? 'Saving...' : mode === 'edit' ? 'Update hotel' : 'Create hotel'}</button>
      </form>
    </FadeIn>
  )
}

function HotelDetail({ hotel, loading, detail, hotels, adminForm, saving, onBack, onEdit, onDelete, onAdminChange, onCreateAdmin, onRemoveAdmin, onDeleteAdmin }) {
  if (loading || !hotel) return <LoadingState label="Loading hotel report" />
  const bookings = detail?.bookings || []
  const rooms = detail?.rooms || []
  return (
    <FadeIn className="mt-6 grid gap-6">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-panel">
        <div className="relative h-64">
          <img src={hotel.hero_image_url || hotel.branding?.logoUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80'} alt={hotel.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal/70 to-transparent" />
          <div className="absolute bottom-5 left-5 text-white">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/70">Hotel report</p>
            <h2 className="mt-2 text-5xl font-semibold">{hotel.name}</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-4">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={18} /> Portfolio</button>
          <button className="btn-secondary" onClick={onEdit}><Pencil size={18} /> Edit</button>
          <a className="btn-secondary" href={`/?hotel=${hotel.subdomain}`} target="_blank" rel="noreferrer"><Eye size={18} /> Open hotel page</a>
          <button className="btn-secondary text-red-700" onClick={onDelete}><Trash2 size={18} /> Delete</button>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric icon={CalendarDays} label="Bookings" value={hotel.bookings || 0} />
        <Metric icon={UsersRound} label="Guest users" value={hotel.customers || 0} />
        <Metric icon={BarChart3} label="Revenue" value={`Rs ${Number(hotel.revenue || 0).toLocaleString('en-IN')}`} />
        <Metric icon={BedIcon} label="Room types" value={rooms.length} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_430px]">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft">
          <SectionTitle icon={ShieldCheck} title="Hotel admins" />
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

        <form onSubmit={onCreateAdmin} className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft">
          <SectionTitle icon={UserPlus} title="Add hotel admin" />
          <div className="mt-4 grid gap-3">
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
            <button className="btn-primary w-full" disabled={saving}><UserPlus size={18} /> Add admin</button>
          </div>
        </form>
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

function FormBlock({ title, children }) {
  return (
    <fieldset className="grid gap-4 rounded-lg border border-stone-200 p-4 md:grid-cols-2">
      <legend className="px-2 text-xs font-extrabold uppercase tracking-[0.16em] text-stone-500">{title}</legend>
      {children}
    </fieldset>
  )
}

function UploadField({ label, value, multiple, onFile }) {
  return (
    <label>
      <span className="label">{label}</span>
      <div className="flex min-h-12 items-center gap-3 rounded-md border border-stone-300 bg-white px-3">
        <ImagePlus size={18} className="text-amberline" />
        <input className="min-w-0 flex-1 text-sm" type="file" accept="image/*" multiple={multiple} onChange={(event) => onFile(event.target.files?.[0])} />
      </div>
      {value ? <p className="mt-2 truncate text-xs font-semibold text-stone-500">{value}</p> : null}
    </label>
  )
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric-card">
      <span className="icon-tile"><Icon size={20} /></span>
      <p className="mt-4 text-2xl font-extrabold">{value}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
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
  return {
    name: form.name,
    slug: form.slug,
    subdomain: form.subdomain,
    legalName: form.legalName || undefined,
    customDomain: form.customDomain || undefined,
    description: form.description,
    address: { line1: form.line1, city: form.city, state: form.state, country: form.country },
    contact: {
      email: form.email,
      web3formsAccessKey: form.web3formsAccessKey,
      phones: splitList(form.phones),
      phone: splitList(form.phones)[0] || '',
      whatsapp: form.whatsapp,
      social: { instagram: form.instagram, facebook: form.facebook },
    },
    policies: { checkIn: form.checkIn, checkOut: form.checkOut, cancellation: 'Configured by hotel admin.' },
    amenities: splitList(form.amenities),
    branding: {
      logoText: form.name,
      logoUrl: form.logoUrl,
      showcaseImageUrl: form.showcaseImageUrl,
      youtubeEmbedUrl: form.youtubeEmbedUrl,
      gallery: form.gallery,
      accent: '#7f1d1d',
      tone: 'Independent luxury hotel',
    },
    heroImageUrl: form.heroImageUrl || undefined,
  }
}

function toHotelForm(hotel) {
  return {
    ...emptyHotel,
    name: hotel.name || '',
    legalName: hotel.legal_name || '',
    slug: hotel.slug || '',
    subdomain: hotel.subdomain || '',
    customDomain: hotel.custom_domain || '',
    description: hotel.description || '',
    line1: hotel.address?.line1 || '',
    city: hotel.address?.city || '',
    state: hotel.address?.state || '',
    country: hotel.address?.country || 'India',
    email: hotel.contact?.email || '',
    web3formsAccessKey: hotel.contact?.web3formsAccessKey || '',
    phones: (hotel.contact?.phones || [hotel.contact?.phone].filter(Boolean)).join(', '),
    whatsapp: hotel.contact?.whatsapp || '',
    instagram: hotel.contact?.social?.instagram || '',
    facebook: hotel.contact?.social?.facebook || '',
    checkIn: hotel.policies?.checkIn || '14:00',
    checkOut: hotel.policies?.checkOut || '11:00',
    amenities: (hotel.amenities || []).join(', '),
    logoUrl: hotel.branding?.logoUrl || '',
    heroImageUrl: hotel.hero_image_url || '',
    showcaseImageUrl: hotel.branding?.showcaseImageUrl || '',
    youtubeEmbedUrl: hotel.branding?.youtubeEmbedUrl || '',
    gallery: hotel.branding?.gallery || [],
  }
}

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
