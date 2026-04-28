import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

// Allow up to 120 seconds for AI processing of multiple files
export const maxDuration = 120;

// POST: Parse vendor quote(s) and auto-detect trade category
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: projectId } = await params;

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI not configured. Add ANTHROPIC_API_KEY.' }, { status: 500 });
    }

    // Verify project
    const projResult = await db().execute({
      sql: 'SELECT id, name FROM projects WHERE id = ?',
      args: [projectId],
    });
    if (projResult.rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get project's existing categories
    const catResult = await db().execute({
      sql: `SELECT pc.category_id, tc.name, tc.grp
            FROM project_categories pc
            JOIN trade_categories tc ON tc.id = pc.category_id
            WHERE pc.project_id = ?`,
      args: [projectId],
    });
    const projectCategories = catResult.rows.map(r => ({
      id: r.category_id as string,
      name: r.name as string,
      grp: r.grp as string,
    }));

    // Get ALL trade categories for matching
    const allCatsResult = await db().execute({ sql: 'SELECT id, name, grp FROM trade_categories ORDER BY name' });
    const allCategories = allCatsResult.rows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      grp: r.grp as string,
    }));

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const textContent = formData.get('text') as string | null;

    if (files.length === 0 && !textContent) {
      return NextResponse.json({ error: 'Upload files or paste text' }, { status: 400 });
    }

    // Process each file (or text) independently
    const results: any[] = [];

    const itemsToProcess: { contentBlocks: any[]; fileName: string }[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = file.type || 'application/pdf';
      const blocks: any[] = [];

      if (mimeType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } });
      } else if (mimeType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
      } else {
        blocks.push({ type: 'text', text: `Document content:\n${buffer.toString('utf-8')}` });
      }

      itemsToProcess.push({ contentBlocks: blocks, fileName: file.name });
    }

    if (textContent && files.length === 0) {
      itemsToProcess.push({
        contentBlocks: [{ type: 'text', text: `Quote text:\n${textContent}` }],
        fileName: 'Pasted text',
      });
    }

    const categoryListStr = allCategories.map(c => `${c.name} (${c.grp})`).join(', ');
    const projectCatListStr = projectCategories.map(c => c.name).join(', ');

    // Process files in parallel batches of 5 for speed
    const BATCH_SIZE = 5;
    for (let batchStart = 0; batchStart < itemsToProcess.length; batchStart += BATCH_SIZE) {
      const batch = itemsToProcess.slice(batchStart, batchStart + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (item) => {
        // Extract folder/vendor hint from filename like "[FolderName] file.pdf"
        const folderMatch = item.fileName.match(/^\[([^\]]+)\]\s*/);
        const folderHint = folderMatch ? folderMatch[1] : null;

        const promptBlocks = [
          ...item.contentBlocks,
          {
            type: 'text',
            text: `You are parsing a vendor price quote for a construction project.
File name: ${item.fileName}
${folderHint ? `Folder name (hint — may indicate vendor name or trade): ${folderHint}` : ''}

Available trade categories: ${categoryListStr}
Project's current categories: ${projectCatListStr || 'None yet'}

Extract the following and return ONLY valid JSON (no markdown):
{
  "vendor_name": "vendor/company name",
  "trade_category": "best matching category name from the list above",
  "trade_category_new": null,
  "proposals": [
    {
      "name": "option name",
      "price": 12345.00,
      "specs": [
        { "key": "spec name", "value": "spec value" }
      ]
    }
  ]
}

Rules:
- IMPORTANT: Detect "trade_category" primarily from the DOCUMENT CONTENT — look at what products/services are being quoted (e.g. electrical work, plumbing, HVAC, flooring, painting, elevators, etc.)
- The folder name is just a hint — the document content is the primary source for determining the trade category
- "trade_category": Pick the BEST match from the available categories list. Use exact name from the list.
- If NO category matches well, set "trade_category" to null and "trade_category_new" to a suggested Hebrew category name that describes the trade/work type
- Extract ALL options/proposals with prices
- Extract ALL specs (brand, model, warranty, delivery, features, etc.)
- Price = number only (no currency symbols)
- If vendor name is in the document, use it. If folder name looks like a company name, use that. Otherwise "Unknown Vendor"
- Return ONLY JSON`,
          },
        ];

        try {
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
              messages: [{ role: 'user', content: promptBlocks }],
            }),
          });

          if (!aiRes.ok) {
            return { fileName: item.fileName, error: 'AI parsing failed', data: null };
          }

          const aiData = await aiRes.json();
          const aiText = aiData.content?.[0]?.text || '';

          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            return { fileName: item.fileName, error: 'Could not parse response', data: null };
          }

          const parsed = JSON.parse(jsonMatch[0]);

          let matchedCategory = null;
          if (parsed.trade_category) {
            matchedCategory = allCategories.find(c =>
              c.name.toLowerCase() === parsed.trade_category.toLowerCase()
            );
            if (!matchedCategory) {
              matchedCategory = allCategories.find(c =>
                c.name.toLowerCase().includes(parsed.trade_category.toLowerCase()) ||
                parsed.trade_category.toLowerCase().includes(c.name.toLowerCase())
              );
            }
          }

          const inProject = matchedCategory
            ? projectCategories.some(pc => pc.id === matchedCategory!.id)
            : false;

          return {
            fileName: item.fileName,
            error: null,
            data: {
              vendor_name: parsed.vendor_name || 'Unknown Vendor',
              proposals: (parsed.proposals || []).map((p: any) => ({
                name: p.name || '',
                price: String(p.price || ''),
                specs: (p.specs || []).map((s: any) => ({ key: s.key || '', value: s.value || '' })),
              })),
              detected_category: matchedCategory ? matchedCategory.name : (parsed.trade_category_new || parsed.trade_category || null),
              matched_category_id: matchedCategory?.id || null,
              category_in_project: inProject,
              suggested_new_category: !matchedCategory ? (parsed.trade_category_new || parsed.trade_category || null) : null,
            },
          };
        } catch (err) {
          return { fileName: item.fileName, error: 'Processing failed', data: null };
        }
      }));

      results.push(...batchResults);
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error in smart parse:', error);
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }
}

// PUT: Save parsed results — create categories, bids, responses as needed
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbReady();
    const { id: projectId } = await params;
    const body = await request.json();
    const { items } = body; // Array of { vendor_name, proposals, category_id, new_category_name }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items to save' }, { status: 400 });
    }

    const saved: { vendor_name: string; category: string; responseId: string }[] = [];

    for (const item of items) {
      let categoryId = item.category_id;

      // Create new category if needed
      if (!categoryId && item.new_category_name) {
        const newCatId = crypto.randomUUID();
        try {
          await db().execute({
            sql: 'INSERT INTO trade_categories (id, name, grp) VALUES (?, ?, ?)',
            args: [newCatId, item.new_category_name, item.new_category_grp || 'Other'],
          });
          categoryId = newCatId;
        } catch {
          // Category might already exist
          const existing = await db().execute({
            sql: 'SELECT id FROM trade_categories WHERE name = ?',
            args: [item.new_category_name],
          });
          if (existing.rows.length > 0) categoryId = existing.rows[0].id as string;
          else continue;
        }
      }

      if (!categoryId) continue;

      // Ensure category is in project
      const pcCheck = await db().execute({
        sql: 'SELECT id FROM project_categories WHERE project_id = ? AND category_id = ?',
        args: [projectId, categoryId],
      });
      if (pcCheck.rows.length === 0) {
        await db().execute({
          sql: 'INSERT INTO project_categories (id, project_id, category_id) VALUES (?, ?, ?)',
          args: [crypto.randomUUID(), projectId, categoryId],
        });
      }

      // Find or create a bid for this category in this project
      let bidId: string | null = null;
      const bidResult = await db().execute({
        sql: "SELECT id FROM bids WHERE project_id = ? AND trade_category_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 1",
        args: [projectId, categoryId],
      });

      if (bidResult.rows.length > 0) {
        bidId = bidResult.rows[0].id as string;
      } else {
        // Create a new open-mode bid
        bidId = crypto.randomUUID();
        const catName = await db().execute({ sql: 'SELECT name FROM trade_categories WHERE id = ?', args: [categoryId] });
        const catNameStr = catName.rows[0]?.name as string || 'Bid';
        const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        await db().execute({
          sql: "INSERT INTO bids (id, title, description, deadline, status, project_id, trade_category_id, bid_mode) VALUES (?, ?, ?, ?, 'active', ?, ?, 'open')",
          args: [bidId, catNameStr, `Bid for ${catNameStr}`, deadline, projectId, categoryId],
        });
      }

      // Create vendor response
      const responseId = crypto.randomUUID();
      const statements: { sql: string; args: (string | number | null)[] }[] = [];

      statements.push({
        sql: 'INSERT INTO vendor_responses (id, bid_id, vendor_name, pricing_mode) VALUES (?, ?, ?, ?)',
        args: [responseId, bidId, item.vendor_name, 'open'],
      });

      if (item.proposals && Array.isArray(item.proposals)) {
        for (let pi = 0; pi < item.proposals.length; pi++) {
          const prop = item.proposals[pi];
          const proposalId = crypto.randomUUID();
          statements.push({
            sql: 'INSERT INTO vendor_proposals (id, response_id, name, price, sort_order) VALUES (?, ?, ?, ?, ?)',
            args: [proposalId, responseId, prop.name || `Option ${pi + 1}`, parseFloat(prop.price) || 0, pi],
          });

          if (prop.specs && Array.isArray(prop.specs)) {
            for (let si = 0; si < prop.specs.length; si++) {
              const spec = prop.specs[si];
              if (spec.key && spec.value) {
                statements.push({
                  sql: 'INSERT INTO vendor_proposal_specs (id, proposal_id, spec_key, spec_value, sort_order) VALUES (?, ?, ?, ?, ?)',
                  args: [crypto.randomUUID(), proposalId, spec.key, spec.value, si],
                });
              }
            }
          }

          statements.push({
            sql: 'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)',
            args: [crypto.randomUUID(), responseId, JSON.stringify({ _proposal: prop.name || `Option ${pi + 1}` }), parseFloat(prop.price) || 0],
          });
        }
      }

      await db().batch(statements, 'write');

      const catNameRes = await db().execute({ sql: 'SELECT name FROM trade_categories WHERE id = ?', args: [categoryId] });
      saved.push({
        vendor_name: item.vendor_name,
        category: catNameRes.rows[0]?.name as string || 'Unknown',
        responseId,
      });
    }

    return NextResponse.json({ success: true, saved });
  } catch (error) {
    console.error('Error saving smart parse results:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
