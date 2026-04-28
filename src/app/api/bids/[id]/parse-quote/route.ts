import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

// POST: Parse a vendor quote document using AI
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: bidId } = await params;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI parsing not configured. Add ANTHROPIC_API_KEY to environment.' }, { status: 500 });
    }

    // Verify bid exists
    const bidResult = await db().execute({
      sql: 'SELECT id, title, description FROM bids WHERE id = ?',
      args: [bidId],
    });
    if (bidResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    const bid = bidResult.rows[0];

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const textContent = formData.get('text') as string | null;

    if (!file && !textContent) {
      return NextResponse.json({ error: 'Upload a file or paste text' }, { status: 400 });
    }

    let contentBlocks: any[] = [];

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
        // Try as text
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
      const errData = await aiRes.json().catch(() => ({}));
      console.error('AI API error:', errData);
      return NextResponse.json({ error: 'AI parsing failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const aiText = aiData.content?.[0]?.text || '';

    // Parse JSON from AI response
    let parsed;
    try {
      // Try to extract JSON from the response (in case AI wraps it)
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({
        error: 'Could not parse AI response',
        raw: aiText,
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error) {
    console.error('Error parsing quote:', error);
    return NextResponse.json({ error: 'Failed to parse quote' }, { status: 500 });
  }
}
