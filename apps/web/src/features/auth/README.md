# auth feature

Reference feature — mirror this structure for new features
(`npm run gen:feature`), or copy manually before Phase 10 tooling.

## Structure

- `index.ts` — public barrel; the only import path for other modules
- `components/` — feature-scoped UI (`LoginForm`, the two-step OTP flow)
- `hooks/` — react-query mutations/queries (`useOtpRequest`, `useOtpVerify`, `useMe`)
- `api/` — fetchers + query keys; all calls go through the web BFF
- `schemas/` — zod schemas, reused for validation and types
- `types.ts` — feature-facing type re-exports

## API endpoints touched

| BFF route                    | API endpoint             | Notes                        |
| ---------------------------- | ------------------------ | ---------------------------- |
| `POST /api/auth/otp/request` | `POST /auth/otp/request` | sends the SMS code           |
| `POST /api/auth/otp/verify`  | `POST /auth/otp/verify`  | sets httpOnly refresh cookie |
| `POST /api/auth/refresh`     | `POST /auth/refresh`     | rotates refresh cookie       |
| `POST /api/auth/logout`      | `POST /auth/logout`      | revokes session              |
| `GET /api/auth/me`           | `GET /auth/me`           | bearer access token          |

Access tokens live in memory (AuthProvider); the refresh token stays in an
httpOnly cookie and never reaches client JS.
