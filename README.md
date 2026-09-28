# NovaVest — Neon backend + user authentication

This build adds real user registration/login on top of the Neon-backed application.

## Vercel environment variable
Set this server-side in Vercel:

- `DATABASE_URL` = the connection string for the **separate NovaVest Neon project**.

Do not put the connection string in frontend JavaScript or expose it as a `NEXT_PUBLIC_*` variable.

## Authentication
- Registration: full name, email, password, confirm password, optional referral code.
- Login/logout use an HttpOnly `novavest_session` cookie.
- Sessions expire after 30 days.
- Passwords are hashed with Node `scrypt`; plaintext passwords are never stored.
- Each registered user gets a unique referral code.
- Referral codes create Level 1 and, when applicable, Level 2 relationships.

## Backend data
VIP products, purchases, balances, deposits, withdrawals, gift-code redemptions, bank details, referrals and transaction history are stored in Neon and are tied to the authenticated user.

## Demo financial behavior
The deposit endpoint is still a demo/backend balance recorder; it is not payment-provider verification. Real payment confirmation and an admin-controlled financial engine should be added before treating balances as real money.
