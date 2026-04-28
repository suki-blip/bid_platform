import { NextResponse } from 'next/server';

// Not used — vendor preview is shown as an inline modal on the frontend
export async function POST() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
