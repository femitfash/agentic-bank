import { NextRequest } from "next/server";
import { createAdminClient } from "@/shared/lib/supabase/admin";
import { authenticateRequest } from "@/shared/lib/auth";

// VULN: SQL Injection — user input concatenated directly into SQL query
export async function POST(request: NextRequest) {
  const user = await authenticateRequest();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { table, filter, value } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;

  // VULNERABLE: Direct string interpolation in SQL query
  const query = `SELECT * FROM ${table} WHERE ${filter} = '${value}'`;

  const { data, error } = await admin.rpc("exec_sql", { query });

  if (error) {
    // VULN: Exposing internal error details and executed query to client
    return Response.json({ error: error.message, query }, { status: 500 });
  }

  return Response.json({ results: data, query_executed: query });
}
