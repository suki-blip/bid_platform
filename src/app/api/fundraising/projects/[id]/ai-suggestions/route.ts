import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';

interface SuggestedDonor {
  donor_id: string;
  rank: number;
  reasoning: string;
  estimated_amount: number;
}

interface ClaudeResponse {
  suggestions: Array<{ donor_id: string; rank: number; reasoning: string; estimated_amount: number }>;
  summary: string;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Manager only' }, { status: 403 });
  await dbReady();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI suggestions are not configured. Set ANTHROPIC_API_KEY in environment.' },
      { status: 503 },
    );
  }

  const { id: projectId } = await params;

  const projectRes = await db().execute({
    sql: 'SELECT * FROM fr_projects WHERE id = ? AND owner_id = ?',
    args: [projectId, session.ownerId],
  });
  const project = projectRes.rows[0];
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Pull all donors with the data Claude can use to rank.
  const donorsRes = await db().execute({
    sql: `SELECT d.id, d.first_name, d.last_name, d.organization, d.occupation, d.tags,
                 d.financial_rating, d.giving_rating, d.total_paid, d.total_pledged,
                 d.notes, d.source_notes, s.name AS source_name,
                 (SELECT GROUP_CONCAT(prj.name, ' | ')
                    FROM fr_pledges pl
                    LEFT JOIN fr_projects prj ON prj.id = pl.project_id
                    WHERE pl.donor_id = d.id AND prj.name IS NOT NULL) AS prior_projects
          FROM fr_donors d
          LEFT JOIN fr_sources s ON s.id = d.source_id
          WHERE d.owner_id = ? AND d.do_not_contact = 0
          ORDER BY d.total_paid DESC, d.financial_rating DESC NULLS LAST
          LIMIT 200`,
    args: [session.ownerId],
  });

  if (donorsRes.rows.length === 0) {
    return NextResponse.json({
      suggestions: [],
      summary: 'No donors in your database yet. Add donors first to get AI-powered suggestions.',
    });
  }

  // Build a compact donor list for Claude. Only include relevant fields, drop nulls.
  const donorPayload = donorsRes.rows.map((d) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(String(d.tags || '[]'));
    } catch {}
    const obj: Record<string, unknown> = {
      id: String(d.id),
      name: `${d.first_name}${d.last_name ? ' ' + d.last_name : ''}`,
    };
    if (d.organization) obj.organization = d.organization;
    if (d.occupation) obj.occupation = d.occupation;
    if (tags.length > 0) obj.tags = tags;
    if (d.financial_rating != null) obj.financial_rating = Number(d.financial_rating);
    if (d.giving_rating != null) obj.giving_rating = Number(d.giving_rating);
    if (d.total_paid && Number(d.total_paid) > 0) obj.lifetime_paid = Number(d.total_paid);
    if (d.total_pledged && Number(d.total_pledged) > 0) obj.lifetime_pledged = Number(d.total_pledged);
    if (d.source_name) obj.source = d.source_name;
    if (d.notes) obj.notes = String(d.notes).slice(0, 250);
    if (d.prior_projects) obj.prior_projects = String(d.prior_projects);
    return obj;
  });

  const projectInfo = {
    name: String(project.name),
    description: project.description ? String(project.description) : undefined,
    goal_amount: project.goal_amount ? Number(project.goal_amount) : undefined,
    currency: String(project.currency || 'USD'),
  };

  const prompt = `You are an expert fundraising strategist for a Jewish nonprofit. Given a fundraising project and a list of potential donors, identify the 10-15 donors most likely to give to THIS specific project, ranked by likelihood and estimated gift size.

PROJECT:
${JSON.stringify(projectInfo, null, 2)}

POTENTIAL DONORS (${donorPayload.length} total):
${JSON.stringify(donorPayload, null, 2)}

Consider:
- The donor's financial capacity rating (1-5, higher = wealthier)
- The donor's giving rating (1-5, higher = generous in practice)
- Their lifetime giving history
- Whether their tags, occupation, organization, or notes suggest alignment with the project's purpose
- Whether they've previously supported similar projects (prior_projects)
- Match the project's goal amount when estimating gift sizes — distribute realistic amounts that, in aggregate, could plausibly hit the goal

Return STRICT JSON only — no prose, no markdown, no code fences. Schema:
{
  "suggestions": [
    {
      "donor_id": "<id from input>",
      "rank": <1-15>,
      "reasoning": "<one short sentence (15-25 words) explaining why this donor is a good match>",
      "estimated_amount": <number in same currency as project, no commas>
    }
  ],
  "summary": "<one short paragraph (40-70 words) summarizing your strategy and confidence level>"
}`;

  const client = new Anthropic({ apiKey });
  let parsed: ClaudeResponse;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI returned no text' }, { status: 500 });
    }

    let raw = textBlock.text.trim();
    // Strip code fences if Claude added them despite instructions
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('AI suggestions error:', e);
    return NextResponse.json({ error: 'AI failed to generate suggestions' }, { status: 500 });
  }

  // Hydrate suggestions with donor display info from our DB.
  const donorById = new Map(
    donorsRes.rows.map((d) => [
      String(d.id),
      {
        id: String(d.id),
        name: `${d.first_name}${d.last_name ? ' ' + d.last_name : ''}`,
        organization: d.organization ? String(d.organization) : null,
        total_paid: Number(d.total_paid || 0),
        financial_rating: d.financial_rating != null ? Number(d.financial_rating) : null,
        giving_rating: d.giving_rating != null ? Number(d.giving_rating) : null,
      },
    ]),
  );

  const enriched = (parsed.suggestions || [])
    .map((s: SuggestedDonor) => {
      const donor = donorById.get(s.donor_id);
      if (!donor) return null;
      return {
        ...donor,
        rank: s.rank,
        reasoning: s.reasoning,
        estimated_amount: s.estimated_amount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a!.rank - b!.rank));

  return NextResponse.json({
    suggestions: enriched,
    summary: parsed.summary || '',
    project: { id: projectId, name: project.name },
    total_estimate: enriched.reduce((sum, s) => sum + (s!.estimated_amount || 0), 0),
  });
}
