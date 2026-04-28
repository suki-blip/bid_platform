import { NextResponse } from 'next/server';
import { getContractorSession } from '@/lib/session';
import { db, dbReady } from '@/lib/db';
import { splitPdfToChunks } from '@/lib/pdf-split';

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    // Check auth & plan
    const session = await getContractorSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Pro+ plan
    await dbReady();
    const userResult = await db().execute({
      sql: 'SELECT plan, status, payment FROM saas_users WHERE id = ?',
      args: [session.userId],
    });
    const user = userResult.rows[0] as Record<string, unknown> | undefined;
    if (!user || user.plan !== 'Pro' || user.payment !== 'paid') {
      return NextResponse.json({ error: 'This feature requires a Pro+ subscription', upgrade: true }, { status: 403 });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const textContent = formData.get('text') as string | null;
    const fileUrl = formData.get('file_url') as string | null;
    const projectType = formData.get('project_type') as string || '';
    const tradeCategory = formData.get('trade_category') as string || '';

    if (!file && !textContent && !fileUrl) {
      return NextResponse.json({ error: 'Upload a plan, paste a link, or paste specifications' }, { status: 400 });
    }

    const contentBlocks: any[] = [];

    // Helper: extract Google Drive file ID
    function extractDriveId(url: string): string | null {
      const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      return m ? m[1] : null;
    }

    // Fetch file from Google Drive (handles virus scan confirmation)
    async function fetchFromDrive(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
      // Try direct download first
      const url1 = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const res1 = await fetch(url1, { redirect: 'follow' });

      const ct = res1.headers.get('content-type') || '';
      // If we got HTML, it's the virus scan confirmation page
      if (ct.includes('text/html')) {
        // Try with confirm=t parameter to bypass
        const url2 = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
        const res2 = await fetch(url2, { redirect: 'follow' });
        const ct2 = res2.headers.get('content-type') || '';
        if (ct2.includes('text/html')) {
          // Last resort: try the direct media URL
          const url3 = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=AIzaSyC1qbk72OPPcVz-GUHPz8Y-lLU-dgyUkNU`;
          const res3 = await fetch(url3, { redirect: 'follow' });
          if (!res3.ok) {
            throw new Error('Could not download file. Make sure the file is shared as "Anyone with the link".');
          }
          return { buffer: Buffer.from(await res3.arrayBuffer()), contentType: res3.headers.get('content-type') || '' };
        }
        return { buffer: Buffer.from(await res2.arrayBuffer()), contentType: ct2 };
      }
      return { buffer: Buffer.from(await res1.arrayBuffer()), contentType: ct };
    }

    // Fetch file from URL if provided
    if (fileUrl && !file) {
      try {
        let buffer: Buffer;
        let contentType: string;
        const trimmedUrl = fileUrl.trim();

        const driveId = extractDriveId(trimmedUrl);
        if (driveId) {
          // Google Drive
          const result = await fetchFromDrive(driveId);
          buffer = result.buffer;
          contentType = result.contentType;
        } else if (trimmedUrl.includes('dropbox.com')) {
          // Dropbox: force dl=1
          const dbUrl = trimmedUrl.replace(/dl=0/, 'dl=1').replace(/\?.*$/, '?dl=1');
          const urlRes = await fetch(dbUrl, { redirect: 'follow' });
          if (!urlRes.ok) throw new Error('Dropbox download failed');
          buffer = Buffer.from(await urlRes.arrayBuffer());
          contentType = urlRes.headers.get('content-type') || '';
        } else {
          // Direct URL
          const urlRes = await fetch(trimmedUrl, { redirect: 'follow' });
          if (!urlRes.ok) throw new Error('Download failed');
          buffer = Buffer.from(await urlRes.arrayBuffer());
          contentType = urlRes.headers.get('content-type') || '';
        }

        // Check if we got HTML instead of a file (sharing issue)
        if (contentType.includes('text/html')) {
          const snippet = buffer.toString('utf-8').slice(0, 500);
          if (snippet.includes('Sign in') || snippet.includes('denied') || snippet.includes('not found')) {
            return NextResponse.json({ error: 'Cannot access file. Make sure the link is shared as "Anyone with the link can view".' }, { status: 400 });
          }
        }

        const fileSizeMB = buffer.length / (1024 * 1024);
        const hasPdfMagic = buffer.length > 4 && buffer.slice(0, 5).toString() === '%PDF-';
        const isPdf = hasPdfMagic || contentType.includes('pdf') || fileUrl.toLowerCase().includes('.pdf');
        const isImage = !isPdf && (contentType.startsWith('image/') || /\.(jpg|jpeg|png|webp|tiff)(\?|$)/i.test(fileUrl));

        console.log(`File downloaded: ${fileSizeMB.toFixed(1)}MB, type: ${contentType}, isPdf: ${isPdf}, isImage: ${isImage}`);

        if (fileSizeMB > 100) {
          return NextResponse.json({ error: `File is ${fileSizeMB.toFixed(1)}MB — max 100MB.` }, { status: 400 });
        }

        if (isImage) {
          const base64 = buffer.toString('base64');
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: contentType || 'image/jpeg', data: base64 },
          });
        } else if (isPdf) {
          // For small PDFs, send directly; for large ones, split into chunks
          const base64Full = buffer.toString('base64');
          if (base64Full.length < 5 * 1024 * 1024) {
            // Small enough to send directly
            contentBlocks.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Full },
            });
            console.log(`PDF sent directly (${fileSizeMB.toFixed(1)}MB)`);
          } else {
            // Split into page chunks
            console.log(`PDF too large (${fileSizeMB.toFixed(1)}MB), splitting into chunks...`);
            const { chunks, totalPages } = await splitPdfToChunks(buffer, 5, 4);
            console.log(`Split into ${chunks.length} chunks from ${totalPages} pages`);
            if (chunks.length === 0) {
              return NextResponse.json({ error: 'Could not process PDF — pages may be too large individually.' }, { status: 400 });
            }
            for (let i = 0; i < chunks.length; i++) {
              contentBlocks.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: chunks[i] },
              });
            }
            contentBlocks.push({
              type: 'text',
              text: `Note: This PDF has ${totalPages} pages total. You are seeing ${Math.min(totalPages, chunks.length * 5)} pages split across ${chunks.length} document chunks. Analyze all chunks together as one document.`,
            });
          }
        } else {
          const text = buffer.toString('utf-8');
          contentBlocks.push({ type: 'text', text: `Document content:\n${text}` });
        }
      } catch (e: any) {
        console.error('URL fetch error:', e);
        return NextResponse.json({ error: e.message || 'Failed to fetch file from URL. Check that the link is accessible.' }, { status: 400 });
      }
    }

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileSizeMB = buffer.length / (1024 * 1024);
      const mimeType = file.type || 'application/pdf';
      const isPdfFile = mimeType === 'application/pdf' || (buffer.length > 4 && buffer.slice(0, 5).toString() === '%PDF-');

      if (mimeType.startsWith('image/')) {
        const base64 = buffer.toString('base64');
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 },
        });
      } else if (isPdfFile) {
        const base64Full = buffer.toString('base64');
        if (base64Full.length < 5 * 1024 * 1024) {
          contentBlocks.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Full },
          });
        } else {
          console.log(`Uploaded PDF ${fileSizeMB.toFixed(1)}MB, splitting...`);
          const { chunks, totalPages } = await splitPdfToChunks(buffer, 5, 4);
          if (chunks.length === 0) {
            return NextResponse.json({ error: 'Could not process PDF pages.' }, { status: 400 });
          }
          for (const chunk of chunks) {
            contentBlocks.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: chunk },
            });
          }
          contentBlocks.push({
            type: 'text',
            text: `Note: This PDF has ${totalPages} pages. You are seeing ${Math.min(totalPages, chunks.length * 5)} pages across ${chunks.length} chunks. Analyze all together.`,
          });
        }
      } else {
        const text = buffer.toString('utf-8');
        contentBlocks.push({ type: 'text', text: `Document content:\n${text}` });
      }
    }

    const prompt = `You are a senior construction quantity surveyor and estimator. You are analyzing construction plans, drawings, or specifications to extract quantities, materials, and scope of work.

${projectType ? `Project type: ${projectType}` : ''}
${tradeCategory ? `Trade category focus: ${tradeCategory}` : ''}
${textContent ? `\nSpecification text:\n${textContent}\n` : ''}

Analyze the uploaded construction plan/drawing/specification document and extract as much quantitative information as possible.

Return a JSON object with this structure:
{
  "project_summary": "Brief description of what you see in the plans",
  "quantities": [
    {
      "item": "Item description (e.g., 'Concrete Slab', 'Interior Walls', 'Electrical Outlets')",
      "quantity": "Numeric quantity or estimate",
      "unit": "Unit of measurement (sqm, lm, units, kg, cum, etc.)",
      "notes": "Any relevant notes, assumptions, or conditions",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "materials": [
    {
      "material": "Material name",
      "specification": "Grade, type, or specification details",
      "estimated_quantity": "Approximate quantity if determinable",
      "unit": "Unit"
    }
  ],
  "scope_items": [
    "Description of work scope item 1",
    "Description of work scope item 2"
  ],
  "bid_form": {
    "title": "Suggested bid title",
    "description": "Detailed scope description for vendors",
    "bid_mode": "structured" or "open",
    "parameters": [
      {
        "name": "Parameter name",
        "options": ["Option 1", "Option 2"],
        "is_track": false
      }
    ],
    "suggested_specs": ["Spec field 1", "Spec field 2"],
    "checklist": [
      {"text": "Required item", "required": true}
    ]
  },
  "warnings": ["Any important notes or limitations about the analysis"],
  "assumptions": ["Assumptions made during quantity extraction"]
}

Guidelines:
- Extract ALL quantities you can identify from the plans — areas, lengths, counts, volumes
- If dimensions are shown, calculate areas and volumes
- Note the confidence level: "high" for clearly written quantities, "medium" for calculated/estimated, "low" for rough guesses
- Include materials specifications when visible (concrete grade, steel type, pipe diameter, etc.)
- Generate a complete bid form based on what you see
- If the document is in Hebrew, translate items to English but keep original Hebrew terms in notes
- Be conservative — better to note "estimated" than to give a wrong number
- If you see a BOQ (Bill of Quantities) or schedule, extract every line item
- For areas: always specify if it's gross or net area
- List ALL assumptions you made

Return ONLY the JSON, no additional text.`;

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
        max_tokens: 8192,
        messages: [{ role: 'user', content: contentBlocks }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
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
      console.error('Failed to parse AI plan analysis:', text);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('AI plan analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
