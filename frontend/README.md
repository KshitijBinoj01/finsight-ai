# FinSight AI — React + Tailwind starter

A polished, responsive frontend prototype for the FinSight AI DBMS mini-project.

## Included
- Dashboard with summary cards, cash-flow chart and category breakdown
- Transaction ledger with search and type filters
- Add-transaction modal (in-memory demo state)
- Budgets, savings goals and insights screens
- Responsive sidebar and demo/sample-data labels

## Requirements
- Node.js 20.19+ or 22.12+ recommended
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Production build check

```bash
npm run build
npm run preview
```

## Important implementation notes
- This is a frontend-only prototype. No API or database connection is included yet.
- Transactions added through the modal are held in React state and disappear on refresh.
- All initial amounts, account balances, charts, budgets, goals and insights are illustrative mock data.
- Do not present the demo figures as live or real financial data.

## Next: connect to your existing MySQL schema

Suggested backend endpoints:
- `GET /api/dashboard/summary`
- `GET /api/transactions`
- `POST /api/transactions`
- `PUT /api/transactions/{id}`
- `DELETE /api/transactions/{id}`
- `GET /api/budgets`
- `POST /api/budgets`
- `GET /api/goals`
- `GET /api/insights`

Keep MySQL credentials on the backend. Validate every request and scope all reads/writes to the authenticated user. Never trust a `user_id` supplied by the browser as authorization.

Suggested frontend organization once the prototype grows:
- `src/components/` — reusable cards, sidebar, charts, tables and modal
- `src/pages/` — dashboard, transactions, budgets, goals and insights
- `src/services/api.js` — centralized `fetch` calls to FastAPI
- `src/hooks/` — data loading and mutations
