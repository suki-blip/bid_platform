import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params; // validate route param exists

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    const { specKeys } = await request.json();

    if (!specKeys || !Array.isArray(specKeys) || specKeys.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 spec keys to merge' }, { status: 400 });
    }

    const prompt = `You are analyzing technical specification field names from different vendors' bid proposals in a construction/procurement context.

Given this list of specification field names used by different vendors:
${JSON.stringify(specKeys)}

Identify groups of field names that refer to the SAME specification but are written differently.
For example: "Unit Count" and "Unit Number" likely mean the same thing. "Brand" and "Manufacturer" likely mean the same thing. "Warranty Period" and "Warranty (years)" likely mean the same thing.

Rules:
- Only group fields that clearly refer to the same concept
- Choose the clearest/most standard name as the canonical (primary) name for each group
- Don't force merges if fields are genuinely different
- Be conservative — only merge when confident they mean the same thing
- Consider Hebrew field names too (e.g. "יצרן" = "Manufacturer")

Return ONLY a valid JSON object with this format:
{
  "merges": {
    "alias_field_name": "canonical_field_name",
    "another_alias": "canonical_field_name"
  }
}

If no merges are found, return: {"merges": {}}
Return ONLY the JSON, no explanation.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ error: 'AI request failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '{}';

    // Extract JSON from response
    let merges: Record<string, string> = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        merges = parsed.merges || {};
      }
    } catch (e) {
      console.error('Failed to parse AI merge response:', text);
    }

    // Validate: all aliases and canonicals must be in the original specKeys
    const validMerges: Record<string, string> = {};
    for (const [alias, canonical] of Object.entries(merges)) {
      if (specKeys.includes(alias) && specKeys.includes(canonical) && alias !== canonical) {
        validMerges[alias] = canonical;
      }
    }

    return NextResponse.json({ merges: validMerges });
  } catch (error) {
    console.error('Auto-merge error:', error);
    return NextResponse.json({ error: 'Failed to auto-merge' }, { status: 500 });
  }
}
