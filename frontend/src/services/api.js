const API_BASE = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch {
    throw new Error(`Cannot reach the FinSight API at ${API_BASE}. Start the backend and check VITE_API_URL.`)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const detail = body.detail
    const message = Array.isArray(detail)
      ? detail.map(item => item.msg || JSON.stringify(item)).join(', ')
      : (detail || body.message || `API request failed (${response.status})`)
    throw new Error(message)
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  health: () => apiRequest('/health'),
  demoLogin: () => apiRequest('/api/auth/demo', { method: 'POST' }),
  login: (email, password) => apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name, email, password) => apiRequest('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  summary: token => apiRequest('/api/dashboard/summary', { token }),
  accounts: token => apiRequest('/api/accounts', { token }),
  categories: token => apiRequest('/api/categories', { token }),
  transactions: (token, query = '?limit=500') => apiRequest(`/api/transactions${query}`, { token }),
  addTransaction: (token, data) => apiRequest('/api/transactions', { method: 'POST', token, body: JSON.stringify(data) }),
  updateTransaction: (token, id, data) => apiRequest(`/api/transactions/${id}`, { method: 'PUT', token, body: JSON.stringify(data) }),
  deleteTransaction: (token, id) => apiRequest(`/api/transactions/${id}`, { method: 'DELETE', token }),
  budgets: token => apiRequest('/api/budgets', { token }),
  addBudget: (token, data) => apiRequest('/api/budgets', { method: 'POST', token, body: JSON.stringify(data) }),
  goals: token => apiRequest('/api/goals', { token }),
  addGoal: (token, data) => apiRequest('/api/goals', { method: 'POST', token, body: JSON.stringify(data) }),
  updateGoal: (token, id, data) => apiRequest(`/api/goals/${id}`, { method: 'PATCH', token, body: JSON.stringify(data) }),
  insights: token => apiRequest('/api/insights', { token }),
}
