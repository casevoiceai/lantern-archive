import { FormEvent, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Account, api, EntityResult } from './lib/api'

const lanternAlt = 'Lantern Archive lantern mark, a lit brass lantern'

function AuthPage({ onAuth }: { onAuth: (account: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = mode === 'login'
        ? await api.login(email, password)
        : await api.register(email, password, schoolName || undefined)
      onAuth(result.account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to continue')
    } finally {
      setBusy(false)
    }
  }

  async function forgot() {
    if (!email) return setError('Enter your email first.')
    try {
      const result = await api.forgotPassword(email)
      setError(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit request')
    }
  }

  return <main className="auth-shell">
    <section className="auth-story" aria-labelledby="login-title">
      <img src="/lantern-mark.svg" alt={lanternAlt} className="auth-lantern" />
      <h1 id="login-title">Tell us your town. We'll tell you its story.</h1>
      <p>Lantern Archive builds a custom Civic Entity for your town in minutes, ready to run using the free Time-Crawl Chronicles rulebooks.</p>
    </section>
    <section className="auth-panel">
      <form onSubmit={submit} className="form-stack">
        <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {mode === 'register' && <label>School name <span>(optional)</span><input value={schoolName} onChange={e => setSchoolName(e.target.value)} /></label>}
        {error && <p className="status" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      <div className="auth-links">
        <button className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create a free account' : 'Back to login'}</button>
        <button className="text-button" onClick={forgot}>Forgot password</button>
      </div>
      <p className="small-print">Free accounts get up to three town builds per month. Schools get the full version.</p>
    </section>
  </main>
}

function EntityView({ result, onShare }: { result: EntityResult; onShare: (shared: boolean) => void }) {
  const e = result.entity
  return <article className="result-card">
    <header><p className="kicker">Civic Entity</p><h2>{e.name}</h2><p className="subtitle">{e.subtitle}</p></header>
    <section><h3>Symbolism</h3><p>{e.symbolism}</p></section>
    <section><h3>Historical Tie</h3><p>{e.historicalTie}</p></section>
    <section><h3>Manifestations</h3><ul>{e.manifestations.map(item => <li key={item}>{item}</li>)}</ul></section>
    <section><h3>Reform Chain</h3><div className="reform-grid">
      <div><strong>Gentle · {e.reformChain.gentle.dc}</strong><p>{e.reformChain.gentle.action}</p></div>
      <div><strong>Intermediate · {e.reformChain.intermediate.dc}</strong><p>{e.reformChain.intermediate.action}</p></div>
      <div><strong>Advanced · {e.reformChain.advanced.dc}</strong><p>{e.reformChain.advanced.action}</p></div>
    </div></section>
    {e.districts && <section><h3>District Map</h3><div className="district-grid">{e.districts.map(d => <div key={d.district}><strong>{d.district}</strong><p><b>Dominant Entity:</b> {d.dominantEntity}</p><p><b>If Influence rises:</b> {d.influenceRises}</p><p><b>If Reform succeeds:</b> {d.reformSucceeds}</p></div>)}</div></section>}
    <section><h3>Research Pointers</h3><ol>{e.researchPointers.map(item => <li key={item}>{item}</li>)}</ol></section>
    {result.id && <label className="share-row"><input type="checkbox" onChange={ev => onShare(ev.target.checked)} /> Share this build with the community</label>}
  </article>
}

function Archive({ account, onLogout }: { account: Account; onLogout: () => void }) {
  const [form, setForm] = useState({ townName: '', eraOrIndustry: '', knownDetail1: '', knownDetail2: '', localLegend: '', injusticeFocus: '', semesterId: '', shareToCommunity: false })
  const [result, setResult] = useState<EntityResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function generate(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { setResult(await api.generate(form)) }
    catch (err) {
      const e = err as Error & { code?: string; paidInfoUrl?: string }
      setError(e.code === 'FREE_LIMIT_REACHED' ? `${e.message} Paid-tier information: ${e.paidInfoUrl || 'tccrpg.com/for-schools'}` : e.message)
    } finally { setBusy(false) }
  }

  function field(name: keyof typeof form, value: string | boolean) { setForm(previous => ({ ...previous, [name]: value })) }

  return <main className="archive-shell">
    <header className="app-header"><div><img src="/lantern-mark.svg" alt={lanternAlt} /><div><p className="kicker">Lantern Archive</p><p>{account.tier === 'free' ? `${account.remainingGenerations ?? 0} free builds remaining` : 'School account'}</p></div></div><button className="secondary" onClick={onLogout}>Log out</button></header>
    <div className="workspace">
      <section className="builder-panel"><h1>Build a Civic Entity</h1><p>Start with what you know. Lantern Archive will shape the historical tension into a playable civic challenge.</p>
        <form onSubmit={generate} className="form-stack">
          <label>Town name<input value={form.townName} onChange={e => field('townName', e.target.value)} required /></label>
          <label>Dominant historical era or industry <span>(optional)</span><input placeholder="1850s coal-era Carbondale-style setting" value={form.eraOrIndustry} onChange={e => field('eraOrIndustry', e.target.value)} /></label>
          <label>One known local historical detail<textarea value={form.knownDetail1} onChange={e => field('knownDetail1', e.target.value)} required /></label>
          <label>Second historical detail <span>(optional)</span><textarea value={form.knownDetail2} onChange={e => field('knownDetail2', e.target.value)} /></label>
          <label>Local legend or folklore <span>(optional)</span><textarea value={form.localLegend} onChange={e => field('localLegend', e.target.value)} /></label>
          <label>Injustice or tension to center <span>(optional)</span><textarea value={form.injusticeFocus} onChange={e => field('injusticeFocus', e.target.value)} /></label>
          {account.tier === 'paid' && <><label>Semester ID <span>(optional)</span><input value={form.semesterId} onChange={e => field('semesterId', e.target.value)} /></label><label className="share-row"><input type="checkbox" checked={form.shareToCommunity} onChange={e => field('shareToCommunity', e.target.checked)} /> Share to community after generation</label></>}
          {error && <p className="status" role="alert">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'Building your town…' : result ? 'Regenerate Civic Entity' : 'Generate Civic Entity'}</button>
        </form>
      </section>
      <section className="output-panel" aria-live="polite">{result ? <EntityView result={result} onShare={async shared => { if (result.id) await api.share(result.id, shared) }} /> : <div className="empty-state"><img src="/lantern-mark.svg" alt={lanternAlt} /><h2>Your Entity will appear here.</h2><p>Each build includes symbolism, historical grounding, manifestations, reform actions, and research directions.</p></div>}</section>
    </div>
  </main>
}

export default function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  useEffect(() => { api.me().then(r => setAccount(r.account)).catch(() => setAccount(null)).finally(() => setLoading(false)) }, [])
  if (loading) return <div className="loading"><img src="/lantern-mark.svg" alt={lanternAlt} /><p>Opening the archive…</p></div>
  return <Routes>
    <Route path="/login" element={account ? <Navigate to="/" replace /> : <AuthPage onAuth={a => { setAccount(a); navigate('/') }} />} />
    <Route path="/*" element={account ? <Archive account={account} onLogout={async () => { await api.logout(); setAccount(null); navigate('/login') }} /> : <Navigate to="/login" replace />} />
  </Routes>
}
