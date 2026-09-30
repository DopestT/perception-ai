# Perception Auth Email Templates

Canonical branded Supabase Auth templates for Perception.

## Hosted Supabase subjects

- Magic link: `Continue your Perception Project World`
- Confirmation: `Confirm your Perception account`
- Recovery: `Reset your Perception password`

## Hosted project

Supabase hosted projects must copy these templates into **Authentication → Email Templates** in the dashboard.

The templates intentionally use:
- inline CSS for email-client compatibility
- text-based PERCEPTION branding rather than externally hosted logo dependencies
- Supabase's `{{ .ConfirmationURL }}` variable
- no secrets or user-specific authorization data

Keep the magic-link CTA wording as **CONTINUE TO PERCEPTION**.
