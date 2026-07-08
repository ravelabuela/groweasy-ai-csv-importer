import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { parseCsv } from "./csv.js";
import { extractWithAi } from "./openaiExtractor.js";
import { hasContact } from "./normalize.js";
import type { ImportResponse, SkippedRecord } from "./types.js";

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/import", upload.single("file"), async (request, response, next) => {
  try {
    if (!request.file) {
      response.status(400).json({ error: "CSV file is required under form field 'file'." });
      return;
    }

    const rows = parseCsv(request.file.buffer);
    const { provider, records } = await extractWithAi(rows);
    const skipped: SkippedRecord[] = [];
    const imported = records.filter((record, index) => {
      if (hasContact(record)) return true;
      skipped.push({
        index,
        reason: "Missing both email and mobile number",
        original: rows[index] ?? {}
      });
      return false;
    });

    const body: ImportResponse = {
      records: imported,
      skipped,
      totalImported: imported.length,
      totalSkipped: skipped.length,
      aiProvider: provider
    };

    response.json(body);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(400).json({ error: message });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`GrowEasy CSV importer API running on http://localhost:${port}`);
});
