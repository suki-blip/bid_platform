import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// POST: AI-parse a vendor's quote document
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await dbReady();
    const { token } = await params;

    // Verify token
    const invResult = await db().execute({
      sql: `SELECT bi.bid_id, b.title, b.description
            FROM bid_invitations bi
            JOIN bids b ON b.id = bi.bid_id
            WHERE bi.token = ? AND bi.status != 'expired'`,
      args: [token],
    });
    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
    }
    const bid = invResult.rows[0];

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI parsing not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const textContent = formData.get('text') as string | null;

    if (!file && !textContent) {
      return NextResponse.json({ error: 'Upload a file or paste text' }, { status: 400 });
    }

    const contentBlocks: any[] = [];

    if (file) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = file.type || 'application/pdf';

      if (mimeType.startsWith('image/')) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: base64 },
        });
      } else if (mimeType === 'application/pdf') {
        contentBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        });
      } else {
        const text = buffer.toString('utf-8');
        contentBlocks.push({ type: 'text', text: `Document content:\n${text}` });
      }
    }

    if (textContent) {
      contentBlocks.push({ type: 'text', text: `Quote text:\n${textContent}` });
    }

    contentBlocks.push({
      type: 'text',
      text: `You are parsing a vendor price quote for the bid: "${bid.title}".
${bid.description ? `Bid description: ${bid.description}` : ''}

Extract the following from this vendor quote and return ONLY valid JSON (no markdown, no explanation):
{
  "vendor_name": "the vendor/company name",
  "proposals": [
    {
      "name": "option/proposal name (e.g. 'Model X - Basic')",
      "price": 12345.00,
      "specs": [
        { "key": "spec name (e.g. Brand)", "value": "spec value (e.g. Otis)" },
        { "key": "another spec", "value": "its value" }
      ]
    }
  ]
}

Rules:
- Extract ALL distinct options/proposals with their prices
- Extract ALL technical specifications, features, warranty, delivery time, etc. as specs
- If there's only one option, still wrap it in the proposals array
- Price should be a number (no currency symbols)
- If vendor name is not clear, use "Unknown Vendor"
- Be thorough - extract every spec/detail mentioned
- Return ONLY the JSON, nothing else`,
    });

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
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const aiText = aiData.content?.[0]?.text || '';

    let parsed;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: 'Could not parse AI response', raw: aiText }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: parsed });
  } catch (error) {
    console.error('Error parsing vendor quote:', error);
    return NextResponse.json({ error: 'Failed to parse quote' }, { status: 500 });
  }
}
