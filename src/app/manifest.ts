import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

// Dynamic manifest — branding follows the host the user arrived from so the same
// codebase can serve two installable apps:
//   easyfundraisings.com → "easyfundraisings"
//   www.bidmaster.app   → "BidMaster"
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const host = (h.get('host') || '').toLowerCase();
  const isFundraising = host.includes('easyfundraisings');

  const name = isFundraising ? 'easyfundraisings' : 'BidMaster';
  const description = isFundraising
    ? 'Donor management and fundraising for nonprofits.'
    : 'Construction bidding platform.';

  // For the fundraising domain, the rewrite middleware sends "/" to /fundraising,
  // so the install scope and start_url should land users on the dashboard.
  const startUrl = isFundraising ? '/' : '/customer';

  return {
    name,
    short_name: name,
    description,
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fbf7ec', // page bg (paper)
    theme_color: '#2d7a3d',      // shed-green status bar
    categories: ['business', 'productivity', 'finance'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
