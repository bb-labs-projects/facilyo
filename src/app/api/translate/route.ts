import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'hr', 'sr', 'bs', 'sl', 'mk', 'sq', 'es', 'pt'] as const;

// Map our locale codes to MyMemory API language codes
const localeToLangCode: Record<string, string> = {
  'en': 'en',
  'hr': 'hr',
  'sr': 'sr-Latn',
  'bs': 'bs',
  'sl': 'sl',
  'mk': 'mk',
  'sq': 'sq',
  'es': 'es',
  'pt': 'pt',
};

async function translateText(text: string, targetLang: string): Promise<string> {
  const langCode = localeToLangCode[targetLang] || targetLang;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=de|${langCode}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Translation API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.responseStatus === 200 && data.responseData?.translatedText) {
    let translated = data.responseData.translatedText;
    // MyMemory sometimes returns all-caps for short text, keep original casing
    if (translated === translated.toUpperCase() && text !== text.toUpperCase()) {
      translated = translated.charAt(0).toUpperCase() + translated.slice(1).toLowerCase();
    }
    return translated;
  }

  throw new Error('Translation failed');
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const cookieStore = await cookies();
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

    // Translate each item to all supported locales
    const translatedItems: Record<string, Record<string, string>> = {};

    for (const item of items) {
      const translations: Record<string, string> = {};

      for (const locale of SUPPORTED_LOCALES) {
        try {
          translations[locale] = await translateText(item.label, locale);
        } catch {
          // If translation fails for a locale, use the original label
          translations[locale] = item.label;
        }
      }

      translatedItems[item.id] = translations;
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
