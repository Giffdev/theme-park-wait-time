import { NextResponse } from 'next/server';

type Props = { params: Promise<{ parkId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { parkId } = await params;
  // Placeholder — will fetch schedule from Firestore
  return NextResponse.json({
    parkId,
    message: 'Park schedule API — coming soon',
    schedule: [],
  });
}
