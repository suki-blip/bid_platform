import { NextResponse } from 'next/server';
import JSZip from 'jszip';

// Allow up to 120 seconds for large folder downloads
export const maxDuration = 120;

interface FolderFile {
  filename: string;
  contentType: string;
  size: number;
  base64: string;
}

interface VendorFolder {
  vendorName: string;
  files: FolderFile[];
}

// POST: Fetch files from a cloud folder (Google Drive / Dropbox)
// Supports folder structures where each subfolder = vendor name
export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing URL' }, { status: 400 });
    }

    const trimmedUrl = url.trim();

    // Detect Google Drive folder
    const gdriveFolderMatch = trimmedUrl.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/);
    if (gdriveFolderMatch) {
      const folderId = gdriveFolderMatch[1];
      const result = await fetchGoogleDriveFolder(folderId);
      return NextResponse.json(result);
    }

    // Detect Dropbox folder
    if (trimmedUrl.includes('dropbox.com/s') || trimmedUrl.includes('dropbox.com/sh') || trimmedUrl.includes('dropbox.com/scl/fo')) {
      const result = await fetchDropboxFolder(trimmedUrl);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'URL not recognized as a Google Drive or Dropbox folder. Paste a shared folder link.' }, { status: 400 });
  } catch (error) {
    console.error('Error fetching folder:', error);
    return NextResponse.json({ error: 'Failed to process folder link' }, { status: 500 });
  }
}

// ── Google Drive ──
async function fetchGoogleDriveFolder(folderId: string): Promise<any> {
  // Use Google's public embedding endpoint to list folder contents
  // This works for publicly shared folders without needing an API key
  const listUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;

  const res = await fetch(listUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  if (!res.ok) {
    return { error: 'Cannot access this Google Drive folder. Make sure it is shared as "Anyone with the link".' };
  }

  const html = await res.text();

  // Parse file entries from the embedded view
  // The HTML contains data like: ["FILE_ID","FILENAME",...]
  const fileEntries: { id: string; name: string; mimeType: string }[] = [];

  // Match patterns like ["0B...", "filename.pdf", ...] or \x22FILE_ID\x22,\x22FILENAME\x22
  const entryRegex = /\["([\w-]{20,}?)","([^"]+?)","([^"]*?)"/g;
  let match;
  while ((match = entryRegex.exec(html)) !== null) {
    const [, id, name, mimeOrSize] = match;
    if (name && !name.startsWith('_') && id.length > 15) {
      fileEntries.push({ id, name, mimeType: mimeOrSize || '' });
    }
  }

  // Also try alternative parsing for newer Drive format
  // Look for data entries in script tags
  if (fileEntries.length === 0) {
    const altRegex = /\[(?:"[^"]*",){0,2}"([\w-]{20,})","([^"]+)"/g;
    while ((match = altRegex.exec(html)) !== null) {
      const [, id, name] = match;
      if (name && id.length > 15) {
        fileEntries.push({ id, name, mimeType: '' });
      }
    }
  }

  // Try yet another approach: look for files in the JSON-like data structures
  if (fileEntries.length === 0) {
    // Try parsing via a different Google endpoint
    const altListUrl = `https://drive.google.com/drive/folders/${folderId}`;
    const altRes = await fetch(altListUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const altHtml = await altRes.text();

    // Look for file IDs and names in the page data
    const dataRegex = /\\x22([\w-]{25,})\\x22[^\\]*?\\x22([^\\]+?\.\w{2,5})\\x22/g;
    while ((match = dataRegex.exec(altHtml)) !== null) {
      const [, id, name] = match;
      if (!fileEntries.some(f => f.id === id)) {
        fileEntries.push({ id, name, mimeType: '' });
      }
    }
  }

  if (fileEntries.length === 0) {
    // Might be a folder of folders — try to detect subfolders
    // Check if there are folder references
    const folderRegex = /\\x22([\w-]{25,})\\x22[^\\]*?\\x22(application\/vnd\.google-apps\.folder)\\x22[^\\]*?\\x22([^\\]+?)\\x22/g;
    const subfolders: { id: string; name: string }[] = [];

    const mainRes = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const mainHtml = await mainRes.text();

    while ((match = folderRegex.exec(mainHtml)) !== null) {
      subfolders.push({ id: match[1], name: match[3] });
    }

    if (subfolders.length > 0) {
      // This is a folder of vendor folders — process each
      const vendors: VendorFolder[] = [];
      for (const subfolder of subfolders.slice(0, 20)) { // max 20 vendors
        const subFiles = await downloadGoogleDriveFiles(subfolder.id);
        if (subFiles.length > 0) {
          vendors.push({ vendorName: subfolder.name, files: subFiles });
        }
      }
      return { success: true, type: 'vendors', vendors };
    }

    return { error: 'Could not find files in this folder. Make sure it is shared publicly.' };
  }

  // Determine if these are subfolders (vendors) or direct files
  const folderItems = fileEntries.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

  if (folderItems.length > 0) {
    // Vendor folders detected
    const vendors: VendorFolder[] = [];
    for (const folder of folderItems.slice(0, 20)) {
      const files = await downloadGoogleDriveFiles(folder.id);
      if (files.length > 0) {
        vendors.push({ vendorName: folder.name, files });
      }
    }
    return { success: true, type: 'vendors', vendors };
  }

  // Direct files — download them all as single vendor
  const files = await downloadGoogleDriveFilesList(fileEntries);
  return { success: true, type: 'files', files };
}

async function downloadGoogleDriveFiles(folderId: string): Promise<FolderFile[]> {
  // List files in subfolder
  const listUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
  const res = await fetch(listUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await res.text();

  const entries: { id: string; name: string }[] = [];
  const regex = /\["([\w-]{20,}?)","([^"]+?)","([^"]*?)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[2] && match[1].length > 15) {
      entries.push({ id: match[1], name: match[2] });
    }
  }

  // Also try alternative
  if (entries.length === 0) {
    const altRegex = /\\x22([\w-]{25,})\\x22[^\\]*?\\x22([^\\]+?\.\w{2,5})\\x22/g;
    const altRes = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const altHtml = await altRes.text();
    while ((match = altRegex.exec(altHtml)) !== null) {
      entries.push({ id: match[1], name: match[2] });
    }
  }

  return downloadGoogleDriveFilesList(entries);
}

async function downloadGoogleDriveFilesList(entries: { id: string; name: string }[]): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  for (const entry of entries.slice(0, 10)) { // max 10 files per vendor
    try {
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${entry.id}`;
      const res = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow',
      });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      files.push({
        filename: entry.name,
        contentType,
        size: buffer.byteLength,
        base64: Buffer.from(buffer).toString('base64'),
      });
    } catch { /* skip failed downloads */ }
  }
  return files;
}

// ── Dropbox ──
async function fetchDropboxFolder(url: string): Promise<any> {
  // Try HTML parsing first, then fall back to zip download
  let htmlResult: any = null;

  try {
    htmlResult = await tryDropboxHtmlParsing(url);
  } catch { /* HTML parsing failed */ }

  // If HTML parsing succeeded and got files, return them
  if (htmlResult && htmlResult.success) {
    const hasFiles = htmlResult.type === 'vendors'
      ? htmlResult.vendors?.some((v: VendorFolder) => v.files.length > 0)
      : htmlResult.files?.length > 0;
    if (hasFiles) return htmlResult;
  }

  // Don't attempt server-side zip extraction — large folders exceed Vercel's response size limit.
  // Return failure so the client falls back to /api/fetch-zip streaming proxy + client-side extraction.
  return { error: 'use_streaming_fallback', message: 'Folder too large for server-side extraction. Client will use streaming fallback.' };
}

async function tryDropboxHtmlParsing(url: string): Promise<any> {
  let apiUrl = url.replace(/\?.*$/, '');

  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'follow',
  });

  if (!res.ok) return null;

  const html = await res.text();

  const dataMatch = html.match(/InitReact\.mountComponent\(.*?"entries":\s*(\[[\s\S]*?\])\s*[,}]/);
  const altMatch = html.match(/"entries"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  const jsonStr = dataMatch?.[1] || altMatch?.[1];

  if (!jsonStr) {
    const fileLinks: { name: string; url: string; isFolder: boolean }[] = [];
    const linkRegex = /href="(\/sh?\/[^"]+?)"|"url"\s*:\s*"(https:\/\/[^"]*dropbox[^"]*?)"/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const linkUrl = match[1] || match[2];
      if (linkUrl) {
        const nameMatch = linkUrl.match(/\/([^/?]+?)(?:\?|$)/);
        fileLinks.push({
          name: nameMatch?.[1] || 'file',
          url: linkUrl.startsWith('/') ? `https://www.dropbox.com${linkUrl}` : linkUrl,
          isFolder: linkUrl.includes('/sh/') || linkUrl.includes('/scl/fo'),
        });
      }
    }

    if (fileLinks.length === 0) return null;

    const folders = fileLinks.filter(f => f.isFolder);
    if (folders.length > 0) {
      const vendors: VendorFolder[] = [];
      for (const folder of folders.slice(0, 20)) {
        const subResult = await fetchDropboxFolderFiles(folder.url);
        if (subResult.length > 0) {
          vendors.push({ vendorName: decodeURIComponent(folder.name), files: subResult });
        }
      }
      if (vendors.length > 0) {
        return { success: true, type: 'vendors', vendors };
      }
    }

    const files: FolderFile[] = [];
    for (const link of fileLinks.filter(f => !f.isFolder).slice(0, 10)) {
      const file = await downloadDropboxFile(link.url, link.name);
      if (file) files.push(file);
    }
    if (files.length > 0) return { success: true, type: 'files', files };
    return null;
  }

  try {
    const entries = JSON.parse(jsonStr);
    const folders = entries.filter((e: any) => e.is_dir || e.isDir || e['.tag'] === 'folder');
    const files = entries.filter((e: any) => !e.is_dir && !e.isDir && e['.tag'] !== 'folder');

    if (folders.length > 0) {
      const vendors: VendorFolder[] = [];
      for (const folder of folders.slice(0, 20)) {
        const folderUrl = folder.href || folder.url || folder.preview_url;
        if (folderUrl) {
          const subFiles = await fetchDropboxFolderFiles(folderUrl);
          vendors.push({
            vendorName: folder.filename || folder.name || 'Unknown',
            files: subFiles,
          });
        }
      }
      return { success: true, type: 'vendors', vendors };
    }

    const downloadedFiles: FolderFile[] = [];
    for (const file of files.slice(0, 10)) {
      const fileUrl = file.href || file.url || file.preview_url;
      if (fileUrl) {
        const downloaded = await downloadDropboxFile(fileUrl, file.filename || file.name);
        if (downloaded) downloadedFiles.push(downloaded);
      }
    }
    if (downloadedFiles.length > 0) return { success: true, type: 'files', files: downloadedFiles };
    return null;
  } catch {
    return null;
  }
}

// Download Dropbox folder as zip and extract files
// Subfolder names become vendor names
async function downloadDropboxAsZip(url: string): Promise<any> {
  try {
    // Convert to direct download link
    let dlUrl = url.replace(/([?&])dl=0/, '$1dl=1');
    if (!dlUrl.includes('dl=1')) {
      dlUrl += (dlUrl.includes('?') ? '&' : '?') + 'dl=1';
    }

    const res = await fetch(dlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });

    if (!res.ok) {
      return { error: `Failed to download folder: ${res.status} ${res.statusText}` };
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || '';

    // Check if it's actually a zip
    if (!contentType.includes('zip') && !contentType.includes('octet-stream')) {
      // Not a zip — return as single file
      const cd = res.headers.get('content-disposition') || '';
      const cdMatch = cd.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/i);
      const filename = cdMatch ? decodeURIComponent(cdMatch[1]) : 'downloaded-file';
      return {
        success: true,
        type: 'files',
        files: [{
          filename,
          contentType,
          size: buffer.byteLength,
          base64: Buffer.from(buffer).toString('base64'),
        }],
      };
    }

    // Extract zip contents
    const zip = await JSZip.loadAsync(buffer);
    const vendorMap = new Map<string, FolderFile[]>();
    const rootFiles: FolderFile[] = [];
    let fileCount = 0;

    for (const [path, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue;
      // Skip hidden/system files
      const name = path.split('/').pop() || '';
      if (!name || name.startsWith('.') || name.startsWith('__')) continue;
      if (fileCount >= 80) break; // safety limit

      try {
        const data = await zipEntry.async('arraybuffer');
        const ext = name.split('.').pop()?.toLowerCase() || '';
        let ct = 'application/octet-stream';
        if (ext === 'pdf') ct = 'application/pdf';
        else if (ext === 'png') ct = 'image/png';
        else if (ext === 'jpg' || ext === 'jpeg') ct = 'image/jpeg';
        else if (ext === 'doc') ct = 'application/msword';
        else if (ext === 'docx') ct = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (ext === 'xls') ct = 'application/vnd.ms-excel';
        else if (ext === 'xlsx') ct = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        const file: FolderFile = {
          filename: name,
          contentType: ct,
          size: data.byteLength,
          base64: Buffer.from(data).toString('base64'),
        };

        // Determine vendor from path: "RootFolder/VendorName/file.pdf"
        const parts = path.split('/').filter(p => p && !p.startsWith('.') && !p.startsWith('__'));
        if (parts.length >= 3) {
          // Has subfolder structure: parts[0] = root folder name, parts[1] = vendor, parts[2+] = file
          const vendorName = parts[1];
          if (!vendorMap.has(vendorName)) vendorMap.set(vendorName, []);
          vendorMap.get(vendorName)!.push(file);
        } else if (parts.length === 2) {
          // Could be "VendorName/file.pdf" or "RootFolder/file.pdf"
          // Treat first part as vendor/folder name
          const folderName = parts[0];
          if (!vendorMap.has(folderName)) vendorMap.set(folderName, []);
          vendorMap.get(folderName)!.push(file);
        } else {
          rootFiles.push(file);
        }
        fileCount++;
      } catch { /* skip corrupt entries */ }
    }

    // If we found vendor subfolders, return as vendors
    if (vendorMap.size > 1) {
      const vendors: VendorFolder[] = [];
      for (const [vendorName, files] of vendorMap) {
        vendors.push({ vendorName, files: files.slice(0, 10) });
      }
      return { success: true, type: 'vendors', vendors };
    }

    // If only one folder or root files, return as flat files
    const allFiles = [...rootFiles];
    for (const files of vendorMap.values()) {
      allFiles.push(...files);
    }

    if (allFiles.length === 0) {
      return { error: 'Zip file was empty or contained no recognizable files' };
    }

    return { success: true, type: 'files', files: allFiles.slice(0, 60) };
  } catch (err) {
    console.error('Zip extraction error:', err);
    return { error: 'Failed to download or extract folder contents' };
  }
}

async function fetchDropboxFolderFiles(folderUrl: string): Promise<FolderFile[]> {
  const files: FolderFile[] = [];
  try {
    const res = await fetch(folderUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    const html = await res.text();

    // Look for file download links
    const fileRegex = /"preview_url"\s*:\s*"([^"]+)"|"href"\s*:\s*"([^"]+\.(?:pdf|jpg|jpeg|png|doc|docx|xls|xlsx))"/gi;
    let match;
    const fileUrls: string[] = [];
    while ((match = fileRegex.exec(html)) !== null) {
      const url = match[1] || match[2];
      if (url && !fileUrls.includes(url)) fileUrls.push(url);
    }

    for (const fileUrl of fileUrls.slice(0, 10)) {
      const fullUrl = fileUrl.startsWith('/') ? `https://www.dropbox.com${fileUrl}` : fileUrl;
      const nameMatch = fileUrl.match(/\/([^/?]+?\.\w{2,5})(?:\?|$)/);
      const downloaded = await downloadDropboxFile(fullUrl, nameMatch?.[1] || 'file');
      if (downloaded) files.push(downloaded);
    }
  } catch { /* skip errors */ }
  return files;
}

async function downloadDropboxFile(url: string, filename: string): Promise<FolderFile | null> {
  try {
    // Convert to direct download link
    let dlUrl = url;
    dlUrl = dlUrl.replace(/([?&])dl=0/, '$1dl=1');
    if (!dlUrl.includes('dl=1')) {
      dlUrl += (dlUrl.includes('?') ? '&' : '?') + 'dl=1';
    }

    const res = await fetch(dlUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';

    // Get filename from content-disposition if available
    const cd = res.headers.get('content-disposition') || '';
    const cdMatch = cd.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    const finalName = cdMatch ? decodeURIComponent(cdMatch[1]) : decodeURIComponent(filename);

    return {
      filename: finalName,
      contentType,
      size: buffer.byteLength,
      base64: Buffer.from(buffer).toString('base64'),
    };
  } catch {
    return null;
  }
}
