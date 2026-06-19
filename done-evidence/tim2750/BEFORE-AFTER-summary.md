# TIM-2750 — Before/After

## BEFORE the fix (3-rapid-click on /login dev server with current b11873e code)

Output of `node scripts/tim2750-doubleclick.mjs` against pre-fix code:

    Page loaded, attempting rapid double-click
      /authorize call #1, challenge=-J6U3tsqJI_ml_ZCNI7niiMwvGCNa_U4sN7LSg7K-Oc
      /authorize call #2, challenge=WOvmOoAk_VV82cw2uvKipBeIdTNiDybGKCghorUtg1k
    Total /authorize calls intercepted: 2
    Final verifier cookies in jar: 1
      sb-...-code-verifier Path=/ verifier hash = WOvmOoAk_VV82cw2uvKipBeIdTNiDybGKCghorUtg1k
         MATCHES challenge #1: false
         MATCHES challenge #2: true
    *** SMOKING GUN: multiple /authorize calls intercepted — double-click race is reproducible ***

If Supabase's flow_state was created by challenge #1, exchange would receive a verifier whose hash does NOT match — exactly the board's error:
`code_challenge_does_not_match_previously_saved_code_verifier`.

## AFTER the fix

### Vanilla single click (A-vanilla-singleclick-report.json)

    authorize_calls: 1
    verifier_cookies: 1
    gw_oauth_verifier_pre_nav: "1"        ← now WRITTEN (was missing pre-fix)
    gw_oauth_stale_verifiers: "0"
    hash_matches_first_challenge: true    ← exchange would succeed

### Rapid triple click (B-rapid-tripleclick-postfix-report.json)

    authorize_calls: 1                     ← was 2 pre-fix
    verifier_cookies: 1
    gw_oauth_verifier_pre_nav: "1"
    gw_oauth_stale_verifiers: "0"
    hash_matches_first_challenge: true    ← race eliminated

## Vercel preview

Deployment `dpl_42pePfQ2uwPqMYvQwA1Niv8FCAd5` (status Ready):
- https://coffee-shop-consultant-mr4ya23ka-timberlinecoffees-projects.vercel.app
- alias https://coffee-shop-consultant-git-fi-784d13-timberlinecoffees-projects.vercel.app

Gated by Vercel SSO Protection — CEO/team-member browser session required to load. Local prod-mode build (`next build` + `next start`) at the SAME bundle config is what the evidence above was captured against.
