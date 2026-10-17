# GitHub + npm publishing guide

## GitHub

Create an **empty** public repository named `indo-proof` on your GitHub account `wahyualfx7`. Don't initialize it with another README.

Open Git Bash **inside this project folder** and run:

```bash
npm test
git init
git add .
git commit -m "Initial release IndoProof v0.1.0"
git branch -M main
git remote add origin https://github.com/wahyualfx7/indo-proof.git
git push -u origin main
```

If your local Git identity isn't set, set `git config user.name "wahyualfx7"` and `git config user.email "YOUR_VERIFIED_EMAIL_OR_GITHUB_NOREPLY"` before committing.

To push future changes:

```bash
git add .
git commit -m "Describe the change"
git push
```

## npm

The package name `indo-proof` **has not been confirmed available** from this environment. Check before publishing:

```bash
npm view indo-proof version
npm login
npm pack --dry-run
npm publish --access public
```

If `npm view` returns a version, someone owns that name. Choose a scoped name such as `@wahyualfx7/indo-proof` by changing the `name` in package.json and running `npm publish --access public`.

For public release: keep private keys and real sensitive documents out of the package; inspect `npm pack --dry-run`, bump version on updates, and check license, security, and dependencies. CI tests do not substitute for a security audit.
