import { NextRequest } from "next/server";
import { ShareServiceClient } from "@azure/storage-file-share";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

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

  const filePath = request.nextUrl.searchParams.get("path");
  if (!filePath) {
    return Response.json({ error: "path parameter required" }, { status: 400 });
  }

  const ext = filePath.toLowerCase().split(".").pop();
  if (ext !== "csv" && ext !== "json") {
    return Response.json({ error: "Only .csv and .json files are supported" }, { status: 400 });
  }

  const cleanPath = filePath.replace(/^\/+/, "");
  const lastSlash = cleanPath.lastIndexOf("/");
  const dirPath = lastSlash >= 0 ? cleanPath.substring(0, lastSlash) : "";
  const fileName = lastSlash >= 0 ? cleanPath.substring(lastSlash + 1) : cleanPath;

  try {
    const serviceClient = ShareServiceClient.fromConnectionString(connStr);
    const shareClient = serviceClient.getShareClient(shareName);
    const dirClient = dirPath
      ? shareClient.getDirectoryClient(dirPath)
      : shareClient.rootDirectoryClient;
    const fileClient = dirClient.getFileClient(fileName);

    const props = await fileClient.getProperties();
    if (props.contentLength && props.contentLength > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File too large (${(props.contentLength / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.` },
        { status: 413 }
      );
    }

    const downloadResponse = await fileClient.download(0);
    const body = downloadResponse.readableStreamBody;
    if (!body) {
      return Response.json({ error: "Could not read file" }, { status: 500 });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString("utf-8");

    return Response.json({ filename: fileName, content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("ResourceNotFound")) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
