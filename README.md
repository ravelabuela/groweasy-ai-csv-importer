# GrowEasy AI CSV Importer

A full-stack assignment implementation for importing messy CSV lead exports into the GrowEasy CRM format.

## Features

- Next.js responsive frontend with drag-and-drop CSV upload.
- Client-side CSV preview before any AI processing.
- Explicit confirm step before the backend is called.
- Express API with CSV upload, parsing, AI batch extraction, validation, and skipped-record reporting.
- OpenAI integration when `OPENAI_API_KEY` is set.
- Deterministic heuristic fallback so reviewers can test the app without credentials.
- Dark mode, sticky table headers, scrollable tables, loading states, unit test coverage, and Docker setup.

## Tech Stack

- Frontend: Next.js, React, TypeScript, Papa Parse, lucide-react
- Backend: Node.js, Express, TypeScript, Multer, Papa Parse, Zod-ready validation structure
- AI: OpenAI Chat Completions API, with local fallback mapping

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs on `http://localhost:3000`.
The API runs on `http://localhost:4000`.

To use OpenAI extraction, set:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

Without `OPENAI_API_KEY`, the backend uses a heuristic extractor for local evaluation.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run test
```

## API

`POST /api/import`

Multipart form data:

- `file`: CSV file

Response:

```json
{
  "records": [],
  "skipped": [],
  "totalImported": 0,
  "totalSkipped": 0,
  "aiProvider": "openai"
}
```

## CRM Output Fields

`created_at`, `name`, `email`, `country_code`, `mobile_without_country_code`, `company`, `city`, `state`, `country`, `lead_owner`, `crm_status`, `crm_note`, `data_source`, `possession_time`, `description`

Allowed `crm_status` values:

- `GOOD_LEAD_FOLLOW_UP`
- `DID_NOT_CONNECT`
- `BAD_LEAD`
- `SALE_DONE`

Allowed `data_source` values:

- `leads_on_demand`
- `meridian_tower`
- `eden_park`
- `varah_swamy`
- `sarjapur_plots`

## Docker

```bash
docker build -t groweasy-csv-importer .
docker run --env-file .env -p 3000:3000 -p 4000:4000 groweasy-csv-importer
```

## Submission

Include the hosted app URL, GitHub repository URL, and the position being applied for in the email to `varun@groweasy.ai`.
