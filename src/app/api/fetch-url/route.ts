import { NextResponse } from 'next/server';

// POST: Fetch a file from a public URL (Dropbox, Google Drive, etc.)
export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
    }

    // Convert sharing links to direct download links
    let directUrl = url.trim();

    // Dropbox: change dl=0 to dl=1 (preserving ? or &)
    if (directUrl.includes('dropbox.com')) {
      directUrl = directUrl.replace(/([?&])dl=0/, '$1dl=1');
      if (!directUrl.includes('dl=1')) {
        directUrl += (directUrl.includes('?') ? '&' : '?') + 'dl=1';
      }
    }

    // Google Drive file: convert sharing link to direct download
    const gdriveMatch = directUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (gdriveMatch) {
      directUrl = `https://drive.google.com/uc?export=download&id=${gdriveMatch[1]}`;
    }
    // Google Drive alt format
    const gdriveMatch2 = directUrl.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (gdriveMatch2) {
      directUrl = `https://drive.google.com/uc?export=download&id=${gdriveMatch2[1]}`;
    }

    // Fetch the file
    const res = await fetch(directUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to download: ${res.status} ${res.statusText}` }, { status: 400 });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = res.headers.get('content-disposition') || '';

    // Extract filename from content-disposition or URL
    let filename = 'downloaded-file';
    const cdMatch = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    if (cdMatch) {
      filename = decodeURIComponent(cdMatch[1]);
    } else {
      // Try to get filename from URL path
      try {
        const urlPath = new URL(directUrl).pathname;
        const pathFilename = urlPath.split('/').pop();
        if (pathFilename && pathFilename.includes('.')) {
          filename = decodeURIComponent(pathFilename);
        }
      } catch {}
    }

    // Add extension based on content type if missing
    if (!filename.includes('.')) {
      if (contentType.includes('pdf')) filename += '.pdf';
      else if (contentType.includes('png')) filename += '.png';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) filename += '.jpg';
      else if (contentType.includes('word') || contentType.includes('docx')) filename += '.docx';
      else if (contentType.includes('excel') || contentType.includes('xlsx')) filename += '.xlsx';
      else if (contentType.includes('zip')) filename += '.zip';
    }

    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return NextResponse.json({
      success: true,
      filename,
      contentType,
      size: buffer.byteLength,
      base64,
    });
  } catch (error) {
    console.error('Error fetching URL:', error);
    return NextResponse.json({ error: 'Failed to fetch URL' }, { status: 500 });
  }
}
