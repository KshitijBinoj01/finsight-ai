# FinSight AI Full-Stack Starter

This bundle contains:
- `frontend/`: the React + Vite + Tailwind UI prototype
- `backend/`: FastAPI + SQLAlchemy + MySQL API
- `backend/sql/finsight_ai_schema_reference.sql`: a reference schema reconstructed from the project report

## Important schema note
The original project progress report lists these entities: User, Account, Transaction, Category, Budget, SavingsGoal, Prediction and Recommendation. The exact `finsight_ai.sql` file was not included with this build request, so the reference SQL is reconstructed from the report. **Compare it with your existing SQL script before running it against your current database.** The API deliberately does not auto-create or silently alter database tables.

## 1. Create/configure MySQL
If you already have your `finsight_ai` database and tables, keep them and compare the model/table names first.

For a new development database only, you can run the reference schema:

```bash
mysql -u root -p < backend/sql/finsight_ai_schema_reference.sql
```

Create a restricted database user instead of using `root` for the app:

```sql
CREATE USER 'finsight_app'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON finsight_ai.* TO 'finsight_app'@'localhost';
FLUSH PRIVILEGES;
```

## 2. Start the backend (Nobara/Fedora/Linux)
From the project root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `backend/.env` and set `DATABASE_URL` to your MySQL username/password and `JWT_SECRET_KEY` to a long random secret. URL-encode reserved characters in the password.

Then start the API:

```bash
uvicorn app.main:app --reload
```

Open:
- API docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health

`/health` should report `"database": "connected"`.

## 3. Quick demo login
With `ALLOW_DEMO_LOGIN=true` in `.env`, call `POST http://127.0.0.1:8000/api/auth/demo` from the API docs. This creates a demo user, categories, one account and three example transactions on first use, then returns a bearer token. Keep demo login disabled for any deployment.

For a normal account:
- `POST /api/auth/register` with `{ "name": "...", "email": "...", "password": "at-least-8-chars" }`
- `POST /api/auth/login` with `{ "email": "...", "password": "..." }`
- Click **Authorize** in `/docs` and enter the token as `Bearer <access_token>`.

## 4. Endpoints
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/demo` (only if demo mode enabled)
- `GET /api/categories`
- `GET /api/accounts`
- `GET /api/dashboard/summary`
- `GET /api/transactions`
- `POST /api/transactions`
- `PUT /api/transactions/{transaction_id}`
- `DELETE /api/transactions/{transaction_id}`
- `GET /api/budgets`
- `POST /api/budgets`
- `GET /api/goals`
- `POST /api/goals`
- `PATCH /api/goals/{goal_id}`
- `GET /api/insights`

All financial data endpoints require a bearer token. Transaction reads/writes are scoped to the authenticated user's accounts; budgets, goals, predictions and recommendations are scoped to the authenticated user.

## 5. Connect the React frontend
The existing frontend starter is intentionally preserved as a standalone mock-data UI in this bundle. The backend endpoints are available and documented, but the UI still needs a small integration pass to replace its mock state with calls to these endpoints. Recommended first vertical slice:
1. Get a token from `/api/auth/demo` or `/api/auth/login`.
2. Call `GET /api/accounts` and `GET /api/categories`.
3. Call `GET /api/transactions`.
4. Submit the transaction modal to `POST /api/transactions`.
5. Refresh the transaction list and dashboard summary from the API.

## Security and scope
- The demo endpoint is development-only and must be disabled for deployment.
- Use HTTPS and a strong secret outside localhost.
- Keep DB credentials in the backend environment, never in React.
- Use the exact existing SQL schema when integrating; this bundle's schema file is a reference reconstructed from the progress report, not a verified copy of your original script.
- The anomaly trigger from the report should be installed and tested in MySQL separately. The API does not claim a transaction is anomalous unless the database trigger or another rule has set `is_anomaly`.


## Frontend integration status

The frontend now attempts `POST /api/auth/demo` on startup and uses the returned bearer token to load accounts, categories and transactions. The Add Transaction modal posts new records to `POST /api/transactions` when the backend is connected. Other page data (budgets, goals and chart history) still contains illustrative UI values and should be wired to their corresponding endpoints as the next iteration.


## Anomaly detection and forecasting

`app/analytics.py` contains the explainable analytics baselines. Expense anomaly checks use the prior 180 days in the same category, require at least five historical observations, and use Modified Z-score (threshold 3.5) with IQR/median-multiple fallbacks for zero MAD/IQR. Flags are stored in `Transaction.is_anomaly`; income transactions are not flagged. The flags are recalculated after transaction writes and when insights are requested, so edits/deletions can update historical flags.

The `GET /api/insights` endpoint trains a per-user `RandomForestRegressor` using rolling monthly category-spend examples when at least 12 labelled examples are available. Features include the prior three monthly totals, recent trend/variation, category one-hot encoding and target-month seasonality; the target is log-transformed to reduce skew. Current month-to-date spend is projected to a full-month run rate for inference when available. Categories without three completed months, or users with too little training data, use an explicit moving-average fallback. Predictions include `model_trained`, `training_samples`, `method` and an explanation. They are calculated dynamically and are not persisted in `Prediction` by this implementation. A chronological holdout MAE is provided when enough target months are available. The small per-user dataset may not generalize well, so forecasts are estimates and should be evaluated against future actuals before being treated as reliable.

Install dependencies (including scikit-learn) with `python -m pip install -r requirements.txt`. Run the analytics unit tests from `backend/` with `python -m unittest discover -s tests -v`.
