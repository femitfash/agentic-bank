import { NextRequest } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

interface BrowseBody {
  auth?: "connection_string" | "entra";
  conn?: string;
  account?: string;
  container?: string;
  path?: string;
}

function getBlobServiceClient(body: BrowseBody) {
  const authMethod = body.auth || "connection_string";
  const connStr = body.conn || process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (authMethod === "entra") {
    const accountName = body.account || process.env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!accountName) return { error: "Storage account name is required for Entra SSO" };
    const credential = new DefaultAzureCredential();
    return { client: new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential) };
  }

  if (!connStr) return { error: "Connection string is required" };
  return { client: BlobServiceClient.fromConnectionString(connStr) };
}

export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });

  const body: BrowseBody = await request.json();

  const result = getBlobServiceClient(body);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const container = body.container || process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!container) {
    return Response.json({ error: "Container name is required" }, { status: 400 });
  }

  const prefix = body.path || "";
  const cleanPrefix = prefix.replace(/^\/+/, "");

  try {
    const containerClient = result.client.getContainerClient(container);
    const entries: { name: string; kind: "directory" | "file"; size?: number }[] = [];

    const listPrefix = cleanPrefix ? cleanPrefix + (cleanPrefix.endsWith("/") ? "" : "/") : "";

    // Try hierarchical listing first
    for await (const item of containerClient.listBlobsByHierarchy("/", { prefix: listPrefix })) {
      if (item.kind === "prefix") {
        const dirName = item.name.replace(/\/$/, "").split("/").pop() || item.name;
        entries.push({ name: dirName, kind: "directory" });
      } else {
        const fileName = item.name.split("/").pop() || item.name;
        const ext = fileName.toLowerCase().split(".").pop();
        entries.push({
          name: fileName,
          kind: "file",
          size: item.properties?.contentLength,
          supported: ext === "csv" || ext === "json",
        } as { name: string; kind: "directory" | "file"; size?: number; supported?: boolean });
      }
    }

    // If hierarchical listing found nothing at root, try flat listing
    // (some containers have flat blobs without hierarchy)
    if (entries.length === 0 && !cleanPrefix) {
      for await (const blob of containerClient.listBlobsFlat()) {
        const ext = blob.name.toLowerCase().split(".").pop();
        entries.push({
          name: blob.name,
          kind: "file",
          size: blob.properties?.contentLength,
          supported: ext === "csv" || ext === "json",
        } as { name: string; kind: "directory" | "file"; size?: number; supported?: boolean });
      }
    }

    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ path: "/" + cleanPrefix, entries, container });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("ContainerNotFound")) {
      return Response.json({ error: `Container "${container}" not found` }, { status: 404 });
    }
    if (msg.includes("AuthenticationFailed") || msg.includes("AuthorizationFailure")) {
      return Response.json({ error: "Authentication failed. Check your credentials or permissions. If you are the storage account Owner, you also need the 'Storage Blob Data Reader' role assigned via Access Control (IAM)." }, { status: 403 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
