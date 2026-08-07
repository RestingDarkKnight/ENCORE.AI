// GoogleAuthButton.jsx — Emergent-managed Google Auth entrypoint.
// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
//
// Clicking this button redirects to Emergent's OAuth handoff, which brings the
// user back to `/auth/callback#session_id=...` on our origin.

import { GoogleLogo } from "@phosphor-icons/react";

export default function GoogleAuthButton({ label = "Continue with Google" }) {
  const onClick = () => {
    // Derive the redirect URL from the browser to prevent env mismatches.
    const redirectUrl = window.location.origin + "/auth/callback";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="google-auth-button"
      className="w-full inline-flex items-center justify-center gap-2 bg-white border border-black/15 hover:border-black/30 hover:bg-black/[0.02] rounded-lg px-5 py-3 transition-all"
    >
      <GoogleLogo size={18} weight="bold" />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}
