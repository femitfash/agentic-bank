"use client";

import { useState, useEffect, useCallback } from "react";

interface Entry {
  name: string;
  kind: "directory" | "file";
  size?: number;
}

interface AzureFileBrowserProps {
  open: boolean;
  onClose: () => void;
  onFileSelected: (filename: string, content: string) => void;
}

export default function AzureFileBrowser({ open, onClose, onFileSelected }: AzureFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [error, setError] = useState("");

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/fraud-validation/azure-browse?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to browse");
        return;
      }
      setCurrentPath(data.path || "/");
      setEntries(data.entries || []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) browse("");
  }, [open, browse]);

  async function handleFileClick(name: string) {
    const filePath = currentPath === "/" ? name : `${currentPath.replace(/^\//, "")}/${name}`;
    setFetching(name);
    setError("");
    try {
      const res = await fetch(`/api/admin/fraud-validation/azure-fetch?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to fetch file");
        return;
      }
      onFileSelected(data.filename, data.content);
    } catch {
      setError("Network error");
    } finally {
      setFetching(null);
    }
  }

  function navigateTo(path: string) {
    browse(path);
  }

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Azure Storage File Share</span>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-2 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
          <button onClick={() => navigateTo("")} className="hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer">
            /
          </button>
          {breadcrumbs.map((seg, i) => {
            const path = breadcrumbs.slice(0, i + 1).join("/");
            return (
              <span key={path} className="flex items-center gap-1">
                <span>/</span>
                <button onClick={() => navigateTo(path)} className="hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer">
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-4 max-h-80 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm mb-3">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center">No CSV or JSON files found in this directory.</div>
          ) : (
            <div className="space-y-1">
              {entries.map((e) => (
                <button
                  key={e.name}
                  onClick={() => e.kind === "directory" ? navigateTo(
                    (currentPath === "/" ? "" : currentPath.replace(/^\//, "")) + (currentPath === "/" ? "" : "/") + e.name
                  ) : handleFileClick(e.name)}
                  disabled={fetching !== null}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="text-base">{e.kind === "directory" ? "📁" : "📄"}</span>
                  <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">{e.name}</span>
                  {e.kind === "file" && e.size != null && (
                    <span className="text-xs text-gray-400">{(e.size / 1024).toFixed(1)} KB</span>
                  )}
                  {fetching === e.name && <span className="text-xs text-blue-500">Loading...</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
