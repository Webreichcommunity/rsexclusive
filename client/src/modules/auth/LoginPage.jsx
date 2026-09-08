import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, KeyRound, Loader2, LogIn, Mail, RotateCcw, UserPlus } from 'lucide-react'
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

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo')
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
    await apiFetch('/auth/register', {
      method: 'POST',
      authToken: token,
      body: {
        fullName: profile?.fullName || user.displayName || user.email,
        phone: profile?.phone || undefined,
        photoUrl: profile?.photoUrl || user.photoURL || undefined,
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
        const profile = { fullName: form.fullName, email: form.email, phone: form.phone, photoUrl: '' }
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
            <button type="button" onClick={google} className="btn-secondary mt-6 w-full border-stone-300 bg-white" disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />} {mode === 'register' ? 'Register with Google' : 'Continue with Google'}
            </button>
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
    </main>
  )
}

function Field({ label, children }) {
  return <label><span className="label">{label}</span>{children}</label>
}

function GoogleMark() {
  return <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-sm font-black text-[#4285f4] shadow-sm">G</span>
}
