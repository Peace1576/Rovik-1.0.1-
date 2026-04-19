# Rovik Windows Code Signing

Rovik should not publish new public Windows desktop releases without Microsoft-backed signing.

The repository is configured to use **Azure Artifact Signing / Trusted Signing** with **GitHub Actions OIDC**. The release workflow will fail until the required Azure and GitHub configuration exists.

## What this solves

- Removes the "not digitally signed" state from the installer
- Gives Windows SmartScreen a real publisher identity
- Lets reputation build on a consistent signed publisher
- Publishes a SHA-256 checksum alongside each Windows installer

## GitHub configuration required

Add these **GitHub Secrets**:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Add these **GitHub Repository Variables**:

- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_PROFILE_NAME`

## Azure setup required

1. Create an Azure Artifact Signing account.
2. Complete identity validation for Rovik.
3. Create a certificate profile for the account.
4. Create an Entra app registration and service principal.
5. Add a federated credential for this GitHub repository/workflow.
6. Assign the `Artifact Signing Certificate Profile Signer` role to that service principal on the certificate profile scope.

## Release flow

When the GitHub workflow runs for a tag like `v0.1.3`, it now:

1. Builds the Next.js app
2. Packages the portable Windows app payload
3. Signs the packaged `.exe`, `.dll`, and `.node` files
4. Builds the NSIS Windows installer
5. Signs the final installer
6. Generates a SHA-256 checksum file
7. Publishes the installer and checksum to GitHub Releases

## Expected public artifact

The public download should be:

- `Rovik-Setup-<version>.exe`

And the matching checksum file:

- `Rovik-Setup-<version>.exe.sha256.txt`

## Important note

Signed does not always mean SmartScreen warnings disappear immediately. Microsoft and electron-builder both note that regular code signing can still require reputation buildup, while stronger trust options like EV improve first-run trust. But signing is the minimum required baseline for public Windows distribution.

## Official references

- Microsoft quickstart: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
- Microsoft role assignment tutorial: https://learn.microsoft.com/en-us/azure/artifact-signing/tutorial-assign-roles
- GitHub OIDC for Azure: https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-azure
- Azure Artifact Signing GitHub Action: https://github.com/Azure/artifact-signing-action
- electron-builder Windows signing docs: https://www.electron.build/code-signing-win.html
