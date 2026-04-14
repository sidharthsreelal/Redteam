import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  const validUsername = process.env.AUTH_USERNAME || 'admin';
  const validPassword = process.env.AUTH_PASSWORD || 'redteam';

  if (username === validUsername && password === validPassword) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: 'ACCESS DENIED — invalid credentials' }, { status: 401 });
}
