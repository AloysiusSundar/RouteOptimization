import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is not configured in .env.local' }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `
      You are an expert travel assistant. Extract structured itinerary data from the user's text.
      Return ONLY a JSON object. Do not include markdown formatting or extra text.
      
      Current date: ${today}
      
      Rules:
      1. IDENTIFY THE BASE CITY/REGION (e.g., New York, Tokyo, London).
      2. IDENTIFY THE STAY LOCATION / HOTEL (e.g. "Hilton", "staying at my friend's place in Shinjuku").
      3. APPEND THE BASE CITY NAME TO EVERY PLACE NAME and the STAY LOCATION (e.g. "Met Museum" -> "Met Museum, NYC"). This is CRITICAL for geocoding accuracy.
      4. If the user mentions "tomorrow", "next week", etc., calculate based on ${today}.
      5. Durations should be in minutes (default 60 if not specified).
      6. isReservation should be true ONLY if they clearly mention a booking, reservation, or fixed time.
      7. If reservationTime is mentioned, format as HH:MM.
      8. Output Schema:
      {
        "startDate": "YYYY-MM-DD",
        "days": number,
        "baseCity": "string",
        "stayLocation": "string",
        "places": [
          { "name": "string", "duration": number, "isReservation": boolean, "reservationDate": "YYYY-MM-DD", "reservationTime": "HH:MM" }
        ]
      }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${systemPrompt}\n\nUser text: ${prompt}` }]
        }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const resultText = data.candidates[0].content.parts[0].text;
    const resultJson = JSON.parse(resultText.replace(/```json/g, '').replace(/```/g, '').trim());

    return NextResponse.json(resultJson);
  } catch (err: any) {
    console.error('AI Parsing failed:', err);
    return NextResponse.json({ error: err.message || 'AI extraction failed. Try a different prompt.' }, { status: 500 });
  }
}
