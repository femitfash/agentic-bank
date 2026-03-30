"use client";

import { useState, useMemo } from "react";

const TRANSACTION_FIELDS = [
  { key: "type", label: "type", required: true },
  { key: "amount", label: "amount", required: true },
  { key: "description", label: "description" },
  { key: "created_at", label: "created_at" },
  { key: "status", label: "status" },
  { key: "transaction_id", label: "transaction_id" },
  { key: "account_id", label: "account_id" },
  { key: "counterparty_account_id", label: "counterparty_account_id" },
  { key: "balance_before", label: "balance_before" },
  { key: "balance_after", label: "balance_after" },
  { key: "metadata", label: "metadata" },
];

const FIELD_KEYS = TRANSACTION_FIELDS.map((f) => f.key);

interface ColumnMapperProps {
  open: boolean;
  filename: string;
  rawContent: string;
  accountId: string;
  onClose: () => void;
  onUploadComplete: (message: string) => void;
  onError: (error: string) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PiiDetection { entity_type: string; text: string; start: number; end: number; score?: number; [key: string]: any }

function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

function parseJsonRows(text: string): Record<string, string>[] {
  try {
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed) ? parsed : (parsed.transactions || []);
    return arr.map((item: Record<string, unknown>) => {
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(item)) {
        row[k] = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
      }
      return row;
    });
  } catch {
    return [];
  }
}

function maskValue(val: string): string {
  if (val.length <= 4) return "****";
  return val.slice(0, 2) + "*".repeat(val.length - 4) + val.slice(-2);
}

export default function ColumnMapper({ open, filename, rawContent, accountId, onClose, onUploadComplete, onError }: ColumnMapperProps) {
  const [uploading, setUploading] = useState(false);
  const [piiMode, setPiiMode] = useState<"detect" | "anonymize">("detect");
  const [piiChecking, setPiiChecking] = useState(false);
  const [piiDetections, setPiiDetections] = useState<PiiDetection[] | null>(null);
  const [piiAnonymizedContent, setPiiAnonymizedContent] = useState<string | null>(null);
  const [showPiiWarning, setShowPiiWarning] = useState(false);

  const isJson = filename.toLowerCase().endsWith(".json");
  const allRows = useMemo(() => isJson ? parseJsonRows(rawContent) : parseCsvRows(rawContent), [rawContent, isJson]);
  const sourceColumns = useMemo(() => allRows.length > 0 ? Object.keys(allRows[0]) : [], [allRows]);

  // Build initial mapping: auto-map matching column names
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    sourceColumns.forEach((col) => {
      const lower = col.toLowerCase().replace(/[\s-]/g, "_");
      if (FIELD_KEYS.includes(lower)) {
        m[col] = lower;
      }
    });
    return m;
  });

  // Re-initialize mapping when sourceColumns change
  const [prevCols, setPrevCols] = useState<string[]>([]);
  if (sourceColumns.join(",") !== prevCols.join(",") && sourceColumns.length > 0) {
    setPrevCols(sourceColumns);
    const m: Record<string, string> = {};
    sourceColumns.forEach((col) => {
      const lower = col.toLowerCase().replace(/[\s-]/g, "_");
      if (FIELD_KEYS.includes(lower)) {
        m[col] = lower;
      }
    });
    setMapping(m);
  }

  const previewRows = allRows.slice(0, 5);
  const mappedTargets = Object.values(mapping).filter(Boolean);
  const missingRequired = TRANSACTION_FIELDS.filter((f) => f.required && !mappedTargets.includes(f.key));

  function updateMapping(sourceCol: string, targetField: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (targetField === "") {
        delete next[sourceCol];
      } else {
        for (const k of Object.keys(next)) {
          if (next[k] === targetField && k !== sourceCol) delete next[k];
        }
        next[sourceCol] = targetField;
      }
      return next;
    });
  }

  function transformRows(rows?: Record<string, string>[]): Record<string, unknown>[] {
    return (rows || allRows).map((row) => {
      const out: Record<string, unknown> = {};
      for (const [sourceCol, targetField] of Object.entries(mapping)) {
        if (!targetField) continue;
        let val: unknown = row[sourceCol];
        if (targetField === "amount" || targetField === "balance_before" || targetField === "balance_after") {
          val = parseFloat(String(val)) || 0;
        }
        if (targetField === "metadata" && typeof val === "string") {
          try { val = JSON.parse(val); } catch { /* keep as string */ }
        }
        out[targetField] = val;
      }
      if (accountId && !out.account_id) {
        out.account_id = accountId;
      }
      return out;
    });
  }

  // Build a text representation of the data for PII scanning
  function buildScanText(): string {
    // Send all row values as a single text block for the API to scan
    const sampleRows = allRows.slice(0, 100); // scan up to 100 rows
    return sampleRows.map((row) =>
      Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(", ")
    ).join("\n");
  }

  async function runPiiCheck(): Promise<boolean> {
    setPiiChecking(true);
    setPiiDetections(null);
    setPiiAnonymizedContent(null);
    setShowPiiWarning(false);

    try {
      const scanText = buildScanText();
      const res = await fetch("/api/admin/fraud-validation/pii-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: piiMode, content: scanText }),
      });
      const data = await res.json();

      if (!res.ok) {
        onError(data.error || "PII check failed");
        return false;
      }

      const result = data.result;

      if (piiMode === "detect") {
        // Check if PII was found
        const detections: PiiDetection[] = result?.detected_entities
          || result?.entities
          || result?.results
          || [];
        if (detections.length > 0) {
          setPiiDetections(detections);
          setShowPiiWarning(true);
          return false; // block upload
        }
        return true; // no PII found, proceed
      } else {
        // Anonymize mode — use the anonymized text
        const anonymizedText = result?.anonymized_text
          || result?.result
          || result?.text
          || null;
        if (anonymizedText) {
          setPiiAnonymizedContent(anonymizedText);
        }
        return true; // proceed with upload
      }
    } catch {
      onError("PII check request failed");
      return false;
    } finally {
      setPiiChecking(false);
    }
  }

  async function handleUpload() {
    if (missingRequired.length > 0) return;

    // Run PII check first
    const canProceed = await runPiiCheck();
    if (!canProceed) return;

    setUploading(true);
    try {
      let transactions: Record<string, unknown>[];

      if (piiMode === "anonymize" && piiAnonymizedContent) {
        // Re-parse the anonymized content and transform
        const anonymizedRows = isJson
          ? parseJsonRows(piiAnonymizedContent)
          : parseCsvRows(piiAnonymizedContent);
        transactions = anonymizedRows.length > 0 ? transformRows(anonymizedRows) : transformRows();
      } else {
        transactions = transformRows();
      }

      if (transactions.length > 500) {
        onError("Maximum 500 transactions per upload. This file has " + transactions.length + " rows.");
        return;
      }
      const res = await fetch("/api/admin/fraud-validation/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || "Upload failed");
      } else {
        onUploadComplete(data.message || `Uploaded ${data.inserted} transactions`);
        onClose();
      }
    } catch {
      onError("Network error during upload");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div>
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Map Columns</span>
              <span className="ml-2 text-xs text-gray-400">{filename} — {allRows.length} rows</span>
            </div>
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-4 space-y-4">
            {allRows.length === 0 ? (
              <div className="text-sm text-red-500 py-4 text-center">Could not parse any rows from this file.</div>
            ) : (
              <>
                {/* PII Protection Mode */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">PII Protection</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPiiMode("detect")}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        piiMode === "detect"
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="block font-semibold">Detect PII</span>
                      <span className="block mt-0.5 opacity-75">Block upload if sensitive data found</span>
                    </button>
                    <button
                      onClick={() => setPiiMode("anonymize")}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        piiMode === "anonymize"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                          : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="block font-semibold">Anonymize PII</span>
                      <span className="block mt-0.5 opacity-75">Auto-redact sensitive data and continue</span>
                    </button>
                  </div>
                </div>

                {/* Mapping Table */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Map source columns to transaction fields. Unmatched columns will be ignored.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">Source Column</div>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1">Maps To</div>
                    {sourceColumns.map((col) => (
                      <div key={col} className="contents">
                        <div className="px-2 py-1.5 text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded truncate">
                          {col}
                        </div>
                        <select
                          value={mapping[col] || ""}
                          onChange={(e) => updateMapping(col, e.target.value)}
                          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 cursor-pointer"
                        >
                          <option value="">— Ignore —</option>
                          {TRANSACTION_FIELDS.map((f) => (
                            <option key={f.key} value={f.key} disabled={mappedTargets.includes(f.key) && mapping[col] !== f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Validation */}
                {missingRequired.length > 0 && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs">
                    Required fields not mapped: {missingRequired.map((f) => f.key).join(", ")}
                  </div>
                )}

                {/* Preview */}
                {previewRows.length > 0 && mappedTargets.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Preview (first {previewRows.length} rows, mapped fields only)</div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800">
                            {Object.entries(mapping).filter(([, v]) => v).map(([src, target]) => (
                              <th key={src} className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                {target}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                              {Object.entries(mapping).filter(([, v]) => v).map(([src]) => (
                                <td key={src} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[200px] truncate">
                                  {row[src] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {allRows.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-400">
                {mappedTargets.length} field{mappedTargets.length !== 1 ? "s" : ""} mapped, {sourceColumns.length - mappedTargets.length} ignored
                {piiMode === "detect" ? " · PII Detection" : " · PII Anonymization"}
              </span>
              <button
                onClick={handleUpload}
                disabled={uploading || piiChecking || missingRequired.length > 0}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  uploading || piiChecking || missingRequired.length > 0
                    ? "bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                }`}
              >
                {piiChecking ? "Scanning for PII..." : uploading ? "Uploading..." : `Upload ${allRows.length} Transactions`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* PII Warning Modal */}
      {showPiiWarning && piiDetections && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl border border-red-300 dark:border-red-700 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-t-xl">
              <span className="text-red-600 dark:text-red-400 text-lg">&#9888;</span>
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Sensitive Data Detected</span>
            </div>

            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                PII was detected in the uploaded file. The upload has been blocked to protect sensitive information.
              </p>

              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {piiDetections.length} detection{piiDetections.length !== 1 ? "s" : ""} found:
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {piiDetections.map((d, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 whitespace-nowrap">
                      {d.entity_type || d.type || "PII"}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate">
                      {maskValue(d.text || d.value || "")}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                <p className="font-medium mb-1">What you can do:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Remove PII columns from the source file and re-upload</li>
                  <li>Switch to <strong>Anonymize PII</strong> mode to auto-redact sensitive data before uploading</li>
                </ul>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
              <button
                onClick={() => {
                  setShowPiiWarning(false);
                  setPiiMode("anonymize");
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors"
              >
                Switch to Anonymize Mode
              </button>
              <button
                onClick={() => setShowPiiWarning(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
