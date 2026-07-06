"use client";

// In-app auto-dialer (behind the BidMaster/fundraising login). Uses the shared DialerPanel
// pointed at the fundraising-scoped API. A standalone passcode-gated copy lives at /dialer.

import DialerPanel from "../_components/DialerPanel";

export default function AutoDialPage() {
  return (
    <DialerPanel
      endpoints={{
        list: "/api/fundraising/scheduled-calls",
        dialNow: "/api/fundraising/scheduled-calls/dial-now",
        del: (id) => `/api/fundraising/scheduled-calls/${id}`,
      }}
    />
  );
}
