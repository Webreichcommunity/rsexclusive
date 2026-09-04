import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, LogIn, Mail, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { FadeIn } from '../../components/ui/Motion.jsx'
import { loginWithEmail, loginWithGoogle, refreshFirebaseUser, registerWithEmail, resendEmailVerification, sendPasswordReset } from './firebaseClient.js'
import { apiFetch } from '../../services/apiClient.js'
import { useAuth } from './authContext.js'
import { navigateToHotelPath } from '../tenant/resolveTenant.js'

const pendingProfileKey = 'rs-exclusive-pending-registration'

export function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo')
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login')
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' })
  const [pendingProfile, setPendingProfile] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const { firebaseUser, isAuthenticated, loading: authLoading } = useAuth()

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

  async function finishVerifiedRegistration(user, profile = pendingProfile) {
    const token = await user.getIdToken(true)
    await apiFetch('/auth/register', {
      method: 'POST',
      authToken: token,
      body: {
        fullName: profile?.fullName || user.displayName || user.email,
        phone: profile?.phone || undefined,
      },
    })
    window.localStorage.removeItem(pendingProfileKey)
    setPendingProfile(null)
    await redirectByRole(token)
  }

  const redirectByRole = useCallback(async (authToken) => {
    const { user } = await apiFetch('/me', { authToken })
    if (returnTo && user.role === 'customer') {
      navigate(returnTo, { replace: true })
      return
    }
    if (user.role === 'super_admin') {
      navigate('/super-admin', { replace: true })
      return
    }
    if (user.role === 'hotel_admin') {
      navigateToHotelPath(navigate, user.hotel, '/admin', { replace: true })
      return
    }
    navigate(returnTo || '/account', { replace: true })
  }, [navigate, returnTo])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const credential =
        mode === 'register'
          ? await registerWithEmail({ email: form.email, password: form.password, fullName: form.fullName })
          : await loginWithEmail(form.email, form.password)
      if (mode === 'register') {
        savePendingProfile({ fullName: form.fullName, phone: form.phone, email: form.email })
        setMode('verify')
        setInfo('Verification email sent. Open the link from your inbox, then come back and continue.')
        return
      }
      if (!credential.user.emailVerified) {
        const profile = readPendingProfile(credential.user.email) || { fullName: credential.user.displayName || '', email: credential.user.email, phone: '' }
        savePendingProfile(profile)
        setMode('verify')
        setInfo('Please verify your email before continuing.')
        return
      }
      const token = await credential.user.getIdToken(true)
      try {
        await redirectByRole(token)
      } catch (redirectError) {
        if (!redirectError.message.includes('not registered') && !redirectError.message.includes('not active')) throw redirectError
        await finishVerifiedRegistration(credential.user, readPendingProfile(credential.user.email) || { fullName: credential.user.displayName || credential.user.email, email: credential.user.email })
      }
    } catch (err) {
      setError(err.message)
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
      await finishVerifiedRegistration(user, readPendingProfile(user.email) || pendingProfile)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function google() {
    setError('')
    setLoading(true)
    try {
      const credential = await loginWithGoogle()
      const token = await credential.user.getIdToken(true)
      try {
        await redirectByRole(token)
      } catch (error) {
        if (!error.message.includes('not registered') && !error.message.includes('not active')) throw error
        await apiFetch('/auth/register', {
          method: 'POST',
          authToken: token,
          body: { fullName: credential.user.displayName || credential.user.email || 'Guest' },
        })
        await redirectByRole(token)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading || !isAuthenticated || !firebaseUser) return undefined
    if (!firebaseUser.emailVerified && firebaseUser.providerData.some((provider) => provider.providerId === 'password')) {
      const profile = readPendingProfile(firebaseUser.email) || { fullName: firebaseUser.displayName || '', email: firebaseUser.email, phone: '' }
      savePendingProfile(profile)
      setMode('verify')
      return undefined
    }
    let active = true
    setError('')
    setLoading(true)
    firebaseUser
      .getIdToken()
      .then((token) => {
        if (active) redirectByRole(token)
      })
      .catch((err) => {
        if (active) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [authLoading, isAuthenticated, firebaseUser, redirectByRole])

  return (
    <main className="container-page grid min-h-[78vh] items-center gap-10 py-12 lg:grid-cols-[1fr_460px]">
      <FadeIn viewport={false} as="section">
        <div className="max-w-2xl">
          <p className="eyebrow">Secure access</p>
          <h1 className="mt-3 text-5xl font-bold leading-tight text-charcoal md:text-6xl">
            {mode === 'register' ? 'Create your guest account.' : mode === 'forgot' ? 'Reset your password.' : mode === 'verify' ? 'Verify your email.' : 'Continue your booking.'}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-stone-600">
            {returnTo
              ? 'Your selected hotel, room, dates, and guest count will be preserved after login.'
              : mode === 'register'
                ? 'Create an account with email verification or use Google for instant verification.'
                : mode === 'forgot'
                  ? 'Enter your account email and we will send a secure Firebase password reset link.'
                  : mode === 'verify'
                    ? 'Open the verification email, confirm your address, then return here to continue.'
                    : 'Sign in to manage bookings, download receipts, and view your stay history.'}
          </p>
          <div className="mt-8 hidden rounded-lg border border-mist bg-white p-6 shadow-soft md:block">
            <p className="flex items-center gap-2 text-lg font-bold text-charcoal"><ShieldCheck size={20} className="text-amberline" /> Saved session</p>
            <p className="mt-3 text-sm leading-7 text-stone-600">Firebase keeps your session in local browser storage, so returning admins and guests are routed automatically.</p>
          </div>
        </div>
      </FadeIn>

      <FadeIn viewport={false} as="form" onSubmit={mode === 'forgot' ? forgotPassword : submit} className="glass-panel p-5 sm:p-7">
        {isAuthenticated && mode !== 'verify' ? <p className="mb-4 rounded-md border border-mist bg-bone p-3 text-sm font-semibold text-stone-700">You are already signed in. Opening your dashboard...</p> : null}
        {mode !== 'verify' && mode !== 'forgot' ? <button type="button" onClick={google} className="btn-secondary w-full" disabled={loading}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} Continue with Google
        </button> : null}
        {mode !== 'verify' && mode !== 'forgot' ? <div className="my-6 h-px bg-mist" /> : null}

        {mode === 'verify' ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-lg font-extrabold text-amber-950"><Mail size={20} /> Check your email</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-stone-700">We sent a verification link to {firebaseUser?.email || pendingProfile?.email || 'your email'}. After verifying, come back here and continue. Check spam or promotions if it is not in the inbox.</p>
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

        {mode === 'register' ? (
          <>
            <label className="label" htmlFor="fullName">Full name</label>
            <input id="fullName" className="input" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required />
            <label className="label mt-4" htmlFor="phone">Phone</label>
            <input id="phone" className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </>
        ) : null}

        {mode !== 'verify' ? (
          <>
            <label className={`label ${mode === 'register' ? 'mt-4' : ''}`} htmlFor="email">Email</label>
            <input id="email" className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" required />
          </>
        ) : null}
        {mode !== 'forgot' && mode !== 'verify' ? (
          <>
            <label className="label mt-4" htmlFor="password">Password</label>
            <input id="password" className="input" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" minLength={6} required />
          </>
        ) : null}

        {info ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{info}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {mode !== 'verify' ? <button className="btn-primary mt-6 w-full" type="submit" disabled={loading}>
          {loading ? <Loader2 size={18} className="animate-spin" /> : mode === 'register' ? <Mail size={18} /> : <LogIn size={18} />}
          {mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button> : null}

        {mode === 'login' ? (
          <button type="button" className="mt-4 block w-full text-center text-sm font-semibold text-stone-600 hover:text-charcoal" onClick={() => { setError(''); setInfo(''); setMode('forgot') }}>
            Forgot password?
          </button>
        ) : null}

        <button
          type="button"
          className="mt-4 block w-full text-center text-sm font-semibold text-stone-600 hover:text-charcoal"
          onClick={() => {
            setError('')
            setInfo('')
            setMode((value) => (value === 'register' || value === 'forgot' || value === 'verify' ? 'login' : 'register'))
          }}
        >
          {mode === 'register' ? 'Already have an account? Sign in' : mode === 'forgot' || mode === 'verify' ? 'Back to sign in' : 'New guest? Create an account'}
        </button>
        <Link to="/" className="mt-3 block text-center text-sm font-semibold text-stone-600 hover:text-charcoal">Return to hotel</Link>
      </FadeIn>
    </main>
  )
}
