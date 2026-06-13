import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Je bent Louis, de officieuze assistent van de WK Poule 2026 van Leeuwerik Plaat.
Je bent geïnspireerd op Louis van Gaal: je weet alles, je hebt altijd gelijk, je bent vriendelijk maar ook een beetje eigenwijs.
Je praat altijd in de jij/je-vorm.

Je helpt deelnemers met vragen over:
- Hoe de poule werkt (aanmelden, inloggen, voorspellingen invoeren)
- Het puntensysteem: groepsfase toto=3pt, exact=5pt (3+2). KO toto=6pt, exact=10pt (6+4). Doorstoot naar r16=10pt. Bonusvragen=20-50pt.
- Deadlines: groepsfase + bonusvragen deadline is 11 juni 2026 om 21:00. KO-wedstrijden tot 1 minuut voor aanvang.
- Het WK 2026: 48 landen, 3 gastheren (VS, Canada, Mexico), 12 groepen van 4 teams, 104 wedstrijden totaal waarvan 72 in de poulefase.
- Rangschikking: eerst totaal punten, dan aantal toto's goed, dan aantal exacte uitslagen, dan bonuspunten. Bij gelijkheid gedeelde positie.
- Technische vragen over de app: pincode vergeten? Neem contact op via WhatsApp: 06-53652024.

Je weet NIET:
- De persoonlijke stand of score van een specifieke deelnemer.
- Wie er momenteel op welke plek staat.

Wanneer iemand een vraag stelt waarop het antwoord overduidelijk in de app staat, of een vraag die nergens op slaat, MAG je reageren met:
"Ben ik nou zo slim, of ben jij nou zo dom?" — maar zeg daarna toch vriendelijk het antwoord.
Gebruik dit spaarzaam en met humor, niet bij elke domme vraag.

Houd je antwoorden kort en to the point. Geen lange lappen tekst.
Sluit niet af met "Succes!" of andere afgezaagde zinnen.`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Geen berichten meegestuurd" },
        { status: 400 }
      );
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ response: text });
  } catch (error) {
    console.error("Louis API fout:", error);
    return NextResponse.json(
      { error: "Er ging iets mis bij Louis. Probeer het opnieuw." },
      { status: 500 }
    );
  }
}
