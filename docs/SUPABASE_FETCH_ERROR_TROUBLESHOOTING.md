# Supabase "Failed to Fetch" Error - Troubleshooting Guide

## Error Description

The "Failed to fetch" error occurs during Supabase authentication token refresh when the browser cannot reach the Supabase auth endpoint.

**Stack trace indicators:**
- `SupabaseAuthClient._refreshAccessToken`
- `SupabaseAuthClient._callRefreshToken`
- Network request fails before reaching Supabase servers

## Root Causes

### 1. **Missing or Invalid Environment Variables** ⚠️

The most common cause.

**Check:**
```bash
# In .env.local or your environment, verify these are set:
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxx
```

**Solution:**
- Verify URL is correct and accessible
- Regenerate and update the anon key if expired
- Ensure no typos in variable names (must be exactly `NEXT_PUBLIC_SUPABASE_URL`)

### 2. **CORS Issues**

The browser is being blocked by CORS policies when trying to reach Supabase.

**Solution:**
- The implementation now includes proper CORS configuration in the Supabase browser client
- Ensure `flowType: "pkce"` is set in auth options (automatically configured in updated client.ts)

### 3. **Network/Connectivity Issues**

The browser cannot reach Supabase endpoints.

**Solutions:**
- Check internet connection
- Verify firewall/VPN isn't blocking Supabase domains
- Try from a different network to isolate the issue

### 4. **Session Sync Problems**

Auth state isn't being properly synchronized across tabs/windows.

**Solution:**
- The new `AuthProvider` component handles this automatically
- Ensure AuthProvider is wrapped at the root level (done in app/layout.tsx)

## Implemented Fixes

### 1. **AuthProvider Component**
- Location: `components/auth-provider.tsx`
- Handles auth state listener setup
- Prevents concurrent token refresh attempts
- Syncs sessions across tabs

### 2. **Enhanced Browser Client**
- Location: `lib/supabase/client.ts`
- Added PKCE flow configuration
- Enabled auto token refresh
- Better error handling

### 3. **Improved Middleware**
- Location: `lib/supabase/middleware.ts`
- Validates environment variables before use
- Better error logging
- Prevents crashes from invalid configs

### 4. **Configuration Checker**
- Location: `lib/supabase/config-checker.ts`
- Validates Supabase setup
- Development-only diagnostics

### 5. **Health Check Endpoint**
- Location: `app/api/dev/supabase-health/route.ts`
- Test endpoint to verify connectivity
- Use: `GET /api/dev/supabase-health` (development only)

## Debugging Steps

### Step 1: Check Configuration
Visit `http://localhost:3000/api/dev/supabase-health` to see detailed configuration and connectivity status.

### Step 2: Check Browser Console
Look for logs starting with `[Supabase]`, `[Auth]`, or `[Middleware]`.

### Step 3: Verify Environment Variables
```bash
# Print configured variables (sanitized)
npm run dev
# Check console output on startup
```

### Step 4: Check Network Tab
1. Open DevTools → Network
2. Look for failed requests to `*.supabase.co` domains
3. Check response status and error messages

### Step 5: Clear Cache and Restart
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

## Prevention

1. **Always test after auth changes** - Run the app locally and verify token refresh works
2. **Use the health check endpoint** - Run `curl http://localhost:3000/api/dev/supabase-health` before deploying
3. **Monitor auth events** - Check browser console for auth-related logs
4. **Keep dependencies updated** - Update @supabase/ssr and @supabase/supabase-js regularly

## Additional Resources

- [Supabase SSR Documentation](https://supabase.com/docs/guides/auth/server-side-rendering)
- [Supabase JavaScript Library](https://supabase.com/docs/reference/javascript)
- [Next.js Middleware Documentation](https://nextjs.org/docs/advanced-features/middleware)

## Support

If the issue persists after following these steps:

1. Check Supabase status page: https://status.supabase.com/
2. Review Supabase logs in your dashboard
3. Verify your Supabase project is active and not rate-limited
4. Check for recent Supabase API changes or deprecations
