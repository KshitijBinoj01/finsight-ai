# FinSight AI — Full-stack project bundle

- `frontend/` — React + Vite + Tailwind interface wired to the API
- `backend/` — FastAPI + SQLAlchemy + MariaDB/MySQL API and JWT authentication
- `backend/sql/finsight_ai_schema_reference.sql` — reference schema reconstructed from the project report

## Start the backend

```bash
cd backend
source .venv/bin/activate
# Ensure backend/.env is configured first
uvicorn app.main:app --reload
```

Backend docs: http://127.0.0.1:8000/docs  
Health: http://127.0.0.1:8000/health

## Start the frontend in a second terminal

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open the URL printed by Vite, usually http://localhost:5173. `frontend/.env` should contain:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
```

Restart Vite after changing `.env` values.

## What is connected

- On launch, the frontend calls `POST /api/auth/demo`, then loads dashboard summary, accounts, categories, transactions, budgets, goals and insights.
- Dashboard totals and charts derive from API/database records.
- Add/delete transactions, create budgets, create savings goals, and add goal contributions call the backend, then reload all relevant data from the API.
- A visible connection state and API error banner make failed synchronization explicit. If the backend is offline, the app does not pretend that changes were saved.
- Refresh buttons reload data from the API.

## Database note

The SQL file is a reconstructed reference schema, not a verified copy of your original SQL. Compare it against your own schema before running it. The backend intentionally does not create or alter tables automatically. The demo login seeds a demo account, common categories, and a few transactions on first use; it requires `ALLOW_DEMO_LOGIN=true` in `backend/.env`.

Forecasting uses scikit-learn's per-user RandomForestRegressor when at least 12 historical rolling category-month samples are available. The model uses recent monthly spend, trend/variation, category and calendar features. Sparse data falls back to a moving-average estimate. A chronological holdout MAE is reported when enough data is available. Predictions remain estimates; the current implementation does not persist model artifacts or prediction rows.

## Troubleshooting

- If the frontend says backend offline, run `curl http://127.0.0.1:8000/health`.
- If health says database unavailable, check `DATABASE_URL`, that MariaDB is running, and that the tables from the schema exist.
- If the API returns `404` or `500`, inspect the terminal running Uvicorn and compare the database tables/columns with `backend/app/models.py`.
- Keep `backend/.env` private. Do not put database credentials in `frontend/.env`.


## Financial analytics implementation

- **Anomaly detector:** On transaction create/update/delete and when `/api/insights` is requested, the backend recomputes each user's expense flags. It compares an expense only with earlier expenses in the same category from the previous 180 days. At least five historical observations are required. The detector uses a one-sided Modified Z-score threshold of 3.5, then an IQR fence if MAD is zero, and finally a conservative 3x-median fallback if both MAD and IQR are zero. Income rows are never flagged. Anomaly flags are persisted in `Transaction.is_anomaly`.
- **Spending forecast:** `/api/insights` trains a per-user scikit-learn `RandomForestRegressor` from rolling monthly category-spend examples when at least 12 labelled examples are available. It uses recent monthly lags, trend/variation, category encoding and calendar seasonality. Sparse histories use a moving-average fallback. Forecasts are estimates and are not persisted in the `Prediction` table by this implementation.
- The frontend reloads the ledger after the Insights endpoint updates historical anomaly flags, so the transaction list and Insights page stay synchronized.
