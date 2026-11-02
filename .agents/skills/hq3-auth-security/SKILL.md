---
name: hq3-auth-security
description: Implement and verify private Google sign-in, verified membership, and server-enforced Supabase permissions for 4EIGN Content HQ 3.0.
---

# HQ3 authentication and permissions

## Scope and evidence

- Read `AGENTS.md` and the recovered auth code and database policies before changing behavior. Use `feat/hq3-liquid-glass-workspace`; never merge main, publish production, alter the existing HQ Site, or touch the Dragon Ball Hunt project.
- The intended Supabase project is `4EIGN HQ`, reference `gytldbxbvnrxhsprovfm`. A project reference alone does not establish credentials, configuration, or authorization to migrate production.
- Inspect credential names and presence only. Never print secret values, commit credentials, place service-role credentials in browser code, or copy tokens into screenshots or logs.
- Use isolated development configuration or clearly labeled mock data when live prerequisites are unavailable. Mock mode must not impersonate a successful OAuth login or serve as an authorization mechanism.

## Sign-in and membership

- Replace the login welcome heading with the provided official 4EIGNLABZ logo. Google is the required functional provider; use Supabase's supported Google OAuth flow, appropriate PKCE/session handling for the recovered framework, and explicit development redirect URLs.
- Verify provider configuration, redirect handling, cancellation, expired sessions, sign-out, and session restoration. Do not claim live sign-in is verified from SDK wiring alone.
- Investigate current official OpenAI and Supabase documentation before exposing ChatGPT sign-in. Do not treat an API key, a ChatGPT subscription, or an unrelated OAuth feature as application identity support. If unsupported or unavailable, provide an honest unavailable state rather than an active nonfunctional provider.
- Keep registration private. A successful Google login alone does not grant workspace membership. Require a verified provider identity and a trusted server-controlled invitation or membership record before granting access.
- Match normalized verified identities, then bind membership to immutable Supabase user IDs. Never authorize using client-supplied email, query parameters, local storage, or editable user metadata.

## Requested role mapping

| Role | Requested verified identity |
| --- | --- |
| Owner | `foreignlabz@gmail.com` |
| Owner | `eightysixthewrld@gmail.com` |
| Social Media Manager | `marianabeatrizofficial@gmail.com` |
| Brand Member, read-only | `Thecmco@gmail.com` |

This mapping records intent; it does not authorize creating privileged accounts or assigning roles to an unverified identity. Do not silently provision production users. Owners and managers may edit permitted content; only trusted owner workflows may manage membership. Brand members must remain read-only on both direct database access and server endpoints.

## Server enforcement

- Enable RLS for every relevant exposed table and use explicit policies for select, insert, update, and delete. Validate membership and role server-side, including post-account associations and media relations.
- Deny unauthenticated and nonmember access by default. Protect role/membership records against self-promotion and cross-workspace access. Do not depend on hidden UI buttons for enforcement.
- Check both existing-row access and new-row validity for writes. Scope security-definer functions narrowly, set a safe search path, and review execute grants.
- Author migrations for review without applying them to the existing production database. Inspect historical schema and preserve records; never reset or drop production data to make tests pass.

## Required verification

Test anonymous users, uninvited verified users, each authorized role, forged role metadata, cross-user/workspace requests, and expired sessions against real enforcement in an isolated database when available. Exercise direct API calls as well as UI restrictions. Report mock, unit, integration, and live OAuth results separately; list unavailable configuration without requesting secrets in chat.
