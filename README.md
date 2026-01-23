# FacilityTrack

Mobile-first Zeit- & Problemerfassung app for Facility Management with Swiss German (de-CH) localization.

## Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **State Management**: Zustand + React Query
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Forms**: React Hook Form + Zod
- **i18n**: next-intl (de-CH)
- **PWA**: Service Worker + Manifest

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### 1. Clone and Install

```bash
cd facility-track
npm install
```

### 2. Setup Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the schema SQL in `supabase/schema.sql` in the SQL Editor
3. Create a storage bucket named `photos` and set it to public
4. Get your project URL and anon key from Settings > API

### 3. Configure Environment

Copy the example environment file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth routes (login)
│   ├── (app)/             # Protected app routes
│   └── api/               # API routes
├── components/            # React components
│   ├── ui/               # Base UI components
│   ├── layout/           # Layout components
│   ├── time-tracking/    # Time tracking components
│   ├── checklist/        # Checklist components
│   └── issues/           # Issue reporting components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and configuration
│   └── supabase/         # Supabase client setup
├── stores/               # Zustand stores
├── types/                # TypeScript types
└── messages/             # i18n translations
```

## Features

### Time Tracking
- Start/stop work days
- Track time at specific properties
- Pause/resume timer
- GPS location logging
- Offline support

### Checklist System
- Property-specific checklists
- Multiple item types (checkbox, text, number, photo)
- Drag-and-drop reordering
- Progress tracking

### Issue Reporting
- Photo capture and upload
- Category and priority selection
- Location auto-detection
- Status tracking

### Mobile-First Design
- Bottom navigation
- Large touch targets (64px+)
- Swipe gestures
- Pull-to-refresh
- Safe area support

### PWA Features
- Installable app
- Offline caching
- Push notifications
- Background sync

## Development

### Build for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Database Schema

See `supabase/schema.sql` for the complete database schema including:
- User profiles
- Properties with geofencing
- Work days and time entries
- Checklist templates and instances
- Issues with photo attachments
- Row Level Security policies

## Localization

The app is localized for Swiss German (de-CH) with:
- Swiss date formatting (dd.MM.yyyy)
- Swiss number formatting (1'234.56)
- Swiss currency (CHF)
- German UI text

## License

Private - All rights reserved
