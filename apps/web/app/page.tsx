"use client";

import { AlertCircle, CheckCircle2, FileUp, Loader2, Moon, RefreshCw, UploadCloud } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";

type CsvRow = Record<string, string>;

type CrmRecord = {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: string;
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
};

type ImportResponse = {
  records: CrmRecord[];
  skipped: { index: number; reason: string; original: CsvRow }[];
  totalImported: number;
  totalSkipped: number;
  aiProvider: "openai" | "heuristic";
};

const crmColumns: (keyof CrmRecord)[] = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description"
];

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importMessage, setImportMessage] = useState("Waiting for confirmation");
  const [darkMode, setDarkMode] = useState(false);

  const previewRows = useMemo(() => rows.slice(0, 100), [rows]);

  function reset() {
    setFile(null);
    setRows([]);
    setHeaders([]);
    setResult(null);
    setError("");
    setImportProgress(0);
    setImportMessage("Waiting for confirmation");
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(nextFile: File | undefined) {
    if (!nextFile) return;
    setError("");
    setResult(null);

    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a valid CSV file.");
      return;
    }

    Papa.parse<CsvRow>(nextFile, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
      transform: (value) => String(value ?? "").trim(),
      complete: (parsed) => {
        if (parsed.errors.length) {
          setError(parsed.errors[0].message);
          return;
        }

        const cleanRows = parsed.data.filter((row) => Object.values(row).some(Boolean));
        if (!cleanRows.length) {
          setError("CSV file does not contain any data rows.");
          return;
        }

        setFile(nextFile);
        setRows(cleanRows);
        setHeaders(parsed.meta.fields ?? Object.keys(cleanRows[0] ?? {}));
      }
    });
  }

  async function confirmImport() {
    if (!file) return;
    setIsImporting(true);
    setImportProgress(12);
    setImportMessage("Uploading CSV to API");
    setError("");

    const body = new FormData();
    body.append("file", file);

    let progressTimer: number | undefined;

    try {
      progressTimer = window.setInterval(() => {
        setImportProgress((value) => Math.min(value + 8, 88));
        setImportMessage((message) => (message === "Uploading CSV to API" ? "AI mapping records in batches" : "Validating CRM output"));
      }, 700);

      const response = await fetch(`${apiUrl}/api/import`, {
        method: "POST",
        body
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Import failed");
      setImportProgress(100);
      setImportMessage("Import complete");
      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
      setIsImporting(false);
    }
  }

  return (
    <main className={darkMode ? "shell dark" : "shell"}>
      <section className="topbar">
        <div>
          <p className="eyebrow">GrowEasy Assignment</p>
          <h1>AI CSV Importer</h1>
        </div>
        <div className="actions">
          <button className="iconButton" type="button" onClick={() => setDarkMode((value) => !value)} title="Toggle dark mode">
            <Moon size={18} />
          </button>
          <button className="iconButton" type="button" onClick={reset} title="Start over">
            <RefreshCw size={18} />
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="uploadPanel">
          <div
            className={isDragging ? "dropzone dragging" : "dropzone"}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFile(event.dataTransfer.files[0]);
            }}
          >
            <UploadCloud size={36} />
            <h2>Upload CSV</h2>
            <p>{file ? file.name : "Drop a CSV export here or choose one from your computer."}</p>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={(event) => handleFile(event.target.files?.[0])} />
            <button className="secondaryButton" type="button" onClick={() => inputRef.current?.click()}>
              <FileUp size={18} />
              Choose CSV
            </button>
          </div>

          <div className="stats">
            <Metric label="Rows detected" value={rows.length.toString()} />
            <Metric label="Columns detected" value={headers.length.toString()} />
            <Metric label="AI provider" value={result?.aiProvider ?? "Pending"} />
          </div>

          <button className="primaryButton" type="button" disabled={!file || !rows.length || isImporting} onClick={confirmImport}>
            {isImporting ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
            Confirm Import
          </button>

          {(isImporting || result) && (
            <div className="progressBlock" aria-live="polite">
              <div className="progressMeta">
                <span>{importMessage}</span>
                <strong>{importProgress}%</strong>
              </div>
              <div className="progressTrack">
                <span style={{ width: `${importProgress}%` }} />
              </div>
            </div>
          )}
        </aside>

        <section className="tables">
          {error ? (
            <div className="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          ) : null}

          <Table title="Uploaded CSV Preview" subtitle={rows.length ? `Showing ${previewRows.length} of ${rows.length} rows. AI has not processed this data yet.` : "Upload a CSV to inspect its rows before confirming."} columns={headers} rows={previewRows} />

          {result ? (
            <>
              <div className="summaryGrid">
                <Metric label="Total imported" value={result.totalImported.toString()} tone="green" />
                <Metric label="Total skipped" value={result.totalSkipped.toString()} tone="amber" />
                <Metric label="Parsed records" value={result.records.length.toString()} />
              </div>

              <Table title="GrowEasy CRM Records" subtitle="AI-normalized output ready for CRM import." columns={crmColumns} rows={result.records} />

              <Table title="Skipped Records" subtitle="Rows without email or mobile number." columns={["index", "reason", "original"]} rows={result.skipped.map((item) => ({ index: String(item.index + 1), reason: item.reason, original: JSON.stringify(item.original) }))} />
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Table<T extends Record<string, unknown>>({
  title,
  subtitle,
  columns,
  rows
}: {
  title: string;
  subtitle: string;
  columns: readonly string[];
  rows: T[];
}) {
  return (
    <section className="tableBlock">
      <div className="tableHeader">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span>{rows.length} rows</span>
      </div>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td key={column}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="emptyCell">
                  No rows to display
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
