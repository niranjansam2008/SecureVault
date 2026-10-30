# SecureVault — Security Deposit & FDR Management Portal

Full-stack SIH prototype using React + Vite + Bootstrap, Flask REST API, and Supabase (PostgreSQL, Auth, Storage).

## Architecture
- React: UI and Supabase sign-in; sends the user's Supabase access token to Flask.
- Flask: business rules, role checks, deposit lifecycle, audit logging, reports, and OCR-ready service.
- Supabase: Auth, PostgreSQL, private Storage bucket, and Row Level Security (RLS).

## Prerequisites
- Node.js 18+
- Python 3.10+
- A Supabase project: https://supabase.com/dashboard

## 1. Configure Supabase
1. Create a new Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. Run `supabase/policies.sql`.
4. In **Storage**, create a private bucket named `fdr-documents`.
5. Copy the Project URL and anon/public key from Project Settings → API.

## 2. Configure backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
```
Copy `.env.example` to `.env` and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FRONTEND_ORIGIN=http://localhost:5173`

Run:
```bash
python run.py
```
API runs at `http://localhost:5000`.

### Token validation
Flask validates each access token by calling Supabase Auth's `/auth/v1/user` endpoint. This supports the signing algorithm configured by your Supabase project and avoids placing a JWT secret or service-role key in this application.

## 3. Configure frontend
```bash
cd frontend
npm install
```
Copy `.env.example` to `.env` and set:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL=http://localhost:5000/api`

Run:
```bash
npm run dev
```
Open `http://localhost:5173`.

## 4. Create users and assign roles
1. Register through the app (or create users in Supabase Authentication → Users).
2. In SQL Editor, assign the role to the matching auth user UUID:
```sql
insert into public.profiles (id, full_name, role)
values ('AUTH-USER-UUID', 'Demo Admin', 'admin')
on conflict (id) do update set role = excluded.role;
```
Allowed roles: `vendor`, `requester`, `verifier`, `approver`, `admin`.

For a vendor, also create a vendor profile:
```sql
insert into public.vendors (user_id, vendor_name, email)
values ('AUTH-USER-UUID', 'Demo Vendor Pvt Ltd', 'vendor@example.com');
```

## 5. Demo workflow
- Vendor signs up / signs in and submits an FDR.
- Vendor uploads a scanned FDR file (private bucket).
- Verifier views submitted records and verifies/rejects them.
- Approver approves verified records.
- Admin/authorized approver marks release or forfeiture.
- Dashboard shows status and upcoming maturities.

## API overview
- `GET /api/health`
- `GET /api/me`
- `GET /api/deposits`
- `POST /api/deposits`
- `GET /api/deposits/<id>`
- `PATCH /api/deposits/<id>/verify`
- `PATCH /api/deposits/<id>/approve`
- `PATCH /api/deposits/<id>/close`
- `GET /api/dashboard/summary`
- `GET /api/reports/deposits.csv`
- `POST /api/documents/signed-upload-url` (returns a signed upload URL for a private bucket)

All API routes except `/api/health` require a Supabase access token:
`Authorization: Bearer <access_token>`.

## Security notes — read before deployment
- Never put Supabase service-role keys or database passwords in frontend `.env`.
- This starter uses the anon key and the caller's JWT for database requests; RLS remains enabled.
- Do not rely on frontend role checks. Flask checks roles for privileged actions.
- This starter uses simple JWT verification for local HS256 projects; use Supabase JWKS verification for asymmetric signing keys.
- The included RLS policies are a prototype baseline, not a production security review. Validate department-level access, vendor ownership, storage policies, retention, backups, and audit requirements with stakeholders.
- Bank confirmation, Aadhaar eSign, DigiLocker, SMS/WhatsApp and real OCR extraction are integration points, not live integrations in this starter.
