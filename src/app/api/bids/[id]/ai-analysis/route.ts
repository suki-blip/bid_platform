import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: bidId } = await params;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 });
    }

    // Fetch bid details
    const bidResult = await db().execute({
      sql: 'SELECT * FROM bids WHERE id = ?',
      args: [bidId],
    });
    const bid = bidResult.rows[0];
    if (!bid) return NextResponse.json({ error: 'Bid not found' }, { status: 404 });

    // Fetch all responses with proposals and specs
    const responsesResult = await db().execute({
      sql: 'SELECT * FROM vendor_responses WHERE bid_id = ? ORDER BY submitted_at',
      args: [bidId],
    });

    const vendorData: any[] = [];
    for (const resp of responsesResult.rows) {
      const propsResult = await db().execute({
        sql: 'SELECT * FROM vendor_proposals WHERE response_id = ? ORDER BY sort_order',
        args: [resp.id as string],
      });

      const proposals: any[] = [];
      for (const prop of propsResult.rows) {
        const specsResult = await db().execute({
          sql: 'SELECT * FROM vendor_proposal_specs WHERE proposal_id = ? ORDER BY sort_order',
          args: [prop.id as string],
        });
        proposals.push({
          name: prop.name,
          price: prop.price,
          specs: specsResult.rows.map(s => ({ key: s.spec_key, value: s.spec_value })),
        });
      }

      // Also get structured prices if any
      const pricesResult = await db().execute({
        sql: 'SELECT * FROM vendor_prices WHERE response_id = ?',
        args: [resp.id as string],
      });

      vendorData.push({
        vendor_name: resp.vendor_name,
        notes: resp.notes || '',
        proposals,
        prices: pricesResult.rows.map(p => ({ combination: p.combination_key, price: p.price })),
      });
    }

    if (vendorData.length < 1) {
      return NextResponse.json({ error: 'No vendor responses to analyze' }, { status: 400 });
    }

    // Fetch checklist
    let checklist: { text: string; required: boolean }[] = [];
    try { checklist = JSON.parse((bid.checklist as string) || '[]'); } catch {}

    // Fetch parameters
    const paramsResult = await db().execute({
      sql: 'SELECT * FROM bid_parameters WHERE bid_id = ? ORDER BY sort_order',
      args: [bidId],
    });

    const bidParams: any[] = [];
    for (const param of paramsResult.rows) {
      const optsResult = await db().execute({
        sql: 'SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order',
        args: [param.id as string],
      });
      bidParams.push({
        name: param.name,
        options: optsResult.rows.map(o => o.value),
      });
    }

    // Build detailed prompt
    const prompt = `You are a construction procurement expert analyzing vendor bid responses. Your job is to help the contractor understand, compare, and evaluate the quotes they received.

## Bid Details
- **Title:** ${bid.title}
- **Description:** ${bid.description}
${bidParams.length > 0 ? `- **Parameters:** ${bidParams.map(p => `${p.name} (${p.options.join(', ')})`).join('; ')}` : ''}
${checklist.length > 0 ? `- **Required checklist:** ${checklist.map(c => `${c.text}${c.required ? ' (required)' : ' (optional)'}`).join('; ')}` : ''}

## Vendor Responses
${vendorData.map((v, i) => `
### Vendor ${i + 1}: ${v.vendor_name}
${v.proposals.length > 0 ? v.proposals.map((p: any) => `
**Option: ${p.name}** — Price: $${Number(p.price).toLocaleString()}
${p.specs.length > 0 ? 'Specs:\n' + p.specs.map((s: any) => `  - ${s.key}: ${s.value}`).join('\n') : 'No specs provided'}
`).join('\n') : ''}
${v.prices.length > 0 ? `Structured Prices:\n${v.prices.map((p: any) => `  - ${p.combination}: $${Number(p.price).toLocaleString()}`).join('\n')}` : ''}
${v.notes ? `Notes: ${v.notes}` : ''}
`).join('\n')}

## Your Analysis Task

Provide a comprehensive analysis in the following JSON format:
{
  "summary": "2-3 sentence overview of the bidding situation",
  "price_comparison": {
    "cheapest": "vendor name",
    "most_expensive": "vendor name",
    "price_range": "brief description of the price spread",
    "price_notes": "any notable observations about pricing patterns"
  },
  "vendor_analyses": [
    {
      "vendor_name": "name",
      "strengths": ["list of strengths"],
      "concerns": ["list of concerns or red flags"],
      "missing_info": ["specific information that is missing or unclear"],
      "questions_to_ask": ["specific questions the contractor should ask this vendor to clarify their quote"]
    }
  ],
  "spec_comparison": [
    {
      "spec_name": "normalized spec name",
      "values": {"vendor1": "value", "vendor2": "value"},
      "note": "analysis of differences if any"
    }
  ],
  "recommendation": "overall recommendation for the contractor - who seems best value, what to verify before deciding",
  "risk_flags": ["any potential risks or things to watch out for across all quotes"]
}

Important guidelines:
- Be specific and actionable — general advice is not helpful
- Flag price discrepancies that seem unusual (too low could mean cutting corners, too high could mean padding)
- Identify what each vendor includes vs excludes
- Note any hidden conditions, exclusions, or assumptions
- If specs use different terminology for the same thing, normalize and compare them
- Generate specific, targeted questions (not generic ones) that will help the contractor get missing information
- Consider Hebrew text if present — translate and analyze it properly
- Focus on what matters for making a decision

Return ONLY the JSON, no additional text.`;

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '{}';

    let analysis: any = {};
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Failed to parse AI analysis:', text);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('AI analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
