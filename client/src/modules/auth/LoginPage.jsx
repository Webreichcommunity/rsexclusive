import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, FileText, KeyRound, Loader2, LogIn, Mail, RotateCcw, ShieldCheck, UserPlus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FadeIn } from '../../components/ui/Motion.jsx'
import { GuideToast } from '../../components/ui/GuideToast.jsx'
import {
  loginWithEmail,
  loginWithGoogle,
  refreshFirebaseUser,
  registerWithEmail,
  resendEmailVerification,
  sendPasswordReset,
} from './firebaseClient.js'
import { apiFetch } from '../../services/apiClient.js'
import { useAuth } from './authContext.js'
import { buildTenantPath, navigateToHotelPath, resolveTenantFromLocation, stripTenantFromPath } from '../tenant/resolveTenant.js'

const pendingProfileKey = 'rs-exclusive-pending-registration'
const bookingAuthDraftKey = 'rs-exclusive-booking-auth-return'
const TERMS_VERSION = '2026-09-12'
const termsAndConditions = [
  'The primary guest must be at least 18 years of age to be able to check into the hotel.',
  'It is mandatory for guests to present valid photo identification at the time of check-in. According to government regulations, a valid Photo ID has to be carried by every person above the age of 18 staying at the hotel. The identification proofs accepted are Aadhar Card, Driving License, Voter ID Card, and Passport. Without Original copy of valid ID the guest will not be allowed to check-in.',
  'Should any action by a guest be deemed inappropriate by the hotel, or if any inappropriate behaviour is brought to the attention of the hotel, the hotel reserves the right, after the allegations have been investigated, to take action against the guest.',
  'Every hotel may have different policies for specific times during the year.',
  'Guests shall be liable for any damage, except normal wear and tear to Hotel asset. Guest shall keep the Hotel room in a good condition and maintain hygiene and cleanliness.',
  'Certain policies are booking specific and are informed to the customer while making the booking.',
  'Guests may be contacted closer to their check-in date to confirm the arrival status or arrival time through calls or messages. In case, we do not receive a response from the guest after multiple attempts, the booking may be put on hold or cancelled. In case of availability, The Hotel will try to reinstate your booking when you contact us back or make a payment through our multitude of payment options.',
  'As we continue to strive to improve our services, we may reach out to guests to get a feedback of their experience through calls or messages.',
  'Management does not take any responsibility of the guests valuables. Lockers are available in rooms.',
  'I agree to abide the terms and conditions during my/our stay in Hotel.',
  'By accessing this website and/or submitting any personal or digital information, including but not limited to name, contact details, identification documents, payment information, browsing data, and preferences, the Guest expressly consents to the collection, storage, processing, and use of such Guest Data.',
  'The Hotels reserves the right to use, retain, analyze, and process the Guest Data at its sole discretion, for purposes including but not limited to reservation management, guest services, marketing and promotional communications, service improvement, analytics, and any other business purpose the Hotels may deem fit from time to time, whether now known or hereafter devised.',
  'The Guest acknowledges and agrees that by providing such data, they authorize the Hotels to use the same in the manner the Hotels considers appropriate, without further notice or consent, except where applicable law requires otherwise.',
  "By submitting any personal or digital information on this website, the Guest expressly consents to its collection, storage, and processing by rg exclusive, rs exclusive, Ranjeet hotel a member of the ranjeet Group of Hotels, for purposes including reservations, guest services, marketing, and record-keeping. The Guest further agrees that such data may be shared with and used by ranjeet Hotel, as the Group's head entity, and any other hotel presently or hereafter forming part of the Group, without requiring separate consent for each property.",
]

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const returnTo = normalizeInternalReturnTo(params.get('returnTo')) || readBookingReturnTo()
  const tenantMode = resolveTenantFromLocation()
  const returnToPath = String(returnTo || '').split('?')[0]
  const bookingReturnTo = stripTenantFromPath(returnToPath, tenantMode).startsWith('/book')
  const consoleReturnTo = returnTo && (returnTo.startsWith('/admin') || returnTo.startsWith('/super-admin'))
  const appPath = stripTenantFromPath(location.pathname, tenantMode)
  const isAdminLogin = appPath.startsWith('/admin/login') || params.get('role') === 'admin' || Boolean(consoleReturnTo)
  const requestedMode = params.get('mode')
  const initialMode = isAdminLogin ? (requestedMode === 'forgot' ? 'forgot' : 'login') : requestedMode === 'register' || bookingReturnTo ? 'register' : 'login'
  const [mode, setMode] = useState(initialMode)
  const [showEmailRegister, setShowEmailRegister] = useState(initialMode !== 'register')
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' })
  const [pendingProfile, setPendingProfile] = useState(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [guideToast, setGuideToast] = useState(null)
  const guideToastTimer = useRef(null)
  const [loading, setLoading] = useState(false)
  const { firebaseUser, isAuthenticated, loading: authLoading } = useAuth()

  useEffect(() => () => window.clearTimeout(guideToastTimer.current), [])

  function showGuideToast(title, message, tone = 'warning') {
    window.clearTimeout(guideToastTimer.current)
    setGuideToast({ id: `${Date.now()}-${title}`, title, message, tone })
    guideToastTimer.current = window.setTimeout(() => setGuideToast(null), 3000)
  }

  function savePendingProfile(profile) {
    setPendingProfile(profile)
    window.localStorage.setItem(pendingProfileKey, JSON.stringify(profile))
  }

  function readPendingProfile(email) {
    try {
      const profile = JSON.parse(window.localStorage.getItem(pendingProfileKey) || 'null')
      if (profile?.email && profile.email.toLowerCase() === String(email || '').toLowerCase()) return profile
    } catch {
      return null
    }
    return null
  }

  const redirectByRole = useCallback(async (authToken) => {
    const { user } = await apiFetch('/me', { authToken })
    if (user.role === 'super_admin') {
      navigate('/super-admin', { replace: true })
      return
    }
    if (user.role === 'hotel_admin') {
      navigateToHotelPath(navigate, user.hotel, '/admin', { replace: true })
      return
    }
    navigate(returnTo && !consoleReturnTo ? returnTo : buildTenantPath('/account', tenantMode), { replace: true })
  }, [consoleReturnTo, navigate, returnTo, tenantMode])

  async function registerGuestProfile(user, profile) {
    const token = await user.getIdToken(true)
    const acceptedAt = profile?.termsAcceptedAt || new Date().toISOString()
    await apiFetch('/auth/register', {
      method: 'POST',
      authToken: token,
      body: {
        fullName: profile?.fullName || user.displayName || user.email,
        phone: profile?.phone || undefined,
        photoUrl: profile?.photoUrl || user.photoURL || undefined,
        termsAccepted: true,
        termsVersion: profile?.termsVersion || TERMS_VERSION,
        termsAcceptedAt: acceptedAt,
      },
    })
    window.localStorage.removeItem(pendingProfileKey)
    setPendingProfile(null)
    await redirectByRole(token)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      if (!isAdminLogin && mode === 'register') {
        if (!termsAccepted) {
          setError('Accept the terms and conditions to create your guest account.')
          showGuideToast('Terms required', 'Please read and accept the stay and data terms before registering.')
          return
        }
        const profile = { fullName: form.fullName, email: form.email, phone: form.phone, photoUrl: '', termsVersion: TERMS_VERSION, termsAcceptedAt: new Date().toISOString() }
        const credential = await registerWithEmail({ email: form.email, password: form.password, fullName: form.fullName })
        savePendingProfile(profile)
        setMode('verify')
        setInfo(`Verification email sent to ${credential.user.email}. Confirm it, then continue here.`)
        return
      }

      const credential = await loginWithEmail(form.email, form.password)
      if (!isAdminLogin && !credential.user.emailVerified) {
        const profile = readPendingProfile(credential.user.email) || { fullName: credential.user.displayName || '', email: credential.user.email, phone: '', photoUrl: credential.user.photoURL || '' }
        savePendingProfile(profile)
        setMode('verify')
        setInfo('Please verify your email before continuing.')
        return
      }
      const token = await credential.user.getIdToken(true)
      await redirectByRole(token)
    } catch (err) {
      setError(isAdminLogin ? err.message.replace('Complete your account setup before continuing.', 'This staff account is not registered. Ask the super admin to add it first.') : err.message)
    } finally {
      setLoading(false)
    }
  }

  async function forgotPassword(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    if (!form.email) {
      setError('Enter your email address first.')
      showGuideToast('Email required', 'Enter your email address so we can send the reset link.')
      return
    }
    setLoading(true)
    try {
      await sendPasswordReset(form.email)
      setInfo('Password reset link sent. Open your email and set a new password, then sign in.')
      setMode('login')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification() {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await resendEmailVerification()
      setInfo('Verification email sent again. Check inbox and spam folder.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function checkVerification() {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const user = await refreshFirebaseUser()
      if (!user?.emailVerified) {
        setInfo('Email is not verified yet. Open the verification link from your inbox, then try again.')
        return
      }
      await registerGuestProfile(user, readPendingProfile(user.email) || pendingProfile)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function google() {
    setError('')
    setInfo('')
    if (!isAdminLogin && mode === 'register' && !termsAccepted) {
      setError('Accept the terms and conditions to create your guest account.')
      showGuideToast('Terms required', 'Please read and accept the stay and data terms before registering.')
      return
    }
    setLoading(true)
    try {
      const credential = await loginWithGoogle()
      const token = await credential.user.getIdToken(true)
      if (mode === 'register') {
        await registerGuestProfile(credential.user, {
          fullName: credential.user.displayName || credential.user.email || 'Guest',
          email: credential.user.email,
          phone: form.phone,
          photoUrl: credential.user.photoURL || '',
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date().toISOString(),
        })
        return
      }
      await redirectByRole(token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading || !isAuthenticated || !firebaseUser || mode === 'register' || mode === 'verify') return undefined
    if (!isAdminLogin && !firebaseUser.emailVerified && firebaseUser.providerData.some((provider) => provider.providerId === 'password')) {
      const profile = readPendingProfile(firebaseUser.email) || { fullName: firebaseUser.displayName || '', email: firebaseUser.email, phone: '', photoUrl: firebaseUser.photoURL || '' }
      savePendingProfile(profile)
      setMode('verify')
      return undefined
    }
    let active = true
    setError('')
    firebaseUser
      .getIdToken()
      .then((token) => {
        if (active) redirectByRole(token)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [authLoading, isAuthenticated, firebaseUser, isAdminLogin, mode, redirectByRole])

  const showRegisterProfileFields = !isAdminLogin && mode === 'register' && showEmailRegister
  const showCredentialFields = mode !== 'verify' && (isAdminLogin || mode !== 'register' || showEmailRegister)

  const title = isAdminLogin
    ? mode === 'forgot'
      ? 'Reset staff password.'
      : 'Hotel admin sign in.'
    : mode === 'register'
      ? 'Create your group account.'
      : mode === 'verify'
        ? 'Verify your email.'
        : 'Sign in to your group account.'
  const subtitle = isAdminLogin
    ? 'Use the email and password assigned from the super admin panel. No email verification step is required for hotel admins.'
    : mode === 'register'
      ? 'Register once and use the same account for every hotel in the group.'
      : 'Use the same method you used while registering on any group hotel website.'

  return (
    <main className="relative overflow-hidden bg-white">
      <GuideToast toast={guideToast} />
      <section className="container-page grid min-h-[calc(100svh-72px)] items-center gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-14">
        <FadeIn viewport={false} as="section" className="relative overflow-hidden rounded-lg bg-charcoal p-6 text-white shadow-panel sm:p-8 lg:min-h-[620px]">
          <img src="https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1600&q=80" alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/86 via-black/52 to-black/16" />
          <div className="relative flex min-h-[420px] flex-col justify-end lg:min-h-[560px]">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-100">{isAdminLogin ? 'Hotel console' : 'Guest access'}</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-black leading-none text-white sm:text-5xl md:text-6xl">{title}</h1>
            <p className="mt-5 max-w-xl text-sm font-semibold leading-7 text-white/84 sm:text-base">{subtitle}</p>
          </div>
        </FadeIn>

        <FadeIn viewport={false} as="form" onSubmit={mode === 'forgot' ? forgotPassword : submit} className="glass-panel p-5 sm:p-7">
          <p className="eyebrow">{isAdminLogin ? 'Staff portal' : mode === 'register' ? 'New guest' : 'Guest account'}</p>
          <h2 className="mt-2 text-3xl font-black leading-tight text-charcoal">
            {isAdminLogin ? 'Email and password' : mode === 'register' ? 'Register once' : 'Welcome back'}
          </h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-stone-600">
            {isAdminLogin ? 'Credentials are managed only by the super admin.' : 'One guest account works across every hotel in the group.'}
          </p>

          {!isAdminLogin && mode !== 'verify' ? (
            <button type="button" onClick={google} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md border border-amberline/40 bg-[linear-gradient(135deg,#ffffff_0%,#fff7ed_45%,#fef3c7_100%)] px-5 py-3 text-sm font-black text-charcoal shadow-soft transition duration-300 hover:-translate-y-0.5 hover:border-amberline hover:shadow-card focus:outline-none focus:ring-2 focus:ring-amberline/25 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60" disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />} {mode === 'register' ? 'Register with Google' : 'Continue with Google'}
            </button>
          ) : null}

          {!isAdminLogin && mode === 'register' ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <label className="flex items-start gap-3 text-sm font-semibold leading-6 text-stone-700">
                <input className="mt-1 h-4 w-4 accent-[#7f1d1d]" type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                <span>I agree to the hotel stay terms, guest policies, and data consent terms.</span>
              </label>
              <button type="button" className="mt-2 inline-flex items-center gap-2 text-sm font-black text-amberline underline-offset-4 hover:underline" onClick={() => setTermsOpen(true)}>
                <FileText size={16} /> Read full terms and conditions
              </button>
            </div>
          ) : null}

          {!isAdminLogin && mode === 'register' && !showEmailRegister ? (
            <div className="mt-5 rounded-lg border border-mist bg-white/82 p-3 text-center shadow-sm">
              <p className="text-xs font-semibold leading-5 text-stone-600">Prefer email and password?</p>
              <button type="button" className="mt-2 text-sm font-black text-amberline underline-offset-4 hover:underline" onClick={() => { setError(''); setInfo(''); setShowEmailRegister(true) }}>
                Use email instead
              </button>
            </div>
          ) : null}

          {mode === 'verify' ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-lg font-extrabold text-amber-950"><Mail size={20} /> Check your email</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-stone-700">We sent a verification link to {firebaseUser?.email || pendingProfile?.email || 'your email'}. After verifying, come back here and continue.</p>
              <div className="mt-4 grid gap-3">
                <button className="btn-primary w-full" type="button" onClick={checkVerification} disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} I verified my email
                </button>
                <button className="btn-secondary w-full" type="button" onClick={resendVerification} disabled={loading}>
                  <RotateCcw size={18} /> Resend email
                </button>
              </div>
            </div>
          ) : null}

          {showRegisterProfileFields ? (
            <div className="mt-5 grid gap-4">
              <Field label="Full name"><input className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required /></Field>
              <Field label="Phone"><input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            </div>
          ) : null}

          {showCredentialFields ? (
            <>
              <div className={`${!isAdminLogin ? 'mt-5 border-t border-mist pt-5' : 'mt-5'} grid gap-4`}>
                <Field label="Email"><input id="email" className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" required /></Field>
                {mode !== 'forgot' ? <Field label="Password"><input id="password" className="input" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" minLength={6} required /></Field> : null}
              </div>
              <button className="btn-primary mt-6 w-full" type="submit" disabled={loading}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : mode === 'register' ? <UserPlus size={18} /> : mode === 'forgot' ? <Mail size={18} /> : <LogIn size={18} />}
                {mode === 'register' ? 'Register with email' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
              </button>
            </>
          ) : null}

          {info ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{info}</p> : null}
          {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          {isAdminLogin && mode === 'login' ? <button type="button" className="mt-4 block w-full text-center text-sm font-semibold text-stone-600 hover:text-charcoal" onClick={() => { setError(''); setInfo(''); setMode('forgot') }}>Forgot password?</button> : null}
          {isAdminLogin && mode !== 'login' ? <button type="button" className="mt-4 block w-full text-center text-sm font-semibold text-stone-600 hover:text-charcoal" onClick={() => { setError(''); setInfo(''); setMode('login') }}>Back to staff sign in</button> : null}
          {!isAdminLogin && mode === 'login' ? <button type="button" className="mt-5 block w-full text-center text-sm font-semibold text-stone-600 hover:text-charcoal" onClick={() => { setError(''); setInfo(''); setShowEmailRegister(false); setMode('register') }}><KeyRound className="mr-1 inline" size={15} /> New here? Create group account</button> : null}
          {!isAdminLogin && mode === 'register' ? <button type="button" className="mt-5 block w-full text-center text-sm font-semibold text-stone-600 hover:text-charcoal" onClick={() => { setError(''); setInfo(''); setShowEmailRegister(true); setMode('login') }}>Already registered? Sign in</button> : null}
          <Link to={buildTenantPath('/', tenantMode)} className="mt-3 block text-center text-sm font-semibold text-stone-600 hover:text-charcoal">Return to hotel</Link>
        </FadeIn>
      </section>
      {termsOpen ? <TermsModal onClose={() => setTermsOpen(false)} /> : null}
    </main>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function GoogleMark() {
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-black text-[#4285f4] shadow-sm">G</span>
}

function TermsModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-charcoal/60 p-3 backdrop-blur-sm md:place-items-center" onMouseDown={onClose}>
      <section className="max-h-[92svh] w-full max-w-3xl overflow-hidden rounded-lg border border-white/60 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-mist bg-white/95 p-4 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="eyebrow">Guest terms</p>
            <h2 className="mt-1 text-2xl font-black text-charcoal">Terms and conditions</h2>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-md border border-mist bg-white" onClick={onClose} aria-label="Close terms"><X size={18} /></button>
        </div>
        <div className="max-h-[72svh] overflow-y-auto p-4 sm:p-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-extrabold text-amber-950"><ShieldCheck size={17} /> Applies to guest registration and stays</p>
          </div>
          <ol className="mt-5 grid gap-3 text-sm font-medium leading-7 text-stone-700">
            {termsAndConditions.map((term, index) => (
              <li key={`${index}-${term.slice(0, 16)}`} className="rounded-md border border-stone-200 bg-bone/50 p-3">
                <span className="font-black text-charcoal">{index + 1}. </span>{term}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  )
}

function normalizeInternalReturnTo(value) {
  const target = String(value || '').trim()
  if (!target || !target.startsWith('/') || target.startsWith('//')) return ''
  return target
}

function readBookingReturnTo() {
  try {
    const draft = JSON.parse(window.sessionStorage.getItem(bookingAuthDraftKey) || 'null')
    return normalizeInternalReturnTo(draft?.returnTo)
  } catch {
    return ''
  }
}
