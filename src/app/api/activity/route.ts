import { NextResponse } from 'next/server';
import { db, dbReady } from '@/lib/db';
import { getContractorSession } from '@/lib/session';

export async function GET() {
  try {
    await dbReady();
    const client = db();
    const session = await getContractorSession();

    // Build activity from real data: recent responses, invitations, winners, reminders
    const activities: { icon: string; bg: string; color: string; text: string; time: string }[] = [];

    // Get owner's project IDs (or all if no session)
    let projectFilter = '1=1';
    const args: any[] = [];
    if (session) {
      projectFilter = '(p.owner_id = ? OR p.owner_id IS NULL)';
      args.push(session.userId);
    }

    // Recent vendor responses
    const responses = await client.execute({
      sql: `SELECT vr.vendor_name, vr.submitted_at, b.title
            FROM vendor_responses vr
            JOIN bids b ON b.id = vr.bid_id
            LEFT JOIN projects p ON p.id = b.project_id
            WHERE ${projectFilter}
            ORDER BY vr.submitted_at DESC LIMIT 5`,
      args,
    });

    for (const r of responses.rows) {
      activities.push({
        icon: '\uD83D\uDCE5',
        bg: 'var(--green-bg)',
        color: 'var(--green)',
        text: `<strong>${r.vendor_name}</strong> submitted a bid — ${r.title}`,
        time: timeAgo(r.submitted_at as string),
      });
    }

    // Recent winners
    const winners = await client.execute({
      sql: `SELECT v.name as vendor_name, bw.selected_at, b.title
            FROM bid_winners bw
            JOIN vendors v ON v.id = bw.vendor_id
            JOIN bids b ON b.id = bw.bid_id
            LEFT JOIN projects p ON p.id = b.project_id
            WHERE ${projectFilter}
            ORDER BY bw.selected_at DESC LIMIT 3`,
      args,
    });

    for (const w of winners.rows) {
      activities.push({
        icon: '\uD83C\uDFC6',
        bg: 'var(--gold-bg)',
        color: 'var(--gold)',
        text: `Winner selected: <strong>${w.vendor_name}</strong> — ${w.title}`,
        time: timeAgo(w.selected_at as string),
      });
    }

    // Recent invitations sent
    const invitations = await client.execute({
      sql: `SELECT COUNT(*) as cnt, bi.sent_at, b.title
            FROM bid_invitations bi
            JOIN bids b ON b.id = bi.bid_id
            LEFT JOIN projects p ON p.id = b.project_id
            WHERE ${projectFilter}
            GROUP BY bi.sent_at, b.title
            ORDER BY bi.sent_at DESC LIMIT 3`,
      args,
    });

    for (const inv of invitations.rows) {
      activities.push({
        icon: '\uD83D\uDCE8',
        bg: 'var(--blue-bg)',
        color: 'var(--blue)',
        text: `Bid request sent to <strong>${inv.cnt} vendors</strong> — ${inv.title}`,
        time: timeAgo(inv.sent_at as string),
      });
    }

    // Recent reminders
    const reminders = await client.execute({
      sql: `SELECT COUNT(*) as cnt, rl.sent_at, b.title
            FROM reminder_log rl
            JOIN bid_invitations bi ON bi.id = rl.bid_invitation_id
            JOIN bids b ON b.id = bi.bid_id
            LEFT JOIN projects p ON p.id = b.project_id
            WHERE ${projectFilter}
            GROUP BY rl.sent_at, b.title
            ORDER BY rl.sent_at DESC LIMIT 3`,
      args,
    });

    for (const rem of reminders.rows) {
      activities.push({
        icon: '\u23F0',
        bg: 'var(--red-bg)',
        color: 'var(--red)',
        text: `Auto-reminder sent to <strong>${rem.cnt} vendors</strong> — ${rem.title}`,
        time: timeAgo(rem.sent_at as string),
      });
    }

    // Sort by time (most recent first) and limit
    // Since timeAgo is relative, we can't sort by it easily - the queries are already sorted
    // Just interleave and take first 8
    const sorted = activities.slice(0, 8);

    // If no activity, return placeholder
    if (sorted.length === 0) {
      sorted.push({
        icon: '\uD83D\uDC4B',
        bg: 'var(--gold-bg)',
        color: 'var(--gold)',
        text: 'Welcome! Create your first bid request to see activity here.',
        time: 'Just now',
      });
    }

    return NextResponse.json(sorted);
  } catch (error) {
    console.error('Activity error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
}
