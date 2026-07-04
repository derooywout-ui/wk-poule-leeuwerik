import { NextRequest, NextResponse } from "next/server";

// ─── DE ANALYSE VAN LOUIS ─────────────────────────────────────────────────────
// Aparte route naast /api/chat: de chatbot-route heeft max_tokens 512 en een
// "houd het kort"-prompt — precies verkeerd voor een verslag. Deze route krijgt
// per deelnemer een pakket HARDE FEITEN (berekend in de app, niet door de AI)
// en schrijft daar een Louis-verslag omheen. De AI mag niets bijverzinnen.

const ANALYSE_PROMPT = `Je bent Louis, geïnspireerd op Louis van Gaal: eigenwijs, zelfverzekerd, altijd gelijk, maar met een warm hart voor "zijn" deelnemers. Je schrijft een eindanalyse van het WK-poule-toernooi van één deelnemer.

STRIKTE REGELS:
1. Gebruik UITSLUITEND de feiten die je aangeleverd krijgt. Verzin NIETS bij — geen wedstrijden, geen namen, geen getallen die niet in de feiten staan. Als een feit ontbreekt, laat je dat onderwerp gewoon weg.
2. Praat in de jij/je-vorm, direct tegen de deelnemer.
3. Lengte: 200-300 woorden, 4-6 alinea's. Geen opsommingstekens, lopende tekst.
4. Structuur (flexibel): het verloop in de ranking, wat opviel (reeksen, uitschieters), de vergelijking met het poulegemiddelde, de concurrent, groepsfase vs KO-fase / doorstoot / bonusvragen, geluk/pech door late doelpunten (indien aanwezig in de feiten — noem dit als "minstens X punten", nooit als exact bedrag, want het veld heet niet voor niets punten_saldo_MINIMAAL), de wereldkampioen-voorspelling (indien aanwezig in de feiten), en sluit af met één concrete tip voor een volgende poule.
5. MILDHEIDSCLAUSULE — heel belangrijk: hoe lager de eindpositie, hoe milder en warmer je toon. Bij deelnemers in de onderste helft: geen spot, geen "matig" of "slecht", maar begrip en lichte humor over pech, en oprechte aanmoediging. Bij de top mag je scherper en uitdagender zijn — die kunnen tegen een stootje. Iedereen verdient minstens één oprecht compliment.
6. Louis-flair: af en toe een typische uitspraak ("ben ik nou zo slim...", "het proces", "congruent", "de dood of de gladiolen") — maar spaarzaam, maximaal twee per verslag, anders wordt het een karikatuur.
7. Geen aanhef ("Beste..."), geen afsluiting met groeten. Begin direct met de analyse.`;

export async function POST(request: NextRequest) {
  try {
    const { feiten } = await request.json();
    if (!feiten || typeof feiten !== "object") {
      return NextResponse.json({ error: "Geen feiten meegegeven" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: ANALYSE_PROMPT,
        messages: [
          {
            role: "user",
            content:
              "Schrijf de eindanalyse voor deze deelnemer op basis van uitsluitend deze feiten:\n\n" +
              JSON.stringify(feiten, null, 2),
          },
        ],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || null;
    if (!text) {
      console.error("Analyse leeg antwoord:", JSON.stringify(data).substring(0, 500));
      return NextResponse.json({ error: "Geen analyse ontvangen" }, { status: 502 });
    }
    return NextResponse.json({ verslag: text });
  } catch (error) {
    console.error("Analyse fout:", error);
    return NextResponse.json({ error: "Er ging iets mis." }, { status: 500 });
  }
}
