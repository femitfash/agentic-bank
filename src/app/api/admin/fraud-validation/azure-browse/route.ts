import { NextRequest } from "next/server";
import { ShareServiceClient } from "@azure/storage-file-share";
import { DefaultAzureCredential } from "@azure/identity";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

function getShareClient(request: NextRequest) {
  const authMethod = request.nextUrl.searchParams.get("auth") || "connection_string";
  const shareName = request.nextUrl.searchParams.get("share")
    || process.env.AZURE_FILE_SHARE_NAME;
  const connStr = request.nextUrl.searchParams.get("conn")
    || process.env.AZURE_STORAGE_CONNECTION_STRING;

  if (!shareName) return { error: "File share name is required" };

  if (authMethod === "entra") {
    const accountName = request.nextUrl.searchParams.get("account")
      || process.env.AZURE_STORAGE_ACCOUNT_NAME;
    if (!accountName) return { error: "Storage account name is required for Entra SSO" };
    const credential = new DefaultAzureCredential();
    const serviceClient = new ShareServiceClient(
      `https://${accountName}.file.core.windows.net`,
      credential
    );
    return { client: serviceClient.getShareClient(shareName) };
  }

  if (!connStr) return { error: "Connection string is required" };
  const serviceClient = ShareServiceClient.fromConnectionString(connStr);
  return { client: serviceClient.getShareClient(shareName) };
}

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });

  const result = getShareClient(request);
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const path = request.nextUrl.searchParams.get("path") || "";
  const cleanPath = path.replace(/^\/+/, "");

  try {
    const dirClient = cleanPath
      ? result.client.getDirectoryClient(cleanPath)
      : result.client.rootDirectoryClient;

    const entries: { name: string; kind: "directory" | "file"; size?: number }[] = [];

    for await (const item of dirClient.listFilesAndDirectories()) {
      if (item.kind === "directory") {
        entries.push({ name: item.name, kind: "directory" });
      } else {
        const ext = item.name.toLowerCase().split(".").pop();
        if (ext === "csv" || ext === "json") {
          entries.push({
            name: item.name,
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

    return Response.json({ path: "/" + cleanPath, entries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("ResourceNotFound") || msg.includes("ParentNotFound")) {
      return Response.json({ error: "Path not found" }, { status: 404 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
