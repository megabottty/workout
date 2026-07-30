# Deploy

From the project root:

```bash
npm run build
firebase deploy --only hosting
```

If Firestore rules changed:

```bash
firebase deploy --only firestore:rules
```

If Firebase CLI is not logged in:

```bash
firebase login
```
