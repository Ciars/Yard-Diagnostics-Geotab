# GitHub -> Firebase Hosting + Functions Deployment

Deployment pipeline:

`Public GitHub repo` -> `GitHub Actions` -> `Firebase Hosting + Cloud Functions`

## What is configured in this repo

- Firebase Hosting + Functions config in `firebase.json`
- Firebase project alias placeholder in `.firebaserc`
- GitHub Actions deploy workflow in `.github/workflows/firebase-hosting-deploy.yml`
- SPA rewrite to `index.html` for Vite routes
- Security headers and long cache headers for static assets

## One-time setup

1. Create a Firebase project in the Firebase Console.
2. In this repo, update `.firebaserc`:
   - Replace `your-firebase-project-id` with your real Firebase project ID.
3. Enable Firebase Hosting for that project.
4. Create a service account key for CI:
   - GCP Console -> IAM & Admin -> Service Accounts
   - Create service account with Firebase Hosting deploy permissions
   - Generate JSON key
5. Add these GitHub repository secrets:
   - `FIREBASE_PROJECT_ID`: your Firebase project ID
   - `FIREBASE_SERVICE_ACCOUNT`: full JSON key contents (paste as secret value)
6. Set Rai secret + runtime env vars in Firebase Functions:
   - Secret (required):
     - `firebase functions:secrets:set RAI_GEMINI_API_KEY`
   - Runtime env vars (recommended):
     - `firebase functions:config:set rai.model=\"gemini-3.1-pro-preview\"`
     - `firebase functions:config:set rai.allowed_origins=\"https://<your-firebase-project-id>.web.app,https://<your-custom-domain>\"`
   - Or set equivalent environment variables for Gen2:
     - `RAI_GEMINI_MODEL`
     - `RAI_ALLOWED_ORIGINS`
     - Optional controls:
       - `RAI_MAX_REQUEST_BYTES`
       - `RAI_RATE_LIMIT_CAPACITY`
       - `RAI_RATE_LIMIT_REFILL_PER_MINUTE`
       - `RAI_MAX_GLOBAL_CONCURRENCY`
       - `RAI_MAX_PER_SESSION_CONCURRENCY`
       - `RAI_CACHE_TTL_SECONDS`

## Deploy flow

Every push to `main` triggers:

1. `npm ci`
2. `npm run build`
3. Functions dependency install
4. Firebase deploy (`hosting,functions`)

Manual deploy is also available via the `workflow_dispatch` trigger in GitHub Actions.

## Local verification before pushing

```bash
npm ci
npm run build
npm install --prefix functions
```

If the build succeeds, the workflow should be able to deploy.

## Optional: deploy from local machine

```bash
npm install -g firebase-tools
firebase login
firebase use <your-firebase-project-id>
npm run build
npm install --prefix functions
firebase deploy --only hosting,functions
```

## Register in MyGeotab (if used as Add-In)

After first deploy, use your Firebase Hosting URL:

`https://<your-firebase-project-id>.web.app`

In MyGeotab:

1. System -> Add-Ins -> Marketplace
2. Register Private Add-In
3. Set URL to your Firebase Hosting URL

## Notes

- Keep `.env` out of GitHub; this repo already ignores it.
- Rai endpoint is served at `/api/rai/chat` via Hosting rewrite to function `raiChat`.
- Existing `wrangler.toml` is no longer needed for Firebase deployments and can be removed later if you fully retire Cloudflare.
