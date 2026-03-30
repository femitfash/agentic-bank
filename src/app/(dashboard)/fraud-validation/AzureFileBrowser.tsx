"use client";

import { useState, useEffect, useCallback } from "react";

interface Entry {
  name: string;
  kind: "directory" | "file";
  size?: number;
}

interface AzureConfig {
  authMethod: "connection_string" | "entra";
  connectionString: string;
  containerName: string;
  accountName: string;
}

const LS_KEY = "azure_storage_config";

function loadConfig(): AzureConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConfig(config: AzureConfig) {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

function clearConfig() {
  localStorage.removeItem(LS_KEY);
}

function buildBody(config: AzureConfig, extra?: Record<string, string>) {
  const body: Record<string, string> = {
    auth: config.authMethod,
    container: config.containerName,
  };
  if (config.authMethod === "entra") {
    body.account = config.accountName;
  } else {
    body.conn = config.connectionString;
  }
  if (extra) {
    for (const [k, v] of Object.entries(extra)) body[k] = v;
  }
  return body;
}

interface AzureFileBrowserProps {
  open: boolean;
  onClose: () => void;
  onFileSelected: (filename: string, content: string) => void;
}

export default function AzureFileBrowser({ open, onClose, onFileSelected }: AzureFileBrowserProps) {
  const [config, setConfig] = useState<AzureConfig | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  // Setup form state
  const [formAuth, setFormAuth] = useState<"connection_string" | "entra">("connection_string");
  const [formConnStr, setFormConnStr] = useState("");
  const [formContainer, setFormContainer] = useState("");
  const [formAccount, setFormAccount] = useState("");

  // Browser state
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      const saved = loadConfig();
      if (saved) {
        setConfig(saved);
        setShowSetup(false);
      } else {
        setShowSetup(true);
      }
    }
  }, [open]);

  const browse = useCallback(async (path: string, cfg: AzureConfig) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/fraud-validation/azure-browse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(cfg, { path })),
      });
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
    if (open && config && !showSetup) {
      browse("", config);
    }
  }, [open, config, showSetup, browse]);

  function handleSaveConfig() {
    if (!formContainer.trim()) return;
    if (formAuth === "connection_string" && !formConnStr.trim()) return;
    if (formAuth === "entra" && !formAccount.trim()) return;

    const cfg: AzureConfig = {
      authMethod: formAuth,
      connectionString: formConnStr.trim(),
      containerName: formContainer.trim(),
      accountName: formAccount.trim(),
    };
    saveConfig(cfg);
    setConfig(cfg);
    setShowSetup(false);
  }

  function handleEditConfig() {
    if (config) {
      setFormAuth(config.authMethod);
      setFormConnStr(config.connectionString);
      setFormContainer(config.containerName);
      setFormAccount(config.accountName);
    }
    setShowSetup(true);
  }

  function handleDisconnect() {
    clearConfig();
    setConfig(null);
    setEntries([]);
    setCurrentPath("");
    setShowSetup(true);
    setFormAuth("connection_string");
    setFormConnStr("");
    setFormContainer("");
    setFormAccount("");
  }

  async function handleFileClick(name: string) {
    if (!config) return;
    const filePath = currentPath === "/" ? name : `${currentPath.replace(/^\//, "")}/${name}`;
    setFetching(name);
    setError("");
    try {
      const res = await fetch("/api/admin/fraud-validation/azure-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(config, { path: filePath })),
      });
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
    if (config) browse(path, config);
  }

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">Azure File Storage</span>
          <div className="flex items-center gap-2">
            {config && !showSetup && (
              <>
                <button
                  onClick={handleEditConfig}
                  className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                >
                  Settings
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 cursor-pointer transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {showSetup ? (
          /* Connection Setup Form */
          <div className="p-4 space-y-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Connect to Azure Storage</div>

            {/* Auth Method */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Authentication Method</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setFormAuth("connection_string")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    formAuth === "connection_string"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  Connection String
                </button>
                <button
                  onClick={() => setFormAuth("entra")}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    formAuth === "entra"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                      : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  Azure Entra SSO
                </button>
              </div>
            </div>

            {formAuth === "connection_string" ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Connection String</label>
                  <input
                    type="password"
                    value={formConnStr}
                    onChange={(e) => setFormConnStr(e.target.value)}
                    placeholder="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=..."
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                </div>
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs space-y-2">
                  <p className="font-medium text-gray-700 dark:text-gray-300">Where to find your connection string:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Go to the <strong>Azure Portal</strong> &rarr; your <strong>Storage Account</strong></li>
                    <li>In the left menu under <strong>Security + networking</strong>, click <strong>Access keys</strong></li>
                    <li>Click <strong>Show</strong> next to either key, then copy the <strong>Connection string</strong> value</li>
                  </ol>
                  <p>It looks like: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-[11px] break-all">DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net</code></p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Storage Account Name</label>
                  <input
                    type="text"
                    value={formAccount}
                    onChange={(e) => setFormAccount(e.target.value)}
                    placeholder="e.g. mystorageaccount"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">The name from your storage URL: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">https://<strong>yourname</strong>.blob.core.windows.net</code></p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs space-y-2">
                  <p className="font-medium">How Azure Entra SSO works:</p>
                  <p>Authentication is handled server-side using <strong>DefaultAzureCredential</strong>, which tries these methods in order:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li><strong>Managed Identity</strong> &mdash; automatic if the app is hosted on Azure (App Service, VM, Container Apps)</li>
                    <li><strong>Azure CLI</strong> &mdash; uses your <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">az login</code> session for local development</li>
                    <li><strong>Environment variables</strong> &mdash; set <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">AZURE_TENANT_ID</code>, <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">AZURE_CLIENT_ID</code>, and <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">AZURE_CLIENT_SECRET</code> for a service principal</li>
                  </ol>
                  <p className="font-medium pt-1">Required permissions:</p>
                  <p>The identity needs the <strong>Storage Blob Data Reader</strong> role assigned on the storage account. In Azure Portal: Storage Account &rarr; Access Control (IAM) &rarr; Add role assignment.</p>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Container Name</label>
              <input
                type="text"
                value={formContainer}
                onChange={(e) => setFormContainer(e.target.value)}
                placeholder="e.g. fraud-data"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <p className="text-[11px] text-gray-400 mt-1">Find this in Azure Portal &rarr; Storage Account &rarr; <strong>Containers</strong> in the left menu under Data storage.</p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {config && (
                <button
                  onClick={() => setShowSetup(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSaveConfig}
                disabled={
                  !formContainer.trim()
                  || (formAuth === "connection_string" && !formConnStr.trim())
                  || (formAuth === "entra" && !formAccount.trim())
                }
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:text-gray-500 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Connect
              </button>
            </div>
          </div>
        ) : (
          <>
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
              <span className="ml-auto text-xs text-gray-400">
                {config?.authMethod === "entra" ? "Entra SSO" : "Connection String"} — {config?.containerName}
              </span>
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
                      <span className="text-base">{e.kind === "directory" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}</span>
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
          </>
        )}
      </div>
    </div>
  );
}
