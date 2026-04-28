import { NextResponse } from 'next/server';

// Stream a zip file from Dropbox/Google Drive — no base64, just raw binary proxy
// This avoids Vercel's response size limits for large folders
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
    }

    let dlUrl = url.trim();

    // Convert Dropbox URLs to direct download
    dlUrl = dlUrl.replace(/([?&])dl=0/, '$1dl=1');
    if (!dlUrl.includes('dl=1')) {
      dlUrl += (dlUrl.includes('?') ? '&' : '?') + 'dl=1';
    }

    const res = await fetch(dlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Download failed: ${res.status}` }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const cd = res.headers.get('content-disposition') || '';
    const cdMatch = cd.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    const filename = cdMatch ? decodeURIComponent(cdMatch[1]) : 'download.zip';

    // Stream the response body through
    return new Response(res.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Filename': filename,
      },
    });
  } catch (error) {
    console.error('Fetch zip error:', error);
    return NextResponse.json({ error: 'Failed to download' }, { status: 500 });
  }
}
