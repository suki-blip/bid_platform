import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await dbReady();
    const { token } = await params;

    const result = await db().execute({
      sql: `SELECT bi.id as invitation_id, bi.status as invitation_status,
                   b.id as bid_id, b.title, b.description, b.deadline, b.status as bid_status,
                   b.checklist, b.allow_ve, b.bid_mode, b.suggested_specs,
                   v.name as vendor_name, v.password_hash
            FROM bid_invitations bi
            JOIN bids b ON b.id = bi.bid_id
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE bi.token = ?`,
      args: [token],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    const invitation = result.rows[0];

    if (invitation.invitation_status === 'submitted') {
      return NextResponse.json({ error: 'You have already submitted a response', submitted: true }, { status: 400 });
    }

    if (invitation.invitation_status === 'expired') {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    // Check deadline
    if (invitation.deadline && new Date(invitation.deadline as string) < new Date()) {
      return NextResponse.json({ error: 'Bid deadline has passed' }, { status: 410 });
    }

    if (invitation.bid_status !== 'active') {
      return NextResponse.json({ error: 'This bid is no longer accepting responses' }, { status: 410 });
    }

    // Mark as opened
    await db().execute({
      sql: "UPDATE bid_invitations SET status = 'opened', opened_at = datetime('now') WHERE id = ? AND status = 'pending'",
      args: [invitation.invitation_id as string],
    });

    // Fetch parameters
    const paramsResult = await db().execute({
      sql: 'SELECT * FROM bid_parameters WHERE bid_id = ? ORDER BY sort_order',
      args: [invitation.bid_id as string],
    });

    const parametersWithOptions = await Promise.all(
      paramsResult.rows.map(async (param) => {
        const optionsResult = await db().execute({
          sql: 'SELECT value FROM bid_parameter_options WHERE parameter_id = ? ORDER BY sort_order',
          args: [param.id as string],
        });
        return {
          name: param.name,
          is_track: Number(param.is_track) === 1,
          options: optionsResult.rows.map(o => o.value),
        };
      })
    );

    let checklist: { text: string; required: boolean }[] = [];
    try { checklist = JSON.parse((invitation.checklist as string) || '[]'); } catch {}

    let suggested_specs: string[] = [];
    try { suggested_specs = JSON.parse((invitation.suggested_specs as string) || '[]'); } catch {}

    return NextResponse.json({
      bid_id: invitation.bid_id,
      title: invitation.title,
      description: invitation.description,
      deadline: invitation.deadline,
      vendor_name: invitation.vendor_name,
      has_portal_account: !!invitation.password_hash,
      parameters: parametersWithOptions,
      checklist,
      suggested_specs,
      allow_ve: Number(invitation.allow_ve) === 1,
      bid_mode: (invitation.bid_mode as string) || 'structured',
    });
  } catch (error) {
    console.error('Error fetching bid for vendor:', error);
    return NextResponse.json({ error: 'Failed to load bid' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    await dbReady();
    const { token } = await params;

    // Look up invitation with bid and vendor
    const invResult = await db().execute({
      sql: `SELECT bi.*, b.deadline, b.status as bid_status, v.name as vendor_name, v.id as vid
            FROM bid_invitations bi
            JOIN bids b ON b.id = bi.bid_id
            JOIN vendors v ON v.id = bi.vendor_id
            WHERE bi.token = ?`,
      args: [token],
    });

    if (invResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
    }

    const invitation = invResult.rows[0];

    if (invitation.status === 'submitted') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 400 });
    }

    if (invitation.status === 'expired') {
      return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
    }

    if (invitation.deadline && new Date(invitation.deadline as string) < new Date()) {
      return NextResponse.json({ error: 'Bid deadline has passed' }, { status: 410 });
    }

    if (invitation.bid_status !== 'active') {
      return NextResponse.json({ error: 'Bid is not active' }, { status: 410 });
    }

    // Support both JSON and FormData (when files are attached)
    let body: any;
    let uploadedFiles: { name: string; data: ArrayBuffer }[] = [];
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const jsonStr = formData.get('json') as string;
      body = JSON.parse(jsonStr);
      // Collect files
      const files = formData.getAll('files');
      for (const f of files) {
        if (f instanceof File) {
          uploadedFiles.push({ name: f.name, data: await f.arrayBuffer() });
        }
      }
    } else {
      body = await request.json();
    }

    const { prices, pricing_mode, base_price, rules, checklist_answers, proposals, notes } = body;

    const responseId = crypto.randomUUID();

    // Check if this is an open proposal submission
    if (proposals && Array.isArray(proposals) && proposals.length > 0) {
      // Open proposal mode
      const statements: { sql: string; args: (string | number | null)[] }[] = [
        {
          sql: 'INSERT INTO vendor_responses (id, bid_id, vendor_name, vendor_id, pricing_mode, checklist_answers, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [responseId, invitation.bid_id as string, invitation.vendor_name as string, invitation.vid as string, 'open', checklist_answers ? JSON.stringify(checklist_answers) : '[]', notes || null],
        },
      ];

      for (let pi = 0; pi < proposals.length; pi++) {
        const prop = proposals[pi];
        const proposalId = crypto.randomUUID();
        statements.push({
          sql: 'INSERT INTO vendor_proposals (id, response_id, name, price, sort_order) VALUES (?, ?, ?, ?, ?)',
          args: [proposalId, responseId, prop.name || `Option ${pi + 1}`, prop.price, pi],
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
      }

      // Also save a flat price entry per proposal for backward compatibility
      for (let pi = 0; pi < proposals.length; pi++) {
        const prop = proposals[pi];
        statements.push({
          sql: 'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), responseId, JSON.stringify({ _proposal: prop.name || `Option ${pi + 1}` }), prop.price],
        });
      }

      statements.push({
        sql: "UPDATE bid_invitations SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?",
        args: [invitation.id as string],
      });

      await db().batch(statements, 'write');
    } else {
      // Structured mode (original behavior)
      if (!prices || !Array.isArray(prices) || prices.length === 0) {
        return NextResponse.json({ error: 'Missing required field: prices' }, { status: 400 });
      }

      const mode = pricing_mode === 'additive' ? 'additive' : 'combination';
      const rulesJson = mode === 'additive' && rules ? JSON.stringify(rules) : null;

      const statements: { sql: string; args: (string | number | null)[] }[] = [
        {
          sql: 'INSERT INTO vendor_responses (id, bid_id, vendor_name, vendor_id, pricing_mode, base_price, rules, checklist_answers, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [responseId, invitation.bid_id as string, invitation.vendor_name as string, invitation.vid as string, mode, mode === 'additive' ? base_price : null, rulesJson, checklist_answers ? JSON.stringify(checklist_answers) : '[]', notes || null],
        },
      ];

      for (const p of prices) {
        statements.push({
          sql: 'INSERT INTO vendor_prices (id, response_id, combination_key, price) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), responseId, p.combination_key, p.price],
        });
      }

      statements.push({
        sql: "UPDATE bid_invitations SET status = 'submitted', submitted_at = datetime('now') WHERE id = ?",
        args: [invitation.id as string],
      });

      await db().batch(statements, 'write');
    }

    // Save uploaded files
    if (uploadedFiles.length > 0) {
      for (const f of uploadedFiles) {
        await db().execute({
          sql: 'INSERT INTO vendor_response_files (id, response_id, filename, data) VALUES (?, ?, ?, ?)',
          args: [crypto.randomUUID(), responseId, f.name, Buffer.from(f.data)],
        });
      }
    }

    return NextResponse.json({ success: true, responseId }, { status: 201 });
  } catch (error) {
    console.error('Error submitting vendor response:', error);
    return NextResponse.json({ error: 'Failed to submit response' }, { status: 500 });
  }
}
