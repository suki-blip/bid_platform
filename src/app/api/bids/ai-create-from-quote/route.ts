import { NextResponse } from 'next/server';
import { splitPdfToChunks } from '@/lib/pdf-split';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const textContent = formData.get('text') as string | null;
    const fileUrl = formData.get('file_url') as string | null;

    if (!file && !textContent && !fileUrl) {
      return NextResponse.json({ error: 'Upload a file, paste a link, or paste text' }, { status: 400 });
    }

    const contentBlocks: any[] = [];

    // Google Drive download helper (handles virus scan confirmation)
    function extractDriveId(url: string): string | null {
      const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      return m ? m[1] : null;
    }
    async function fetchFromDrive(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
      const url1 = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const res1 = await fetch(url1, { redirect: 'follow' });
      const ct = res1.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const url2 = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
        const res2 = await fetch(url2, { redirect: 'follow' });
        const ct2 = res2.headers.get('content-type') || '';
        if (ct2.includes('text/html')) {
          throw new Error('Cannot download. Make sure file is shared as "Anyone with the link".');
        }
        return { buffer: Buffer.from(await res2.arrayBuffer()), contentType: ct2 };
      }
      return { buffer: Buffer.from(await res1.arrayBuffer()), contentType: ct };
    }

    if (fileUrl && !file) {
      try {
        let buffer: Buffer; let contentType: string;
        const trimmedUrl = fileUrl.trim();
        const driveId = extractDriveId(trimmedUrl);
        if (driveId) {
          const r = await fetchFromDrive(driveId); buffer = r.buffer; contentType = r.contentType;
        } else if (trimmedUrl.includes('dropbox.com')) {
          const dbUrl = trimmedUrl.replace(/dl=0/, 'dl=1').replace(/\?.*$/, '?dl=1');
          const res = await fetch(dbUrl, { redirect: 'follow' });
          if (!res.ok) throw new Error('Dropbox download failed');
          buffer = Buffer.from(await res.arrayBuffer()); contentType = res.headers.get('content-type') || '';
        } else {
          const res = await fetch(trimmedUrl, { redirect: 'follow' });
          if (!res.ok) throw new Error('Download failed');
          buffer = Buffer.from(await res.arrayBuffer()); contentType = res.headers.get('content-type') || '';
        }
        const fileSizeMB = buffer.length / (1024 * 1024);
        if (fileSizeMB > 100) {
          return NextResponse.json({ error: `File too large (${fileSizeMB.toFixed(1)}MB). Max 100MB.` }, { status: 400 });
        }
        const hasPdfMagic = buffer.length > 4 && buffer.slice(0, 5).toString() === '%PDF-';
        const isPdf = hasPdfMagic || contentType.includes('pdf') || fileUrl.toLowerCase().includes('.pdf');
        const isImage = !isPdf && contentType.startsWith('image/');
        if (isImage) {
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: contentType, data: buffer.toString('base64') } });
        } else if (isPdf) {
          const base64Full = buffer.toString('base64');
          if (base64Full.length < 5 * 1024 * 1024) {
            contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Full } });
          } else {
            const { chunks, totalPages } = await splitPdfToChunks(buffer, 5, 4);
            if (chunks.length === 0) return NextResponse.json({ error: 'Could not process PDF.' }, { status: 400 });
            for (const chunk of chunks) {
              contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: chunk } });
            }
            contentBlocks.push({ type: 'text', text: `PDF has ${totalPages} pages, showing ${Math.min(totalPages, chunks.length * 5)} pages in ${chunks.length} chunks.` });
          }
        } else {
          contentBlocks.push({ type: 'text', text: `Document content:\n${buffer.toString('utf-8')}` });
        }
      } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to fetch file from URL.' }, { status: 400 });
      }
    }

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'application/pdf';
      const isPdfFile = mimeType === 'application/pdf' || (buffer.length > 4 && buffer.slice(0, 5).toString() === '%PDF-');

      if (mimeType.startsWith('image/')) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') },
        });
      } else if (isPdfFile) {
        const base64Full = buffer.toString('base64');
        if (base64Full.length < 5 * 1024 * 1024) {
          contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Full } });
        } else {
          const { chunks, totalPages } = await splitPdfToChunks(buffer, 5, 4);
          if (chunks.length === 0) return NextResponse.json({ error: 'Could not process PDF.' }, { status: 400 });
          for (const chunk of chunks) {
            contentBlocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: chunk } });
          }
          contentBlocks.push({ type: 'text', text: `PDF has ${totalPages} pages, showing ${Math.min(totalPages, chunks.length * 5)} pages.` });
        }
      } else {
        const text = buffer.toString('utf-8');
        contentBlocks.push({ type: 'text', text: `Document content:\n${text}` });
      }
    }

    const prompt = `You are analyzing a vendor quote/proposal document to create a standardized bid form that can be sent to OTHER vendors for comparison quotes.

Your goal: Extract the structure of this quote and create a bid form template that a contractor can send to competing vendors.

${textContent ? `\nPasted text content:\n${textContent}\n` : ''}

Analyze the document and return a JSON object with the following structure:
{
  "title": "Short bid title describing what's being quoted (e.g., 'Elevator Installation', 'HVAC System Supply & Install')",
  "description": "Detailed description of the scope of work, based on what's in the quote. Write it as instructions for OTHER vendors.",
  "bid_mode": "structured" or "open" — use "structured" if the quote has clear parameters with options (sizes, types, etc.), use "open" if it's a complex quote where vendors should propose their own specs,
  "parameters": [
    {
      "name": "Parameter name (e.g., 'System Type', 'Material', 'Capacity')",
      "options": ["Option 1", "Option 2", "Option 3"],
      "is_track": false
    }
  ],
  "suggested_specs": ["Spec field 1", "Spec field 2"],
  "checklist": [
    {"text": "Required document or condition", "required": true},
    {"text": "Optional item", "required": false}
  ],
  "deadline_days": 7
}

Guidelines:
- Extract MEANINGFUL parameters from the quote — things that vary (size, type, model, capacity, etc.)
- For each parameter, provide realistic options based on what's in the quote and common alternatives
- If the quote mentions certifications, warranties, insurance — add those to the checklist
- suggested_specs: list the technical specification fields that vendors should fill in (brand, model, warranty period, etc.)
- If the quote is in Hebrew, still return field names in English but keep Hebrew values where appropriate
- Make the bid form comprehensive enough for fair comparison
- checklist: include both required items (certificates, insurance) and optional items (samples, references)
- For is_track: set to true ONLY for parameters that represent fundamentally different pricing tracks (e.g., "Import vs Local", "Option A vs Option B")

Return ONLY the JSON, no explanation.`;

    contentBlocks.push({ type: 'text', text: prompt });

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '{}';

    let result: any = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse AI bid creation response:', text);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('AI bid creation error:', error);
    return NextResponse.json({ error: 'Failed to create bid from quote' }, { status: 500 });
  }
}
