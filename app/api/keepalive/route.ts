import { NextResponse } from "next/server";

// ─── KEEP-ALIVE ───────────────────────────────────────────────────────────────
// Voorkomt dat het Supabase Free-tier project automatisch wordt gepauzeerd na
// 7 dagen zonder database-activiteit (Supabase's eigen beleid — zie
// https://supabase.com/docs/guides/platform/free-project-pausing). Wordt 1x
// per dag aangeroepen via de Vercel Cron Job (zie vercel.json) — een simpele,
// goedkope leesquery is genoeg om als "activiteit" te tellen. Er hoeft verder
// niets mee te gebeuren; het resultaat wordt niet gebruikt.
//
// Dezelfde publieke anon-key als in de hoofd-app (SUPABASE_KEY) — dit is geen
// nieuwe blootstelling, die staat toch al in de client-bundle.
const SUPABASE_URL = "https://votagyldoiubrffnkokr.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdGFneWxkb2l1YnJmZm5rb2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjc3MzcsImV4cCI6MjA5NTMwMzczN30.ezW6V8Peegrxac83HNmN21Yo6sISEWkuTdZuD2lYL-s";

export async function GET() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/participants?select=id&limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      cache: "no-store",
    });
    return NextResponse.json({ ok: res.ok, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Keep-alive fout:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
