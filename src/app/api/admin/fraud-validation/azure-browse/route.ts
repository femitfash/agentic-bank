import { NextRequest } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

function getBlobServiceClient(request: NextRequest) {
  const authMethod = request.nextUrl.searchParams.get("auth") || "connection_string";
  const connStr = request.nextUrl.searchParams.get("conn")
    || process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (authMethod === "entra") {
    const accountName = request.nextUrl.searchParams.get("account")
      || process.env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!accountName) return { error: "Storage account name is required for Entra SSO" };
    const credential = new DefaultAzureCredential();
    return { client: new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, credential) };
  }

  if (!connStr) return { error: "Connection string is required" };
  return { client: BlobServiceClient.fromConnectionString(connStr) };
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });

  const result = getBlobServiceClient(request);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const container = request.nextUrl.searchParams.get("container")
    || process.env.AZURE_STORAGE_CONTAINER_NAME;
  if (!container) {
    return Response.json({ error: "Container name is required" }, { status: 400 });
  }

  const prefix = request.nextUrl.searchParams.get("path") || "";
  const cleanPrefix = prefix.replace(/^\/+/, "");

  try {
    const containerClient = result.client.getContainerClient(container);
    const entries: { name: string; kind: "directory" | "file"; size?: number }[] = [];

    // List blobs with hierarchy (using delimiter to get virtual directories)
    for await (const item of containerClient.listBlobsByHierarchy("/", {
      prefix: cleanPrefix ? cleanPrefix + (cleanPrefix.endsWith("/") ? "" : "/") : "",
    })) {
      if (item.kind === "prefix") {
        // Virtual directory
        const dirName = item.name.replace(/\/$/, "").split("/").pop() || item.name;
        entries.push({ name: dirName, kind: "directory" });
      } else {
        // Blob
        const fileName = item.name.split("/").pop() || item.name;
        const ext = fileName.toLowerCase().split(".").pop();
        if (ext === "csv" || ext === "json") {
          entries.push({
            name: fileName,
            kind: "file",
            size: item.properties?.contentLength,
          });
        }
      }
    }

    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return Response.json({ path: "/" + cleanPrefix, entries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("ContainerNotFound")) {
      return Response.json({ error: `Container "${container}" not found` }, { status: 404 });
    }
    if (msg.includes("AuthenticationFailed") || msg.includes("AuthorizationFailure")) {
      return Response.json({ error: "Authentication failed. Check your credentials or permissions." }, { status: 403 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
