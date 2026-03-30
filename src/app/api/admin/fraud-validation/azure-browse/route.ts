import { NextRequest } from "next/server";
import { ShareServiceClient } from "@azure/storage-file-share";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

export async function GET(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const orgId = await getOrganizationId(admin, user);
  if (!orgId) return Response.json({ error: "No organization" }, { status: 400 });

  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const shareName = process.env.AZURE_FILE_SHARE_NAME;
  if (!connStr || !shareName) {
    return Response.json(
      { error: "Azure Storage not configured. Set AZURE_STORAGE_CONNECTION_STRING and AZURE_FILE_SHARE_NAME." },
      { status: 501 }
    );
  }

  const path = request.nextUrl.searchParams.get("path") || "";
  const cleanPath = path.replace(/^\/+/, "");

  try {
    const serviceClient = ShareServiceClient.fromConnectionString(connStr);
    const shareClient = serviceClient.getShareClient(shareName);
    const dirClient = cleanPath
      ? shareClient.getDirectoryClient(cleanPath)
      : shareClient.rootDirectoryClient;

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
