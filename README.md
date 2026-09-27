# NovaVest frontend + Neon backend

This build connects the existing mobile-first NovaVest frontend to a Neon PostgreSQL database through Vercel serverless API routes.

## Important scope
- Registration/login are intentionally NOT included yet.
- A browser gets a generated demo user UUID stored in `localStorage` and sent to the API as `x-novavest-user-id`.
- This is a temporary identity bridge only. It is not authentication. Registration/login can replace it later without rebuilding the data model.
- Product values are still the current demo/configurable values. No real payment provider or automatic investment-income engine is included in this build.

## Vercel setup
1. Keep the project connected to GitHub.
2. In Vercel Project Settings → Environment Variables, add:
   - `DATABASE_URL` = your Neon PostgreSQL connection string
3. Apply it to Preview and Production as needed.
4. Push these files to the GitHub `development` branch.
5. Let Vercel create the preview deployment.

The API automatically creates the required tables and seeds the 10 VIP demo products plus the existing demo gift codes on first request.

## Backend routes
- `GET /api/bootstrap` — account, products, purchases, history, bank, referrals
- `POST /api/deposit` — records a backend deposit
- `POST /api/withdraw` — records a pending withdrawal against withdrawal balance only
- `GET/POST /api/bank` — save/load withdrawal bank details
- `POST /api/purchase` — purchase a VIP product and record it in My Products + transaction history
- `POST /api/gift-code` — redeem a configured gift code
- `GET /api/transactions` — transaction history
- `GET /api/team` — referral/team data

## Database tables
`app_users`, `vip_products`, `product_purchases`, `bank_accounts`, `transactions`, `gift_codes`, `gift_redemptions`, `referrals`.

Do not put the Neon connection string directly into frontend JavaScript. It belongs only in Vercel's `DATABASE_URL` environment variable.
