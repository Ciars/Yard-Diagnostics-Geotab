# GitHub -> Firebase Hosting Deployment

Deployment pipeline:

`Public GitHub repo` -> `GitHub Actions` -> `Firebase Hosting`

## What is configured in this repo

- Firebase Hosting config in `firebase.json`
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

## Deploy flow

Every push to `main` triggers:

1. `npm ci`
2. `npm run build`
3. Firebase Hosting deploy to the `live` channel

Manual deploy is also available via the `workflow_dispatch` trigger in GitHub Actions.

## Local verification before pushing

```bash
npm ci
npm run build
```

If the build succeeds, the workflow should be able to deploy.

## Optional: deploy from local machine

```bash
npm install -g firebase-tools
firebase login
firebase use <your-firebase-project-id>
npm run build
firebase deploy --only hosting
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
- Existing `wrangler.toml` is no longer needed for Firebase deployments and can be removed later if you fully retire Cloudflare.
