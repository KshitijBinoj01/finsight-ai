import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bell, CalendarDays, Check, ChevronRight,
  CircleDollarSign, CreditCard, Filter, LayoutDashboard, LoaderCircle, LogOut,
  Menu, Plus, RefreshCw, Search, ShieldAlert, Sparkles, Target, Trash2, TrendingDown,
  TrendingUp, Wallet, X, Utensils, CarFront, House, ShoppingBag, HeartPulse,
  PiggyBank, BriefcaseBusiness, CircleHelp
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell
} from 'recharts'
import { api } from './services/api.js'

const NAV = [
  { label: 'OVERVIEW', items: [{ name: 'Dashboard', icon: LayoutDashboard }, { name: 'Transactions', icon: Activity }] },
  { label: 'MANAGE MONEY', items: [{ name: 'Budgets', icon: CreditCard }, { name: 'Savings goals', icon: Target }] },
  { label: 'INTELLIGENCE', items: [{ name: 'Insights & AI', icon: Sparkles }] },
]
const COLORS = ['#5b6ee1', '#25a879', '#f1aa47', '#9a79db', '#e879a9', '#5bb6c9', '#94a3b8']
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0))
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const isoToday = () => localISO(new Date())
const monthStart = () => { const d = new Date(); d.setDate(1); return localISO(d) }
const monthEnd = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 0); return localISO(d) }
const dateLabel = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No deadline'
const categoryIcon = name => name === 'Housing' ? House : name === 'Transport' ? CarFront : name === 'Food & dining' ? Utensils : name === 'Shopping' ? ShoppingBag : name === 'Healthcare' ? HeartPulse : name === 'Income' ? CircleDollarSign : BriefcaseBusiness

function normalizeTransaction(row, accounts) {
  const account = accounts.find(a => a.account_id === row.account_id)
  return {
    id: row.transaction_id, description: row.description || 'Untitled transaction',
    category: row.category?.name || 'Uncategorised', categoryId: row.category_id,
    account: account?.bank_name || account?.account_type || 'Account', accountId: row.account_id,
    date: String(row.txn_date).slice(0, 10), amount: Number(row.amount),
    type: row.txn_type, anomaly: Boolean(row.is_anomaly),
  }
}

function App() {
  const [page, setPage] = useState('Dashboard')
  const [token, setToken] = useState('')
  const [user, setUser] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [budgets, setBudgets] = useState([])
  const [goals, setGoals] = useState([])
  const [insights, setInsights] = useState({ anomalies: [], budget_alerts: [], predictions: [], recommendations: [], note: '' })
  const [summary, setSummary] = useState(null)
  const [backendStatus, setBackendStatus] = useState('connecting')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showAddBudget, setShowAddBudget] = useState(false)
  const [showAddGoal, setShowAddGoal] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [transactionForm, setTransactionForm] = useState({ description: '', amount: '', category_id: '', account_id: '', txn_date: isoToday(), txn_type: 'expense' })
  const [budgetForm, setBudgetForm] = useState({ category_id: '', amount: '', period: 'monthly', start_date: monthStart(), end_date: monthEnd() })
  const [goalForm, setGoalForm] = useState({ name: '', target_amount: '', current_amount: '0', deadline: '' })

  const loadAll = useCallback(async authToken => {
    // Insights refreshes anomaly flags for existing rows. Fetch transactions after
    // it completes so the ledger shows the same flags as the Insights page.
    const [summaryData, accountData, categoryData, budgetData, goalData, insightData] = await Promise.all([
      api.summary(authToken), api.accounts(authToken), api.categories(authToken),
      api.budgets(authToken), api.goals(authToken), api.insights(authToken),
    ])
    const transactionData = await api.transactions(authToken)
    setSummary(summaryData)
    setUser(summaryData.user || null)
    setAccounts(accountData)
    setCategories(categoryData)
    setTransactions(transactionData.map(row => normalizeTransaction(row, accountData)))
    setBudgets(budgetData)
    setGoals(goalData)
    setInsights(insightData)
    setTransactionForm(prev => ({
      ...prev,
      account_id: prev.account_id || String(accountData[0]?.account_id || ''),
      category_id: prev.category_id || String((categoryData.find(c => c.name === 'Food & dining') || categoryData[0])?.category_id || ''),
    }))
    setBudgetForm(prev => ({
      ...prev,
      category_id: prev.category_id || String((categoryData.find(c => c.name === 'Food & dining') || categoryData[0])?.category_id || ''),
    }))
    setBackendStatus('connected')
  }, [])

  const connect = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const session = await api.demoLogin()
      setToken(session.access_token)
      await loadAll(session.access_token)
      setBackendStatus('connected')
    } catch (e) {
      setBackendStatus('offline')
      setError(e.message || 'Could not connect to the backend.')
    } finally {
      setLoading(false)
    }
  }, [loadAll])

  useEffect(() => { connect() }, [connect])

  const notify = message => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }

  const refresh = async () => {
    if (!token) return connect()
    setBusy(true)
    setError('')
    try {
      await loadAll(token)
      notify('Synced with MySQL')
    } catch (e) {
      setError(e.message)
      notify('Sync failed — see the error banner')
    } finally { setBusy(false) }
  }

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const filtered = useMemo(() => transactions.filter(t => {
    const match = `${t.description} ${t.category} ${t.account}`.toLowerCase().includes(search.toLowerCase())
    return match && (typeFilter === 'all' || t.type === typeFilter)
  }), [transactions, search, typeFilter])

  async function addTransaction(event) {
    event.preventDefault()
    if (!token) return notify('Backend is not connected. No data was saved.')
    setBusy(true); setError('')
    try {
      await api.addTransaction(token, {
        account_id: Number(transactionForm.account_id),
        category_id: Number(transactionForm.category_id),
        amount: Number(transactionForm.amount),
        txn_date: transactionForm.txn_date,
        description: transactionForm.description.trim(),
        txn_type: transactionForm.txn_type,
      })
      await loadAll(token)
      setShowAddTransaction(false)
      setTransactionForm(prev => ({ ...prev, description: '', amount: '', txn_date: isoToday() }))
      setPage('Transactions')
      notify('Transaction saved to MySQL')
    } catch (e) { setError(e.message); notify('Could not save transaction') }
    finally { setBusy(false) }
  }

  async function deleteTransaction(id) {
    if (!token || !window.confirm('Delete this transaction permanently?')) return
    setBusy(true); setError('')
    try {
      await api.deleteTransaction(token, id)
      await loadAll(token)
      notify('Transaction deleted from MySQL')
    } catch (e) { setError(e.message); notify('Could not delete transaction') }
    finally { setBusy(false) }
  }

  async function addBudget(event) {
    event.preventDefault()
    if (!token) return notify('Backend is not connected.')
    setBusy(true); setError('')
    try {
      await api.addBudget(token, {
        category_id: Number(budgetForm.category_id), amount: Number(budgetForm.amount),
        period: budgetForm.period, start_date: budgetForm.start_date, end_date: budgetForm.end_date,
      })
      await loadAll(token); setShowAddBudget(false)
      setBudgetForm(prev => ({ ...prev, amount: '', start_date: monthStart(), end_date: monthEnd() }))
      notify('Budget saved to MySQL')
    } catch (e) { setError(e.message); notify('Could not save budget') }
    finally { setBusy(false) }
  }

  async function addGoal(event) {
    event.preventDefault()
    if (!token) return notify('Backend is not connected.')
    setBusy(true); setError('')
    try {
      await api.addGoal(token, {
        name: goalForm.name.trim(), target_amount: Number(goalForm.target_amount),
        current_amount: Number(goalForm.current_amount || 0), deadline: goalForm.deadline || null,
      })
      await loadAll(token); setShowAddGoal(false)
      setGoalForm({ name: '', target_amount: '', current_amount: '0', deadline: '' })
      notify('Savings goal saved to MySQL')
    } catch (e) { setError(e.message); notify('Could not save savings goal') }
    finally { setBusy(false) }
  }

  async function contribute(goal) {
    const amountText = window.prompt(`How much would you like to add to "${goal.name}"?`, '500')
    if (amountText === null) return
    const amount = Number(amountText)
    if (!Number.isFinite(amount) || amount <= 0) return notify('Enter a valid positive amount.')
    setBusy(true); setError('')
    try {
      await api.updateGoal(token, goal.goal_id, { current_amount: Number(goal.current_amount) + amount })
      await loadAll(token); notify('Savings progress updated')
    } catch (e) { setError(e.message); notify('Could not update goal') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-[#182230]">
      {mobileNav && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden" onClick={() => setMobileNav(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[258px] flex-col bg-[#111d35] px-4 py-5 text-white transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2 pb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400 text-[#102a25]"><Activity size={22} strokeWidth={2.7}/></div>
          <div><div className="text-[19px] font-bold tracking-tight">FinSight <span className="text-emerald-300">AI</span></div><div className="mt-0.5 text-[10px] tracking-[0.18em] text-slate-400">PERSONAL FINANCE</div></div>
          <button className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-white/10 lg:hidden" onClick={() => setMobileNav(false)}><X size={18}/></button>
        </div>
        <div className="space-y-7">{NAV.map(group => <div key={group.label}>
          <div className="mb-2 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-500">{group.label}</div>
          <div className="space-y-1">{group.items.map(item => { const Icon = item.icon; const active = page === item.name; return <button key={item.name} onClick={() => { setPage(item.name); setMobileNav(false) }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${active ? 'bg-emerald-400 text-[#102a25]' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'}`}><Icon size={17}/>{item.name}{item.name === 'Insights & AI' && <span className="ml-auto rounded-md bg-violet-400/20 px-1.5 py-0.5 text-[9px] font-bold text-violet-200">LIVE</span>}</button> })}</div>
        </div>)}</div>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-2 text-emerald-300"><ShieldAlert size={15}/><span className="text-[10px] font-bold tracking-wide">DATA PROTECTION</span></div><p className="mt-2 text-[10px] leading-5 text-slate-400">Your ledger is loaded from your authenticated account. Changes are sent to the API and persisted in MariaDB/MySQL.</p><div className="mt-4 flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/15 text-xs font-bold text-emerald-300">{(user?.name || 'U').slice(0, 1).toUpperCase()}</div><div className="min-w-0"><div className="truncate text-xs font-semibold">{user?.name || 'Connecting…'}</div><div className="text-[10px] text-slate-400">Demo workspace</div></div><button title="Refresh data" onClick={refresh} className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/10"><RefreshCw size={14} className={busy ? 'animate-spin' : ''}/></button></div></div>
      </aside>

      <main className="min-h-screen lg:pl-[258px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 lg:hidden"><Menu size={18}/></button><div><div className="text-[11px] text-slate-500">Workspace <span className="mx-1 text-slate-300">/</span> <span className="text-slate-700">{page}</span></div><h1 className="mt-0.5 text-lg font-bold tracking-tight">{page}</h1></div></div>
          <div className="flex items-center gap-2 sm:gap-3"><div className={`hidden items-center gap-2 rounded-lg border px-3 py-2 text-[11px] md:flex ${backendStatus === 'connected' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : backendStatus === 'connecting' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-rose-200 bg-rose-50 text-rose-700'}`}><span className={`h-1.5 w-1.5 rounded-full ${backendStatus === 'connected' ? 'bg-emerald-500' : backendStatus === 'connecting' ? 'bg-slate-400' : 'bg-rose-500'}`}/>{backendStatus === 'connected' ? 'API + DB connected' : backendStatus === 'connecting' ? 'Connecting…' : 'Backend offline'}</div><button title="Refresh from backend" onClick={refresh} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:text-slate-900"><RefreshCw size={16} className={busy ? 'animate-spin' : ''}/></button><button onClick={() => setShowAddTransaction(true)} disabled={!token} className="flex items-center gap-1.5 rounded-xl bg-[#172b4d] px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#223b65] disabled:opacity-50 sm:px-4"><Plus size={16}/><span className="hidden sm:inline">Add transaction</span><span className="sm:hidden">Add</span></button></div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 sm:p-8">
          {error && <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900"><ShieldAlert size={17} className="mt-0.5 shrink-0"/><div className="min-w-0 flex-1"><div className="text-xs font-bold">Backend/API error</div><p className="mt-1 break-words text-xs leading-5">{error}</p></div><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16}/></button></div>}
          {loading ? <div className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle size={20} className="animate-spin"/>Connecting to FinSight API and loading your database…</div> : backendStatus !== 'connected' ? <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600"><Activity size={23}/></div><h2 className="mt-4 text-lg font-bold">Backend connection required</h2><p className="mt-2 text-sm leading-6 text-slate-500">FinSight will not pretend to save data locally. Start FastAPI, check MariaDB/MySQL and retry. Your data stays in the database, so all pages use the same source of truth.</p><button onClick={connect} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#172b4d] px-4 py-2.5 text-xs font-semibold text-white"><RefreshCw size={14}/> Retry connection</button></div> : <>
            {page === 'Dashboard' && <Dashboard transactions={transactions} income={income} expenses={expenses} summary={summary} budgets={budgets} onNavigate={setPage} onAdd={() => setShowAddTransaction(true)}/>}
            {page === 'Transactions' && <Transactions transactions={filtered} search={search} setSearch={setSearch} typeFilter={typeFilter} setTypeFilter={setTypeFilter} onDelete={deleteTransaction} onAdd={() => setShowAddTransaction(true)}/>}
            {page === 'Budgets' && <Budgets budgets={budgets} onAdd={() => setShowAddBudget(true)}/>}
            {page === 'Savings goals' && <Goals goals={goals} onAdd={() => setShowAddGoal(true)} onContribute={contribute}/>}
            {page === 'Insights & AI' && <Insights transactions={transactions} insights={insights}/>}
          </>}
          <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200/80 pt-5 text-[10px] text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>© 2026 FinSight AI · DBMS Mini Project</span><span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${backendStatus === 'connected' ? 'bg-emerald-500' : 'bg-rose-400'}`}/>{backendStatus === 'connected' ? 'Live data · API + MariaDB/MySQL' : 'Waiting for backend connection'}</span></footer>
        </div>
      </main>

      {showAddTransaction && <Modal title="Add transaction" subtitle="This record will be written to the database." onClose={() => setShowAddTransaction(false)}>
        <form onSubmit={addTransaction} className="space-y-4">
          <TypeSwitch value={transactionForm.txn_type} onChange={txn_type => { const preferred = categories.find(c => c.name === (txn_type === 'income' ? 'Income' : 'Food & dining')) || categories[0]; setTransactionForm(p => ({ ...p, txn_type, category_id: String(preferred?.category_id || p.category_id) })) }}/>
          <Field label="Description"><input required maxLength="255" value={transactionForm.description} onChange={e => setTransactionForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Hostel mess, allowance" className={inputClass}/></Field>
          <Field label="Amount (₹)"><input required type="number" min="0.01" step="0.01" value={transactionForm.amount} onChange={e => setTransactionForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className={inputClass}/></Field>
          <Field label="Account"><select required value={transactionForm.account_id} onChange={e => setTransactionForm(p => ({ ...p, account_id: e.target.value }))} className={inputClass}>{accounts.map(a => <option key={a.account_id} value={a.account_id}>{a.bank_name || a.account_type} · {a.currency}</option>)}</select></Field>
          <Field label="Category"><select required value={transactionForm.category_id} onChange={e => setTransactionForm(p => ({ ...p, category_id: e.target.value }))} className={inputClass}>{categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></Field>
          <Field label="Date"><input required type="date" value={transactionForm.txn_date} onChange={e => setTransactionForm(p => ({ ...p, txn_date: e.target.value }))} className={inputClass}/></Field>
          <ModalActions onCancel={() => setShowAddTransaction(false)} busy={busy} submit="Save to database"/>
        </form>
      </Modal>}
      {showAddBudget && <Modal title="Create budget" subtitle="Set a category limit for a date range." onClose={() => setShowAddBudget(false)}>
        <form onSubmit={addBudget} className="space-y-4">
          <Field label="Category"><select required value={budgetForm.category_id} onChange={e => setBudgetForm(p => ({ ...p, category_id: e.target.value }))} className={inputClass}>{categories.filter(c => c.name !== 'Income').map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}</select></Field>
          <Field label="Budget amount (₹)"><input required type="number" min="0.01" step="0.01" value={budgetForm.amount} onChange={e => setBudgetForm(p => ({ ...p, amount: e.target.value }))} className={inputClass}/></Field>
          <Field label="Period"><select value={budgetForm.period} onChange={e => setBudgetForm(p => ({ ...p, period: e.target.value }))} className={inputClass}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option><option value="custom">Custom</option></select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Start date"><input required type="date" value={budgetForm.start_date} onChange={e => setBudgetForm(p => ({ ...p, start_date: e.target.value }))} className={inputClass}/></Field><Field label="End date"><input required type="date" value={budgetForm.end_date} onChange={e => setBudgetForm(p => ({ ...p, end_date: e.target.value }))} className={inputClass}/></Field></div>
          <ModalActions onCancel={() => setShowAddBudget(false)} busy={busy} submit="Save budget"/>
        </form>
      </Modal>}
      {showAddGoal && <Modal title="New savings goal" subtitle="Track a target and optionally set a deadline." onClose={() => setShowAddGoal(false)}>
        <form onSubmit={addGoal} className="space-y-4">
          <Field label="Goal name"><input required maxLength="100" value={goalForm.name} onChange={e => setGoalForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Emergency fund" className={inputClass}/></Field>
          <Field label="Target amount (₹)"><input required type="number" min="0.01" step="0.01" value={goalForm.target_amount} onChange={e => setGoalForm(p => ({ ...p, target_amount: e.target.value }))} className={inputClass}/></Field>
          <Field label="Already saved (₹)"><input type="number" min="0" step="0.01" value={goalForm.current_amount} onChange={e => setGoalForm(p => ({ ...p, current_amount: e.target.value }))} className={inputClass}/></Field>
          <Field label="Deadline (optional)"><input type="date" value={goalForm.deadline} onChange={e => setGoalForm(p => ({ ...p, deadline: e.target.value }))} className={inputClass}/></Field>
          <ModalActions onCancel={() => setShowAddGoal(false)} busy={busy} submit="Create goal"/>
        </form>
      </Modal>}
      {toast && <div className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 rounded-xl bg-[#172b4d] px-4 py-3 text-sm font-medium text-white shadow-xl"><Check size={16} className="text-emerald-300"/>{toast}</div>}
    </div>
  )
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
function Field({ label, children }) { return <label className="block text-xs font-semibold text-slate-700">{label}{children}</label> }
function Modal({ title, subtitle, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div>{children}</div></div>
}
function ModalActions({ onCancel, busy, submit }) { return <div className="flex gap-2 pt-2"><button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#172b4d] py-2.5 text-sm font-semibold text-white hover:bg-[#223b65] disabled:opacity-50">{busy && <LoaderCircle size={14} className="animate-spin"/>}{submit}</button></div> }
function TypeSwitch({ value, onChange }) { return <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">{['expense','income'].map(type => <button type="button" key={type} onClick={() => onChange(type)} className={`rounded-lg py-2 text-xs font-semibold capitalize ${value === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{type}</button>)}</div> }
function SectionTitle({ title, subtitle, action }) { return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-bold tracking-tight">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>{action}</div> }
function Metric({ label, value, icon: Icon, tone = 'indigo', note }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-600', indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-600', violet: 'bg-violet-50 text-violet-600' }
  return <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.indigo}`}><Icon size={18}/></div></div><div className="mt-4 text-2xl font-bold tracking-tight text-slate-900">{value}</div><div className="mt-2 text-[10px] text-slate-400">{note}</div></div>
}
function Dashboard({ transactions, income, expenses, summary, budgets, onNavigate, onAdd }) {
  const monthly = useMemo(() => {
    const map = new Map()
    transactions.forEach(t => {
      const d = new Date(`${t.date}T12:00:00`)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      if (!map.has(key)) map.set(key, { key, month: d.toLocaleDateString('en-IN', { month: 'short' }), income: 0, expenses: 0 })
      map.get(key)[t.type === 'income' ? 'income' : 'expenses'] += t.amount
    })
    return [...map.values()].sort((a,b) => a.key.localeCompare(b.key)).slice(-6)
  }, [transactions])
  const categorySpend = useMemo(() => {
    const map = new Map()
    transactions.filter(t => t.type === 'expense').forEach(t => map.set(t.category, (map.get(t.category) || 0) + t.amount))
    return [...map.entries()].map(([name, amount], i) => ({ name, amount, color: COLORS[i % COLORS.length] })).sort((a,b) => b.amount-a.amount)
  }, [transactions])
  const recent = transactions.slice(0, 5)
  const budgetSpent = budgets.reduce((s,b) => s + Number(b.actual_spent || 0), 0)
  const budgetTotal = budgets.reduce((s,b) => s + Number(b.amount || 0), 0)
  return <div className="space-y-7">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><div className="mb-1 flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500"/> Live account data</div><h2 className="text-2xl font-bold tracking-tight sm:text-[27px]">Welcome back, {summary?.user?.name || 'there'} <span>✦</span></h2><p className="mt-1.5 text-sm text-slate-500">These totals are calculated from your database records.</p></div><button onClick={onAdd} className="flex w-fit items-center gap-2 rounded-xl bg-[#172b4d] px-3.5 py-2.5 text-xs font-semibold text-white"><Plus size={15}/> Add transaction</button></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Account balance" value={money(summary?.account_balance)} icon={Wallet} tone="indigo" note="Sum of your account balances"/>
      <Metric label="Total income" value={money(summary?.total_income ?? income)} icon={ArrowDownLeft} tone="emerald" note="All recorded income"/>
      <Metric label="Total expenses" value={money(summary?.total_expenses ?? expenses)} icon={ArrowUpRight} tone="amber" note="All recorded expenses"/>
      <Metric label="Income minus expenses" value={money(summary?.income_less_expenses ?? income-expenses)} icon={PiggyBank} tone="violet" note="Net across recorded transactions"/>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.65fr_1fr]">
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"><div><h3 className="text-sm font-bold">Cash flow</h3><p className="mt-1 text-xs text-slate-500">Grouped from your saved transaction dates</p></div>
        <div className="mt-5 h-[245px] w-full">{monthly.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly} margin={{top:8,right:4,left:-18,bottom:0}}><defs><linearGradient id="incomeFillLive" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#25a879" stopOpacity={0.17}/><stop offset="100%" stopColor="#25a879" stopOpacity={0}/></linearGradient><linearGradient id="expenseFillLive" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6678e8" stopOpacity={0.14}/><stop offset="100%" stopColor="#6678e8" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#edf1f6" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:11,fill:'#8b95a7'}} dy={10}/><YAxis axisLine={false} tickLine={false} tick={{fontSize:10,fill:'#8b95a7'}} tickFormatter={v => `₹${Math.round(v/1000)}k`}/><Tooltip formatter={v => money(v)} contentStyle={{border:'1px solid #e8edf3',borderRadius:12,fontSize:12}}/><Area type="monotone" dataKey="income" name="Income" stroke="#25a879" strokeWidth={2.5} fill="url(#incomeFillLive)"/><Area type="monotone" dataKey="expenses" name="Expenses" stroke="#6678e8" strokeWidth={2.5} fill="url(#expenseFillLive)"/></AreaChart></ResponsiveContainer> : <Empty text="Add transactions to see your cash flow."/>}</div>
      </section>
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"><div><h3 className="text-sm font-bold">Spending breakdown</h3><p className="mt-1 text-xs text-slate-500">Expense transactions by category</p></div>
        {categorySpend.length ? <><div className="relative mx-auto mt-1 h-[190px] max-w-[250px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categorySpend} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={57} outerRadius={82} paddingAngle={3} stroke="none">{categorySpend.map(entry => <Cell key={entry.name} fill={entry.color}/>)}</Pie><Tooltip formatter={v => money(v)}/></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] text-slate-400">Total spend</span><span className="mt-1 text-lg font-bold">{money(expenses)}</span></div></div><div className="mt-1 space-y-3">{categorySpend.slice(0,5).map(c => <div key={c.name} className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-full" style={{background:c.color}}/><span className="flex-1 text-xs text-slate-600">{c.name}</span><span className="text-xs font-semibold">{money(c.amount)}</span></div>)}</div></> : <Empty text="No expense categories yet."/>}
      </section>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm"><div className="flex items-center justify-between px-5 py-5 sm:px-6"><div><h3 className="text-sm font-bold">Recent transactions</h3><p className="mt-1 text-xs text-slate-500">Latest records from your ledger</p></div><button onClick={() => onNavigate('Transactions')} className="text-xs font-semibold text-indigo-600">View all →</button></div><TransactionRows transactions={recent}/></section>
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-start justify-between"><div><h3 className="text-sm font-bold">Budget pulse</h3><p className="mt-1 text-xs text-slate-500">Live budget actuals</p></div><button onClick={() => onNavigate('Budgets')} className="text-xs font-semibold text-indigo-600">Manage</button></div>
        {budgets.length ? <div className="mt-5 space-y-5">{budgets.slice(0,4).map(b => { const spent=Number(b.actual_spent||0), limit=Number(b.amount||0), pct=limit ? spent/limit*100 : 0; return <div key={b.budget_id}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-slate-700">{b.category?.name || 'Category'}</span><span className="text-[10px] text-slate-500">{money(spent)} / {money(limit)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pct>100?'bg-rose-500':pct>85?'bg-amber-400':'bg-emerald-500'}`} style={{width:`${Math.min(100,pct)}%`}}/></div></div>})}</div> : <Empty text="No budgets yet. Create one to track spending."/>}
      </section>
    </div>
  </div>
}
function Empty({ text }) { return <div className="flex min-h-28 items-center justify-center p-5 text-center text-xs text-slate-400">{text}</div> }
function TransactionRows({ transactions, onDelete }) {
  return <div className="divide-y divide-slate-100">{transactions.map(t => { const Icon = categoryIcon(t.category); return <div key={t.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.type==='income'?'bg-emerald-50 text-emerald-600':'bg-slate-100 text-slate-600'}`}><Icon size={16}/></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold text-slate-800">{t.description}</span>{t.anomaly && <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600">FLAGGED</span>}</div><div className="mt-1 text-[10px] text-slate-400">{t.category} · {t.account} · {dateLabel(t.date)}</div></div><div className={`shrink-0 text-xs font-bold ${t.type==='income'?'text-emerald-600':'text-slate-800'}`}>{t.type==='income'?'+ ':'− '}{money(t.amount)}</div>{onDelete && <button title="Delete transaction" onClick={() => onDelete(t.id)} className="rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15}/></button>}</div>})}</div>
}
function Transactions({ transactions, search, setSearch, typeFilter, setTypeFilter, onDelete, onAdd }) {
  return <div className="space-y-5"><SectionTitle title="Transaction ledger" subtitle="Search and filter the same records stored in your database." action={<button onClick={onAdd} className="flex items-center gap-2 rounded-xl bg-[#172b4d] px-4 py-2.5 text-xs font-semibold text-white"><Plus size={15}/> Add transaction</button>}/><div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search description, category or account..." className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-emerald-400"/></div><div className="flex items-center gap-2"><Filter size={15} className="text-slate-400"/><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none"><option value="all">All transactions</option><option value="income">Income</option><option value="expense">Expenses</option></select></div></div>{transactions.length ? <TransactionRows transactions={transactions} onDelete={onDelete}/> : <Empty text="No matching transactions. Add a transaction or change your filters."/>}<div className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400">Showing {transactions.length} matching database record(s)</div></div></div>
}
function Budgets({ budgets, onAdd }) {
  const planned = budgets.reduce((s,b)=>s+Number(b.amount||0),0), spent = budgets.reduce((s,b)=>s+Number(b.actual_spent||0),0)
  return <div className="space-y-5"><SectionTitle title="Budgets" subtitle="Actual spending is calculated by the backend from expense transactions and each budget's date range." action={<button onClick={onAdd} className="flex items-center gap-2 rounded-xl bg-[#172b4d] px-4 py-2.5 text-xs font-semibold text-white"><Plus size={15}/> Create budget</button>}/><div className="grid gap-4 sm:grid-cols-3"><Metric label="Total planned" value={money(planned)} icon={CreditCard} tone="indigo" note={`${budgets.length} saved budget(s)`}/><Metric label="Actual spent" value={money(spent)} icon={Wallet} tone="amber" note="Across budget date ranges"/><Metric label="Remaining" value={money(planned-spent)} icon={PiggyBank} tone="emerald" note="Planned minus actual"/></div>{budgets.length ? <div className="grid gap-4 md:grid-cols-2">{budgets.map(b=>{const limit=Number(b.amount), actual=Number(b.actual_spent||0), pct=limit ? Math.round(actual/limit*100) : 0;return <div key={b.budget_id} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><CreditCard size={18}/></div><div className="flex-1"><div className="text-sm font-bold">{b.category?.name || 'Category'}</div><div className="mt-0.5 text-[11px] capitalize text-slate-400">{b.period} · {dateLabel(b.start_date)} – {dateLabel(b.end_date)}</div></div><span className={`text-sm font-bold ${pct>100?'text-rose-600':pct>85?'text-amber-600':'text-emerald-600'}`}>{pct}%</span></div><div className="mt-6 flex items-end justify-between"><div><div className="text-xl font-bold">{money(actual)}</div><div className="mt-1 text-[10px] text-slate-400">of {money(limit)} limit</div></div><div className={`text-[11px] ${pct>100?'text-rose-600':'text-slate-500'}`}>{pct>100?`${money(actual-limit)} over budget`:`${money(limit-actual)} remaining`}</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${pct>100?'bg-rose-500':pct>85?'bg-amber-400':'bg-emerald-500'}`} style={{width:`${Math.min(100,pct)}%`}}/></div></div>})}</div> : <Empty text="No budgets saved yet. Create a budget to start tracking your spending."/>}</div>
}
function Goals({ goals, onAdd, onContribute }) {
  const target = goals.reduce((s,g)=>s+Number(g.target_amount||0),0), current = goals.reduce((s,g)=>s+Number(g.current_amount||0),0)
  return <div className="space-y-5"><SectionTitle title="Savings goals" subtitle="Goals and progress are stored in your SavingsGoal table." action={<button onClick={onAdd} className="flex items-center gap-2 rounded-xl bg-[#172b4d] px-4 py-2.5 text-xs font-semibold text-white"><Plus size={15}/> New goal</button>}/><div className="rounded-2xl bg-gradient-to-r from-[#172b4d] to-[#243f68] p-6 text-white"><div className="flex items-center gap-2 text-xs text-emerald-200"><Target size={15}/> Your savings journey</div><div className="mt-3 text-3xl font-bold">{money(current)}</div><p className="mt-1 text-xs text-slate-300">saved toward {money(target)} across {goals.length} goal(s)</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-emerald-300" style={{width:`${target ? Math.min(100,current/target*100):0}%`}}/></div></div>{goals.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{goals.map(g=>{const goalTarget=Number(g.target_amount), saved=Number(g.current_amount), pct=goalTarget?Math.round(saved/goalTarget*100):0;return <div key={g.goal_id} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100"><PiggyBank size={18}/></div><div><div className="text-sm font-bold">{g.name}</div><div className="mt-0.5 text-[10px] text-slate-400">Deadline: {dateLabel(g.deadline)}</div></div></div><div className="mt-6 text-2xl font-bold">{money(saved)}<span className="ml-1 text-xs font-normal text-slate-400">/ {money(goalTarget)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{width:`${Math.min(100,pct)}%`}}/></div><div className="mt-3 flex justify-between text-[11px]"><span className="font-semibold text-slate-600">{pct}% complete</span><span className="text-slate-400">{money(Math.max(0,goalTarget-saved))} to go</span></div><button onClick={()=>onContribute(g)} className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Add contribution</button></div>})}</div> : <Empty text="No savings goals yet. Create one to track your progress."/>}</div>
}
function Insights({ transactions, insights }) {
  const expenseTotal=transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)
  const cards = [
    ...insights.anomalies.map(a=>({ key:`a-${a.transaction_id}`, title:a.description || 'Unusual transaction', tag:'REVIEW', tone:'rose', body:`${money(a.amount)} · ${a.category} · ${dateLabel(a.txn_date)}. ${a.message}` })),
    ...insights.budget_alerts.map((b,i)=>({ key:`b-${i}`, title:`${b.category} budget alert`, tag:'ACTIONABLE', tone:'amber', body:b.message })),
    ...insights.predictions.map(p=>({
      key:`p-${p.prediction_id}`, title:`${p.category} forecast`, tag:p.model_trained ? 'ML FORECAST' : 'BASELINE', tone:'violet',
      body:`Estimated spend: ${money(p.predicted_amount)} for ${p.period}. ${p.method || 'Moving-average baseline'}. ${p.explanation || ''} This is an estimate, not financial advice.`,
    })),
    ...insights.recommendations.map(r=>({ key:`r-${r.recommendation_id}`, title:r.type || 'Recommendation', tag:'SUGGESTION', tone:'emerald', body:r.description })),
  ]
  const tone = { rose:'bg-rose-50 text-rose-600', amber:'bg-amber-50 text-amber-600', violet:'bg-violet-50 text-violet-600', emerald:'bg-emerald-50 text-emerald-600' }
  return <div className="space-y-5"><SectionTitle title="Insights & AI" subtitle="Alerts, predictions and recommendations returned by your backend."/><div className="rounded-2xl bg-[#172b4d] p-6 text-white sm:p-8"><div className="flex items-center gap-2 text-emerald-300"><Sparkles size={18}/><span className="text-xs font-bold uppercase tracking-wider">FinSight intelligence</span></div><h2 className="mt-3 max-w-xl text-2xl font-bold tracking-tight">Make your money make more sense.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Anomaly detection compares expenses with earlier transactions in the same category. When enough monthly history is available, forecasts use a Random Forest model trained on your transaction history; sparse histories use an explainable moving-average fallback. An anomaly is a review prompt, not a fraud verdict.</p><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[10px] text-slate-400">Recorded expenses</div><div className="mt-2 text-xl font-bold">{money(expenseTotal)}</div></div><div className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[10px] text-slate-400">Flagged transactions</div><div className="mt-2 text-xl font-bold">{insights.anomalies.length}</div></div><div className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><div className="text-[10px] text-slate-400">Backend signals</div><div className="mt-2 text-xl font-bold">{cards.length}</div></div></div></div>{cards.length ? <div className="grid gap-4 lg:grid-cols-3">{cards.map(c=><div key={c.key} className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone[c.tone] || tone.emerald}`}><Sparkles size={19}/></div><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold tracking-wider text-slate-500">{c.tag}</span></div><h3 className="mt-4 text-sm font-bold">{c.title}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{c.body}</p><div className="mt-5 flex items-center gap-1.5 text-[10px] text-slate-400"><Activity size={12}/> Returned by FastAPI</div></div>)}</div> : <div className="rounded-2xl border border-slate-200 bg-white p-6"><div className="text-sm font-bold">No insights yet</div><p className="mt-2 text-xs leading-5 text-slate-500">{insights.note || 'Add expense transactions to build a history. ML forecasts require enough completed monthly records across categories; otherwise FinSight shows the baseline method used.'}</p></div>}</div>
}

export default App
