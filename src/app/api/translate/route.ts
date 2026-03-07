import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['de-CH', 'de-DE', 'en', 'hr', 'sr', 'bs', 'sl', 'mk', 'sq', 'es', 'pt', 'fr', 'it'] as const;

const NEAR_AI_URL = 'https://cloud-api.near.ai/v1';
const NEAR_AI_KEY = process.env.NEAR_AI_API_KEY || 'sk-f8b3cad314574234b9ad8ac39cc5c016';

const localeNames: Record<string, string> = {
  'de-CH': 'German (Switzerland)',
  'de-DE': 'German (Germany)',
  'en': 'English',
  'hr': 'Croatian',
  'sr': 'Serbian (Latin script)',
  'bs': 'Bosnian',
  'sl': 'Slovenian',
  'mk': 'Macedonian (Cyrillic script)',
  'sq': 'Albanian',
  'es': 'Spanish',
  'pt': 'Brazilian Portuguese',
  'fr': 'French',
  'it': 'Italian',
};

async function translateBatch(labels: { id: string; label: string }[], targetLang: string): Promise<Record<string, string>> {
  const langName = localeNames[targetLang] || targetLang;
  const labelsText = labels.map((l, i) => `${i + 1}. ${l.label}`).join('\n');

  const response = await fetch(`${NEAR_AI_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NEAR_AI_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following facility management checklist items to ${langName}. Each item may be in a different language — auto-detect the language of EACH item individually and translate it to ${langName}. If an item is already in ${langName}, return it unchanged. Return ONLY the translations as a numbered list, one per line, matching the input numbering. No explanations.`,
        },
        {
          role: 'user',
          content: labelsText,
        },
      ],
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Near AI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // Parse numbered list response
  const lines = content.trim().split('\n');
  const result: Record<string, string> = {};

  for (let i = 0; i < labels.length; i++) {
    const line = lines[i]?.replace(/^\d+\.\s*/, '').trim();
    result[labels[i].id] = line || labels[i].label;
  }

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set() {},
          remove() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { items } = body as { items: { id: string; label: string }[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Items array is required' }, { status: 400 });
    }

    // Translate batch to all supported locales in parallel
    const translationPromises = SUPPORTED_LOCALES.map(async (locale) => {
      try {
        const result = await translateBatch(items, locale);
        return { locale, result };
      } catch {
        // Fallback: use original labels
        const fallback: Record<string, string> = {};
        items.forEach(item => { fallback[item.id] = item.label; });
        return { locale, result: fallback };
      }
    });

    const results = await Promise.all(translationPromises);

    // Restructure: { itemId: { locale: translation } }
    const translatedItems: Record<string, Record<string, string>> = {};
    for (const item of items) {
      translatedItems[item.id] = {};
    }
    for (const { locale, result } of results) {
      for (const item of items) {
        translatedItems[item.id][locale] = result[item.id] || item.label;
      }
    }

    return NextResponse.json({ translations: translatedItems });
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: error?.message || 'Translation failed' },
      { status: 500 }
    );
  }
}
