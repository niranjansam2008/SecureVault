import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import { api } from './lib/api'
import { uploadFdrDocument } from './lib/storage'
import { ShieldCheck, LayoutDashboard, FilePlus2, Search, LogOut, Bell, RefreshCw, FileDown, CheckCircle2, Clock3, Wallet, UploadCloud } from 'lucide-react'

const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n || 0))
const pretty = s => (s || '').replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase())

function Login({ onDone }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
        if (error) throw error
        setError('Account created. If email confirmation is enabled, confirm your email and then sign in.')
        setMode('login')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onDone()
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="login-wrap"><div className="login-card">
    <div className="brand-mark"><ShieldCheck size={28}/></div><div className="eyebrow">SECURE DEPOSIT OPERATIONS</div>
    <h1>SecureVault</h1><p className="muted">One trusted workspace for every FDR.</p>
    <div className="btn-group w-100 my-3"><button className={`btn ${mode==='login'?'btn-primary':'btn-outline-secondary'}`} onClick={()=>{setMode('login');setError('')}}>Sign in</button><button className={`btn ${mode==='signup'?'btn-primary':'btn-outline-secondary'}`} onClick={()=>{setMode('signup');setError('')}}>Create account</button></div>
    <form onSubmit={submit}>
      {mode==='signup' && <label className="form-label">Full name<input className="form-control" value={name} onChange={e=>setName(e.target.value)} required/></label>}
      <label className="form-label">Email<input className="form-control" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
      <label className="form-label">Password<input className="form-control" type="password" minLength="6" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
      {error && <div className="alert alert-info py-2 small">{error}</div>}
      <button className="btn btn-primary w-100 mt-2" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in securely':'Create account'}</button>
    </form>
    <p className="tiny-note mt-3">New accounts default to the Vendor role. An administrator assigns staff roles in Supabase.</p>
  </div></div>
}

function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [deposits, setDeposits] = useState([])
  const [summary, setSummary] = useState({})
  const [tab, setTab] = useState('overview')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({vendor_name:'',fdr_number:'',bank_name:'',amount:'',issue_date:'',maturity_date:'',department:'',beneficiary:''})
  const [file, setFile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  async function load() {
    if (!session) return
    setLoading(true)
    try {
      const [me, list, stats] = await Promise.all([api('/me'), api('/deposits'), api('/dashboard/summary')])
      setProfile(me.profile); setDeposits(list); setSummary(stats)
    } catch(e) { setNotice(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [session])

  async function submitDeposit(e) {
    e.preventDefault(); setNotice('')
    try {
      const created = await api('/deposits', { method:'POST', body:JSON.stringify(form) })
      if (file) {
        const uploaded = await uploadFdrDocument(file, session.user.id)
        const { error } = await supabase.from('documents').insert({deposit_id:created.id, owner_id:session.user.id, ...uploaded})
        if (error) throw error
      }
      setForm({vendor_name:'',fdr_number:'',bank_name:'',amount:'',issue_date:'',maturity_date:'',department:'',beneficiary:''}); setFile(null)
      setNotice('Deposit submitted successfully.'); setTab('deposits'); await load()
    } catch(e) { setNotice(e.message) }
  }

  async function action(id, endpoint, payload) {
    try { await api(`/deposits/${id}/${endpoint}`, {method:'PATCH', body:JSON.stringify(payload)}); setNotice('Workflow updated successfully.'); await load() }
    catch(e) { setNotice(e.message) }
  }

  async function downloadReport() {
    try {
      const { data:{session:s} } = await supabase.auth.getSession()
      const r = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'}/reports/deposits.csv`, {headers:{Authorization:`Bearer ${s.access_token}`}})
      if (!r.ok) throw new Error('Could not export report')
      const blob = await r.blob(); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='securevault-deposits.csv'; a.click(); URL.revokeObjectURL(url)
    } catch(e) { setNotice(e.message) }
  }

  if (!session) return <Login onDone={()=>{}} />
  const role = profile?.role || 'vendor'
  const canVerify = ['verifier','admin'].includes(role)
  const canApprove = ['approver','admin'].includes(role)
  const filtered = deposits.filter(d => [d.vendor_name,d.fdr_number,d.bank_name,d.status].join(' ').toLowerCase().includes(search.toLowerCase()))
  const cards = [
    {label:'Total deposits',value:summary.total_deposits||0,icon:Wallet},
    {label:'Total secured value',value:money(summary.total_amount),icon:ShieldCheck},
    {label:'Upcoming maturities',value:summary.upcoming_maturities||0,icon:Bell},
    {label:'Pending review',value:(summary.by_status?.submitted||0)+(summary.by_status?.verified||0),icon:Clock3}
  ]

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><div className="brand-mark small"><ShieldCheck/></div><div><b>SecureVault</b><small>FDR MANAGEMENT</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <button className={tab==='overview'?'side-link active':'side-link'} onClick={()=>setTab('overview')}><LayoutDashboard size={18}/> Overview</button>
      <button className={tab==='deposits'?'side-link active':'side-link'} onClick={()=>setTab('deposits')}><Wallet size={18}/> Deposits</button>
      <button className={tab==='new'?'side-link active':'side-link'} onClick={()=>setTab('new')}><FilePlus2 size={18}/> Submit deposit</button>
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{(profile?.full_name||session.user.email||'U')[0].toUpperCase()}</div><div className="user-text"><b>{profile?.full_name||session.user.email}</b><small>{pretty(role)}</small></div></div><button className="side-link" onClick={()=>supabase.auth.signOut()}><LogOut size={18}/> Sign out</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">SECURE OPERATIONS / {pretty(tab)}</div><h2>{tab==='overview'?'Overview':tab==='new'?'Submit a deposit':'Deposit register'}</h2></div><div className="top-actions"><span className="role-pill">{pretty(role)}</span><button className="icon-btn" onClick={load} title="Refresh"><RefreshCw size={18}/></button></div></header>
      {notice && <div className="alert alert-info alert-dismissible">{notice}<button className="btn-close" onClick={()=>setNotice('')}/></div>}
      {tab==='overview' && <>
        <div className="welcome-panel"><div><span className="eyebrow light">CONTROL CENTER</span><h3>Good to see you, {profile?.full_name?.split(' ')[0]||'there'}.</h3><p>Track deposits, approvals and upcoming maturity dates in one place.</p></div><ShieldCheck size={54} opacity=".8"/></div>
        <div className="stats-grid">{cards.map(({label,value,icon:Icon})=><div className="stat-card" key={label}><div className="stat-icon"><Icon size={20}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div></div>)}</div>
        <section className="panel"><div className="panel-head"><div><h5>Recent deposits</h5><p>Latest records visible to your account</p></div><button className="btn btn-sm btn-outline-primary" onClick={()=>setTab('deposits')}>View register</button></div><DepositTable rows={deposits.slice(0,5)} role={role} action={action}/></section>
      </>}
      {tab==='deposits' && <section className="panel"><div className="panel-head"><div><h5>Deposit register</h5><p>Search and monitor FDR records</p></div><div className="d-flex gap-2"><div className="searchbox"><Search size={16}/><input placeholder="Search records…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="btn btn-sm btn-outline-primary" onClick={downloadReport}><FileDown size={15}/> Export</button></div></div><DepositTable rows={filtered} role={role} action={action}/></section>}
      {tab==='new' && <section className="panel form-panel"><div className="panel-head"><div><h5>New security deposit / FDR</h5><p>Enter the instrument details and attach the receipt</p></div></div><form onSubmit={submitDeposit}><div className="form-grid">
        {[
          ['vendor_name','Vendor / contractor name','text'],['fdr_number','FDR reference number','text'],['bank_name','Bank name','text'],['amount','Deposit amount (INR)','number'],['issue_date','Issue date','date'],['maturity_date','Maturity date','date'],['department','Department','text'],['beneficiary','Beneficiary','text']
        ].map(([key,label,type])=><label className="form-label" key={key}>{label}<input className="form-control" type={type} min={type==='number'?'0.01':undefined} step={type==='number'?'0.01':undefined} required={!['department','beneficiary'].includes(key)} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
      </div><label className="form-label mt-2">FDR receipt (PDF / image)<input type="file" className="form-control" accept=".pdf,image/*" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="btn btn-primary mt-3"><UploadCloud size={17}/> Submit deposit</button></form></section>}
      <footer>SecureVault · SIH 2026 prototype <span>Role-based · Auditable · Paperless</span></footer>
    </main>
  </div>
}

function DepositTable({rows,role,action}) {
  if (!rows.length) return <div className="empty-state"><Wallet size={28}/><b>No deposits found</b><span>Records submitted to your workspace will appear here.</span></div>
  return <div className="table-responsive"><table className="table align-middle"><thead><tr><th>FDR / Vendor</th><th>Bank</th><th>Amount</th><th>Maturity</th><th>Status</th><th>Workflow</th></tr></thead><tbody>{rows.map(d=><tr key={d.id}><td><b>{d.fdr_number}</b><small className="d-block text-secondary">{d.vendor_name}</small></td><td>{d.bank_name}</td><td>{money(d.amount)}</td><td>{d.maturity_date}</td><td><span className={`status status-${d.status}`}>{pretty(d.status)}</span></td><td><div className="d-flex gap-1 flex-wrap">
    {['verifier','admin'].includes(role)&&d.status==='submitted'&&<><button className="btn btn-sm btn-success" onClick={()=>action(d.id,'verify',{decision:'verify'})}>Verify</button><button className="btn btn-sm btn-outline-danger" onClick={()=>action(d.id,'verify',{decision:'reject'})}>Reject</button></>}
    {['approver','admin'].includes(role)&&d.status==='verified'&&<button className="btn btn-sm btn-primary" onClick={()=>action(d.id,'approve',{decision:'approve'})}>Approve</button>}
    {['approver','admin'].includes(role)&&d.status==='approved'&&<><button className="btn btn-sm btn-outline-success" onClick={()=>action(d.id,'close',{decision:'released'})}>Release</button><button className="btn btn-sm btn-outline-danger" onClick={()=>action(d.id,'close',{decision:'forfeited'})}>Forfeit</button></>}
    {!(role==='admin'||(role==='verifier'&&d.status==='submitted')||(role==='approver'&&['verified','approved'].includes(d.status)))&&<span className="text-secondary small">—</span>}
  </div></td></tr>)}</tbody></table></div>
}

export default App
