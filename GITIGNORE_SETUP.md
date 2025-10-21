# .gitignore Strategy for Public Demo Branch

## 🎯 Goal
Allow UI/educational components to be open-sourced while protecting proprietary quant algorithms

## 📋 Shell Commands for Replit

### Step 1: Verify Current .gitignore
```bash
cat .gitignore
```

### Step 2: Create Public Demo Branch
```bash
# Create and switch to new branch
git checkout -b public-demo

# Verify you're on the right branch
git branch
```

### Step 3: Test What Will Be Ignored
```bash
# See what files are currently ignored
git status --ignored

# See what files WOULD be tracked
git add --dry-run .
```

### Step 4: Verify Protected Files
```bash
# These should show "ignored" or not appear:
git check-ignore server/quant-ideas-generator.ts
git check-ignore server/ml-retraining-service.ts
git check-ignore server/performance-validator.ts
git check-ignore server/backtesting.ts
```

### Step 5: Add Files to Public Repo
```bash
# Add everything except ignored files
git add .

# Check what's staged
git status

# Review specific files if needed
git diff --cached --name-only
```

### Step 6: Commit to Public Branch
```bash
git commit -m "Public demo: UI and educational components only"
```

### Step 7: Push to GitHub (Public Repo)
```bash
# Add your GitHub remote
git remote add public https://github.com/YOUR_USERNAME/quantedge-ui.git

# Push public branch
git push -u public public-demo
```

### Step 8: Return to Private Development
```bash
# Switch back to main branch
git checkout main

# Verify you're back on main
git branch
```

## 🔐 What's Protected (.gitignore)

These files are excluded from public demo:

### Core Quant Algorithms
- `server/quant-ideas-generator.ts` - Proprietary signal detection
- `server/ml-retraining-service.ts` - Adaptive learning system
- `server/performance-validator.ts` - Trade validation logic
- `server/backtesting.ts` - Performance analysis engine

### Sensitive Data
- `.env` - API keys and secrets
- `drizzle/` - Database migrations
- `dist/` - Compiled output

## ✅ What's Public

These components can be shared:

### UI Components
- All `client/src/` files - Full React frontend
- `client/src/pages/` - All dashboard pages
- `client/src/components/` - Reusable UI components

### Educational Resources
- `client/src/pages/learning.tsx` - Quant strategy explainers
- `client/src/pages/analytics.tsx` - Performance visualization
- `README.md` - Project documentation

### Infrastructure
- `server/routes.ts` - API route definitions (sanitized)
- `server/market-api.ts` - External API integrations
- `shared/schema.ts` - Data models
- `package.json` - Dependencies

## 🧪 Quick Test
```bash
# Create test branch and verify
git checkout -b test-public
git add .
git diff --cached --name-only | grep -E "(quant-ideas|ml-retraining|performance-validator|backtesting)"

# Should return NOTHING (files properly ignored)
# If files appear, .gitignore is not working correctly
```

## 🔄 Syncing Updates

When you update UI components:

```bash
# On main branch (private)
git add client/src/
git commit -m "Update UI components"

# Switch to public branch
git checkout public-demo

# Cherry-pick UI changes (or merge specific paths)
git cherry-pick <commit-hash>

# Push to public repo
git push public public-demo
```

## ⚠️ Important Notes

1. **Never push `main` branch to public repo** - Contains proprietary code
2. **Always use `public-demo` branch** for open-source releases
3. **Review changes before pushing** - Use `git diff` to verify
4. **Keep .env secure** - Never commit API keys
5. **Test .gitignore regularly** - Run verification commands

## 🎓 Why This Works

- **.gitignore is branch-independent** - Protects files on ALL branches
- **Selective commits** - Only UI/educational files added to public branch
- **Clean separation** - Private algos never leave your machine
- **Community contributions** - Others can improve UI without seeing strategy
