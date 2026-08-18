import React, { useEffect, useState } from 'react'
import { useAuth } from '../useAuth'
import { supabase } from '../supabaseClient'

function LoginForm() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [signedUp, setSignedUp] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setSignedUp(true)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (signedUp) {
    return (
      <div className="contact-sent">
        <div className="tag">Check Your Email</div>
        <p>We've sent a confirmation link to {email}. Confirm it, then sign in below with the same account you already use on the live site.</p>
      </div>
    )
  }

  return (
    <form className="contact-form" onSubmit={submit} style={{ maxWidth: 380 }}>
      <div className="account-tabs">
        <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign In</button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign Up</button>
      </div>
      <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></label>
      {error && <div className="account-error">{error}</div>}
      <button className="blaze-btn" type="submit" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'signin' ? 'Sign In →' : 'Create Account →'}
      </button>
      {mode === 'signin' && (
        <p className="account-note">This uses your real Swindon Airsoft account — same login as the live site.</p>
      )}
    </form>
  )
}

function useMyBookings(userId) {
  const [bookings, setBookings] = useState(null)
  useEffect(() => {
    if (!userId) { setBookings(null); return }
    let cancelled = false
    supabase
      .from('bookings')
      .select('id, ticket_type, qty, total, checked_in, cancelled_at, created_at, events(title, date)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setBookings(error ? [] : (data || []))
      })
    return () => { cancelled = true }
  }, [userId])
  return bookings
}

function ProfileView() {
  const { user, profile, profileLoading, signOut } = useAuth()
  const bookings = useMyBookings(user?.id)

  if (profileLoading || !profile) {
    return <div className="empty-note">Loading your profile…</div>
  }

  return (
    <>
      <div className="account-summary">
        <div className="account-summary-row">
          <div>
            <div className="tag">Player</div>
            <div className="account-name">{profile.name || profile.email}</div>
            {profile.callsign && <div className="account-callsign">Callsign: {profile.callsign}</div>}
          </div>
          <button className="btn-red btn-red-small" onClick={signOut}>Sign Out</button>
        </div>
        <div className="account-stats">
          <div><span className="n">{profile.games_attended ?? 0}</span><span className="l">Games Attended</span></div>
          <div><span className="n">£{Number(profile.credits || 0).toFixed(2)}</span><span className="l">Game Credits</span></div>
          <div><span className="n">{profile.waiver_signed && profile.waiver_year === new Date().getFullYear() ? 'Signed' : 'Not Signed'}</span><span className="l">{new Date().getFullYear()} Waiver</span></div>
          {profile.vip_status && profile.vip_status !== 'none' && (
            <div><span className="n">{profile.vip_status}</span><span className="l">VIP Status</span></div>
          )}
        </div>
        {!(profile.waiver_signed && profile.waiver_year === new Date().getFullYear()) && (
          <div className="account-warning">Your waiver isn't signed for {new Date().getFullYear()} yet — this is required before you can play. Sign it on the live site's Profile page.</div>
        )}
      </div>

      <div className="section-head" style={{ marginTop: 32 }}>
        <span className="section-tag">Your History</span>
        <h2>My Bookings</h2>
      </div>
      {bookings === null && <div className="empty-note">Loading bookings…</div>}
      {bookings && bookings.length === 0 && <div className="empty-note">No bookings yet — head to Fixtures to book your first game.</div>}
      {bookings && bookings.length > 0 && (
        <div className="fixtures-list fixtures-list-full">
          {bookings.map(b => (
            <div className="fixture" key={b.id}>
              <div className="fixture-num">{b.cancelled_at ? '✕' : b.checked_in ? '✓' : '·'}</div>
              <div className="fixture-main">
                <h3>{b.events?.title || 'Event'}</h3>
                <div className="date">
                  {b.events?.date ? new Date(b.events.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                  {' · '}{b.qty}x {b.ticket_type}
                  {b.cancelled_at ? ' · Cancelled' : b.checked_in ? ' · Checked In' : ''}
                </div>
              </div>
              <div className="fixture-slots"><span className="n">£{Number(b.total || 0).toFixed(2)}</span></div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default function Account() {
  const { user, loading } = useAuth()

  return (
    <>
      <section className="page-hero">
        <div className="wrap">
          <span className="section-tag">Your Account</span>
          <h1>{user ? 'My Account' : 'Sign In'}</h1>
          <p className="page-hero-sub">
            {user
              ? 'Your real profile and booking history, pulled live from the same system as the live site.'
              : 'Sign in with your existing Swindon Airsoft account, or create a new one.'}
          </p>
        </div>
      </section>
      <section>
        <div className="wrap">
          {loading && <div className="empty-note">Loading…</div>}
          {!loading && !user && <LoginForm />}
          {!loading && user && <ProfileView />}
        </div>
      </section>
    </>
  )
}
