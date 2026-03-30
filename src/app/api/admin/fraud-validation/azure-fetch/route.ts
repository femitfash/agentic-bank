import { NextRequest } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest, getOrganizationId } from "@/shared/lib/auth";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

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

  const blobPath = request.nextUrl.searchParams.get("path");
  if (!blobPath) {
    return Response.json({ error: "path parameter required" }, { status: 400 });
  }

  const ext = blobPath.toLowerCase().split(".").pop();
  if (ext !== "csv" && ext !== "json") {
    return Response.json({ error: "Only .csv and .json files are supported" }, { status: 400 });
  }

  const cleanPath = blobPath.replace(/^\/+/, "");
  const fileName = cleanPath.split("/").pop() || cleanPath;

  try {
    const containerClient = result.client.getContainerClient(container);
    const blobClient = containerClient.getBlobClient(cleanPath);

    const props = await blobClient.getProperties();
    if (props.contentLength && props.contentLength > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File too large (${(props.contentLength / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.` },
        { status: 413 }
      );
    }

    const downloadResponse = await blobClient.download(0);
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
    if (msg.includes("BlobNotFound")) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    if (msg.includes("AuthenticationFailed") || msg.includes("AuthorizationFailure")) {
      return Response.json({ error: "Authentication failed. Check your credentials or permissions." }, { status: 403 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
