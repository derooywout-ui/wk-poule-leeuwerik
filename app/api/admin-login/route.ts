import { NextRequest, NextResponse } from "next/server";

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
// Checkt het admin-wachtwoord server-side tegen de omgevingsvariabele
// ADMIN_PASSWORD (Vercel → Project Settings → Environment Variables). Het
// wachtwoord staat dus nergens meer in de client-bundle — wijzigen kan door
// alleen die env var aan te passen, zonder een nieuwe deploy van de site.
//
// BELANGRIJK, ook na deze fix: dit beveiligt alleen de knoppen in de admin-UI.
// De Supabase anon-key staat nog steeds in de client (normaal bij Supabase,
// mits Row Level Security per tabel goed staat) — dat is een apart, groter
// traject dat bewust is uitgesteld tot na het toernooi (EK 2028-voorbereiding).
export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const correct = process.env.ADMIN_PASSWORD;

    if (!correct) {
      // Env var vergeten in te stellen op Vercel — dit moet opvallen, niet
      // stilzwijgend altijd "onjuist wachtwoord" teruggeven.
      console.error("ADMIN_PASSWORD ontbreekt als omgevingsvariabele op de server.");
      return NextResponse.json(
        { ok: false, error: "Server niet correct geconfigureerd (ADMIN_PASSWORD ontbreekt)." },
        { status: 500 }
      );
    }

    const ok = typeof password === "string" && password.length > 0 && password === correct;
    return NextResponse.json(ok ? { ok: true } : { ok: false, error: "Onjuist wachtwoord" });
  } catch (error) {
    console.error("Admin-login fout:", error);
    return NextResponse.json({ ok: false, error: "Ongeldige aanvraag." }, { status: 400 });
  }
}
