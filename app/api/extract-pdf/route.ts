import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export async function POST(request: NextRequest) {
  try {
    const { fileBuffer, fileName } = await request.json();

    if (!fileBuffer) {
      return NextResponse.json({ error: 'fileBuffer is required' }, { status: 400 });
    }

    const buffer = Buffer.from(fileBuffer, 'base64');
    const pdfData = await pdfParse(buffer);

    return NextResponse.json({
      success: true,
      fileName,
      pages: pdfData.numpages,
      text: pdfData.text,
      metadata: pdfData.info,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('PDF extraction error:', message);
    return NextResponse.json({ error: `PDF extraction failed: ${message}` }, { status: 500 });
  }
}
