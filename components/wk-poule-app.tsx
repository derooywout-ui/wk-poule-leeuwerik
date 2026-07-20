"use client";
// NOTE: Run in Supabase SQL Editor:
// ALTER TABLE bonus_questions ADD COLUMN IF NOT EXISTS points integer DEFAULT 20;
// ALTER TABLE bonus_questions ADD COLUMN IF NOT EXISTS tooltip text;
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

const SUPABASE_URL = "https://votagyldoiubrffnkokr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvdGFneWxkb2l1YnJmZm5rb2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3Mjc3MzcsImV4cCI6MjA5NTMwMzczN30.ezW6V8Peegrxac83HNmN21Yo6sISEWkuTdZuD2lYL-s";
// ADMIN_PASSWORD is verplaatst naar een server-side env var (zie app/api/admin-login/route.ts) —
// hier stond 'm voorheen kaal als string, zichtbaar voor iedereen die de broncode opende.
const DEADLINE = new Date("2026-06-11T21:00:00+02:00");
const MAX_PARTICIPANTS = 100;

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
async function sb(method, path, body) {
  const prefer = method === "POST" ? "return=representation,resolution=merge-duplicates"
               : method === "DELETE" ? "return=minimal"
               : "return=representation";
  // Range-header afleiden uit de &limit= die de query zelf meegeeft, in plaats van
  // een hardgecodeerd plafond. Zo kan deze header nooit meer stiekem een query
  // afknijpen die zelf om meer vroeg (was eerder vast op "0-9999" = 10.000 rijen,
  // ongeacht &limit= in de query of de Max Rows-instelling in Supabase — daardoor
  // bleef rankings_snapshot bij elke fetch afgekapt op 10.000, ook toen Max Rows
  // al naar 40.000/50.000 was verhoogd).
  const limitMatch = path.match(/[?&]limit=(\d+)/);
  const rangeMax = limitMatch ? parseInt(limitMatch[1]) - 1 : 9999;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
      "Range": `0-${rangeMax}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.text(); console.error("Supabase error:", e, path); return null; }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const db = {
  get: (table, query="") => sb("GET", `${table}?${query}`, null),
  insert: (table, data) => sb("POST", table, data),
  upsert: (table, data) => sb("POST", `${table}?on_conflict=`, data),
  update: (table, query, data) => sb("PATCH", `${table}?${query}`, data),
  delete: (table, query) => sb("DELETE", `${table}?${query}`, null),
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const WK_LOGO_IMG = "https://i.postimg.cc/4N17LT24/WK-logo-bal.jpg";
const LEEUWERIK_HEADER_IMG = "https://i.postimg.cc/JFgYKzb3/logo-header-linksboven-afbeelding-1.jpg";

const KO_ROUNDS = [
  { id:"r16", label:"Zestiende finales", matchCount:16 },
  { id:"r8",  label:"Achtste finales",   matchCount:8 },
  { id:"r4",  label:"Kwartfinales",      matchCount:4 },
  { id:"r2",  label:"Halve finales",     matchCount:2 },
  { id:"r3",  label:"Troostfinale",      matchCount:1 },
  { id:"r1",  label:"Finale",            matchCount:1 },
];
// KO scoring
const KO_TOTO_PTS = 6;
const KO_EXACT_PTS = 10; // includes toto
// Doorstoot (group phase -> r16) scoring
const DOORSTOOT_PTS = 10;

const FLAG_CODES = {
  "Mexico":"mx","Zuid-Afrika":"za","Zuid-Korea":"kr","Tsjechië":"cz",
  "Canada":"ca","Bosnië-Herzegovina":"ba","Qatar":"qa","Zwitserland":"ch",
  "Brazilië":"br","Marokko":"ma","Haïti":"ht","Schotland":"gb-sct",
  "VS":"us","Paraguay":"py","Australië":"au","Turkije":"tr",
  "Duitsland":"de","Curaçao":"cw","Ivoorkust":"ci","Ecuador":"ec",
  "Nederland":"nl","Japan":"jp","Zweden":"se","Tunesië":"tn",
  "België":"be","Egypte":"eg","Iran":"ir","Nieuw-Zeeland":"nz",
  "Spanje":"es","Kaapverdië":"cv","Saoedi-Arabië":"sa","Uruguay":"uy",
  "Frankrijk":"fr","Senegal":"sn","Irak":"iq","Noorwegen":"no",
  "Oostenrijk":"at","Jordanië":"jo","Argentinië":"ar","Algerije":"dz",
  "Portugal":"pt","DR Congo":"cd","Oezbekistan":"uz","Colombia":"co",
  "Engeland":"gb-eng","Kroatië":"hr","Ghana":"gh","Panama":"pa",
};

// ─── NL→EN TEAM ALIAS MAP (voor doorstoot matching) ─────────────────────────
const NL_TO_EN_ALIAS = {
  "Mexico":"mexico","Zuid-Afrika":"south africa","Zuid-Korea":"korea republic",
  "Tsjechië":"czechia","Canada":"canada","Bosnië-Herzegovina":"bosnia and herzegovina",
  "Qatar":"qatar","Zwitserland":"switzerland","Brazilië":"brazil","Marokko":"morocco",
  "Haïti":"haiti","Schotland":"scotland","VS":"usa","Paraguay":"paraguay",
  "Australië":"australia","Turkije":"turkiye","Duitsland":"germany","Curaçao":"curacao",
  "Ivoorkust":"cote divoire","Ecuador":"ecuador","Nederland":"netherlands","Japan":"japan",
  "Zweden":"sweden","Tunesië":"tunisia","België":"belgium","Egypte":"egypt",
  "Iran":"ir iran","Nieuw-Zeeland":"new zealand","Spanje":"spain","Kaapverdië":"cape verde",
  "Saoedi-Arabië":"saudi arabia","Uruguay":"uruguay","Frankrijk":"france","Senegal":"senegal",
  "Irak":"iraq","Noorwegen":"norway","Argentinië":"argentina","Algerije":"algeria",
  "Oostenrijk":"austria","Jordanië":"jordan","Portugal":"portugal","DR Congo":"dr congo",
  "Oezbekistan":"uzbekistan","Colombia":"colombia","Engeland":"england","Kroatië":"croatia",
  "Ghana":"ghana","Panama":"panama",
};

function InsightNaam({p, onSelect}){
  if(!p) return <strong>Onbekend</strong>;
  return(
    <strong style={{color:COLORS.green,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}
      onClick={()=>onSelect(p)}>
      {p.first_name} {p.last_name}
    </strong>
  );
}

function FlagImg({ name, size=20 }) {
  const code = FLAG_CODES[name];
  // Bouw een lijst van bronnen die we achter elkaar proberen als er één faalt.
  // 1) flagcdn PNG (primair, snel), 2) lipis SVG (achtervang), zodat een
  // tijdelijke CDN-hapering bij één bron niet leidt tot een kapot vlag-icoon.
  const bronnen = React.useMemo(()=>{
    if(!code) return [];
    if(code.length>2){
      // Bijzondere codes (gb-sct, gb-eng) bestaan alleen als SVG bij lipis
      return [`https://flagicons.lipis.dev/flags/4x3/${code}.svg`];
    }
    return [
      `https://flagcdn.com/w40/${code}.png`,
      `https://flagicons.lipis.dev/flags/4x3/${code}.svg`,
    ];
  },[code]);

  const [bronIdx, setBronIdx] = React.useState(0);
  // Reset naar de eerste bron als het land wisselt
  React.useEffect(()=>{ setBronIdx(0); },[code]);

  if(!code || bronnen.length===0) return <span>🏳️</span>;
  // Alle bronnen geprobeerd en gefaald → neutraal emoji i.p.v. kapot icoon
  if(bronIdx>=bronnen.length) return <span style={{fontSize:size*0.9}}>🏳️</span>;

  return (
    <img
      src={bronnen[bronIdx]}
      alt={name}
      onError={()=>setBronIdx(i=>i+1)}
      style={{width:size,height:"auto",borderRadius:2,verticalAlign:"middle",display:"inline-block"}}
    />
  );
}

const WK_GROUPS = {
  A:[{name:"Mexico"},{name:"Zuid-Afrika"},{name:"Zuid-Korea"},{name:"Tsjechië"}],
  B:[{name:"Canada"},{name:"Bosnië-Herzegovina"},{name:"Qatar"},{name:"Zwitserland"}],
  C:[{name:"Brazilië"},{name:"Marokko"},{name:"Haïti"},{name:"Schotland"}],
  D:[{name:"VS"},{name:"Paraguay"},{name:"Australië"},{name:"Turkije"}],
  E:[{name:"Duitsland"},{name:"Curaçao"},{name:"Ivoorkust"},{name:"Ecuador"}],
  F:[{name:"Nederland"},{name:"Japan"},{name:"Zweden"},{name:"Tunesië"}],
  G:[{name:"België"},{name:"Egypte"},{name:"Iran"},{name:"Nieuw-Zeeland"}],
  H:[{name:"Spanje"},{name:"Kaapverdië"},{name:"Saoedi-Arabië"},{name:"Uruguay"}],
  I:[{name:"Frankrijk"},{name:"Senegal"},{name:"Irak"},{name:"Noorwegen"}],
  J:[{name:"Argentinië"},{name:"Algerije"},{name:"Oostenrijk"},{name:"Jordanië"}],
  K:[{name:"Portugal"},{name:"DR Congo"},{name:"Oezbekistan"},{name:"Colombia"}],
  L:[{name:"Engeland"},{name:"Kroatië"},{name:"Ghana"},{name:"Panama"}],
};
const ALL_TEAMS = Object.values(WK_GROUPS).flat().map(t=>t.name);

const MATCH_SCHEDULE = {
  "A-Mexico-Zuid-Afrika":{date:"11 jun",time:"21:00",city:"Mexico-Stad"},
  "A-Zuid-Korea-Tsjechië":{date:"12 jun",time:"04:00",city:"Guadalajara"},
  "A-Zuid-Afrika-Tsjechië":{date:"18 jun",time:"18:00",city:"Atlanta"},
  "A-Mexico-Zuid-Korea":{date:"19 jun",time:"03:00",city:"Guadalajara"},
  "A-Mexico-Tsjechië":{date:"25 jun",time:"03:00",city:"Mexico-Stad"},
  "A-Zuid-Afrika-Zuid-Korea":{date:"25 jun",time:"03:00",city:"Monterrey"},
  "B-Canada-Bosnië-Herzegovina":{date:"12 jun",time:"21:00",city:"Toronto"},
  "B-Qatar-Zwitserland":{date:"13 jun",time:"21:00",city:"San Francisco"},
  "B-Bosnië-Herzegovina-Zwitserland":{date:"18 jun",time:"21:00",city:"Los Angeles"},
  "B-Canada-Qatar":{date:"19 jun",time:"00:00",city:"Vancouver"},
  "B-Canada-Zwitserland":{date:"24 jun",time:"21:00",city:"Vancouver"},
  "B-Bosnië-Herzegovina-Qatar":{date:"24 jun",time:"21:00",city:"Seattle"},
  "C-Brazilië-Marokko":{date:"14 jun",time:"00:00",city:"New York/NJ"},
  "C-Haïti-Schotland":{date:"14 jun",time:"03:00",city:"Boston"},
  "C-Marokko-Schotland":{date:"20 jun",time:"00:00",city:"Boston"},
  "C-Brazilië-Haïti":{date:"20 jun",time:"03:00",city:"Philadelphia"},
  "C-Brazilië-Schotland":{date:"25 jun",time:"00:00",city:"Miami"},
  "C-Marokko-Haïti":{date:"25 jun",time:"00:00",city:"Atlanta"},
  "D-VS-Paraguay":{date:"13 jun",time:"03:00",city:"Los Angeles"},
  "D-Australië-Turkije":{date:"14 jun",time:"06:00",city:"Vancouver"},
  "D-Paraguay-Turkije":{date:"20 jun",time:"06:00",city:"San Francisco"},
  "D-VS-Australië":{date:"19 jun",time:"21:00",city:"Seattle"},
  "D-VS-Turkije":{date:"26 jun",time:"04:00",city:"Los Angeles"},
  "D-Paraguay-Australië":{date:"26 jun",time:"04:00",city:"San Francisco"},
  "E-Duitsland-Curaçao":{date:"14 jun",time:"19:00",city:"Houston"},
  "E-Ivoorkust-Ecuador":{date:"15 jun",time:"01:00",city:"Philadelphia"},
  "E-Duitsland-Ivoorkust":{date:"20 jun",time:"22:00",city:"Toronto"},
  "E-Curaçao-Ecuador":{date:"21 jun",time:"02:00",city:"Kansas City"},
  "E-Duitsland-Ecuador":{date:"25 jun",time:"22:00",city:"New York/NJ"},
  "E-Curaçao-Ivoorkust":{date:"25 jun",time:"22:00",city:"Philadelphia"},
  "F-Nederland-Japan":{date:"14 jun",time:"22:00",city:"Dallas"},
  "F-Zweden-Tunesië":{date:"15 jun",time:"04:00",city:"Monterrey"},
  "F-Japan-Tunesië":{date:"21 jun",time:"06:00",city:"Monterrey"},
  "F-Nederland-Zweden":{date:"20 jun",time:"19:00",city:"Houston"},
  "F-Japan-Zweden":{date:"26 jun",time:"01:00",city:"Dallas"},
  "F-Nederland-Tunesië":{date:"26 jun",time:"01:00",city:"Kansas City"},
  "G-België-Egypte":{date:"15 jun",time:"21:00",city:"Seattle"},
  "G-Iran-Nieuw-Zeeland":{date:"16 jun",time:"03:00",city:"Los Angeles"},
  "G-België-Iran":{date:"21 jun",time:"21:00",city:"Los Angeles"},
  "G-Egypte-Nieuw-Zeeland":{date:"22 jun",time:"03:00",city:"Vancouver"},
  "G-Egypte-Iran":{date:"27 jun",time:"05:00",city:"Seattle"},
  "G-België-Nieuw-Zeeland":{date:"27 jun",time:"05:00",city:"Vancouver"},
  "H-Spanje-Kaapverdië":{date:"15 jun",time:"18:00",city:"Atlanta"},
  "H-Saoedi-Arabië-Uruguay":{date:"16 jun",time:"00:00",city:"Miami"},
  "H-Spanje-Saoedi-Arabië":{date:"21 jun",time:"18:00",city:"Atlanta"},
  "H-Kaapverdië-Uruguay":{date:"22 jun",time:"00:00",city:"Miami"},
  "H-Kaapverdië-Saoedi-Arabië":{date:"27 jun",time:"02:00",city:"Houston"},
  "H-Spanje-Uruguay":{date:"27 jun",time:"02:00",city:"Guadalajara"},
  "I-Frankrijk-Senegal":{date:"16 jun",time:"21:00",city:"New York/NJ"},
  "I-Irak-Noorwegen":{date:"17 jun",time:"00:00",city:"Boston"},
  "I-Frankrijk-Irak":{date:"22 jun",time:"23:00",city:"Philadelphia"},
  "I-Senegal-Noorwegen":{date:"23 jun",time:"02:00",city:"New York/NJ"},
  "I-Frankrijk-Noorwegen":{date:"26 jun",time:"21:00",city:"Boston"},
  "I-Senegal-Irak":{date:"26 jun",time:"21:00",city:"Toronto"},
  "J-Argentinië-Algerije":{date:"17 jun",time:"03:00",city:"Kansas City"},
  "J-Oostenrijk-Jordanië":{date:"17 jun",time:"06:00",city:"San Francisco"},
  "J-Argentinië-Oostenrijk":{date:"22 jun",time:"19:00",city:"Dallas"},
  "J-Algerije-Jordanië":{date:"23 jun",time:"05:00",city:"San Francisco"},
  "J-Argentinië-Jordanië":{date:"28 jun",time:"04:00",city:"Dallas"},
  "J-Algerije-Oostenrijk":{date:"28 jun",time:"04:00",city:"Kansas City"},
  "K-Portugal-DR Congo":{date:"17 jun",time:"19:00",city:"Houston"},
  "K-Oezbekistan-Colombia":{date:"18 jun",time:"04:00",city:"Mexico-Stad"},
  "K-Portugal-Oezbekistan":{date:"23 jun",time:"19:00",city:"Houston"},
  "K-DR Congo-Colombia":{date:"24 jun",time:"04:00",city:"Guadalajara"},
  "K-Portugal-Colombia":{date:"28 jun",time:"01:30",city:"Miami"},
  "K-DR Congo-Oezbekistan":{date:"28 jun",time:"01:30",city:"Atlanta"},
  "L-Engeland-Kroatië":{date:"17 jun",time:"22:00",city:"Dallas"},
  "L-Ghana-Panama":{date:"18 jun",time:"01:00",city:"Toronto"},
  "L-Engeland-Ghana":{date:"23 jun",time:"22:00",city:"Boston"},
  "L-Kroatië-Panama":{date:"24 jun",time:"01:00",city:"Toronto"},
  "L-Engeland-Panama":{date:"27 jun",time:"23:00",city:"New York/NJ"},
  "L-Kroatië-Ghana":{date:"27 jun",time:"23:00",city:"Philadelphia"}
};

const COLORS = {
  green:"#00633a",yellow:"#fec72f",gray:"#767676",
  light:"#f4f8f5",white:"#ffffff",dark:"#1a2e24",border:"#d0e8d8",
};

function calcToto(h,a){if(+h>+a)return"W";if(+h<+a)return"L";return"D";}
function deadlinePassed(){return localStorage.getItem('deadlineOverride')==='true'||new Date()>DEADLINE;}
function fmtDeadline(){return DEADLINE.toLocaleString("nl-NL",{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});}
function getMatchId(g,t1,t2){return`${g}-${t1}-${t2}`;}

// Bepaalt hoe een KO-uitslag getoond moet worden, inclusief eventuele vermelding
// van verlenging (n.v.) en strafschoppen. Voor de PUNTEN telt altijd de 90-minuten-
// stand (home_goals/away_goals) — dat blijft ongewijzigd. Deze functie bepaalt
// alleen de WEERGAVE ernaast.
//   - geen verlenging → { main: "2–0", caption: null }
//   - verlenging, geen strafschoppen → { main: "3–2", mainSuffix: "(n.v.)", caption: "2–2 na 90 minuten" }
//   - strafschoppen → { main: "1–1", caption: "Paraguay wint n.v. (1–1) en strafschoppen (3–4)" }
//     (caption krijgt een extra ", X–Y na 90 minuten" als de 120-min-stand afwijkt
//     van de 90-minuten-stand, bijv. bij een 3-3 na verlenging dat op 90 min 1-1 was)
function koScoreDisplay(match){
  if(!match) return null;
  const has90 = match.home_goals!==null && match.home_goals!==undefined;
  if(!has90) return null; // nog niet gespeeld
  const hasET = match.home_goals_et!==null && match.home_goals_et!==undefined;
  if(!hasET){
    return { main:`${match.home_goals}–${match.away_goals}`, mainSuffix:null, caption:null };
  }
  const hasPen = match.home_penalties!==null && match.home_penalties!==undefined;
  if(!hasPen){
    // Beslist in verlenging, geen strafschoppen nodig
    return {
      main:`${match.home_goals_et}–${match.away_goals_et}`,
      mainSuffix:"(n.v.)",
      caption:`${match.home_goals}–${match.away_goals} na 90 minuten`,
    };
  }
  // Beslist na strafschoppen
  const winnaar = match.home_penalties>match.away_penalties ? match.home_team : match.away_team;
  const etWijktAf = match.home_goals_et!==match.home_goals || match.away_goals_et!==match.away_goals;
  let caption = `${winnaar} wint n.v. (${match.home_goals_et}–${match.away_goals_et}) en strafschoppen (${match.home_penalties}–${match.away_penalties})`;
  if(etWijktAf) caption += `, ${match.home_goals}–${match.away_goals} na 90 minuten`;
  return { main:`${match.home_goals}–${match.away_goals}`, mainSuffix:null, caption };
}

// ─── FEITEN VOOR "DE ANALYSE VAN LOUIS" ──────────────────────────────────────
// Berekent per deelnemer een pakket HARDE feiten dat naar de AI gaat. De AI mag
// niets bijverzinnen, dus alles wat in het verslag moet kunnen staan, wordt hier
// berekend — met exact dezelfde logica als het klassement (zelfde punten, zelfde
// streak-definities), zodat verslag en klassement elkaar nooit tegenspreken.
// ─── LUCKY BASTARDS / PECHVOGELS ─────────────────────────────────────────────
// Berekent per deelnemer hoe vaak een laat doelpunt (min. 86+, reguliere
// speeltijd) de toto van een wedstrijd deed "kantelen" — en of dat de
// deelnemer punten KOSTTE (pech) of juist OPLEVERDE (geluk) t.o.v. de stand
// vlak vóór dat late doelpunt. Alleen wedstrijden die de admin handmatig als
// "gekanteld" heeft gemarkeerd tellen mee (zie AdminResults/KO-admin).
//   - Pech: voorspelde toto matchte de stand-vóór, maar niet de eindstand
//   - Geluk: voorspelde toto matchte de stand-vóór NIET, maar de eindstand wél
//   - Overig (incl. geen voorspelling): telt niet mee
// Punten: groepsfase-toto = 3 pt, KO-toto = 6 pt (KO_TOTO_PTS) per wedstrijd.
// BELANGRIJK: dit is een MINIMUM — we leggen alleen de toto vlak vóór de
// kanteling vast, geen exacte stand. Stond je vóór het late doelpunt ook nog
// exact goed, dan ben je die extra exacte-punten óók kwijtgeraakt, maar dat
// zit niet in dit cijfer (zie toelichting/tooltip bij het homepage-blok).
const GROEP_TOTO_PTS = 3;
// ─── POULEGEMIDDELDEN (GROEP + KO) ───────────────────────────────────────────
// Eén bron van waarheid voor "hoe goed doet de gemiddelde deelnemer het",
// gebruikt door zowel het "Opvallend"-blok op de homepage als "De analyse van
// Louis" — zodat die twee elkaar nooit kunnen tegenspreken. Groepsfase: gemiddelde
// van de PERCENTAGES van gekwalificeerde deelnemers (≥50 van 72 ingevuld, zelfde
// drempel als de homepage-lijst). KO-fase: CUMULATIEF (som van alle correcte
// voorspellingen / som van alle ingevulde voorspellingen) — geen drempel, want de
// KO-fase groeit nog en te weinig deelnemers zouden anders kwalificeren.
function berekenPouleGemiddelden(ctx){
  const playedMids=Object.keys(ctx.matchResults).filter(mid=>ctx.matchResults[mid]&&ctx.matchResults[mid].home!==null);
  const allMids=Object.keys(MATCH_SCHEDULE);
  const ratios=ctx.participants.map(p=>{
    const pred=ctx.predictions[p.id]||{};
    let totoOk=0,exactOk=0,total=0;
    const aantalIngevuld=allMids.filter(mid=>{
      const pp=pred[mid];
      return pp&&pp.home!==undefined&&pp.home!==null&&pp.away!==undefined&&pp.away!==null;
    }).length;
    playedMids.forEach(mid=>{
      const pp=pred[mid];
      const r=ctx.matchResults[mid];
      if(!pp||pp.home===undefined||pp.home===null||pp.away===undefined||pp.away===null) return;
      total++;
      const ex=parseInt(pp.home)===parseInt(r.home)&&parseInt(pp.away)===parseInt(r.away);
      const to=calcToto(pp.home,pp.away)===calcToto(r.home,r.away);
      if(ex){totoOk++;exactOk++;}else if(to){totoOk++;}
    });
    return{name:`${p.first_name} ${p.last_name}`,participant:p,totoOk,exactOk,total,aantalIngevuld};
  }).filter(r=>r.total>0);

  const DREMPEL=50;
  const ratiosGekwalificeerd=ratios.filter(r=>r.aantalIngevuld>=DREMPEL);
  const avgGroepToto=ratiosGekwalificeerd.length>0
    ? Math.round(ratiosGekwalificeerd.reduce((s,r)=>s+r.totoOk/r.total,0)/ratiosGekwalificeerd.length*100)
    : null;
  const avgGroepExact=ratiosGekwalificeerd.length>0
    ? Math.round(ratiosGekwalificeerd.reduce((s,r)=>s+r.exactOk/r.total,0)/ratiosGekwalificeerd.length*100)
    : null;

  const gespeeldeKO=(ctx.koMatches||[]).filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.home_team&&m.away_team);
  const koRatios=ctx.participants.map(p=>{
    const kpred=ctx.koPredictions[p.id]||{};
    let totoOk=0,exactOk=0,total=0;
    gespeeldeKO.forEach(m=>{
      const pp=kpred[m.id];
      if(!pp||pp.home===undefined||pp.home===null||pp.away===undefined||pp.away===null) return;
      total++;
      const ex=parseInt(pp.home)===parseInt(m.home_goals)&&parseInt(pp.away)===parseInt(m.away_goals);
      const to=calcToto(pp.home,pp.away)===calcToto(m.home_goals,m.away_goals);
      if(ex){totoOk++;exactOk++;}else if(to){totoOk++;}
    });
    return{name:`${p.first_name} ${p.last_name}`,participant:p,totoOk,exactOk,total};
  }).filter(r=>r.total>0);

  const koTotaalIngevuld=koRatios.reduce((s,r)=>s+r.total,0);
  const avgKoToto=koTotaalIngevuld>0
    ? Math.round(koRatios.reduce((s,r)=>s+r.totoOk,0)/koTotaalIngevuld*100)
    : null;
  const avgKoExact=koTotaalIngevuld>0
    ? Math.round(koRatios.reduce((s,r)=>s+r.exactOk,0)/koTotaalIngevuld*100)
    : null;

  // Doorstoot-gemiddelde: percentage per deelnemer (landen goed / max), gemiddeld
  // over alle deelnemers — nodig om "zwakste onderdeel" ook voor doorstoot te
  // kunnen bepalen, naast de al bestaande toto/exact-gemiddelden hierboven.
  const maxDoorstootAll=(ctx.koMatches||[]).filter(m=>m.round_id==="r16").length*2;
  let avgDoorstoot=null;
  if(maxDoorstootAll>0&&ctx.doorstootLanden&&ctx.doorstootLanden.length>0){
    const doorstootPcts=ctx.participants.map(p=>{
      const predAdv=calcDoorstootFromPredictions(ctx.predictions[p.id]||{});
      let goed=0;
      predAdv.forEach(t=>{
        const enNaam=NL_TO_EN_ALIAS[t]||t.toLowerCase();
        if(ctx.doorstootLanden.includes(enNaam)) goed++;
      });
      return goed/maxDoorstootAll;
    });
    avgDoorstoot=doorstootPcts.length>0?Math.round(doorstootPcts.reduce((s,v)=>s+v,0)/doorstootPcts.length*100):null;
  }

  // Bonus-gemiddelde: gemiddeld aantal bonuspunten per deelnemer (zelfde bron
  // die eerder alleen lokaal in berekenAnalyseFeiten berekend werd — nu hier
  // centraal, één bron van waarheid, geen dubbele/uiteenlopende berekening meer).
  let somBonusAlle=0;
  ctx.participants.forEach(p=>{
    Object.entries(ctx.bonusScores[p.id]||{}).forEach(([qi,v])=>{
      if(v){const q=ctx.bonusQuestions.find(bq=>String(bq.idx)===String(qi));somBonusAlle+=(q?.points??20);}
    });
  });
  const avgBonus=ctx.participants.length>0?Math.round(somBonusAlle/ctx.participants.length):null;

  // Bonus-gemiddelde als PERCENTAGE (aantal vragen goed beoordeeld / totaal
  // vragen) — een andere eenheid dan avgBonus hierboven (dat zijn ruwe,
  // punten-gewogen bonuspunten, gebruikt in de AI-feiten). Deze pct-versie is
  // voor het Louis-schema-tabelletje én voor "zwakste onderdeel", waar alle
  // rijen/categorieën in percentages staan.
  // BELANGRIJK: alleen meegeteld als de deelnemer de bonusvragen ook echt heeft
  // ingevuld (ctx.bonusAnswers niet leeg) — iemand die niets invulde (bijv.
  // Peter Smulders) telt anders onterecht mee als 0%, wat het gemiddelde
  // kunstmatig omlaag trekt voor iets wat hij nooit geprobeerd heeft.
  const totaalBonusVragen=(ctx.bonusQuestions||[]).length;
  let avgBonusPct=null;
  if(totaalBonusVragen>0){
    const bonusPcts=ctx.participants
      .filter(p=>Object.keys(ctx.bonusAnswers[p.id]||{}).length>0)
      .map(p=>{
        let goed=0;
        Object.values(ctx.bonusScores[p.id]||{}).forEach(v=>{ if(v===true) goed++; });
        return goed/totaalBonusVragen;
      });
    avgBonusPct=bonusPcts.length>0?Math.round(bonusPcts.reduce((s,v)=>s+v,0)/bonusPcts.length*100):null;
  }

  return {ratiosGekwalificeerd,koRatios,DREMPEL,avgGroepToto,avgGroepExact,avgKoToto,avgKoExact,koTotaalIngevuld,avgDoorstoot,avgBonus,avgBonusPct};
}

function berekenGelukPech(ctx){
  const gekantelde=[];
  Object.entries(ctx.matchResults).forEach(([mid,r])=>{
    if(r.gekanteld && r.toto_voor_kanteling && r.home!==null && r.home!==undefined){
      gekantelde.push({mid, isKO:false, totoVoor:r.toto_voor_kanteling, totoFinaal:calcToto(r.home,r.away), punten:GROEP_TOTO_PTS});
    }
  });
  (ctx.koMatches||[]).forEach(m=>{
    if(m.gekanteld && m.toto_voor_kanteling && m.home_goals!==null && m.home_goals!==undefined){
      gekantelde.push({mid:m.id, isKO:true, totoVoor:m.toto_voor_kanteling, totoFinaal:calcToto(m.home_goals,m.away_goals), punten:KO_TOTO_PTS});
    }
  });

  const resultaten=ctx.participants.map(p=>{
    let geluk=0, pech=0, puntenGeluk=0, puntenPech=0;
    const predGroep=ctx.predictions[p.id]||{};
    const predKO=ctx.koPredictions[p.id]||{};
    gekantelde.forEach(({mid,isKO,totoVoor,totoFinaal,punten})=>{
      const pred=(isKO?predKO:predGroep)[mid];
      if(!pred||pred.home===undefined||pred.home===null||pred.home===""||pred.away===undefined||pred.away===null||pred.away==="") return;
      const totoVoorspeld=calcToto(pred.home,pred.away);
      const matchteVoor=totoVoorspeld===totoVoor;
      const matchteFinaal=totoVoorspeld===totoFinaal;
      if(matchteVoor&&!matchteFinaal){pech++;puntenPech+=punten;}
      else if(!matchteVoor&&matchteFinaal){geluk++;puntenGeluk+=punten;}
    });
    return {
      deelnemer:p, geluk, pech, saldo:geluk-pech,
      puntenGeluk, puntenPech, puntenSaldo:puntenGeluk-puntenPech,
    };
  });
  return {resultaten, aantalGekanteldeWedstrijden:gekantelde.length};
}

// Eén bron van waarheid voor "wat heeft elke deelnemer per onderdeel gescoord",
// gebruikt door zowel de koploper/winnaar-detectie in berekenAnalyseFeiten als
// het Louis-schema-tabelletje (berekenLouisSchema) — zodat winnaar-cijfers in
// de tabel altijd exact overeenkomen met de winnaar die Louis in de tekst noemt.
function berekenAllePuntenTotalen(ctx){
  return ctx.participants.map(q=>{
    const qp=ctx.predictions[q.id]||{};const qk=ctx.koPredictions[q.id]||{};
    let qGToto=0,qGExact=0,qGDoorstoot=0,qKoToto=0,qKoExact=0,qBonus=0;
    let totoGroep=0,exactGroep=0,totoKO=0,exactKO=0,doorstootGoed=0,bonusGoed=0;
    Object.entries(ctx.matchResults).forEach(([mid,r])=>{
      if(r.home===null||r.home===undefined)return;
      const pp=qp[mid];if(!pp||pp.home===undefined||pp.home==="")return;
      const ex=parseInt(pp.home)===parseInt(r.home)&&parseInt(pp.away)===parseInt(r.away);
      const to=calcToto(pp.home,pp.away)===calcToto(r.home,r.away);
      if(ex){qGToto+=3;qGExact+=2;totoGroep++;exactGroep++;}else if(to){qGToto+=3;totoGroep++;}
    });
    const qPredAdv=calcDoorstootFromPredictions(qp);
    if(ctx.doorstootLanden&&ctx.doorstootLanden.length>0){
      qPredAdv.forEach(t=>{
        const enNaam=NL_TO_EN_ALIAS[t]||t.toLowerCase();
        if(ctx.doorstootLanden.includes(enNaam)){qGDoorstoot+=DOORSTOOT_PTS;doorstootGoed++;}
      });
    }
    ctx.koMatches.forEach(m=>{
      if(!m.home_team||m.home_goals===null||m.home_goals===undefined)return;
      const pp=qk[m.id];if(!pp||pp.home===null||pp.home===undefined)return;
      const ex=parseInt(pp.home)===parseInt(m.home_goals)&&parseInt(pp.away)===parseInt(m.away_goals);
      const to=calcToto(pp.home,pp.away)===calcToto(m.home_goals,m.away_goals);
      if(ex){qKoToto+=KO_TOTO_PTS;qKoExact+=(KO_EXACT_PTS-KO_TOTO_PTS);totoKO++;exactKO++;}else if(to){qKoToto+=KO_TOTO_PTS;totoKO++;}
    });
    Object.entries(ctx.bonusScores[q.id]||{}).forEach(([qi,v])=>{
      if(v){const qq=ctx.bonusQuestions.find(bq=>String(bq.idx)===String(qi));qBonus+=(qq?.points??20);}
      if(v===true) bonusGoed++;
    });
    const qTotaal=qGToto+qGExact+qGDoorstoot+qKoToto+qKoExact+qBonus;
    return {participant:q, qGToto,qGExact,qGDoorstoot,qKoToto,qKoExact,qBonus,qTotaal,
      totoGroep,exactGroep,totoKO,exactKO,doorstootGoed,bonusGoed};
  });
}

function berekenAnalyseFeiten(deelnemer, ctx){
  const uid=deelnemer.id;
  const pred=ctx.predictions[uid]||{};
  const koPred=ctx.koPredictions[uid]||{};

  // ── Punten per onderdeel (identiek aan klassement-berekening) ──
  let gToto=0,gExact=0,gDoorstoot=0,koToto=0,koExact=0,bonus=0;
  let totoGoedGroep=0,exactGoedGroep=0,gespeeldGroep=0;
  Object.entries(ctx.matchResults).forEach(([mid,result])=>{
    if(result.home===null||result.home===undefined) return;
    gespeeldGroep++;
    const p=pred[mid];
    if(!p||p.home===undefined||p.away===undefined||p.home===""||p.away==="") return;
    const exactOk=parseInt(p.home)===parseInt(result.home)&&parseInt(p.away)===parseInt(result.away);
    const totoOk=calcToto(p.home,p.away)===calcToto(result.home,result.away);
    if(exactOk){gToto+=3;gExact+=2;totoGoedGroep++;exactGoedGroep++;}
    else if(totoOk){gToto+=3;totoGoedGroep++;}
  });
  const predAdv=calcDoorstootFromPredictions(pred);
  let doorstootGoed=0;
  if(ctx.doorstootLanden&&ctx.doorstootLanden.length>0){
    predAdv.forEach(t=>{
      const enNaam=NL_TO_EN_ALIAS[t]||t.toLowerCase();
      if(ctx.doorstootLanden.includes(enNaam)){gDoorstoot+=DOORSTOOT_PTS;doorstootGoed++;}
    });
  }
  let totoGoedKO=0,exactGoedKO=0,gespeeldKO=0;
  ctx.koMatches.forEach(match=>{
    if(!match.home_team||!match.away_team||match.home_goals===null||match.home_goals===undefined) return;
    gespeeldKO++;
    const p=koPred[match.id];
    if(!p||p.home===undefined||p.home===null) return;
    const exactOk=parseInt(p.home)===parseInt(match.home_goals)&&parseInt(p.away)===parseInt(match.away_goals);
    const totoOk=calcToto(p.home,p.away)===calcToto(match.home_goals,match.away_goals);
    if(exactOk){koToto+=KO_TOTO_PTS;koExact+=(KO_EXACT_PTS-KO_TOTO_PTS);totoGoedKO++;exactGoedKO++;}
    else if(totoOk){koToto+=KO_TOTO_PTS;totoGoedKO++;}
  });
  Object.entries(ctx.bonusScores[uid]||{}).forEach(([qi,v])=>{
    if(v){const q=ctx.bonusQuestions.find(bq=>String(bq.idx)===String(qi));bonus+=(q?.points??20);}
  });

  // ── Streaks + exact-goed-in-doelrijke-wedstrijd (groep+KO chronologisch) ──
  const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
  const gespeeldAlles=[];
  Object.entries(ctx.matchResults).forEach(([mid,r])=>{
    if(r.home===null||r.home===undefined) return;
    const s=MATCH_SCHEDULE[mid];
    let dt=new Date(2099,0,1);
    if(s){const[d,mo]=s.date.split(" ");const[h,m]=s.time.split(":");dt=new Date(2026,months[mo],parseInt(d),parseInt(h),parseInt(m));}
    gespeeldAlles.push({pp:pred[mid],r,dt});
  });
  ctx.koMatches.forEach(m=>{
    if(m.home_goals===null||m.home_goals===undefined||!m.kickoff) return;
    gespeeldAlles.push({pp:koPred[m.id],r:{home:m.home_goals,away:m.away_goals},dt:new Date(m.kickoff)});
  });
  gespeeldAlles.sort((a,b)=>a.dt-b.dt);
  let totoStreak=0,maxTotoStreak=0,exactStreak=0,maxExactStreak=0,exactBijDoelrijk=0;
  gespeeldAlles.forEach(({pp,r})=>{
    const heeft=pp&&pp.home!==undefined&&pp.home!==null&&pp.home!==""&&pp.away!==undefined&&pp.away!==null&&pp.away!=="";
    const exactOk=heeft&&parseInt(pp.home)===parseInt(r.home)&&parseInt(pp.away)===parseInt(r.away);
    const totoOk=heeft&&calcToto(pp.home,pp.away)===calcToto(r.home,r.away);
    totoStreak=totoOk?totoStreak+1:0;maxTotoStreak=Math.max(maxTotoStreak,totoStreak);
    exactStreak=exactOk?exactStreak+1:0;maxExactStreak=Math.max(maxExactStreak,exactStreak);
    if(exactOk&&(parseInt(r.home)+parseInt(r.away))>4) exactBijDoelrijk++;
  });

  // ── Ranking-verloop uit snapshots ──
  const eigen=ctx.rankingSnapshot.filter(r=>r.participant_id===uid&&(r.matches_played??0)>0);
  let startRank=null,huidigRank=null,hoogste=null,laagste=null;
  if(eigen.length>0){
    const sorted=[...eigen].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    startRank=sorted[0].rank;huidigRank=sorted[sorted.length-1].rank;
    sorted.forEach(r=>{
      if(hoogste===null||r.rank<hoogste) hoogste=r.rank;
      if(laagste===null||r.rank>laagste) laagste=r.rank;
    });
  }

  // ── Concurrent: meest gelijkend ranking-verloop (kleinste gemiddelde afstand) ──
  // perBatch is chronologisch te sorteren op created_at (ISO-string, dus string-sort=tijd-sort).
  const perBatch={};
  ctx.rankingSnapshot.forEach(r=>{
    if((r.matches_played??0)<=0) return;
    if(!perBatch[r.created_at]) perBatch[r.created_at]={};
    perBatch[r.created_at][r.participant_id]=r.rank;
  });
  const batchTijden=Object.keys(perBatch).sort();
  let concurrent=null,kleinsteAfstand=Infinity;
  ctx.participants.forEach(q=>{
    if(q.id===uid) return;
    let som=0,n=0;
    Object.values(perBatch).forEach(batch=>{
      if(batch[uid]!==undefined&&batch[q.id]!==undefined){som+=Math.abs(batch[uid]-batch[q.id]);n++;}
    });
    if(n>=5){const gem=som/n;if(gem<kleinsteAfstand){kleinsteAfstand=gem;concurrent=q;}}
  });
  // ── Concurrent-verloop door het toernooi heen: niet alleen het gemiddelde
  // verschil, maar ook hoe vaak van plek gewisseld werd, de grootste voor-
  // en achterstand ooit, en of het gat richting het einde groter of kleiner
  // werd (laatste 20% van de snapshots vs. het volledige gemiddelde). Alles
  // afgeleid uit dezelfde perBatch-tijdreeks, geen nieuwe databron nodig.
  let concurrentVerloop=null;
  if(concurrent){
    let vorigTeken=0, keerGewisseld=0, grootsteVoorsprong=0, grootsteAchterstand=0;
    const verschillen=[];
    batchTijden.forEach(t=>{
      const batch=perBatch[t];
      if(batch[uid]===undefined||batch[concurrent.id]===undefined) return;
      const verschil=batch[concurrent.id]-batch[uid]; // positief = uid staat beter (lager rank getal)
      verschillen.push(verschil);
      const teken=verschil>0?1:verschil<0?-1:0;
      if(teken!==0){
        if(vorigTeken!==0&&teken!==vorigTeken) keerGewisseld++;
        vorigTeken=teken;
      }
      if(verschil>grootsteVoorsprong) grootsteVoorsprong=verschil;
      if(-verschil>grootsteAchterstand) grootsteAchterstand=-verschil;
    });
    if(verschillen.length>=5){
      const laatste20pct=Math.max(1,Math.round(verschillen.length*0.2));
      const slotFase=verschillen.slice(-laatste20pct);
      const gemSlot=slotFase.reduce((s,v)=>s+Math.abs(v),0)/slotFase.length;
      const gemTotaal=verschillen.reduce((s,v)=>s+Math.abs(v),0)/verschillen.length;
      // Alleen als betekenisvol anders (>0.5 plek verschil) — anders "vlak" laten en weglaten
      const richting=Math.abs(gemSlot-gemTotaal)<=0.5?null:(gemSlot<gemTotaal?"kleiner_richting_einde":"groter_richting_einde");
      concurrentVerloop={
        keer_gewisseld:keerGewisseld,
        grootste_voorsprong_op_concurrent:grootsteVoorsprong,
        grootste_achterstand_op_concurrent:grootsteAchterstand,
        richting_einde:richting,
      };
    }
  }

  // ── Koploper/winnaar (voor perspectief naast de concurrent) ──
  // Gebruikt de gedeelde berekenAllePuntenTotalen (zelfde bron als het Louis-
  // schema-tabelletje) om de huidige koploper te vinden (bij afronding na de
  // finale: de daadwerkelijke winnaar).
  const alleTotalen=berekenAllePuntenTotalen(ctx);
  let koploper=null,hoogsteTotaal=-Infinity;
  alleTotalen.forEach(t=>{ if(t.qTotaal>hoogsteTotaal){hoogsteTotaal=t.qTotaal;koploper=t.participant;} });
  const totaal=gToto+gExact+gDoorstoot+koToto+koExact+bonus;

  // ── Geluk/pech: hergebruikt berekenGelukPech (zelfde bron als het homepage-
  // blok "Lucky bastards & Pechvogels"), zodat het verslag nooit iets anders
  // beweert dan wat er publiek op de site staat. Hier vóór winnaarFeit berekend
  // zodat we ook het geluk/pech-saldo van de winnaar erin kunnen meegeven —
  // nodig om het puntverschil met de winnaar in perspectief te zetten (zie
  // ANALYSE_PROMPT: "was het gat vooral geluk, of zat er meer achter?").
  const gelukPechAlles=berekenGelukPech(ctx);
  const gelukPechVan=(id)=>{
    const r=gelukPechAlles.resultaten.find(x=>x.deelnemer.id===id);
    return (r&&(r.geluk>0||r.pech>0))?{
      aantal_geluk:r.geluk, aantal_pech:r.pech, saldo:r.saldo, punten_saldo_minimaal:r.puntenSaldo,
    }:null;
  };

  const winnaarFeit=(koploper&&koploper.id!==uid)?{
    naam:`${koploper.first_name} ${koploper.last_name}`,
    punten:hoogsteTotaal,
    verschil:hoogsteTotaal-totaal,
    geluk_pech:gelukPechVan(koploper.id),
  }:null;

  // ── Poulegemiddelden: gedeelde functie, zelfde cijfers als de homepage ──
  const {avgGroepToto,avgGroepExact,avgKoToto,avgKoExact,avgDoorstoot,avgBonus,avgBonusPct}=berekenPouleGemiddelden(ctx);

  // ── Percentages vooraf berekenen (i.p.v. Louis ter plekke te laten rekenen —
  // dat leidde eerder tot een verwarde/haperende zin toen hij een percentage met
  // een aantal probeerde te vergelijken) ──
  const groepTotoPct=gespeeldGroep>0?Math.round(totoGoedGroep/gespeeldGroep*100):null;
  const groepExactPct=gespeeldGroep>0?Math.round(exactGoedGroep/gespeeldGroep*100):null;
  const koTotoPct=gespeeldKO>0?Math.round(totoGoedKO/gespeeldKO*100):null;
  const koExactPct=gespeeldKO>0?Math.round(exactGoedKO/gespeeldKO*100):null;
  // Max. aantal doorstoot-landen: dynamisch afgeleid (aantal r16-wedstrijden x 2),
  // i.p.v. hardgecodeerd — blijft dan kloppen ook als het toernooiformat wijzigt.
  const maxDoorstoot=(ctx.koMatches||[]).filter(m=>m.round_id==="r16").length*2;
  const doorstootPct=maxDoorstoot>0?Math.round(doorstootGoed/maxDoorstoot*100):null;

  // ── Zwakste onderdeel: relatieve afwijking t.o.v. het poulegemiddelde, over
  // 6 categorieën (4 toto/exact-percentages + doorstoot-pct + bonuspunten).
  // Relatief (verschil/gemiddelde) i.p.v. absoluut, zodat percentage-punten en
  // bonuspunten (verschillende eenheden) eerlijk naast elkaar gelegd kunnen
  // worden. Puur een WIJZER naar welk bestaand feitenpaar de tip moet dragen —
  // geen nieuw getal dat Louis moet interpreteren of voorrekenen (rule 2).
  // Iedere deelnemer heeft altijd een zwakste onderdeel, ook de koploper — er
  // is geen perfecte score, dus dit hoeft nooit negatief/kritisch gebracht te
  // worden, wel altijd als basis voor de afsluittip (zie ANALYSE_PROMPT 7c).
  // Bonusvragen als PERCENTAGE (aantal goed / totaal vragen), niet als ruwe
  // punten — dezelfde maatstaf als avgBonusPct en als de "Onderdeel in
  // cijfers"-tabel (berekenLouisSchema). Voorheen gebruikte dit blok bonus/
  // avgBonus (punten-gewogen), wat in theorie een andere zwakste-onderdeel-
  // uitkomst kon geven dan wat de tabel liet zien — nu altijd consistent.
  const totaalBonusVragen=(ctx.bonusQuestions||[]).length;
  const zelfEntry=alleTotalen.find(t=>t.participant.id===uid);
  const bonusPctZelf=(zelfEntry&&totaalBonusVragen>0)?Math.round(zelfEntry.bonusGoed/totaalBonusVragen*100):null;

  const kandidaten=[
    {categorie:"groepsfase_toto", zelf:groepTotoPct, gem:avgGroepToto},
    {categorie:"groepsfase_exact", zelf:groepExactPct, gem:avgGroepExact},
    {categorie:"ko_toto", zelf:koTotoPct, gem:avgKoToto},
    {categorie:"ko_exact", zelf:koExactPct, gem:avgKoExact},
    {categorie:"doorstoot", zelf:doorstootPct, gem:avgDoorstoot},
    {categorie:"bonusvragen", zelf:bonusPctZelf, gem:avgBonusPct},
  ].filter(k=>k.zelf!==null&&k.gem!==null&&k.gem!==0)
   .map(k=>({...k, relatieveAfwijking:(k.zelf-k.gem)/k.gem}));
  let zwaksteOnderdeel=null;
  if(kandidaten.length>0){
    const laagste=kandidaten.reduce((min,k)=>k.relatieveAfwijking<min.relatieveAfwijking?k:min);
    zwaksteOnderdeel={categorie:laagste.categorie};
  }

  // ── Wereldkampioen-bonusvraag (defensief: alleen als vraag vindbaar én finale gespeeld) ──
  let kampioenFeit=null;
  const kampVraag=ctx.bonusQuestions.find(q=>/kampioen/i.test(q.question||q.text||""));
  const finale=ctx.koMatches.find(m=>m.round_id==="r1");
  if(kampVraag&&finale&&finale.home_goals!==null&&finale.home_goals!==undefined&&finale.home_team&&finale.away_team){
    let winnaar=null;
    const hp=finale.home_penalties,ap=finale.away_penalties;
    const he=finale.home_goals_et,ae=finale.away_goals_et;
    if(hp!==null&&hp!==undefined&&ap!==null&&ap!==undefined) winnaar=hp>ap?finale.home_team:finale.away_team;
    else if(he!==null&&he!==undefined&&ae!==null&&ae!==undefined) winnaar=he>ae?finale.home_team:he<ae?finale.away_team:null;
    else winnaar=finale.home_goals>finale.away_goals?finale.home_team:finale.home_goals<finale.away_goals?finale.away_team:null;
    const antwoord=(ctx.bonusAnswers[uid]||{})[kampVraag.idx];
    // De vraag is type "open" (vrije tekst), dus GEEN eigen tekst-vergelijking
    // (typefoutjes/varianten zoals "Oranje" i.p.v. "Nederland" zouden dan onterecht
    // als fout gelden). We gebruiken i.p.v. daarvan de HANDMATIGE beoordeling die
    // de admin al via het Beoordelen-scherm geeft (bonus_scores) — betrouwbaarder
    // dan een automatische match. Nog niet beoordeeld → goed_voorspeld:null, en de
    // AI-prompt wordt geïnstrueerd dat element dan gewoon weg te laten.
    if(winnaar&&antwoord!==undefined&&antwoord!==null&&antwoord!==""){
      const beoordeling=(ctx.bonusScores[uid]||{})[kampVraag.idx];
      // Alleen meegeven als er al een handmatig oordeel is (true/false). Nog niet
      // beoordeeld → element gewoon weglaten (i.p.v. een dubbelzinnige null-waarde
      // aan de AI voor te leggen).
      if(beoordeling===true||beoordeling===false){
        kampioenFeit={
          wereldkampioen:winnaar,
          voorspelling_deelnemer:antwoord,
          goed_voorspeld:beoordeling,
        };
      }
    }
  }

  // Eigen geluk/pech-feit: zelfde gelukPechAlles als hierboven (al berekend
  // vóór winnaarFeit), via de gedeelde helper — weglaten als er niks gebeurde
  // (geen enkele gekantelde wedstrijd geraakt) — dan is er niks te vertellen.
  const gelukPechFeit=gelukPechVan(uid);

  // ── Leeg gelaten wedstrijden: KO-wedstrijden die nog open stonden op het
  // moment van het maken van deze analyse (teams bekend, nog geen uitslag —
  // dus een voorspelling was mogelijk) maar waar de deelnemer niets invulde.
  // Op Wouts verzoek: dit is een aanmoediging/dreigement richting deelnemers
  // ("Louis velt een vernietigend oordeel als je wedstrijden leeg laat") en
  // geldt voor ALLE nog open KO-wedstrijden, elke ronde — niet alleen de
  // finale. Zie ANALYSE_PROMPT: dit oordeel overstijgt bewust de mildheids-
  // clausule (regel 8), ongeacht klassementspositie.
  const leegGelatenWedstrijden=(ctx.koMatches||[])
    .filter(m=>m.home_team&&m.away_team&&(m.home_goals===null||m.home_goals===undefined)&&!koPred[m.id])
    .map(m=>{
      const ronde=KO_ROUNDS.find(r=>r.id===m.round_id);
      const label=ronde?ronde.label:m.round_id;
      return `${label}: ${m.home_team} - ${m.away_team}`;
    });
  const leegGelatenFeit=leegGelatenWedstrijden.length>0?{wedstrijden:leegGelatenWedstrijden}:null;

  return {
    naam:`${deelnemer.first_name} ${deelnemer.last_name}`,
    totaal_deelnemers:ctx.participants.length,
    eindpositie:huidigRank, start_positie:startRank,
    hoogste_positie_ooit:hoogste, laagste_positie_ooit:laagste,
    punten:{totaal, groepsfase:gToto+gExact, doorstoot:gDoorstoot, ko_fase:koToto+koExact, bonusvragen:bonus},
    groepsfase:{wedstrijden:gespeeldGroep, toto_goed:totoGoedGroep, toto_pct:groepTotoPct, exact_goed:exactGoedGroep, exact_pct:groepExactPct},
    ko_fase:{wedstrijden:gespeeldKO, toto_goed:totoGoedKO, toto_pct:koTotoPct, exact_goed:exactGoedKO, exact_pct:koExactPct},
    doorstoot:{landen_goed:doorstootGoed, landen_max:maxDoorstoot>0?maxDoorstoot:null, pct:doorstootPct},
    langste_toto_reeks:maxTotoStreak,
    langste_exact_reeks:maxExactStreak,
    exact_goed_bij_wedstrijd_met_5plus_doelpunten:exactBijDoelrijk,
    // Poulegemiddelden zijn PERCENTAGES, per fase apart (groep vs KO) — zelfde
    // cijfers als het "Opvallend"-blok op de homepage. Vergelijk dus altijd
    // groepsfase-percentage met groepsfase-gemiddelde, KO met KO — nooit kruislings.
    poule_gemiddelde:{groepsfase_toto_pct:avgGroepToto, groepsfase_exact_pct:avgGroepExact, ko_toto_pct:avgKoToto, ko_exact_pct:avgKoExact, doorstoot_pct:avgDoorstoot, bonuspunten:avgBonus},
    zwakste_onderdeel:zwaksteOnderdeel,
    concurrent:concurrent?{
      naam:`${concurrent.first_name} ${concurrent.last_name}`,
      gemiddeld_posities_verschil:Math.round(kleinsteAfstand*10)/10,
      ...(concurrentVerloop||{}),
    }:null,
    winnaar:winnaarFeit,
    wereldkampioen:kampioenFeit,
    geluk_pech:gelukPechFeit,
    leeg_gelaten:leegGelatenFeit,
  };
}

// ── Louis-schema: het tabelletje "Mijn score / Gemiddelde score / Winnaar's
// score" per onderdeel, getoond onder het verslag van Louis. Puur UI — geen
// AI bij betrokken, dus 100% consistent met de rest van de site. Alles in
// percentages (op verzoek), behalve de laatste rij (geluk/pech, dat is een
// saldo/aantal, geen percentage). Hergebruikt bestaande gedeelde functies
// (berekenAllePuntenTotalen, berekenPouleGemiddelden, berekenGelukPech) zodat
// de winnaar hier altijd exact dezelfde is als in "De analyse van Louis".
function berekenLouisSchema(deelnemer, ctx){
  const uid=deelnemer.id;
  const alleTotalen=berekenAllePuntenTotalen(ctx);
  const zelf=alleTotalen.find(t=>t.participant.id===uid);
  let koploperEntry=null,hoogsteTotaal=-Infinity;
  alleTotalen.forEach(t=>{ if(t.qTotaal>hoogsteTotaal){hoogsteTotaal=t.qTotaal;koploperEntry=t;} });
  if(!zelf||!koploperEntry) return null;

  const gespeeldGroep=Object.values(ctx.matchResults).filter(r=>r&&r.home!==null&&r.home!==undefined).length;
  const gespeeldKO=(ctx.koMatches||[]).filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.home_team&&m.away_team).length;
  const maxDoorstoot=(ctx.koMatches||[]).filter(m=>m.round_id==="r16").length*2;
  const totaalBonusVragen=(ctx.bonusQuestions||[]).length;

  const {avgGroepToto,avgGroepExact,avgKoToto,avgKoExact,avgDoorstoot,avgBonusPct}=berekenPouleGemiddelden(ctx);
  const pct=(n,d)=>d>0?Math.round(n/d*100):null;

  const rijen=[
    {onderdeel:"Groep toto", zelf_pct:pct(zelf.totoGroep,gespeeldGroep), gemiddelde_pct:avgGroepToto, winnaar_pct:pct(koploperEntry.totoGroep,gespeeldGroep)},
    {onderdeel:"Groep exact", zelf_pct:pct(zelf.exactGroep,gespeeldGroep), gemiddelde_pct:avgGroepExact, winnaar_pct:pct(koploperEntry.exactGroep,gespeeldGroep)},
    {onderdeel:"Doorstoot", zelf_pct:pct(zelf.doorstootGoed,maxDoorstoot), gemiddelde_pct:avgDoorstoot, winnaar_pct:pct(koploperEntry.doorstootGoed,maxDoorstoot)},
    {onderdeel:"KO toto", zelf_pct:pct(zelf.totoKO,gespeeldKO), gemiddelde_pct:avgKoToto, winnaar_pct:pct(koploperEntry.totoKO,gespeeldKO)},
    {onderdeel:"KO exact", zelf_pct:pct(zelf.exactKO,gespeeldKO), gemiddelde_pct:avgKoExact, winnaar_pct:pct(koploperEntry.exactKO,gespeeldKO)},
    {onderdeel:"Bonusvragen", zelf_pct:pct(zelf.bonusGoed,totaalBonusVragen), gemiddelde_pct:avgBonusPct, winnaar_pct:pct(koploperEntry.bonusGoed,totaalBonusVragen)},
  ];

  // Geluk/pech: geen poulegemiddelde (zie gesprek met Wout — een saldo dat voor
  // de helft van de poule positief en voor de andere helft negatief uitpakt
  // zegt als gemiddelde weinig). Wel de ratio van de winnaar, plus tussen
  // haakjes het totale puntenverschil van de deelnemer t.o.v. de winnaar.
  const gelukPechAlles=berekenGelukPech(ctx);
  const saldoVan=(id)=>{const r=gelukPechAlles.resultaten.find(x=>x.deelnemer.id===id);return r?r.saldo:0;};
  const fmtSaldo=(s)=>s>0?`+${s}`:`${s}`;
  const geluk_pech={
    onderdeel:"Geluk/pech ratio",
    zelf_ratio:fmtSaldo(saldoVan(uid)),
    winnaar_ratio:fmtSaldo(saldoVan(koploperEntry.participant.id)),
    verschil_punten:zelf.qTotaal-koploperEntry.qTotaal, // ≤0 tenzij deelnemer zelf koploper is
  };

  return {rijen, geluk_pech};
}

const S={
  app:{fontFamily:'"Inter",sans-serif',minHeight:"100vh",background:COLORS.light,color:COLORS.dark},
  header:{background:COLORS.green,color:"#fff",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"center",flexWrap:"wrap",gap:16},
  logo:{fontWeight:800,fontSize:18,letterSpacing:-0.5},
  accent:{color:COLORS.yellow},
  nav:{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"},
  navBtn:(a)=>({padding:"8px 18px",borderRadius:6,border:`1px solid ${COLORS.border}`,cursor:"pointer",fontWeight:600,fontSize:13,letterSpacing:0.1,background:a?COLORS.yellow:"#fff",color:a?COLORS.dark:COLORS.dark}),
  card:{background:"#fff",borderRadius:10,border:`1px solid ${COLORS.border}`,padding:18,marginBottom:14},
  h2:{fontSize:17,fontWeight:700,color:COLORS.green,marginBottom:12,marginTop:0},
  h3:{fontSize:14,fontWeight:700,color:COLORS.dark,marginBottom:8,marginTop:0},
  btn:(c="green")=>({padding:"8px 16px",borderRadius:6,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,background:c==="green"?COLORS.green:c==="yellow"?COLORS.yellow:"#eee",color:c==="yellow"?COLORS.dark:c==="green"?"#fff":COLORS.dark}),
  input:{padding:"7px 11px",borderRadius:6,border:`1px solid ${COLORS.border}`,fontSize:14,width:"100%",boxSizing:"border-box"},
  label:{fontSize:12,fontWeight:600,color:COLORS.gray,marginBottom:4,display:"block"},
  tag:(c)=>({display:"inline-block",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:600,background:c==="green"?"#e8f5ee":c==="yellow"?"#fff8e1":"#eee",color:c==="green"?COLORS.green:c==="yellow"?"#b8860b":COLORS.gray}),
  row:{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"},
  table:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{textAlign:"left",padding:"8px 10px",background:COLORS.green,color:"#fff",fontWeight:600,fontSize:12},
  td:{padding:"8px 10px",borderBottom:`1px solid ${COLORS.border}`},
  tdc:{padding:"8px 10px",borderBottom:`1px solid ${COLORS.border}`,textAlign:"center"},
  badge:{display:"inline-block",minWidth:28,textAlign:"center",padding:"2px 6px",borderRadius:4,fontWeight:700,fontSize:12,background:COLORS.yellow,color:COLORS.dark},
  alert:(t)=>({padding:"10px 14px",borderRadius:8,marginBottom:10,fontSize:13,background:t==="warn"?"#fff8e1":t==="err"?"#fdecea":"#e8f5ee",color:t==="warn"?"#7c5800":t==="err"?"#b71c1c":COLORS.green,border:`1px solid ${t==="warn"?"#ffe082":t==="err"?"#ef9a9a":COLORS.border}`}),
};

function ScoreStepper({value,onChange,disabled}){
  // Default to 0 if not set yet — one click to start
  const parsed=(value===undefined||value===null||value==="")? 0:parseInt(value,10);
  const isDefault=(value===undefined||value===null||value==="");
  // BUGFIX (7 juli, gemeld door Wout — 0-0 na verlenging/strafschoppen werd niet
  // opgeslagen zonder de omweg "eerst naar 1, dan terug naar 0"):
  // vóór deze fix deed de '−'-knop bij een ongebruikte (default) stepper NIETS
  // (parsed<=0 blokkeerde 'm), terwijl de '+'-knop vanuit diezelfde default-staat
  // gewoon een expliciete 1 doorgaf. Daardoor was er geen enkele manier om een
  // stepper direct op een EXPLICIETE 0 te zetten (i.p.v. "nog niet ingevuld") —
  // je moest eerst naar 1 en weer terug, wat niemand zou verzinnen zonder het
  // toevallig te ontdekken. Nu bevestigt de '−'-knop, zolang de stepper nog op
  // de default staat, in één klik een expliciete 0 (net zo direct als de
  // '+'-knop dat al deed voor een expliciete 1). Pas ZODRA de stepper al
  // expliciet op 0 staat, is verder omlaag natuurlijk niet meer mogelijk.
  const decDisabled=disabled||(parsed<=0&&!isDefault);
  function dec(e){e.preventDefault();if(decDisabled)return;onChange(isDefault?0:parsed-1);}
  function inc(e){e.preventDefault();if(disabled)return;onChange(parsed+1);}
  return(
    <div style={{display:"flex",alignItems:"center",border:`2px solid ${!isDefault?COLORS.green:COLORS.border}`,borderRadius:8,overflow:"hidden",background:disabled?"#f5f5f5":"#fff"}}>
      <button type="button" onClick={dec} disabled={decDisabled} style={{width:38,height:42,border:"none",borderRight:`1px solid ${COLORS.border}`,background:"transparent",fontSize:20,fontWeight:700,cursor:decDisabled?"default":"pointer",color:COLORS.green,opacity:decDisabled?0.2:1}}>−</button>
      <div style={{width:36,textAlign:"center",fontSize:17,fontWeight:800,color:COLORS.dark,userSelect:"none"}}>{parsed}</div>
      <button type="button" onClick={inc} disabled={disabled} style={{width:38,height:42,border:"none",borderLeft:`1px solid ${COLORS.border}`,background:"transparent",fontSize:20,fontWeight:700,cursor:disabled?"default":"pointer",color:COLORS.green,opacity:disabled?0.2:1}}>+</button>
    </div>
  );
}

function MatchCard({grp,t1,t2,homeVal,awayVal,onHomeChange,onAwayChange,disabled,onReset,onSave,onEdit,onCancel,isSaved,isEditing,showActions=false,officialResult=null,gekanteld,totoVoorKanteling,onGekanteldChange,onTotoVoorChange}){
  // Calculate points if official result known
  const filled2=homeVal!==null&&homeVal!==undefined&&homeVal!==""&&awayVal!==null&&awayVal!==undefined&&awayVal!=="";
  let pts=null;
  if(officialResult&&filled2&&isSaved){
    const exactOk=parseInt(homeVal)===parseInt(officialResult.home)&&parseInt(awayVal)===parseInt(officialResult.away);
    const totoOk=calcToto(homeVal,awayVal)===calcToto(officialResult.home,officialResult.away);
    pts=exactOk?5:totoOk?3:0;
  }
  const mid=getMatchId(grp,t1.name,t2.name);
  const sch=MATCH_SCHEDULE[mid]||null;
  const homeNum=(homeVal===undefined||homeVal===null||homeVal==="")? null:parseInt(homeVal,10);
  const awayNum=(awayVal===undefined||awayVal===null||awayVal==="")? null:parseInt(awayVal,10);
  // filled = at least one side has been explicitly set (not still at default null)
  const filled=homeNum!==null&&awayNum!==null;
  let totoLabel=null;
  if(filled){const t=calcToto(homeNum,awayNum);totoLabel=t==="W"?`${t1.name} wint`:t==="L"?`${t2.name} wint`:"Gelijkspel";}
  return(
    <div style={{border:`1px solid ${isSaved?"#b2dfdb":filled?"#d0e8d8":COLORS.border}`,borderRadius:10,padding:"12px 14px",marginBottom:10,background:isSaved?"#f0faf6":"#fff"}}>
      {sch&&(
        <div style={{fontSize:11,color:COLORS.gray,marginBottom:8,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span>📅 {sch.date}</span><span>🕐 {sch.time} CET</span><span>📍 {sch.city}</span>
          {officialResult&&(
            <span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontWeight:700,color:COLORS.dark,fontSize:12}}>Uitslag: {officialResult.home}–{officialResult.away}</span>
              {pts!==null&&(
                <span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700,
                  background:pts===5?"#e8f5ee":pts===3?"#fff8e1":"#fdecea",
                  color:pts===5?COLORS.green:pts===3?"#7c5800":"#c62828"}}>
                  {pts===5?"🎯 5pt":pts===3?"✅ 3pt":"❌ 0pt"}
                </span>
              )}
            </span>
          )}
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center",flexWrap:"nowrap"}}>
          <div style={{width:80,display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",flexShrink:0}}>
            <span style={{fontWeight:600,fontSize:11,textAlign:"right",color:COLORS.dark,lineHeight:1.3,hyphens:"auto"}}>{t1.name}</span>
            <FlagImg name={t1.name} size={20}/>
          </div>
          <ScoreStepper value={homeVal} onChange={onHomeChange} disabled={disabled}/>
          <span style={{fontWeight:800,color:COLORS.gray,fontSize:13,flexShrink:0}}>–</span>
          <ScoreStepper value={awayVal} onChange={onAwayChange} disabled={disabled}/>
          <div style={{width:80,display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            <FlagImg name={t2.name} size={20}/>
            <span style={{fontWeight:600,fontSize:11,textAlign:"left",color:COLORS.dark,lineHeight:1.3,hyphens:"auto"}}>{t2.name}</span>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
          {totoLabel&&(
            <span style={{background:"#e8f5ee",color:COLORS.green,border:`1px solid #b2dfdb`,
              borderRadius:5,padding:"3px 10px",fontSize:12,fontWeight:700}}>
              {totoLabel}
            </span>
          )}
          {showActions&&disabled&&isSaved&&(
            <span style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{fontSize:12,color:"#aaa",fontWeight:600}}>✓ Opgeslagen</span>
              <button disabled style={{
                background:"none",border:"1px solid #ccc",cursor:"not-allowed",
                fontSize:11,color:"#ccc",padding:"3px 10px",borderRadius:5,opacity:0.6
              }}>✏️ Wijzigen</button>
            </span>
          )}
          {showActions&&disabled&&!isSaved&&(
            <button disabled style={{
              padding:"4px 14px",borderRadius:6,border:"none",cursor:"not-allowed",
              background:"#ccc",color:"#fff",fontSize:12,fontWeight:700,opacity:0.6
            }}>💾 Opslaan</button>
          )}
          {showActions&&!disabled&&!isSaved&&(
            <button onClick={onSave} style={{
              padding:"4px 14px",borderRadius:6,border:"none",cursor:"pointer",
              background:COLORS.green,color:"#fff",fontSize:12,fontWeight:700,
              boxShadow:"0 1px 3px rgba(0,99,58,0.3)"
            }}>💾 Opslaan</button>
          )}
          {showActions&&!disabled&&isSaved&&!isEditing&&(
            <span style={{fontSize:12,color:COLORS.green,fontWeight:600}}>✓ Opgeslagen</span>
          )}
          {showActions&&!disabled&&isSaved&&!isEditing&&onEdit&&(
            <button onClick={onEdit} style={{
              background:"none",border:`1px solid ${COLORS.gray}`,cursor:"pointer",
              fontSize:11,color:COLORS.gray,padding:"3px 10px",borderRadius:5
            }}>✏️ Wijzigen</button>
          )}
          {showActions&&!disabled&&isSaved&&isEditing&&(
            <button onClick={onSave} style={{
              padding:"4px 14px",borderRadius:6,border:"none",cursor:"pointer",
              background:COLORS.green,color:"#fff",fontSize:12,fontWeight:700,
              boxShadow:"0 1px 3px rgba(0,99,58,0.3)"
            }}>💾 Opslaan</button>
          )}
          {showActions&&!disabled&&isSaved&&isEditing&&onCancel&&(
            <button onClick={onCancel} style={{
              background:"none",border:`1px solid ${COLORS.gray}`,cursor:"pointer",
              fontSize:11,color:COLORS.gray,padding:"3px 10px",borderRadius:5
            }}>✕ Annuleren</button>
          )}
        </div>
        {/* Gekanteld door laat doelpunt (min. 86, reguliere speeltijd) — alleen
            in admin-context (onGekanteldChange meegegeven) en alleen als de
            wedstrijd al een uitslag heeft. Binnen hetzelfde kader als de rest
            van de kaart, zodat nooit onduidelijk is bij welke wedstrijd dit
            hoort (was eerder een los blokje ónder de kaart). */}
        {onGekanteldChange&&isSaved&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:8,paddingTop:8,borderTop:`1px dashed ${COLORS.border}`,flexWrap:"wrap"}}>
            <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:COLORS.gray,cursor:"pointer"}}>
              <input type="checkbox" checked={!!gekanteld} onChange={e=>onGekanteldChange(e.target.checked)}/>
              Gekanteld door laat doelpunt (min. 86+)
            </label>
            {gekanteld&&(
              <select style={{...S.input,width:"auto",padding:"2px 6px",fontSize:11}}
                value={totoVoorKanteling||"D"} onChange={e=>onTotoVoorChange(e.target.value)}>
                <option value="W">Toto vóór: Thuis wint</option>
                <option value="D">Toto vóór: Gelijkspel</option>
                <option value="L">Toto vóór: Uit wint</option>
              </select>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
// ─── LOUIS CHATBOT ────────────────────────────────────────────────────────────
function LouisChatbot(){
  const [open,setOpen]=React.useState(false);
  const [messages,setMessages]=React.useState([]);
  const [input,setInput]=React.useState("");
  const [loading,setLoading]=React.useState(false);
  const bottomRef=React.useRef(null);

  React.useEffect(()=>{
    if(open&&bottomRef.current) bottomRef.current.scrollIntoView({behavior:"smooth"});
  },[messages,open]);

  async function send(){
    const txt=input.trim();
    if(!txt||loading) return;
    const newMessages=[...messages,{role:"user",content:txt}];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try{
      const res=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({messages:newMessages}),
      });
      const data=await res.json();
      setMessages(m=>[...m,{role:"assistant",content:data.response||"Geen antwoord van Louis."}]);
    }catch(e){
      setMessages(m=>[...m,{role:"assistant",content:"Er ging iets mis. Probeer het opnieuw."}]);
    }
    setLoading(false);
  }

  function handleKey(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}

  return(
    <>
      {/* Floating button */}
      <button
        onClick={()=>setOpen(o=>!o)}
        style={{
          position:"fixed",bottom:20,right:20,zIndex:9999,
          width:56,height:56,borderRadius:"50%",border:"none",cursor:"pointer",
          background:COLORS.green,color:"#fff",fontSize:24,
          boxShadow:"0 4px 16px rgba(0,99,58,0.4)",
          display:"flex",alignItems:"center",justifyContent:"center",
        }}
        title="Vraag het aan Louis"
      >
        {open?"✕":"💬"}
      </button>

      {/* Chat venster */}
      {open&&(
        <div style={{
          position:"fixed",bottom:86,right:20,zIndex:9998,
          width:340,maxWidth:"calc(100vw - 40px)",
          background:"#fff",borderRadius:16,
          boxShadow:"0 8px 32px rgba(0,0,0,0.18)",
          display:"flex",flexDirection:"column",overflow:"hidden",
          border:`1px solid ${COLORS.border}`,
        }}>
          {/* Header */}
          <div style={{background:COLORS.green,color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:24}}>🧔</span>
            <div>
              <div style={{fontWeight:800,fontSize:15}}>Louis</div>
              <div style={{fontSize:11,opacity:0.8}}>Assistent WK Poule 2026</div>
            </div>
          </div>

          {/* Berichten */}
          <div style={{flex:1,overflowY:"auto",padding:12,maxHeight:320,display:"flex",flexDirection:"column",gap:8}}>
            {messages.length===0&&(
              <div style={{fontSize:13,color:COLORS.gray,textAlign:"center",marginTop:16,lineHeight:1.6}}>
                Hoi! Ik ben Louis.<br/>Stel me een vraag over de WK Poule.
              </div>
            )}
            {messages.map((m,i)=>(
              <div key={i} style={{
                alignSelf:m.role==="user"?"flex-end":"flex-start",
                maxWidth:"85%",
                background:m.role==="user"?COLORS.green:"#f1f1f1",
                color:m.role==="user"?"#fff":COLORS.dark,
                borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",
                padding:"8px 12px",fontSize:13,lineHeight:1.5,
              }}>
                {m.content}
              </div>
            ))}
            {loading&&(
              <div style={{alignSelf:"flex-start",background:"#f1f1f1",borderRadius:"16px 16px 16px 4px",padding:"8px 12px",fontSize:13,color:COLORS.gray}}>
                Louis denkt na…
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={{padding:"10px 12px",borderTop:`1px solid ${COLORS.border}`,display:"flex",gap:8}}>
            <input
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Stel een vraag…"
              disabled={loading}
              style={{
                flex:1,border:`1px solid ${COLORS.border}`,borderRadius:20,
                padding:"8px 14px",fontSize:13,outline:"none",
                background:loading?"#f9f9f9":"#fff",
              }}
            />
            <button
              onClick={send}
              disabled={loading||!input.trim()}
              style={{
                width:36,height:36,borderRadius:"50%",border:"none",
                background:input.trim()&&!loading?COLORS.green:"#ccc",
                color:"#fff",cursor:input.trim()&&!loading?"pointer":"default",
                fontSize:16,flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}
            >➤</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── KLETSHOEKJE (chat) ───────────────────────────────────────────────────────
function ChatHoekje({ctx}){
  const C=COLORS;
  const [open,setOpen]=React.useState(false);
  const [messages,setMessages]=React.useState([]);
  const [tekst,setTekst]=React.useState("");
  const [naam,setNaam]=React.useState("");
  const [naamGekozen,setNaamGekozen]=React.useState(false);
  const [laatstGezien,setLaatstGezien]=React.useState(0); // timestamp ms van laatst geopend
  const [bezig,setBezig]=React.useState(false);
  const [chatAan,setChatAan]=React.useState(true);
  const [tagQuery,setTagQuery]=React.useState(null); // null = geen actieve @-tag; anders de tekst na @
  const [online,setOnline]=React.useState(0);
  const lijstRef=React.useRef(null);
  const inputRef=React.useRef(null);

  // Lijst met alle deelnemersnamen (voor @-tag suggesties)
  const alleNamen=React.useMemo(()=>{
    return (ctx.participants||[]).map(p=>`${p.first_name} ${p.last_name}`).sort((a,b)=>a.localeCompare(b,"nl"));
  },[ctx.participants]);

  // Gefilterde suggesties op basis van wat er na @ getypt is
  const tagSuggesties=React.useMemo(()=>{
    if(tagQuery===null) return [];
    const q=tagQuery.toLowerCase();
    return alleNamen.filter(n=>n.toLowerCase().includes(q)).slice(0,6);
  },[tagQuery,alleNamen]);

  // client_id: stabiele browser-id voor "eigen bericht verwijderen"
  const clientId=React.useMemo(()=>{
    try{
      let c=localStorage.getItem("wk_chat_client");
      if(!c){ c="c_"+Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem("wk_chat_client",c); }
      return c;
    }catch(e){ return "c_anon"; }
  },[]);

  // Bepaal de afzendernaam: ingelogd → automatisch; anders gekozen naam uit localStorage
  const ingelogdeNaam = ctx.currentUser ? `${ctx.currentUser.first_name} ${ctx.currentUser.last_name}` : null;
  React.useEffect(()=>{
    if(ingelogdeNaam){ setNaam(ingelogdeNaam); setNaamGekozen(true); return; }
    try{
      const opgeslagen=localStorage.getItem("wk_chat_name");
      if(opgeslagen){ setNaam(opgeslagen); setNaamGekozen(true); }
    }catch(e){}
  },[ingelogdeNaam]);

  // Berichten ophalen (polling elke 10 sec) + chat-status meelezen
  const laadBerichten=React.useCallback(async()=>{
    const data=await db.get("chat_messages","select=*&order=created_at.desc&limit=200");
    if(data) setMessages(data);
    const setting=await db.get("app_settings","key=eq.chat_enabled&select=value");
    if(setting) setChatAan(setting.length===0 || setting[0].value==="true");
  },[]);
  React.useEffect(()=>{
    laadBerichten();
    const t=setInterval(laadBerichten,10000);
    return()=>clearInterval(t);
  },[laadBerichten]);

  // Aanwezigheid (heartbeat) — loopt ALTIJD zolang de site open is, ook als de chat dicht is.
  // Werkt elke 30 sec de eigen last_seen bij en telt iedereen met een heartbeat in de laatste 90 sec.
  const heartbeat=React.useCallback(async()=>{
    // Eigen aanwezigheid bijwerken (upsert op client_id)
    await sb("POST","online_presence?on_conflict=client_id",[{client_id:clientId,last_seen:new Date().toISOString()}]);
    // Tel actieve bezoekers (last_seen binnen 90 sec)
    const grens=new Date(Date.now()-90*1000).toISOString();
    const rijen=await db.get("online_presence",`last_seen=gte.${grens}&select=client_id`);
    if(rijen) setOnline(rijen.length);
  },[clientId]);
  React.useEffect(()=>{
    heartbeat();
    const t=setInterval(heartbeat,30000);
    return()=>clearInterval(t);
  },[heartbeat]);

  // Ongelezen-teller: berichten nieuwer dan laatst geopend, niet van jezelf
  React.useEffect(()=>{
    try{ const v=localStorage.getItem("wk_chat_seen"); if(v) setLaatstGezien(parseInt(v)||0); }catch(e){}
  },[]);
  const ongelezen = messages.filter(m=>{
    const t=new Date(m.created_at).getTime();
    return t>laatstGezien && m.client_id!==clientId;
  }).length;

  function openChat(){
    setOpen(true);
    const nu=Date.now();
    setLaatstGezien(nu);
    try{ localStorage.setItem("wk_chat_seen",String(nu)); }catch(e){}
  }
  function sluitChat(){ setOpen(false); }

  function kiesNaam(){
    const n=naam.trim();
    if(!n) return;
    try{ localStorage.setItem("wk_chat_name",n); }catch(e){}
    setNaamGekozen(true);
  }

  // Detecteer of de gebruiker een @-tag aan het typen is (na laatste @ tot cursor)
  function checkTag(waarde){
    setTekst(waarde);
    const match=waarde.match(/@([^@]*)$/); // alles na de laatste @
    if(match){
      // Alleen suggesties tonen zolang er geen spatie ná de @-naam staat die 'm afsluit
      const naTeken=match[1];
      // Sta een paar woorden toe (namen hebben spaties), maar stop bij dubbele spatie / nieuwe regel
      if(!/\n/.test(naTeken)){
        setTagQuery(naTeken);
        return;
      }
    }
    setTagQuery(null);
  }

  function kiesTag(volledigeNaam){
    // Vervang het laatste "@..." door "@VolledigeNaam " (met spatie erachter)
    const nieuw=tekst.replace(/@([^@]*)$/, `@${volledigeNaam} `);
    setTekst(nieuw);
    setTagQuery(null);
    if(inputRef.current) inputRef.current.focus();
  }

  async function verstuur(){
    const m=tekst.trim();
    if(!m || bezig || !chatAan) return;
    if(!naamGekozen) return;
    setBezig(true);
    const nieuw={
      author_name: naam.trim(),
      participant_id: ctx.currentUser ? ctx.currentUser.id : null,
      client_id: clientId,
      message: m,
    };
    const res=await db.insert("chat_messages",[nieuw]);
    if(res){ setTekst(""); await laadBerichten(); }
    setBezig(false);
  }

  async function verwijder(id){
    if(!confirm("Dit bericht verwijderen?")) return;
    await db.delete("chat_messages",`id=eq.${id}`);
    await laadBerichten();
  }

  // Pin/ontpin een bericht (alleen admin). Max één bericht gepind tegelijk:
  // bij pinnen worden eerst alle bestaande pins gereset, daarna dit bericht gepind.
  async function togglePin(m){
    if(!ctx.isAdmin) return;
    if(m.pinned){
      // Ontpinnen
      await db.update("chat_messages",`id=eq.${m.id}`,{pinned:false});
    }else{
      // Eerst alle bestaande pins weghalen, dan dit bericht pinnen
      await db.update("chat_messages","pinned=eq.true",{pinned:false});
      await db.update("chat_messages",`id=eq.${m.id}`,{pinned:true});
    }
    await laadBerichten();
  }

  function magVerwijderen(m){
    return ctx.isAdmin || m.client_id===clientId;
  }

  // Render een bericht met @-getagde namen gemarkeerd (alleen echte deelnemersnamen)
  function renderBericht(tekst){
    if(!tekst.includes("@")) return tekst;
    // Sorteer namen op lengte (langste eerst) zodat "Jan de Laat" vóór "Jan" matcht
    const namenGesorteerd=[...alleNamen].sort((a,b)=>b.length-a.length);
    const delen=[];
    let rest=tekst;
    let guard=0;
    while(rest.length>0 && guard<500){
      guard++;
      const atIdx=rest.indexOf("@");
      if(atIdx===-1){ delen.push(rest); break; }
      // Tekst vóór de @ toevoegen
      if(atIdx>0) delen.push(rest.slice(0,atIdx));
      const naAt=rest.slice(atIdx+1);
      // Zoek of er direct een bekende naam na de @ staat
      const gevonden=namenGesorteerd.find(n=>naAt.toLowerCase().startsWith(n.toLowerCase()));
      if(gevonden){
        delen.push(<span key={delen.length} style={{color:C.green,fontWeight:700,background:"#e8f5ee",borderRadius:4,padding:"0 3px"}}>@{gevonden}</span>);
        rest=naAt.slice(gevonden.length);
      }else{
        // Geen bekende naam → @ als gewone tekst behandelen
        delen.push("@");
        rest=naAt;
      }
    }
    return delen;
  }

  function tijdLabel(iso){
    const d=new Date(iso);
    const nu=new Date();
    const zelfdeDag=d.toDateString()===nu.toDateString();
    const tijd=d.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});
    if(zelfdeDag) return tijd;
    return d.toLocaleDateString("nl-NL",{day:"numeric",month:"short"})+" "+tijd;
  }

  // Bubble (dicht) — gele pill, duidelijk anders dan Louis' groene cirkel
  if(!open){
    return(
      <button onClick={openChat} aria-label="Open kletshoekje" style={{
        position:"fixed",bottom:20,left:20,zIndex:9998,
        height:52,padding:"0 18px",borderRadius:26,border:"none",cursor:"pointer",
        background:C.yellow,color:C.dark,fontSize:15,fontWeight:800,
        boxShadow:"0 4px 14px rgba(0,0,0,0.25)",
        display:"flex",alignItems:"center",gap:8,
      }}>
        <span style={{fontSize:20}}>🗣️</span>
        <span>Praat mee!</span>
        {online>0&&(
          <span style={{display:"flex",alignItems:"center",gap:4,fontSize:13,fontWeight:600,opacity:0.85}}>
            <span style={{color:"#1b5e20",fontSize:10}}>●</span>{online}
          </span>
        )}
        {ongelezen>0&&(
          <span style={{
            minWidth:22,height:22,padding:"0 6px",
            borderRadius:11,background:"#e53935",color:"#fff",fontSize:12,fontWeight:700,
            display:"flex",alignItems:"center",justifyContent:"center",marginLeft:2,
          }}>{ongelezen>99?"99+":ongelezen}</span>
        )}
      </button>
    );
  }

  // Paneel (open)
  return(
    <div style={{
      position:"fixed",bottom:20,left:20,zIndex:9998,
      width:"min(360px, calc(100vw - 40px))",
      // dvh (dynamic viewport height) krimpt mee als het mobiele toetsenbord opkomt,
      // zodat de invoerregel + verstuurknop zichtbaar blijven. vh als fallback.
      height:"min(520px, calc(100vh - 100px))",
      maxHeight:"calc(100dvh - 40px)",
      background:"#fff",borderRadius:14,boxShadow:"0 8px 30px rgba(0,0,0,0.3)",
      display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid ${C.border}`,
    }}>
      {/* Header */}
      <div style={{background:C.green,color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",flexDirection:"column",lineHeight:1.2}}>
          <span style={{fontWeight:800,fontSize:15}}>🗣️ Kletshoekje</span>
          <span style={{fontSize:11,opacity:0.85}}>{messages.length} bericht{messages.length===1?"":"en"}{online>0&&<span> · <span style={{color:"#a5d6a7"}}>●</span> {online} online</span>}</span>
        </div>
        <button onClick={sluitChat} aria-label="Sluiten" style={{background:"none",border:"none",color:"#fff",fontSize:20,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>

      {/* Naamkiezer (alleen als niet ingelogd én nog geen naam gekozen) */}
      {chatAan&&!naamGekozen&&(
        <div style={{padding:16,borderBottom:`1px solid ${C.border}`,background:"#f9fffe"}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:8,color:C.dark}}>Hoe heet je?</div>
          <div style={{display:"flex",gap:6}}>
            <input
              value={naam} onChange={e=>setNaam(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")kiesNaam();}}
              placeholder="Je naam…"
              style={{flex:1,padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13}}
            />
            <button onClick={kiesNaam} style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.green,color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>OK</button>
          </div>
        </div>
      )}

      {!chatAan?(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center",gap:8}}>
          <div style={{fontSize:34}}>🔕</div>
          <div style={{fontSize:14,fontWeight:600,color:C.dark}}>Chat is op dit moment niet beschikbaar</div>
          <div style={{fontSize:12,color:C.gray}}>De beheerder heeft het kletshoekje tijdelijk uitgezet.</div>
        </div>
      ):(
      <>
      {/* Berichtenlijst (nieuwste boven) */}
      <div ref={lijstRef} style={{flex:1,overflowY:"auto",padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
        {messages.length===0&&(
          <div style={{textAlign:"center",color:C.gray,fontSize:13,marginTop:20}}>Nog geen berichten. Wees de eerste! 👋</div>
        )}
        {[...messages].sort((a,b)=>{
          // Gepind bericht altijd bovenaan; daarbinnen blijft de bestaande
          // (nieuwste-eerst) volgorde uit de query behouden.
          if(a.pinned&&!b.pinned) return -1;
          if(!a.pinned&&b.pinned) return 1;
          return 0;
        }).map(m=>{
          const vanMij=m.client_id===clientId;
          const gepind=!!m.pinned;
          return(
            <div key={m.id} style={{
              background:gepind?"#fdf6d8":vanMij?"#e8f5ee":"#f4f4f4",borderRadius:10,padding:"8px 10px",
              border:`1px solid ${gepind?"#e6cf5a":vanMij?"#b2dfdb":"#e8e8e8"}`,
            }}>
              {gepind&&(
                <div style={{display:"flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#9a7d00",textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>
                  📌 Gepind door beheerder
                </div>
              )}
              <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:8,marginBottom:2}}>
                <span style={{fontWeight:700,fontSize:12,color:C.green}}>
                  {m.author_name}{m.participant_id?"":" ·"}
                  {!m.participant_id&&<span style={{fontWeight:400,fontSize:10,color:C.gray}}> gast</span>}
                </span>
                <span style={{fontSize:10,color:C.gray,flexShrink:0}}>{tijdLabel(m.created_at)}</span>
              </div>
              <div style={{fontSize:13,color:C.dark,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{renderBericht(m.message)}</div>
              {(magVerwijderen(m)||ctx.isAdmin)&&(
                <div style={{display:"flex",justifyContent:"flex-end",gap:12,marginTop:2}}>
                  {ctx.isAdmin&&(
                    <button onClick={()=>togglePin(m)} style={{background:"none",border:"none",color:gepind?"#9a7d00":C.gray,fontSize:11,cursor:"pointer",padding:0,fontWeight:gepind?700:400}}>
                      {gepind?"📌 losmaken":"📌 pin"}
                    </button>
                  )}
                  {magVerwijderen(m)&&(
                    <button onClick={()=>verwijder(m.id)} style={{background:"none",border:"none",color:"#c62828",fontSize:11,cursor:"pointer",padding:0}}>verwijderen</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Invoer */}
      {naamGekozen&&(
        <div style={{borderTop:`1px solid ${C.border}`,padding:10,position:"relative"}}>
          {/* @-tag suggesties */}
          {tagSuggesties.length>0&&(
            <div style={{
              position:"absolute",bottom:"100%",left:10,right:10,marginBottom:4,
              background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,
              boxShadow:"0 -4px 14px rgba(0,0,0,0.12)",overflow:"hidden",maxHeight:180,overflowY:"auto",
            }}>
              <div style={{padding:"6px 10px",fontSize:10,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,borderBottom:`1px solid ${C.border}`}}>Tag iemand</div>
              {tagSuggesties.map(n=>(
                <button key={n} onClick={()=>kiesTag(n)} style={{
                  width:"100%",textAlign:"left",padding:"8px 10px",border:"none",background:"#fff",
                  cursor:"pointer",fontSize:13,color:C.dark,display:"flex",alignItems:"center",gap:6,
                }}
                onMouseDown={e=>e.preventDefault()}>
                  <span style={{color:C.green,fontWeight:700}}>@</span>{n}
                </button>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:6,alignItems:"flex-end"}}>
            <textarea
              ref={inputRef}
              value={tekst} onChange={e=>checkTag(e.target.value)}
              onKeyDown={e=>{
                if(e.key==="Escape"){ setTagQuery(null); return; }
                if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); if(tagSuggesties.length>0){ kiesTag(tagSuggesties[0]); } else { verstuur(); } }
              }}
              placeholder={`Bericht als ${naam.trim()}… (typ @ om te taggen)`}
              rows={1}
              style={{flex:1,padding:"8px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,resize:"none",maxHeight:80,fontFamily:"inherit"}}
            />
            <button onClick={verstuur} disabled={bezig||!tekst.trim()} style={{
              padding:"8px 14px",borderRadius:8,border:"none",
              background:(bezig||!tekst.trim())?"#bdbdbd":C.green,color:"#fff",fontWeight:700,fontSize:13,
              cursor:(bezig||!tekst.trim())?"default":"pointer",flexShrink:0,
            }}>➤</button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export default function App(){
  const [view,setView]=useState("home");
  const [navTarget,setNavTarget]=useState(null); // {matchId, date} voor directe navigatie
  // SPA-fix (8 juli, gemeld door Wout): bij het wisselen van view (bijv. via een
  // knop als "Terugblik groepsfase") bleef de scrollpositie van de vorige pagina
  // hangen, waardoor je middenin de nieuwe pagina belandde i.p.v. bovenaan. Dit
  // geldt centraal voor ELKE navigatie, niet alleen deze ene knop.
  useEffect(()=>{ window.scrollTo(0,0); },[view]);
  const [currentUser,setCurrentUser]=useState(null);
  const [isAdmin,setIsAdmin]=useState(false);
  const [participants,setParticipants]=useState([]);
  const [matchResults,setMatchResults]=useState({});
  const [predictions,setPredictions]=useState({});
  const [bonusQuestions,setBonusQuestions]=useState([]);
  const [bonusAnswers,setBonusAnswers]=useState({});
  const [bonusScores,setBonusScores]=useState({});
  const [koMatches,setKoMatches]=useState([]);
  const [koPredictions,setKoPredictions]=useState({});
  const [rankingSnapshot,setRankingSnapshot]=useState([]);
  // Watermark (created_at van de meest recente snapshot-rij die we al hebben) —
  // nodig om bij de 15-minuten-achtergrondrefresh alleen NIEUWE snapshot-rijen
  // op te halen i.p.v. steeds de volledige, groeiende geschiedenis opnieuw (zie
  // egress-fix hieronder in loadAll).
  const snapWatermarkRef=useRef(null);
  const [newsItems,setNewsItems]=useState([]);
  const [rssItems,setRssItems]=useState([]);
  const [doorstootLanden,setDoorstootLanden]=useState([]);
  const [liveScore,setLiveScore]=useState(null);
  const [loading,setLoading]=useState(true);

  // isRefresh=true → achtergrondrefresh (elke 15 min per open tab): alle andere
  // tabellen zijn begrensd van omvang (vast aantal deelnemers x vaste wedstrijden),
  // dus die blijven gewoon volledig herladen. ALLEEN rankings_snapshot groeit
  // onbegrensd door tijdens het toernooi (14.000+ rijen en groeiend) — die tabel
  // wordt bij een refresh daarom alleen als DELTA opgehaald (created_at > laatst
  // geziene watermark) en aan de bestaande state toegevoegd, i.p.v. in zijn
  // geheel opnieuw gedownload. Dit was de hoofdoorzaak van de Supabase-egress-
  // overschrijding (174% van de 5GB-egress-quota, zie gesprek met Wout 7 juli).
  const loadAll=useCallback(async(isRefresh=false)=>{
    if(!isRefresh) setLoading(true);
    const snapQuery=(isRefresh&&snapWatermarkRef.current)
      ? `select=participant_id,rank,matches_played,speeldatum,created_at&order=created_at.asc&created_at=gt.${encodeURIComponent(snapWatermarkRef.current)}`
      : "select=participant_id,rank,matches_played,speeldatum,created_at&order=created_at.desc&limit=40000";
    const [parts,results,preds,bq,ba,bs,kom,kop,snap,news,rss,doorstoot,live]=await Promise.all([
      db.get("participants","select=*&order=created_at"),
      db.get("match_results","select=*"),
      db.get("predictions","select=*&limit=10000"),
      db.get("bonus_questions","select=*&order=idx"),
      db.get("bonus_answers","select=*&limit=10000"),
      db.get("bonus_scores","select=*&limit=10000"),
      db.get("ko_matches","select=*&order=match_num"),
      db.get("ko_predictions","select=*&limit=2000"),
      db.get("rankings_snapshot",snapQuery),
      db.get("news_items","select=*&order=created_at.desc&limit=3"),
      db.get("rss_items","select=*&order=pub_date.desc&limit=5"),
      db.get("doorstoot_landen","select=team_name"),
      db.get("live_score","select=*&limit=1"),
    ]);
    if(parts) setParticipants(parts);
    if(results){
      const m={};
      results.forEach(r=>{m[r.match_id]={home:r.home_goals,away:r.away_goals,gekanteld:r.gekanteld,toto_voor_kanteling:r.toto_voor_kanteling};});
      setMatchResults(m);
    }
    if(preds){
      const p={};
      preds.forEach(r=>{
        if(!p[r.participant_id]) p[r.participant_id]={};
        p[r.participant_id][r.match_id]={home:r.home_goals,away:r.away_goals};
      });
      setPredictions(p);
    }
    if(bq) setBonusQuestions(bq.map(q=>({...q,options:Array.isArray(q.options)?q.options:(typeof q.options==="string"?JSON.parse(q.options):[])  })));
    if(ba){
      const a={};
      ba.forEach(r=>{
        if(!a[r.participant_id]) a[r.participant_id]={};
        a[r.participant_id][r.question_idx]=r.answer;
      });
      setBonusAnswers(a);
    }
    if(bs){
      const s={};
      bs.forEach(r=>{
        if(!s[r.participant_id]) s[r.participant_id]={};
        s[r.participant_id][r.question_idx]=r.correct;
      });
      setBonusScores(s);
    }
    if(kom) setKoMatches(kom);
    if(snap&&snap.length>0){
      if(isRefresh){
        setRankingSnapshot(prev=>[...prev,...snap]); // alleen de nieuwe (delta) rijen erbij
      }else{
        setRankingSnapshot(snap); // initiële load: volledige geschiedenis, vervangt state
      }
      // Watermark = created_at van de meest recente rij in dit resultaat (snap is
      // desc gesorteerd bij initiële load → snap[0]; asc bij refresh → laatste item).
      const nieuwsteCreatedAt=isRefresh?snap[snap.length-1].created_at:snap[0].created_at;
      if(!snapWatermarkRef.current||nieuwsteCreatedAt>snapWatermarkRef.current) snapWatermarkRef.current=nieuwsteCreatedAt;
    }
    if(news) setNewsItems(news);
    if(rss) setRssItems(rss);
    if(doorstoot) setDoorstootLanden(doorstoot.map(r=>r.team_name));
    setLiveScore(live&&live.length>0?live[0]:null);
    if(kop){
      const k={};
      kop.forEach(r=>{
        if(!k[r.participant_id])k[r.participant_id]={};
        k[r.participant_id][r.match_id]={home:r.home_goals,away:r.away_goals};
      });
      setKoPredictions(k);
    }
    setLoading(false);

    // Restore logged-in user from localStorage
    try{
      const savedId=localStorage.getItem("wk_user_id");
      if(savedId&&parts){
        const savedUser=parts.find(p=>p.id===savedId);
        if(savedUser) setCurrentUser(savedUser);
      }
    }catch(e){}
  },[]);

  useEffect(()=>{loadAll(false);},[loadAll]);

  // Auto-refresh data every 15 minutes (silent background update).
  // isRefresh=true zorgt dat rankings_snapshot alleen als delta wordt opgehaald
  // (zie loadAll) — dit was de hoofdoorzaak van de Supabase-egress-overschrijding,
  // niet de 15-minuten-frequentie an sich (die stond er al, maar haalde tot
  // vandaag steeds de VOLLEDIGE, groeiende snapshot-geschiedenis opnieuw op).
  useEffect(()=>{
    const interval=setInterval(()=>{
      loadAll(true);
    }, 15 * 60 * 1000); // 15 minutes
    return()=>clearInterval(interval);
  },[loadAll]);

  // Live score polling elke 30 seconden (alleen als wedstrijd bezig is)
  useEffect(()=>{
    async function pollLiveScore(){
      const res=await db.get("live_score","select=*&limit=1");
      setLiveScore(res&&res.length>0?res[0]:null);
    }
    // Check of er nu een wedstrijd bezig kan zijn
    const now=new Date();
    const anyLive=Object.values(MATCH_SCHEDULE).some(sch=>{
      const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
      const[day,mon]=sch.date.split(" ");
      const[h,m]=sch.time.split(":");
      const start=new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));
      const end=new Date(start.getTime()+130*60000); // wedstrijd + 10 min marge
      return now>=start&&now<=end;
    });
    if(!anyLive) return;
    const interval=setInterval(pollLiveScore,30000);
    return()=>clearInterval(interval);
  },[]);

  useEffect(()=>{
    // Set emoji favicon
    const link = document.querySelector("link[rel~='icon']") || document.createElement("link");
    link.type = "image/svg+xml";
    link.rel = "icon";
    link.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>";
    document.head.appendChild(link);
    document.title = "WK Poule 2026 — Leeuwerik";
  },[]);

  const ctx={
    participants,setParticipants,matchResults,setMatchResults,
    predictions,setPredictions,bonusQuestions,setBonusQuestions,
    bonusAnswers,setBonusAnswers,bonusScores,setBonusScores,
    koMatches,setKoMatches,koPredictions,setKoPredictions,
    currentUser,setCurrentUser,isAdmin,setIsAdmin,loadAll,
    rankingSnapshot,setRankingSnapshot,
    newsItems,setNewsItems,
    rssItems,setRssItems,
    doorstootLanden,setDoorstootLanden,
    liveScore,setLiveScore,
    navTarget,setNavTarget,
  };

  if(loading) return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:12}}><div style={{fontSize:32}}>⚽</div><div style={{fontSize:15,color:COLORS.gray}}>Laden…</div></div>;

  const tabs=[
    {id:"home",label:"Home"},
    {id:"standings",label:"Klassement"},
    {id:"dagprogramma",label:"Programma"},
    {id:"help",label:"Help"},
    ...(!currentUser&&!isAdmin?[{id:"register",label:"Inloggen"}]:[]),
    ...(currentUser?[{id:"predict",label:"⚽ Mijn voorspellingen"}]:[]),
    {id:"admin",label:isAdmin?"⚙️ Beheer":"🔒 Beheer"},
    ...((currentUser||isAdmin)?[{id:"logout",label:"Uitloggen"}]:[]),
  ];

  function handleNav(id){
    if(id==="logout"){setCurrentUser(null);setIsAdmin(false);try{localStorage.removeItem("wk_user_id");}catch(e){}setView("home");}
    else setView(id);
  }

  return(
    <div style={S.app}>
      <LouisChatbot/>
      <ChatHoekje ctx={ctx}/>
      <header style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          <div style={{display:"flex",flexDirection:"column",justifyContent:"center",lineHeight:1.2}}>
            <span style={{color:"#fff",fontWeight:800,fontSize:16,letterSpacing:0.5}}>LEEUWERIK<sup style={{fontSize:9}}>®</sup></span>
            <span style={{color:"rgba(255,255,255,0.75)",fontWeight:400,fontSize:10,fontStyle:"italic"}}>full-service in plaatmateriaal</span>
          </div>
          <div style={{width:1,height:32,background:"rgba(255,255,255,0.35)"}}/>
          <div style={S.logo}>WK Poule <span style={S.accent}>2026</span></div>
        </div>
        <nav style={S.nav}>
          {tabs.map(t=><button key={t.id} style={S.navBtn(view===t.id&&t.id!=="logout")} onClick={()=>handleNav(t.id)}>{t.label}</button>)}
        </nav>
      </header>
      <main style={{maxWidth:900,margin:"0 auto",padding:"20px 14px"}}>
        {view==="home"&&<HomeView setView={setView} ctx={ctx}/>}
        {view==="register"&&<RegisterView setView={setView} ctx={ctx}/>}
        {view==="predict"&&<PredictView ctx={ctx}/>}
        {view==="standings"&&<StandingsView ctx={ctx}/>}
        {view==="dagprogramma"&&<DagProgrammaView ctx={ctx} setView={setView}/>}
        {view==="alle-standen"&&<AlleStandenView ctx={ctx} setView={setView}/>}
        {view==="help"&&<HelpView/>}
        {view==="admin"&&<AdminView ctx={ctx}/>}
      </main>
    </div>
  );
}


// ─── DOORSTOOT BEREKENING ────────────────────────────────────────────────────
function calcGroepsstandFromPred(grp, teams, matchPredictions) {
  const stand = teams.map(t=>({name:t.name,pts:0,gv:0,gt:0,saldo:0,gespeeld:0}));
  teams.forEach((t1,i)=>teams.slice(i+1).forEach((t2,j)=>{
    const mid=getMatchId(grp,t1.name,t2.name);
    const p=matchPredictions[mid];
    if(!p||p.home===undefined||p.home===null||p.home===""||p.away===undefined||p.away===null||p.away==="") return;
    const h=parseInt(p.home),a=parseInt(p.away);
    if(isNaN(h)||isNaN(a)) return;
    const s1=stand.find(s=>s.name===t1.name),s2=stand.find(s=>s.name===t2.name);
    if(!s1||!s2) return;
    s1.gv+=h;s1.gt+=a;s1.saldo+=h-a;s1.gespeeld++;
    s2.gv+=a;s2.gt+=h;s2.saldo+=a-h;s2.gespeeld++;
    if(h>a){s1.pts+=3;}else if(h<a){s2.pts+=3;}else{s1.pts+=1;s2.pts+=1;}
  }));
  return stand.sort((a,b)=>b.pts-a.pts||b.saldo-a.saldo||b.gv-a.gv);
}

function calcDoorstootFromPredictions(matchPred) {
  // Top 2 per groep
  const top2 = [];
  const nr3s = [];
  Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
    const stand = calcGroepsstandFromPred(grp, teams, matchPred);
    if(stand[0]&&stand[0].gespeeld>0) top2.push(stand[0].name);
    if(stand[1]&&stand[1].gespeeld>0) top2.push(stand[1].name);
    // Nummer 3 met punten/saldo voor beste-3 berekening
    if(stand[2]&&stand[2].gespeeld>0) nr3s.push({...stand[2],grp});
  });
  // 8 beste nummers 3
  const best8nr3 = nr3s
    .sort((a,b)=>b.pts-a.pts||b.saldo-a.saldo||b.gv-a.gv)
    .slice(0,8).map(t=>t.name);
  return [...top2, ...best8nr3];
}

function GroepsstandMini({grp,teams,matchPredictions}){
  const stand=calcGroepsstandFromPred(grp,teams,matchPredictions);
  const C=COLORS;
  const anyPlayed=stand.some(t=>t.gespeeld>0);
  if(!anyPlayed) return null;
  return(
    <div style={{marginTop:10,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
      <div style={{background:C.green,color:"#fff",padding:"4px 10px",fontSize:11,fontWeight:700,letterSpacing:0.5}}>STAND GROEP {grp} (o.b.v. jouw voorspellingen)</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:"#f0faf6"}}>
            <th style={{padding:"4px 6px",textAlign:"left",fontWeight:600,color:C.gray,width:20}}>#</th>
            <th style={{padding:"4px 8px",textAlign:"left",fontWeight:600,color:C.gray}}>Land</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>G</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>GV</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>GT</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>+/-</th>
            <th style={{padding:"4px 8px",textAlign:"center",fontWeight:700,color:C.dark}}>Pt</th>
          </tr>
        </thead>
        <tbody>
          {stand.map((t,i)=>(
            <tr key={t.name} style={{background:i<2?"#e8f5ee":i===2?"#fff8e1":"#fff",borderTop:`1px solid ${C.border}`}}>
              <td style={{padding:"4px 6px",fontWeight:700,color:i<2?C.green:C.gray,textAlign:"center"}}>{i+1}</td>
              <td style={{padding:"4px 8px"}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <FlagImg name={t.name} size={14}/> {t.name}
                  {i<2&&<span style={{fontSize:10,color:C.green,fontWeight:700,marginLeft:2}}>✓</span>}
                </div>
              </td>
              <td style={{padding:"4px 6px",textAlign:"center",color:C.gray}}>{t.gespeeld}</td>
              <td style={{padding:"4px 6px",textAlign:"center"}}>{t.gv}</td>
              <td style={{padding:"4px 6px",textAlign:"center"}}>{t.gt}</td>
              <td style={{padding:"4px 6px",textAlign:"center",color:t.saldo>0?C.green:t.saldo<0?"#c62828":C.gray}}>{t.saldo>0?"+":""}{t.saldo}</td>
              <td style={{padding:"4px 8px",textAlign:"center",fontWeight:800,color:C.dark}}>{t.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{fontSize:10,color:C.gray,padding:"3px 8px",background:"#f9fffe"}}>🟢 Gaat door · 🟡 Mogelijke nummer 3</div>
    </div>
  );
}


// ─── KO PREDICT TAB ──────────────────────────────────────────────────────────
function KOPredictTab({ctx, currentUser, saving, setSaving, saved, setSaved}){
  const [localKoPred, setLocalKoPred] = useState({});
  const [editingId, setEditingId] = useState(null); // welke match_id wordt nu bewerkt

  useEffect(()=>{
    setLocalKoPred(ctx.koPredictions[currentUser.id]||{});
  },[currentUser.id, ctx.koPredictions]);

  function canPredict(match){
    if(!match.home_team||!match.away_team) return false;
    if(!match.kickoff) return true;
    const kickoff = new Date(match.kickoff);
    const oneMinBefore = new Date(kickoff.getTime() - 60000);
    return new Date() < oneMinBefore;
  }

  function setKoScore(matchId, field, val){
    setLocalKoPred(p=>({...p,[matchId]:{...p[matchId],[field]:val}}));
    setSaved(false);
  }

  async function saveKoMatch(match){
    setSaving(true);
    const p = localKoPred[match.id]||{};
    // De ScoreStepper toont 0 als standaard. Behandel een nog-niet-aangeraakte
    // waarde dus ook als 0, zodat een 0-0 (of bijv. 2-0 waarbij één kant niet is
    // aangeraakt) gewoon opslaat. Voorheen weigerde de save bij een undefined
    // waarde, waardoor "0-0" zonder stepper-interactie niet werd opgeslagen.
    const homeGoals = (p.home===undefined||p.home===null||p.home==="")? 0 : parseInt(p.home,10);
    const awayGoals = (p.away===undefined||p.away===null||p.away==="")? 0 : parseInt(p.away,10);
    await fetch(`${SUPABASE_URL}/rest/v1/ko_predictions`,{
      method:"POST",
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify([{participant_id:currentUser.id,match_id:match.id,home_goals:homeGoals,away_goals:awayGoals}]),
    });
    // Lokale voorspelling meteen bijwerken zodat de UI klopt, ook als de stepper niet is aangeraakt
    setLocalKoPred(prev=>({...prev,[match.id]:{home:homeGoals,away:awayGoals}}));
    const kop=await db.get("ko_predictions","select=*&limit=2000");
    if(kop){
      const k={};
      kop.forEach(r=>{if(!k[r.participant_id])k[r.participant_id]={};k[r.participant_id][r.match_id]={home:r.home_goals,away:r.away_goals};});
      ctx.setKoPredictions(k);
    }
    setSaving(false);setSaved(true);setEditingId(null);setTimeout(()=>setSaved(false),2000);
  }

  const matchesByRound = KO_ROUNDS.map(round=>({
    ...round,
    matches: ctx.koMatches
      .filter(m=>m.round_id===round.id)
      .sort((a,b)=>a.match_num-b.match_num)
  }));

  if(ctx.koMatches.length===0) return(
    <div style={S.alert("warn")}>
      De knock-outfase wedstrijden worden door de admin ingevoerd zodra de landen bekend zijn.
    </div>
  );

  return(
    <div>
      <div style={{...S.alert(""),marginBottom:12}}>
        Je kunt een wedstrijd voorspellen zodra beide landen bekend zijn, tot <strong>1 minuut voor aanvang</strong>.
        Juiste toto: <strong>{KO_TOTO_PTS} pt</strong> · Exacte uitslag: <strong>{KO_EXACT_PTS} pt</strong> (na 90 min)
      </div>
      {matchesByRound.map(({id,label,matches})=>(
        <div key={id} style={S.card}>
          <h3 style={S.h3}>{label}</h3>
          {matches.map(match=>{
            const open = canPredict(match);
            const p = localKoPred[match.id]||{};
            const result = match.home_goals!==null&&match.home_goals!==undefined;
            const saved_pred = ctx.koPredictions[currentUser.id]?.[match.id];
            const hasSaved = saved_pred&&saved_pred.home!==undefined&&saved_pred.home!==null;
            const beideLanden = match.home_team&&match.away_team;
            const isEditing = editingId===match.id;
            // Bewerkbaar: beide landen bekend, vóór deadline, en (nog niet opgeslagen OF in wijzig-modus)
            const bewerkbaar = open && (!hasSaved || isEditing);
            // Ingevulde lokale voorspelling → toon "[land] wint"
            const pHome=(p.home===undefined||p.home===null||p.home==="")?null:parseInt(p.home,10);
            const pAway=(p.away===undefined||p.away===null||p.away==="")?null:parseInt(p.away,10);
            const filled = pHome!==null&&pAway!==null;
            let totoLabel=null;
            if(filled&&beideLanden){const t=calcToto(pHome,pAway);totoLabel=t==="W"?`${match.home_team} wint`:t==="L"?`${match.away_team} wint`:"Gelijkspel";}

            // Points earned
            let pts = null;
            if(hasSaved&&result){
              const exact=parseInt(saved_pred.home)===parseInt(match.home_goals)&&parseInt(saved_pred.away)===parseInt(match.away_goals);
              const toto=calcToto(saved_pred.home,saved_pred.away)===calcToto(match.home_goals,match.away_goals);
              pts=exact?KO_EXACT_PTS:toto?KO_TOTO_PTS:0;
            }

            // Kleurcodering: groen=opgeslagen, wit=te voorspellen, grijs=nog niet mogelijk
            const bgKleur = !beideLanden ? "#f7f7f7" : hasSaved ? "#f0faf6" : "#fff";
            const randKleur = !beideLanden ? "#e0e0e0" : hasSaved ? COLORS.green : COLORS.border;

            return(
              <div key={match.id} style={{border:`1px solid ${randKleur}`,borderRadius:10,padding:"12px 14px",marginBottom:10,background:bgKleur}}>
                {/* Match info */}
                <div style={{fontSize:11,color:COLORS.gray,marginBottom:8,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontWeight:600,color:COLORS.dark}}>#{match.match_num}</span>
                  {match.kickoff&&<span>📅 {new Date(match.kickoff).toLocaleDateString("nl-NL",{day:"numeric",month:"short"})} · {new Date(match.kickoff).toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"})} CET</span>}
                  {match.city&&<span>📍 {match.city}</span>}
                  {!beideLanden&&<span style={{color:COLORS.gray,fontStyle:"italic"}}>Landen nog niet bekend</span>}
                  {beideLanden&&!hasSaved&&open&&<span style={{color:COLORS.green,fontWeight:600}}>Voorspellen mogelijk</span>}
                  {beideLanden&&!open&&!result&&<span style={{color:"#c62828",fontWeight:600}}>🔒 Gesloten</span>}
                  {result&&<span style={{color:COLORS.green,fontWeight:600}}>Uitslag: {match.home_goals}–{match.away_goals}</span>}
                  {pts!==null&&(
                    <span style={{padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:700,
                      background:pts===KO_EXACT_PTS?"#e8f5ee":pts===KO_TOTO_PTS?"#fff8e1":"#fdecea",
                      color:pts===KO_EXACT_PTS?COLORS.green:pts===KO_TOTO_PTS?"#7c5800":"#c62828"}}>
                      {pts===KO_EXACT_PTS?`🎯 ${KO_EXACT_PTS}pt`:pts===KO_TOTO_PTS?`✅ ${KO_TOTO_PTS}pt`:"❌ 0pt"}
                    </span>
                  )}
                </div>

                {/* Teams + score */}
                {!beideLanden ? (
                  // Landen nog niet (volledig) bekend
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:"8px 0"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,opacity:match.home_team?1:0.4}}>
                      {match.home_team
                        ? <><FlagImg name={match.home_team} size={20}/><span style={{fontSize:13,fontWeight:600}}>{match.home_team}</span></>
                        : <><div style={{width:28,height:20,background:"#ddd",borderRadius:3}}/><span style={{fontSize:13,color:COLORS.gray,fontStyle:"italic"}}>PM</span></>
                      }
                    </div>
                    <span style={{fontWeight:700,color:COLORS.gray,fontSize:15}}>vs</span>
                    <div style={{display:"flex",alignItems:"center",gap:6,opacity:match.away_team?1:0.4}}>
                      {match.away_team
                        ? <><span style={{fontSize:13,fontWeight:600}}>{match.away_team}</span><FlagImg name={match.away_team} size={20}/></>
                        : <><span style={{fontSize:13,color:COLORS.gray,fontStyle:"italic"}}>PM</span><div style={{width:28,height:20,background:"#ddd",borderRadius:3}}/></>
                      }
                    </div>
                    <span style={{fontSize:11,color:COLORS.gray,marginLeft:4,fontStyle:"italic"}}>
                      {match.home_team&&!match.away_team?"Uitland volgt nog":!match.home_team&&match.away_team?"Thuisland volgt nog":"Landen volgen na de groepsfase"}
                    </span>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto 1fr",alignItems:"center",gap:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
                        <span style={{fontWeight:600,fontSize:13}}>{match.home_team}</span>
                        <FlagImg name={match.home_team} size={22}/>
                      </div>
                      <ScoreStepper value={p.home} onChange={v=>setKoScore(match.id,"home",v)} disabled={!bewerkbaar}/>
                      <span style={{fontWeight:800,color:COLORS.gray,fontSize:13,textAlign:"center"}}>–</span>
                      <ScoreStepper value={p.away} onChange={v=>setKoScore(match.id,"away",v)} disabled={!bewerkbaar}/>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <FlagImg name={match.away_team} size={22}/>
                        <span style={{fontWeight:600,fontSize:13}}>{match.away_team}</span>
                      </div>
                    </div>

                    {/* Wint-label + actieknoppen */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:6,flexWrap:"wrap"}}>
                      {totoLabel&&(
                        <span style={{background:"#e8f5ee",color:COLORS.green,border:`1px solid #b2dfdb`,
                          borderRadius:5,padding:"3px 10px",fontSize:12,fontWeight:700}}>
                          {totoLabel}
                        </span>
                      )}
                      {/* Opslaan (nog niet opgeslagen, open) */}
                      {open&&!hasSaved&&(
                        <button onClick={()=>saveKoMatch(match)} disabled={saving} style={{
                          padding:"4px 14px",borderRadius:6,border:"none",cursor:"pointer",
                          background:COLORS.green,color:"#fff",fontSize:12,fontWeight:700,
                          boxShadow:"0 1px 3px rgba(0,99,58,0.3)"
                        }}>💾 Opslaan</button>
                      )}
                      {/* Opgeslagen + wijzigen (open, opgeslagen, niet aan het bewerken) */}
                      {open&&hasSaved&&!isEditing&&(
                        <>
                          <span style={{fontSize:12,color:COLORS.green,fontWeight:600}}>✓ Opgeslagen</span>
                          <button onClick={()=>{setEditingId(match.id);setSaved(false);}} style={{
                            background:"none",border:`1px solid ${COLORS.gray}`,cursor:"pointer",
                            fontSize:11,color:COLORS.gray,padding:"3px 10px",borderRadius:5
                          }}>✏️ Wijzigen</button>
                        </>
                      )}
                      {/* Opslaan + annuleren (open, opgeslagen, aan het bewerken) */}
                      {open&&hasSaved&&isEditing&&(
                        <>
                          <button onClick={()=>saveKoMatch(match)} disabled={saving} style={{
                            padding:"4px 14px",borderRadius:6,border:"none",cursor:"pointer",
                            background:COLORS.green,color:"#fff",fontSize:12,fontWeight:700,
                            boxShadow:"0 1px 3px rgba(0,99,58,0.3)"
                          }}>💾 Opslaan</button>
                          <button onClick={()=>{setEditingId(null);setLocalKoPred(prev=>({...prev,[match.id]:saved_pred}));}} style={{
                            background:"none",border:`1px solid ${COLORS.gray}`,cursor:"pointer",
                            fontSize:11,color:COLORS.gray,padding:"3px 10px",borderRadius:5
                          }}>✕ Annuleren</button>
                        </>
                      )}
                      {/* Gesloten, wel opgeslagen → toon opgeslagen voorspelling */}
                      {!open&&hasSaved&&(
                        <span style={{fontSize:12,color:"#aaa",fontWeight:600}}>✓ Opgeslagen: {saved_pred.home}–{saved_pred.away}</span>
                      )}
                      {/* Gesloten, niet opgeslagen → niets meer mogelijk */}
                      {!open&&!hasSaved&&!result&&(
                        <span style={{fontSize:12,color:"#c62828",fontWeight:600}}>Niet meer te voorspellen</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}



// ─── NU LIVE BLOK ────────────────────────────────────────────────────────────
function NuLiveBlok({liveScore, ctx, setView}){
  const C = COLORS;
  const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};

  // Meest recente gespeelde wedstrijd (groep + KO)
  const laatstGespeeld = React.useMemo(()=>{
    let beste=null,besteDt=null;
    // Groepswedstrijden
    Object.entries(MATCH_SCHEDULE).forEach(([mid,sch])=>{
      const result=ctx.matchResults[mid];
      if(!result||result.home===null||result.home===undefined) return;
      const[day,mon]=sch.date.split(" ");const[h,m]=sch.time.split(":");
      const dt=new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));
      if(!besteDt||dt>besteDt){besteDt=dt;beste={mid,sch,result,dt};}
    });
    // KO-wedstrijden
    (ctx.koMatches||[]).forEach(km=>{
      if(km.home_goals===null||km.home_goals===undefined||!km.kickoff) return;
      const dt=new Date(km.kickoff);
      if(!besteDt||dt>besteDt){
        besteDt=dt;
        const ronde=KO_ROUNDS.find(r=>r.id===km.round_id);
        beste={mid:km.id,sch:{date:dt.toLocaleDateString("nl-NL",{day:"numeric",month:"short"}),time:dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Amsterdam"}),city:km.city||"",isKO:true,koLabel:ronde?ronde.label:"Knock-out",home_team:km.home_team,away_team:km.away_team},result:{home:km.home_goals,away:km.away_goals},koMatch:km,dt};
      }
    });
    return beste;
  },[ctx.matchResults,ctx.koMatches]);

  // Eerstvolgende wedstrijd (groep + KO)
  const volgende=React.useMemo(()=>{
    let vroegste=null,vroegsteDt=null;
    // Groepswedstrijden zonder uitslag
    Object.entries(MATCH_SCHEDULE).forEach(([mid,sch])=>{
      const result=ctx.matchResults[mid];
      if(result&&result.home!==null&&result.home!==undefined) return;
      const[day,mon]=sch.date.split(" ");const[h,m]=sch.time.split(":");
      const dt=new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));
      if(!vroegsteDt||dt<vroegsteDt){vroegsteDt=dt;vroegste={mid,sch,dt};}
    });
    // KO-wedstrijden zonder uitslag
    (ctx.koMatches||[]).forEach(km=>{
      if(km.home_goals!==null&&km.home_goals!==undefined) return;
      if(!km.kickoff) return;
      const dt=new Date(km.kickoff);
      if(!vroegsteDt||dt<vroegsteDt){
        vroegsteDt=dt;
        const ronde=KO_ROUNDS.find(r=>r.id===km.round_id);
        vroegste={mid:km.id,sch:{date:dt.toLocaleDateString("nl-NL",{day:"numeric",month:"short"}),time:dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Amsterdam"}),city:km.city||"",isKO:true,koLabel:ronde?ronde.label:"Knock-out",home_team:km.home_team,away_team:km.away_team},dt};
      }
    });
    return vroegste;
  },[ctx.matchResults,ctx.koMatches]);

  const now=new Date();
  const isLive=!!liveScore;
  // Toon "Laatst gespeeld" als:
  // - geen live data én
  // - er een uitslag is én
  // - volgende wedstrijd nog niet begonnen ÓÓOR net begonnen maar nog geen live data (< 10 min geleden)
  const volgendeBegonnen = volgende && now >= volgende.dt;
  // Geen live-API beschikbaar, dus "Nu bezig" blijft zichtbaar zolang de wedstrijd
  // loopt zonder uitslag — niet beperkt tot een korte marge na aanvang.
  // We geven een ruime marge van 3 uur (langer dan een wedstrijd + rust kan duren)
  // zodat het blok niet eindeloos "nu bezig" blijft tonen als een uitslag vergeten wordt.
  const volgendeBinnenRedelijkeTijd = volgende && now < new Date(volgende.dt.getTime() + 3*60*60000);
  const toonLaatstGespeeld=!isLive&&!!laatstGespeeld&&(!volgendeBegonnen||(volgendeBegonnen&&volgendeBinnenRedelijkeTijd));

  if(!isLive&&!toonLaatstGespeeld) return null;

  // ─── LAATST GESPEELD / NU BEZIG (zonder live data) ──────────────────────────
  if(toonLaatstGespeeld){
    // Als de volgende wedstrijd al begonnen is (maar geen live-data beschikbaar),
    // toon DIE wedstrijd centraal met "NU BEZIG" — niet de vorige uitslag.
    const toonNuBezigWedstrijd = volgendeBegonnen && volgende;
    const mid = toonNuBezigWedstrijd ? volgende.mid : laatstGespeeld.mid;
    const sch = toonNuBezigWedstrijd ? volgende.sch : laatstGespeeld.sch;
    const result = toonNuBezigWedstrijd ? null : laatstGespeeld.result;
    // n.v./strafschoppen-weergave, alleen relevant voor KO-wedstrijden met verlenging
    const koDisp = (!toonNuBezigWedstrijd && sch.isKO && laatstGespeeld.koMatch) ? koScoreDisplay(laatstGespeeld.koMatch) : null;

    let t1=null,t2=null;
    if(sch.isKO){
      // KO-wedstrijd: teams komen direct uit de sch-data (mid is een UUID, geen groep-formaat)
      t1=sch.home_team?{name:sch.home_team}:{name:"nog onbekend"};
      t2=sch.away_team?{name:sch.away_team}:{name:"nog onbekend"};
    }else{
      const parts=mid.split("-");const grp=parts[0];
      const groupTeams=WK_GROUPS[grp]||[];
      for(let i=0;i<groupTeams.length;i++) for(let j=i+1;j<groupTeams.length;j++){
        if(`${grp}-${groupTeams[i].name}-${groupTeams[j].name}`===mid){t1=groupTeams[i];t2=groupTeams[j];}
      }
      if(!t1||!t2) return null;
    }
    return(
      <div style={{borderRadius:12,overflow:"hidden",marginBottom:14,
        boxShadow:"0 2px 12px rgba(0,0,0,0.08)",border:`1px solid ${C.border}`}}>
        <div style={{background:toonNuBezigWedstrijd?"#e53935":C.dark,color:"#fff",padding:"10px 16px",
          display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>{toonNuBezigWedstrijd?"●":"⏱"}</span>
          <span style={{fontWeight:800,fontSize:14,letterSpacing:0.5}}>
            {toonNuBezigWedstrijd?"NU BEZIG":"LAATST GESPEELD"}
          </span>
          <span style={{marginLeft:"auto",fontSize:11,opacity:0.7}}>
            {sch.date} · {sch.time} CET · {sch.city}
          </span>
        </div>
        <div style={{background:"#fff",padding:"20px 16px"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"center",gap:16,marginBottom:12}}>
            <div style={{flex:1,minHeight:56,display:"flex",alignItems:"center"}}>
              <div style={{width:"100%",display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
                <span style={{fontWeight:800,fontSize:16,color:C.dark}}>{t1.name}</span>
                <FlagImg name={t1.name} size={28}/>
              </div>
            </div>
            {result?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{background:"#f4f8f5",borderRadius:10,padding:"8px 20px",minHeight:56,boxSizing:"border-box",
                  display:"flex",alignItems:"center",gap:12,minWidth:100,justifyContent:"center"}}>
                  {koDisp?(<>
                    <span style={{fontSize:32,fontWeight:900,color:C.dark}}>{koDisp.main.split("–")[0]}</span>
                    <span style={{fontSize:20,color:C.gray}}>–</span>
                    <span style={{fontSize:32,fontWeight:900,color:C.dark}}>{koDisp.main.split("–")[1]}</span>
                  </>):(<>
                    <span style={{fontSize:32,fontWeight:900,color:C.dark}}>{result.home}</span>
                    <span style={{fontSize:20,color:C.gray}}>–</span>
                    <span style={{fontSize:32,fontWeight:900,color:C.dark}}>{result.away}</span>
                  </>)}
                </div>
                {koDisp?.mainSuffix&&<span style={{fontSize:11,color:C.gray,fontWeight:600}}>{koDisp.mainSuffix}</span>}
              </div>
            ):(
              <div style={{padding:"8px 20px",minHeight:56,boxSizing:"border-box",borderRadius:10,fontWeight:700,fontSize:14,color:C.gray,display:"flex",alignItems:"center"}}>vs</div>
            )}
            <div style={{flex:1,minHeight:56,display:"flex",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <FlagImg name={t2.name} size={28}/>
                <span style={{fontWeight:800,fontSize:16,color:C.dark}}>{t2.name}</span>
              </div>
            </div>
          </div>
          {koDisp?.caption&&(
            <div style={{textAlign:"center",fontSize:12,color:C.gray,marginBottom:8}}>{koDisp.caption}</div>
          )}
          {toonNuBezigWedstrijd?(
            <div style={{textAlign:"center",fontSize:12,color:"#e53935",fontWeight:700}}>
              Uitslag nog niet bekend — wordt zo snel mogelijk ingevoerd
            </div>
          ):volgende&&(
            <div style={{textAlign:"center",fontSize:12,color:C.gray}}>
              Volgende wedstrijd: <strong style={{color:C.dark}}>{volgende.sch.date} om {volgende.sch.time} CET</strong>
            </div>
          )}
          {/* Voorspellingsverdeling */}
          {(()=>{
            // KO-wedstrijden hebben hun voorspellingen in koPredictions, groepswedstrijden in predictions
            const predBron = sch.isKO ? ctx.koPredictions : ctx.predictions;
            const predRows=ctx.participants.map(p=>{
              const pred=predBron[p.id]?.[mid];
              const hasPred=pred&&pred.home!==undefined&&pred.home!==null;
              return{...p,pred,hasPred};
            }).filter(p=>p.hasPred);
            const totaalPred=predRows.length;
            const freqMap={};
            predRows.forEach(p=>{
              const key=`${p.pred.home}-${p.pred.away}`;
              freqMap[key]=(freqMap[key]||0)+1;
            });
            const topPred=Object.entries(freqMap).sort((a,b)=>b[1]-a[1])[0];
            if(totaalPred===0) return null;
            return(
              <div style={{marginTop:12,background:C.light,borderRadius:8,padding:"10px 14px",
                display:"flex",alignItems:"center",justifyContent:"space-between",
                flexWrap:"wrap",gap:8,fontSize:12}}>
                <span style={{color:C.gray}}>
                  ⚽ <strong style={{color:C.dark}}>{totaalPred}</strong> voorspellingen
                </span>
                {topPred&&(
                  <span style={{color:C.gray}}>
                    Meest voorspeld: <strong style={{color:C.green}}>{topPred[0]}</strong>
                    <span style={{color:C.gray}}> ({topPred[1]}×)</span>
                  </span>
                )}
                <button onClick={()=>{
                    ctx.setNavTarget({matchId:mid,date:sch.date});
                    setView("dagprogramma");
                  }}
                  style={{...S.btn("green"),fontSize:11,padding:"4px 10px"}}>
                  Alle voorspellingen →
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ─── NU LIVE ──────────────────────────────────────────────────────────────
  // Vertaal Engelse teamnaam naar Nederlandse vlag via NL_TO_EN_ALIAS omgekeerd
  const EN_TO_NL = Object.fromEntries(Object.entries(NL_TO_EN_ALIAS).map(([nl,en])=>[en,nl]));
  const homeNL = EN_TO_NL[liveScore.home_team?.toLowerCase()] || liveScore.home_team;
  const awayNL = EN_TO_NL[liveScore.away_team?.toLowerCase()] || liveScore.away_team;

  // Voorspellingsverdeling voor deze wedstrijd
  // Zoek match_id op via teamnamen als die niet direct beschikbaar is
  const mid = liveScore.match_id || (()=>{
    const homeEn = (liveScore.home_team||"").toLowerCase();
    const awayEn = (liveScore.away_team||"").toLowerCase();
    const homeNl = EN_TO_NL[homeEn] || liveScore.home_team;
    const awayNl = EN_TO_NL[awayEn] || liveScore.away_team;
    return Object.keys(MATCH_SCHEDULE).find(k=>{
      const parts = k.split("-");
      const grp = parts[0];
      return k === `${grp}-${homeNl}-${awayNl}` || k === `${grp}-${awayNl}-${homeNl}`;
    }) || null;
  })();
  const predRows = mid ? ctx.participants.map(p=>{
    const pred = ctx.predictions[p.id]?.[mid];
    const hasPred = pred&&pred.home!==undefined&&pred.home!==null;
    return{...p, pred, hasPred};
  }).filter(p=>p.hasPred) : [];
  const totaalPred = predRows.length;

  // Meest voorspelde uitslag
  const freqMap = {};
  predRows.forEach(p=>{
    const key = `${p.pred.home}-${p.pred.away}`;
    freqMap[key] = (freqMap[key]||0)+1;
  });
  const topPred = Object.entries(freqMap).sort((a,b)=>b[1]-a[1])[0];

  const isHalftime = liveScore.status === "PAUSED";

  return(
    <div style={{
      borderRadius:12, overflow:"hidden", marginBottom:14,
      boxShadow:"0 4px 20px rgba(0,99,58,0.25)",
      border:`2px solid ${C.green}`,
    }}>
      {/* Header met pulserende indicator */}
      <div style={{
        background:C.green, color:"#fff",
        padding:"10px 16px",
        display:"flex", alignItems:"center", gap:10,
      }}>
        <span style={{
          display:"inline-block", width:10, height:10, borderRadius:"50%",
          background:"#ff4444",
          boxShadow:"0 0 0 0 rgba(255,68,68,0.7)",
          animation:"pulse 1.5s infinite",
        }}/>
        <style>{`@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(255,68,68,0.7)}70%{box-shadow:0 0 0 8px rgba(255,68,68,0)}100%{box-shadow:0 0 0 0 rgba(255,68,68,0)}}`}</style>
        <span style={{fontWeight:800, fontSize:14, letterSpacing:0.5}}>
          {isHalftime ? "⏸ RUST" : "● NU LIVE"}
        </span>
        {liveScore.minute&&!isHalftime&&(
          <span style={{fontSize:12, opacity:0.85}}>{liveScore.minute}'</span>
        )}
        <span style={{marginLeft:"auto", fontSize:11, opacity:0.75}}>
          Bijgewerkt elke 30s
        </span>
      </div>

      {/* Score */}
      <div style={{background:"#fff", padding:"20px 16px"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:16}}>
          {/* Thuisteam */}
          <div style={{flex:1, textAlign:"right"}}>
            <div style={{display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end"}}>
              <span style={{fontWeight:800, fontSize:16, color:C.dark}}>{homeNL}</span>
              <FlagImg name={homeNL} size={28}/>
            </div>
          </div>

          {/* Score display */}
          <div style={{
            background:C.green, color:"#fff",
            borderRadius:10, padding:"8px 20px",
            display:"flex", alignItems:"center", gap:12,
            minWidth:100, justifyContent:"center",
          }}>
            <span style={{fontSize:32, fontWeight:900, fontVariantNumeric:"tabular-nums"}}>
              {liveScore.home_goals}
            </span>
            <span style={{fontSize:20, opacity:0.6}}>–</span>
            <span style={{fontSize:32, fontWeight:900, fontVariantNumeric:"tabular-nums"}}>
              {liveScore.away_goals}
            </span>
          </div>

          {/* Uitteam */}
          <div style={{flex:1}}>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <FlagImg name={awayNL} size={28}/>
              <span style={{fontWeight:800, fontSize:16, color:C.dark}}>{awayNL}</span>
            </div>
          </div>
        </div>

        {/* Voorspellingen info — altijd tonen na deadline */}
        {deadlinePassed()&&(
          <div style={{
            background:C.light, borderRadius:8, padding:"10px 14px",
            display:"flex", alignItems:"center", justifyContent:"space-between",
            flexWrap:"wrap", gap:8, fontSize:12,
          }}>
            <span style={{color:C.gray}}>
              ⚽ <strong style={{color:C.dark}}>{totaalPred}</strong> voorspellingen
            </span>
            {topPred&&(
              <span style={{color:C.gray}}>
                Meest voorspeld: <strong style={{color:C.green}}>{topPred[0]}</strong>
                <span style={{color:C.gray}}> ({topPred[1]}×)</span>
              </span>
            )}
            <button
              onClick={()=>{
                const targetMid=mid||liveScore.match_id;
                if(targetMid){
                  const sch=MATCH_SCHEDULE[targetMid];
                  ctx.setNavTarget({matchId:targetMid,date:sch?.date});
                }
                setView("dagprogramma");
              }}
              style={{...S.btn("green"), fontSize:11, padding:"4px 10px"}}
            >
              Alle voorspellingen →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COUNTDOWN ───────────────────────────────────────────────────────────────
function Countdown(){
  const [timeLeft,setTimeLeft]=useState(()=>Math.max(0,DEADLINE-new Date()));
  useEffect(()=>{
    if(timeLeft<=0) return;
    const t=setInterval(()=>setTimeLeft(Math.max(0,DEADLINE-new Date())),1000);
    return()=>clearInterval(t);
  },[]);
  if(timeLeft<=0) return null;
  const d=Math.floor(timeLeft/86400000);
  const h=Math.floor((timeLeft%86400000)/3600000);
  const m=Math.floor((timeLeft%3600000)/60000);
  const s=Math.floor((timeLeft%60000)/1000);
  const pad=n=>String(n).padStart(2,"0");
  return(
    <div style={{marginTop:6,fontSize:11,opacity:0.75,letterSpacing:0.5,fontVariantNumeric:"tabular-nums"}}>
      {d>0&&<span>{d}d </span>}
      <span>{pad(h)}u {pad(m)}m {pad(s)}s</span>
    </div>
  );
}



function FaqItem({vraag, antwoord}){
  const [open,setOpen]=useState(false);
  const C=COLORS;
  return(
    <div style={{borderRadius:7,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:"100%",textAlign:"left",padding:"12px 14px",
        background:open?"#f0faf6":"#fff",border:"none",cursor:"pointer",
        display:"flex",justifyContent:"space-between",alignItems:"center",gap:10
      }}>
        <span style={{fontSize:13,fontWeight:700,color:C.dark}}>{vraag}</span>
        <span style={{fontSize:16,color:C.green,flexShrink:0}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{padding:"10px 14px",background:"#f9fffe",borderTop:`1px solid ${C.border}`,fontSize:13,color:C.dark,lineHeight:1.6}}>
          {antwoord}
        </div>
      )}
    </div>
  );
}

// ─── HELP ────────────────────────────────────────────────────────────────────
function HelpView(){
  const C=COLORS;
  const sections=[
    {num:1,title:"Eerste keer aanmelden",steps:[
      {icon:"🌐",text:"Ga naar de poule-pagina via de link of QR-code op de flyer."},
      {icon:"👆",text:"Klik op Inloggen in de navigatie of op 'Meedoen / Inloggen' op de homepage."},
      {icon:"✍️",text:"Vul je voor- en achternaam in en klik op 'Verder →'"},
      {icon:"🔢",text:"Je naam is nog niet bekend — klik op 'Ja, ik ben nieuw' en kies een 4-cijferige pincode. Onthoud deze goed, je hebt hem elke keer nodig!"},
      {icon:"✅",text:"Je bent aangemeld en kunt direct beginnen met voorspellen!"},
    ],tip:"Zorg dat je naam altijd exact hetzelfde gespeld is (hoofdletters, spaties). Je pincode is jouw persoonlijk wachtwoord."},
    {num:2,title:"Inloggen (terugkerende deelnemers)",steps:[
      {icon:"🌐",text:"Ga naar de poule-pagina en klik op Inloggen."},
      {icon:"✍️",text:"Vul je voor- en achternaam in, precies zoals bij aanmelding."},
      {icon:"🔢",text:"Vul je 4-cijferige pincode in en klik op 'Inloggen →'"},
    ],tip:"Pincode vergeten? Neem contact op met de beheerder via WhatsApp: 06-53652024."},
    {num:3,title:"Wedstrijden voorspellen",steps:[
      {icon:"🏠",text:"Klik na het inloggen op 'Mijn voorspellingen' in de navigatie."},
      {icon:"📋",text:"Je ziet Stap 1: Groepsfase & Bonus — hier vul je alle 72 groepswedstrijden in, per groep gesorteerd op datum."},
      {icon:"➕",text:"Gebruik de + en – knoppen om de score in te stellen. Standaard staan de scores op 0–0."},
      {icon:"💾",text:"Klik op 💾 Opslaan om jouw voorspelling op te slaan. Je ziet ✓ Opgeslagen verschijnen."},
      {icon:"📊",text:"Onderaan elke groep zie je automatisch de live groepsstand op basis van jouw voorspellingen."},
    ],deadline:"Deadline: woensdag 11 juni 2026 om 21:00 uur."},
    {num:4,title:"Een voorspelling wijzigen",steps:[
      {icon:"✏️",text:"Zoek de wedstrijd en klik op ✏️ Wijzigen."},
      {icon:"➕",text:"De knoppen worden actief met de huidige waarden. Pas de score aan."},
      {icon:"💾",text:"Klik op 💾 Opslaan om op te slaan, of ✕ Annuleren om terug te gaan."},
    ],tip:"Je kunt voorspellingen alleen wijzigen vóór de deadline (11 juni 21:00)."},
    {num:5,title:"Bonusvragen beantwoorden",steps:[
      {icon:"🎁",text:"De bonusvragen staan onderaan Stap 1, na alle groepswedstrijden."},
      {icon:"ⓘ",text:"Klik op het ⓘ knopje naast een vraag voor extra toelichting."},
      {icon:"⌨️",text:"Typ je antwoord of selecteer een optie. Jouw antwoord wordt automatisch opgeslagen."},
    ],deadline:"Ook bonusvragen moeten voor 11 juni 21:00 ingevuld zijn. Daarna zijn ze niet meer aanpasbaar!"},
    {num:6,title:"Finaleronden voorspellen",steps:[
      {icon:"⚡",text:"Klik op Stap 2: Knock-out in het Mijn voorspellingen menu."},
      {icon:"🔍",text:"Wedstrijden waarvoor landen nog niet bekend zijn staan grijs. Zodra de beheerder landen invult, worden ze actief."},
      {icon:"⏱️",text:"Je kunt een KO-wedstrijd voorspellen tot 1 minuut voor aanvang. Daarna vergrendeld 🔒."},
      {icon:"💾",text:"Opslaan via 💾 Opslaan, wijzigen via ✏️ Wijzigen."},
    ],tip:"KO-wedstrijden tellen dubbel: 6 punten voor de juiste toto en 10 punten voor de exacte uitslag (na 90 min)."},
    {num:7,title:"Stand bekijken & interpreteren",steps:[
      {icon:"🏆",text:"Klik op Klassement voor het volledige overzicht. Op de Homepage zie je altijd de top 5."},
      {icon:"📊",text:"Kolommen: Groep toto (3pt) | Groep exact (5pt) | Doorstoot (10pt) | KO toto (6pt) | KO exact (10pt) | Bonus | Totaal"},
      {icon:"📈",text:"Op de Homepage zie je ook de sterkste stijger & daler — bijgewerkt na elke officiële uitslag."},
      {icon:"3️⃣",text:"Onderaan de Programma-pagina: stand beste nummers 3 per groep. Verschijnt zodra eerste wedstrijd gespeeld is. De beste 8 nummers 3 gaan door naar de knock-outfase."},
    ]},
    {num:8,title:"Rangschikking bij gelijke stand",steps:[
      {icon:"1️⃣",text:"Eerst: totaal aantal punten (poulefase + finalefase + bonus samen)."},
      {icon:"2️⃣",text:"Dan: het aantal keren de juiste toto voorspeld (winst/gelijk/verlies correct) — zowel poulefase als finalefase tellen mee."},
      {icon:"3️⃣",text:"Dan: het aantal keren de exacte uitslag correct voorspeld — zowel poulefase als finalefase tellen mee."},
      {icon:"4️⃣",text:"Dan: totaal behaalde bonuspunten."},
      {icon:"5️⃣",text:"Zijn al deze criteria nog steeds gelijk? Dan wordt dezelfde positie gedeeld weergegeven in de tussenstand. Alleen bij de definitieve eindstand (prijsuitreiking) geldt als allerlaatste tiebreaker het tijdstip van aanmelding — wie eerder aanmeldde, staat hoger."},
    ],tip:"Tussentijds kun je dus meerdere deelnemers op dezelfde positie zien staan. Dat is correct!"},
  ];

  return(
    <div style={{maxWidth:700,margin:"0 auto"}}>
      <div style={{...S.card,marginBottom:20,background:C.green,color:"#fff",textAlign:"center",padding:"24px"}}>
        <h2 style={{fontSize:22,fontWeight:800,marginBottom:6}}>Handleiding WK Poule 2026</h2>
        <p style={{opacity:0.85,fontSize:14}}>Alles wat je nodig hebt om mee te doen en te winnen!</p>
      </div>

      {sections.map(sec=>(
        <div key={sec.num} style={{...S.card,marginBottom:16,overflow:"hidden",padding:0}}>
          <div style={{background:C.green,color:"#fff",padding:"12px 18px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{width:26,height:26,borderRadius:"50%",background:C.yellow,color:C.dark,fontWeight:900,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{sec.num}</span>
            <span style={{fontWeight:800,fontSize:15}}>{sec.title}</span>
          </div>
          <div style={{padding:"16px 18px"}}>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {sec.steps.map((step,i)=>(
                <div key={i} style={{display:"flex",gap:10,padding:"8px 12px",background:C.light,borderRadius:7,borderLeft:`3px solid ${C.yellow}`}}>
                  <span style={{fontSize:16,flexShrink:0}}>{step.icon}</span>
                  <span style={{fontSize:13,fontWeight:600,color:C.dark,lineHeight:1.5}}>{step.text}</span>
                </div>
              ))}
            </div>
            {sec.deadline&&(
              <div style={{...S.alert(""),marginTop:10,fontSize:13,background:"#e8f5ee",border:`1px solid ${C.border}`}}>
                ⏰ <strong>{sec.deadline}</strong>
              </div>
            )}
            {sec.tip&&(
              <div style={{marginTop:10,background:"#fff8e1",border:"1px solid #ffe082",borderRadius:7,padding:"10px 12px",fontSize:12,color:"#5d4037"}}>
                💡 {sec.tip}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* FAQ */}
      <div style={{...S.card,marginBottom:16,overflow:"hidden",padding:0}}>
        <div style={{background:"#f0faf6",borderBottom:`1px solid ${C.border}`,padding:"12px 18px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>❓</span>
          <span style={{fontWeight:800,fontSize:15,color:C.green}}>Veelgestelde vragen</span>
        </div>
        <div style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:10}}>
          {[
            {v:"Ik zie mijn voorspellingen niet meer!", a:"Waarschijnlijk heb je je naam net iets anders gespeld dan de eerste keer. Controleer hoofdletters en spaties. Lukt het niet? Neem contact op met de beheerder."},
            {v:"Kan ik mijn voorspelling nog aanpassen?", a:"Ja, zolang de deadline nog niet verstreken is (11 juni 21:00). Klik op ✏️ Wijzigen naast de wedstrijd."},
            {v:"Ik wil 0-0 voorspellen, hoe doe ik dat?", a:"De scores staan standaard al op 0-0. Klik gewoon op 💾 Opslaan zonder iets aan te passen."},
            {v:"Wanneer zie ik de voorspellingen van andere deelnemers?", a:"Na de deadline (11 juni 21:00) kun je op de Programma-pagina per wedstrijd zien wat iedereen heeft voorspeld."},
            {v:"Wanneer worden de punten bijgewerkt?", a:"Punten worden automatisch bijgewerkt zodra de beheerder een officiële uitslag invoert. Dit gebeurt zo snel mogelijk na elke wedstrijd."},
            {v:"Wat zijn de beste nummers 3?", a:"Bij een WK met 12 groepen gaan niet alleen de nummers 1 en 2 door, maar ook de 8 beste nummers 3. Op de Programma-pagina zie je onderaan welke dat zijn."},
          ].map((faq,i)=>(
            <FaqItem key={i} vraag={faq.v} antwoord={faq.a}/>
          ))}
        </div>
      </div>

      {/* Contact + WhatsApp */}
      <div style={{...S.card,background:C.green,color:"#fff",textAlign:"center",padding:"24px"}}>
        <h3 style={{fontSize:16,fontWeight:800,marginBottom:8}}>Staat je vraag er niet bij?</h3>
        <p style={{fontSize:14,opacity:0.9,lineHeight:1.7,marginBottom:16}}>
          Neem contact op met de beheerder via WhatsApp:<br/>
          <strong style={{fontSize:17,color:C.yellow}}>Wout de Rooy — 06-53652024</strong>
        </p>
        <a href="https://wa.me/31653652024?text=Hoi%20Wout%2C%20ik%20heb%20een%20vraag%20over%20de%20WK%20Poule%202026%3A%20"
          target="_blank" rel="noopener noreferrer"
          style={{display:"inline-flex",alignItems:"center",gap:8,background:"#25D366",color:"#fff",
            fontWeight:800,fontSize:14,padding:"12px 24px",borderRadius:8,textDecoration:"none",
            boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>
          <span style={{fontSize:20}}>💬</span> Stuur een WhatsApp
        </a>
      </div>
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────────────────────────────
function HomeView({setView,ctx}){
  const dp=deadlinePassed();
  const [stijgersDalersModus,setStijgersDalersModus]=React.useState("wedstrijd"); // "wedstrijd" | "dag"
  const [selectedInsight,setSelectedInsight]=React.useState(null);
  return(
    <div>
      {selectedInsight&&<DeelnemerOverlay p={selectedInsight} ctx={ctx} onClose={()=>setSelectedInsight(null)}/>}
      <div style={{...S.card,background:COLORS.green,color:"#fff",textAlign:"center",padding:"0",overflow:"hidden",position:"relative"}}>
        <img src={WK_LOGO_IMG} alt="FIFA World Cup 2026" style={{width:"100%",maxHeight:220,objectFit:"cover",objectPosition:"center 30%",opacity:0.22,display:"block"}}/>
        <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 20px"}}>
          <h1 style={{margin:"0 0 6px",fontSize:26,fontWeight:800}}>WK Poule 2026</h1>
          <p style={{margin:"0 0 16px",opacity:0.85,fontSize:14}}>Leeuwerik Plaat — voorspel jouw weg naar de wereldtitel!</p>
          {!dp?(
            <div style={{background:"rgba(255,255,255,0.18)",borderRadius:8,padding:"10px 18px",display:"inline-block",marginBottom:16,textAlign:"center"}}>
              <div><span style={{fontSize:12,opacity:0.9}}>⏰ Deadline: </span><strong>{fmtDeadline()}</strong></div>
              <Countdown/>
            </div>
          ):(
            <div style={{...S.alert("warn"),display:"inline-block"}}>Voorspellen finalewedstrijden mogelijk tot één minuut voor aanvang wedstrijd</div>
          )}
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            {!ctx.currentUser&&!dp&&<button style={S.btn("yellow")} onClick={()=>setView("register")}>Meedoen / Inloggen</button>}
            {ctx.currentUser&&<button style={S.btn("yellow")} onClick={()=>setView("predict")}>Mijn voorspellingen</button>}
            <button style={{...S.btn("yellow"),background:"rgba(255,255,255,0.2)",color:"#fff"}} onClick={()=>setView("standings")}>Klassement</button>
          </div>
        </div>
      </div>
{/* Nu Live blok — alleen tonen als er een wedstrijd bezig is */}
      <NuLiveBlok liveScore={ctx.liveScore} ctx={ctx} setView={setView}/>

      {/* Tijdlijn: waar staan we in het toernooi (datums 100% data-driven, zie component) */}
      <TournamentTimeline ctx={ctx}/>

      
{/* Eerstvolgende wedstrijden */}
      {(()=>{
        const now=new Date();
        const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
        // Collect all group matches with date/time
        const allMatches=[];
        Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
          teams.forEach((t1,i)=>teams.slice(i+1).forEach((t2,j)=>{
            const mid=getMatchId(grp,t1.name,t2.name);
            const sch=MATCH_SCHEDULE[mid];
            if(!sch) return;
            const [day,mon]=sch.date.split(" ");
            const [h,m]=sch.time.split(":");
            const dt=new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));
            const result=ctx.matchResults[mid];
            const hasResult=result&&result.home!==undefined&&result.home!==null;
            const isLive=!hasResult&&dt<=now&&now<=new Date(dt.getTime()+115*60000);
            allMatches.push({mid,grp,t1,t2,sch,dt,hasResult,isLive,isKO:false});
          }));
        });
        // KO-wedstrijden toevoegen (ook met nog-onbekende landen)
        (ctx.koMatches||[]).forEach(km=>{
          if(!km.kickoff) return;
          const dt=new Date(km.kickoff);
          const hasResult=km.home_goals!==null&&km.home_goals!==undefined;
          const isLive=!hasResult&&dt<=now&&now<=new Date(dt.getTime()+130*60000);
          const ronde=KO_ROUNDS.find(r=>r.id===km.round_id);
          allMatches.push({
            mid:km.id,grp:null,isKO:true,koLabel:ronde?ronde.label:"Knock-out",
            t1:{name:km.home_team||"nog onbekend"},t2:{name:km.away_team||"nog onbekend"},
            sch:{date:dt.toLocaleDateString("nl-NL",{day:"numeric",month:"short"}),time:dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Amsterdam"}),city:km.city||""},
            dt,hasResult,isLive,
          });
        });
        // Show live + upcoming, sorted by time, max 3
        const upcoming=allMatches
          .filter(m=>!m.hasResult||m.isLive)
          .sort((a,b)=>a.dt-b.dt)
          .slice(0,3);
        if(upcoming.length===0) return null;
        return(
          <div style={S.card}>
            <div style={{...S.row,marginBottom:12,justifyContent:"space-between"}}>
              <h2 style={{...S.h2,margin:0}}>Eerstvolgende wedstrijden</h2>
              <button style={{...S.btn("green"),fontSize:12,padding:"6px 12px"}} onClick={()=>setView("dagprogramma")}>Volledig programma →</button>
            </div>
            {upcoming.map(({mid,grp,t1,t2,sch,isLive,isKO,koLabel})=>(
              <div key={mid} style={{padding:"10px 0",borderBottom:`1px solid ${COLORS.border}`}}>
                <div style={{fontSize:11,color:COLORS.gray,marginBottom:6,display:"flex",gap:10,alignItems:"center"}}>
                  {isLive&&<span style={{background:"#e53935",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,letterSpacing:0.5}}>● NU BEZIG</span>}
                  <span>📅 {sch.date}</span><span>🕐 {sch.time} CET</span><span>📍 {sch.city}</span>
                  <span style={S.tag(isKO?"green":"")}>{isKO?koLabel:`Groep ${grp}`}</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flex:1,justifyContent:"flex-end"}}>
                    <span style={{fontWeight:700,fontSize:14}}>{t1.name}</span>
                    <FlagImg name={t1.name} size={20}/>
                  </div>
                  <span style={{fontWeight:800,color:COLORS.gray,fontSize:14,width:30,textAlign:"center"}}>vs</span>
                  <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                    <FlagImg name={t2.name} size={20}/>
                    <span style={{fontWeight:700,fontSize:14}}>{t2.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}


      
{/* Top 5 klassement */}
      {(()=>{
        // Hergebruik dezelfde score-logica als StandingsView (incl. juiste puntensysteem)
        function calcScoreHome(uid){
          let gToto=0,gExact=0,gDoorstoot=0,koToto=0,koExact=0,bonus=0,gTotoCount=0,gExactCount=0,koTotoCount=0,koExactCount=0;
          const pred=ctx.predictions[uid]||{};
          const koPred=ctx.koPredictions[uid]||{};
          Object.entries(ctx.matchResults).forEach(([mid,result])=>{
            const p=pred[mid];
            if(!p||p.home===undefined||p.away===undefined||p.home===""||p.away==="") return;
            const exactOk=parseInt(p.home)===parseInt(result.home)&&parseInt(p.away)===parseInt(result.away);
            const totoOk=calcToto(p.home,p.away)===calcToto(result.home,result.away);
            if(exactOk){gToto+=3;gExact+=2;gTotoCount++;gExactCount++;}
            else if(totoOk){gToto+=3;gTotoCount++;}
          });
          const predAdv=calcDoorstootFromPredictions(pred);
          if(ctx.doorstootLanden&&ctx.doorstootLanden.length>0){
            predAdv.forEach(t=>{
              const enNaam=NL_TO_EN_ALIAS[t]||t.toLowerCase();
              if(ctx.doorstootLanden.includes(enNaam)) gDoorstoot+=DOORSTOOT_PTS;
            });
          }
          ctx.koMatches.forEach(match=>{
            if(!match.home_team||!match.away_team||match.home_goals===null||match.home_goals===undefined) return;
            const p=koPred[match.id];
            if(!p||p.home===undefined||p.home===null) return;
            const exactOk=parseInt(p.home)===parseInt(match.home_goals)&&parseInt(p.away)===parseInt(match.away_goals);
            const totoOk=calcToto(p.home,p.away)===calcToto(match.home_goals,match.away_goals);
            if(exactOk){koToto+=KO_TOTO_PTS;koExact+=(KO_EXACT_PTS-KO_TOTO_PTS);koTotoCount++;koExactCount++;}
            else if(totoOk){koToto+=KO_TOTO_PTS;koTotoCount++;}
          });
          Object.entries(ctx.bonusScores[uid]||{}).forEach(([qi,v])=>{
            if(v){const q=ctx.bonusQuestions.find(bq=>String(bq.idx)===String(qi));bonus+=(q?.points??20);}
          });
          const total=gToto+gExact+gDoorstoot+koToto+koExact+bonus;
          // Tiebreaker-aantallen: poulefase + finalefase SAMEN (zie Help §8)
          const totoCountCombined=gTotoCount+koTotoCount;
          const exactCountCombined=gExactCount+koExactCount;
          return{total,gTotoCount,gExactCount,koTotoCount,koExactCount,totoCountCombined,exactCountCombined,bonus};
        }
        const allHome=ctx.participants.map(p=>({...p,...calcScoreHome(p.id)}));
        allHome.sort((a,b)=>{
          if(b.total!==a.total) return b.total-a.total;
          if(b.totoCountCombined!==a.totoCountCombined) return b.totoCountCombined-a.totoCountCombined;
          if(b.exactCountCombined!==a.exactCountCombined) return b.exactCountCombined-a.exactCountCombined;
          if(b.bonus!==a.bonus) return b.bonus-a.bonus;
          return 0;
        });
        const rankedHome=allHome.reduce((acc,p,i)=>{
          const prev=acc[i-1];
          const gelijk=prev&&p.total===prev.total&&p.totoCountCombined===prev.totoCountCombined&&p.exactCountCombined===prev.exactCountCombined&&p.bonus===prev.bonus;
          const rang=i===0?1:gelijk?prev.rang:i+1;
          acc.push({...p,rang});
          return acc;
        },[]);
        const top5=rankedHome.filter(p=>p.rang<=5);
        const medals=["🥇","🥈","🥉"];
        const [selectedHome,setSelectedHome]=React.useState(null);
        return(
          <div style={S.card}>
            {selectedHome&&<DeelnemerOverlay p={selectedHome} ctx={ctx} onClose={()=>setSelectedHome(null)}/>}
            <div style={{...S.row,marginBottom:12,justifyContent:"space-between"}}>
              <h2 style={{...S.h2,margin:0}}>Top 5 klassement</h2>
              <button style={{...S.btn("green"),fontSize:12,padding:"6px 12px"}} onClick={()=>setView("standings")}>Volledig klassement →</button>
            </div>
            {top5.length===0&&<p style={{fontSize:13,color:COLORS.gray}}>Nog geen deelnemers.</p>}
            {top5.map((p,i)=>(
              <div key={p.id} onClick={()=>setSelectedHome(p)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${COLORS.border}`,cursor:"pointer"}}>
                <span style={{fontSize:16,width:24,textAlign:"center"}}>{medals[p.rang-1]||p.rang}</span>
                <span style={{flex:1,fontWeight:600,fontSize:14,color:COLORS.green}}>{p.first_name} {p.last_name} <span style={{fontSize:12,opacity:0.6}}>›</span></span>
                <span style={{...S.badge,fontSize:14,padding:"3px 10px"}}>{p.total} pt</span>
              </div>
            ))}
          </div>
        );
      })()}


      {/* Terugblik groepsfase: link naar de volledige poulestanden (alle 12 groepen
          + beste-nummers-3), nu de groepsfase is afgesloten. Bewust GEEN eigen tab
          in de topnav (die staat al vol: Home/Klassement/Programma/Help/etc.) —
          een compacte link hier, in het verlengde van "Volledig klassement",
          houdt het overzichtelijk terwijl de poulestanden toch vindbaar blijven. */}
      {/* Terugblik groepsfase: link naar de volledige poulestanden (alle 12 groepen
          + beste-nummers-3). Conditie is data-driven (alle groepswedstrijden
          gespeeld), NIET "zodra er een uitslag is" — anders verschijnt dit blok
          bij een volgend toernooi (EK 2028) al na de allereerste wedstrijd,
          terwijl de groepsfase dan nog volop bezig is. Bewust GEEN eigen tab
          in de topnav (die staat al vol: Home/Klassement/Programma/Help/etc.) —
          een compacte link hier, in het verlengde van "Volledig klassement",
          houdt het overzichtelijk terwijl de poulestanden toch vindbaar blijven. */}
      {(()=>{
        const totaalGroepWedstrijden=Object.keys(MATCH_SCHEDULE).length;
        const groepGespeeld=Object.values(ctx.matchResults).filter(r=>r&&r.home!==null&&r.home!==undefined).length;
        const poulefaseVoorbij=totaalGroepWedstrijden>0&&groepGespeeld>=totaalGroepWedstrijden;
        return poulefaseVoorbij&&(
          <div style={{textAlign:"center",marginTop:-8,marginBottom:16}}>
            <button style={{...S.btn(),fontSize:12,padding:"6px 12px"}} onClick={()=>setView("alle-standen")}>📊 Terugblik groepsfase (poulestanden) →</button>
          </div>
        );
      })()}


      
{/* Opvallend blok: stijgers/dalers + ratio's */}
      {(()=>{
        const C=COLORS;

        // ── Stijgers & dalers ──
        function dedupSnap(rows){
          const map={};
          rows.forEach(r=>{
            const key=r.participant_id;
            if(!map[key]||new Date(r.created_at)>new Date(map[key].created_at)) map[key]=r;
          });
          return Object.values(map);
        }

        let top3stijgers=[], top3dalers=[];

        if(stijgersDalersModus==="dag"){
          // ── PER DAG ──────────────────────────────────────────────────────
          const datums=[...new Set(ctx.rankingSnapshot.map(r=>r.speeldatum).filter(Boolean))].sort().reverse();
          if(datums.length>=2){
            const laatsteDag=datums[0];
            const vorigeDag=datums[1];
            const latestSnap=dedupSnap(ctx.rankingSnapshot.filter(r=>r.speeldatum===laatsteDag));
            const prevSnap=dedupSnap(ctx.rankingSnapshot.filter(r=>r.speeldatum===vorigeDag));
            const changes=latestSnap.map(cur=>{
              const prev=prevSnap.find(p=>p.participant_id===cur.participant_id);
              const participant=ctx.participants.find(p=>p.id===cur.participant_id);
              if(!prev||!participant) return null;
              return{name:`${participant.first_name} ${participant.last_name}`,participant,rankNow:cur.rank,rankPrev:prev.rank,change:prev.rank-cur.rank};
            }).filter(Boolean);
            top3stijgers=changes.filter(c=>c.change>0).sort((a,b)=>b.change-a.change||a.rankNow-b.rankNow).slice(0,3);
            top3dalers=changes.filter(c=>c.change<0).sort((a,b)=>a.change-b.change||b.rankNow-a.rankNow).slice(0,3);
          }
        } else {
          // ── PER WEDSTRIJD (standaard) ───────────────────────────────────
          const mpVals2=[...new Set(ctx.rankingSnapshot.map(r=>r.matches_played??0))].sort((a,b)=>b-a);
          const meaningful2=mpVals2.filter(mp=>mp>0);
          if(meaningful2.length>=2){
            const latestSnap=dedupSnap(ctx.rankingSnapshot.filter(r=>(r.matches_played??0)===meaningful2[0]));
            const prevSnap=dedupSnap(ctx.rankingSnapshot.filter(r=>(r.matches_played??0)===meaningful2[1]));
            const changes=latestSnap.map(cur=>{
              const prev=prevSnap.find(p=>p.participant_id===cur.participant_id);
              const participant=ctx.participants.find(p=>p.id===cur.participant_id);
              if(!prev||!participant) return null;
              return{name:`${participant.first_name} ${participant.last_name}`,participant,rankNow:cur.rank,rankPrev:prev.rank,change:prev.rank-cur.rank};
            }).filter(Boolean);
            top3stijgers=changes.filter(c=>c.change>0).sort((a,b)=>b.change-a.change||a.rankNow-b.rankNow).slice(0,3);
            top3dalers=changes.filter(c=>c.change<0).sort((a,b)=>a.change-b.change||b.rankNow-a.rankNow).slice(0,3);
          }
        }

        // ── Ratio groep toto & exact — hergebruikt berekenPouleGemiddelden,
        // zodat homepage en Louis-verslag altijd hetzelfde gemiddelde tonen ──
        const {ratiosGekwalificeerd,koRatios,DREMPEL,avgGroepToto:avgToto,avgGroepExact:avgExact,avgKoToto,avgKoExact,koTotaalIngevuld}=berekenPouleGemiddelden(ctx);

        const top3toto=[...ratiosGekwalificeerd].sort((a,b)=>(b.totoOk/b.total)-(a.totoOk/a.total)||b.totoOk-a.totoOk).slice(0,3);
        const top3exact=[...ratiosGekwalificeerd].sort((a,b)=>(b.exactOk/b.total)-(a.exactOk/a.total)||b.exactOk-a.exactOk).slice(0,3);

        const top3koToto=[...koRatios].sort((a,b)=>(b.totoOk/b.total)-(a.totoOk/a.total)||b.totoOk-a.totoOk).slice(0,3);
        const top3koExact=[...koRatios].sort((a,b)=>(b.exactOk/b.total)-(a.exactOk/a.total)||b.exactOk-a.exactOk).slice(0,3);

        const hasAny=top3stijgers.length>0||top3dalers.length>0||top3toto.length>0||top3exact.length>0;
        if(!hasAny) return null;

        return(
          <div style={S.card}>
            <h2 style={{...S.h2,marginBottom:16}}>⚡ Opvallend</h2>

            {/* Stijgers & dalers */}
            {(top3stijgers.length>0||top3dalers.length>0)&&(
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.5}}>Top 3 sterkste stijgers & dalers</span>
                    <Tooltip text="Vergelijkt de huidige positie in het klassement met een eerder moment. 'Per wedstrijd' kijkt naar de vorige keer dat er een uitslag werd ingevoerd. 'Per dag' kijkt naar het einde van de laatste speeldag versus de speeldag daarvoor — ook als er op de huidige dag nog niet gespeeld is."/>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>setStijgersDalersModus("wedstrijd")} style={{
                      padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",
                      fontWeight:700,fontSize:11,
                      background:stijgersDalersModus==="wedstrijd"?C.green:"#e0e0e0",
                      color:stijgersDalersModus==="wedstrijd"?"#fff":C.dark,
                    }}>Per wedstrijd</button>
                    <button onClick={()=>setStijgersDalersModus("dag")} style={{
                      padding:"4px 10px",borderRadius:6,border:"none",cursor:"pointer",
                      fontWeight:700,fontSize:11,
                      background:stijgersDalersModus==="dag"?C.green:"#e0e0e0",
                      color:stijgersDalersModus==="dag"?"#fff":C.dark,
                    }}>Per dag</button>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {/* Stijgers */}
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",marginBottom:6}}>⬆️ Stijgers</div>
                    {top3stijgers.map((c,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:i<top3stijgers.length-1?`1px solid ${C.border}`:"none"}}>
                        <span style={{fontSize:12,color:C.gray,width:16,flexShrink:0}}>{i+1}</span>
                        <span style={{flex:1,fontSize:13,fontWeight:600}}><InsightNaam p={c.participant} onSelect={setSelectedInsight}/></span>
                        <span style={{fontSize:12,color:C.gray}}>#{c.rankPrev}</span>
                        <span style={{color:C.green,fontSize:13}}>→</span>
                        <span style={{fontSize:13,fontWeight:800,color:C.green}}>#{c.rankNow}</span>
                        <span style={{...S.tag("green"),fontSize:10}}>+{c.change}</span>
                      </div>
                    ))}
                    {top3stijgers.length===0&&<p style={{fontSize:12,color:C.gray}}>—</p>}
                  </div>
                  {/* Dalers */}
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:"#c62828",textTransform:"uppercase",marginBottom:6}}>⬇️ Dalers</div>
                    {top3dalers.map((c,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 0",borderBottom:i<top3dalers.length-1?`1px solid ${C.border}`:"none"}}>
                        <span style={{fontSize:12,color:C.gray,width:16,flexShrink:0}}>{i+1}</span>
                        <span style={{flex:1,fontSize:13,fontWeight:600}}><InsightNaam p={c.participant} onSelect={setSelectedInsight}/></span>
                        <span style={{fontSize:12,color:C.gray}}>#{c.rankPrev}</span>
                        <span style={{color:"#c62828",fontSize:13}}>→</span>
                        <span style={{fontSize:13,fontWeight:800,color:"#c62828"}}>#{c.rankNow}</span>
                        <span style={{background:"#fdecea",color:"#c62828",fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,border:"1px solid #ef9a9a"}}>-{Math.abs(c.change)}</span>
                      </div>
                    ))}
                    {top3dalers.length===0&&<p style={{fontSize:12,color:C.gray}}>—</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Ratio's */}
            {top3toto.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  {/* Groep toto ratio */}
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}><span style={{fontWeight:900,fontSize:12,background:C.green,color:"#fff",borderRadius:4,padding:"1px 5px",marginRight:4}}>W/V/G</span> Beste groep toto ratio</div>
                    {top3toto.map((r,i)=>{
                      const pct=Math.round(r.totoOk/r.total*100);
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:i<top3toto.length-1?`1px solid ${C.border}`:"none"}}>
                          <span style={{fontSize:12,color:C.gray,width:16,flexShrink:0}}>{i+1}</span>
                          <span style={{flex:1,fontSize:13,fontWeight:600}}><InsightNaam p={r.participant} onSelect={setSelectedInsight}/></span>
                          <span style={{fontSize:12,color:C.gray}}>{r.totoOk}/{r.total}</span>
                          <span style={{fontSize:12,fontWeight:700,color:C.green,minWidth:40,textAlign:"right"}}>{pct}%</span>
                        </div>
                      );
                    })}
                    {avgToto!==null&&(
                      <div style={{marginTop:8,paddingTop:6,borderTop:`1px dashed ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:11,color:C.gray}}>
                        <span>Gemiddelde ({ratiosGekwalificeerd.length} deeln. ≥{DREMPEL} ingevuld)</span>
                        <span style={{fontWeight:700,color:C.gray}}>{avgToto}%</span>
                      </div>
                    )}
                  </div>
                  {/* Groep exact ratio */}
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>🎯 Beste groep exact ratio</div>
                    {top3exact.map((r,i)=>{
                      const pct=Math.round(r.exactOk/r.total*100);
                      return(
                        <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:i<top3exact.length-1?`1px solid ${C.border}`:"none"}}>
                          <span style={{fontSize:12,color:C.gray,width:16,flexShrink:0}}>{i+1}</span>
                          <span style={{flex:1,fontSize:13,fontWeight:600}}><InsightNaam p={r.participant} onSelect={setSelectedInsight}/></span>
                          <span style={{fontSize:12,color:C.gray}}>{r.exactOk}/{r.total}</span>
                          <span style={{fontSize:12,fontWeight:700,color:"#1565c0",minWidth:40,textAlign:"right"}}>{pct}%</span>
                        </div>
                      );
                    })}
                    {avgExact!==null&&(
                      <div style={{marginTop:8,paddingTop:6,borderTop:`1px dashed ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:11,color:C.gray}}>
                        <span>Gemiddelde ({ratiosGekwalificeerd.length} deeln. ≥{DREMPEL} ingevuld)</span>
                        <span style={{fontWeight:700,color:C.gray}}>{avgExact}%</span>
                      </div>
                    )}
                  </div>
                  {/* KO toto ratio — alleen tonen als er KO-wedstrijden gespeeld zijn */}
                  {top3koToto.length>0&&(
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}><span style={{fontWeight:900,fontSize:12,background:C.green,color:"#fff",borderRadius:4,padding:"1px 5px",marginRight:4}}>KO</span> Beste KO toto ratio</div>
                      {top3koToto.map((r,i)=>{
                        const pct=Math.round(r.totoOk/r.total*100);
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:i<top3koToto.length-1?`1px solid ${C.border}`:"none"}}>
                            <span style={{fontSize:12,color:C.gray,width:16,flexShrink:0}}>{i+1}</span>
                            <span style={{flex:1,fontSize:13,fontWeight:600}}><InsightNaam p={r.participant} onSelect={setSelectedInsight}/></span>
                            <span style={{fontSize:12,color:C.gray}}>{r.totoOk}/{r.total}</span>
                            <span style={{fontSize:12,fontWeight:700,color:C.green,minWidth:40,textAlign:"right"}}>{pct}%</span>
                          </div>
                        );
                      })}
                      {avgKoToto!==null&&(
                        <div style={{marginTop:8,paddingTop:6,borderTop:`1px dashed ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:11,color:C.gray}}>
                          <span>Gemiddelde ({koRatios.length} deeln., {koTotaalIngevuld} voorspellingen)</span>
                          <span style={{fontWeight:700,color:C.gray}}>{avgKoToto}%</span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* KO exact ratio — alleen tonen als er KO-wedstrijden gespeeld zijn */}
                  {top3koExact.length>0&&(
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>🎯 Beste KO exact ratio</div>
                      {top3koExact.map((r,i)=>{
                        const pct=Math.round(r.exactOk/r.total*100);
                        return(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 0",borderBottom:i<top3koExact.length-1?`1px solid ${C.border}`:"none"}}>
                            <span style={{fontSize:12,color:C.gray,width:16,flexShrink:0}}>{i+1}</span>
                            <span style={{flex:1,fontSize:13,fontWeight:600}}><InsightNaam p={r.participant} onSelect={setSelectedInsight}/></span>
                            <span style={{fontSize:12,color:C.gray}}>{r.exactOk}/{r.total}</span>
                            <span style={{fontSize:12,fontWeight:700,color:"#1565c0",minWidth:40,textAlign:"right"}}>{pct}%</span>
                          </div>
                        );
                      })}
                      {avgKoExact!==null&&(
                        <div style={{marginTop:8,paddingTop:6,borderTop:`1px dashed ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:11,color:C.gray}}>
                          <span>Gemiddelde ({koRatios.length} deeln., {koTotaalIngevuld} voorspellingen)</span>
                          <span style={{fontWeight:700,color:C.gray}}>{avgKoExact}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Vandaag opvallend (deterministisch, per dag wisselend) ── */}
            {(()=>{
              const C2=COLORS;
              const vandaag = new Date().toDateString();

              // Helper: deterministische "random" op basis van een seed-string,
              // zodat de selectie elke dag anders is maar binnen 1 dag stabiel blijft
              function seedHash(str){
                let h=0;
                for(let i=0;i<str.length;i++){ h=((h<<5)-h+str.charCodeAt(i))|0; }
                return Math.abs(h);
              }

              const kandidaten=[];

              // ── Detector 1: Langste win-/foutreeks (toto) per deelnemer ──
              (()=>{
                const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
                function matchDt(mid){
                  const s=MATCH_SCHEDULE[mid];if(!s)return new Date(2099,0,1);
                  const[d,mo]=s.date.split(" ");const[h,m]=s.time.split(":");
                  return new Date(2026,months[mo],parseInt(d),parseInt(h),parseInt(m));
                }
                // Combineer groep- én KO-wedstrijden chronologisch, zodat een reeks
                // die doorloopt in (of volledig binnen) de KO-fase ook meetelt. Eerder
                // keek dit alleen naar groepswedstrijden (ctx.matchResults), waardoor
                // een actuele KO-reeks onzichtbaar bleef voor deze twee detectors.
                const gespeeldeGroep=Object.keys(ctx.matchResults)
                  .filter(mid=>ctx.matchResults[mid]&&ctx.matchResults[mid].home!==null)
                  .map(mid=>({mid,isKO:false,dt:matchDt(mid),result:ctx.matchResults[mid]}));
                const gespeeldeKO=(ctx.koMatches||[])
                  .filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.kickoff)
                  .map(m=>({mid:m.id,isKO:true,dt:new Date(m.kickoff),result:{home:m.home_goals,away:m.away_goals}}));
                const gespeeldeMids=[...gespeeldeGroep,...gespeeldeKO].sort((a,b)=>a.dt-b.dt);

                let besteStreak={naam:null,lengte:0,type:null,deelnemer:null};
                ctx.participants.forEach(p=>{
                  const predGroep=ctx.predictions[p.id]||{};
                  const predKO=ctx.koPredictions[p.id]||{};
                  let streak=0,maxStreak=0;
                  gespeeldeMids.forEach(({mid,isKO,result:r})=>{
                    const pp=(isKO?predKO:predGroep)[mid];
                    if(!pp||pp.home===undefined||pp.home===null){streak=0;return;}
                    const toto=calcToto(pp.home,pp.away)===calcToto(r.home,r.away);
                    if(toto){streak++;maxStreak=Math.max(maxStreak,streak);}else{streak=0;}
                  });
                  if(maxStreak>besteStreak.lengte){
                    besteStreak={naam:`${p.first_name} ${p.last_name}`,lengte:maxStreak,type:"toto",deelnemer:p};
                  }
                });
                if(besteStreak.lengte>=2){
                  kandidaten.push({
                    icon:"🔥",
                    tekst:<><InsightNaam p={besteStreak.deelnemer} onSelect={setSelectedInsight}/> heeft <strong>{besteStreak.lengte}</strong> wedstrijden op rij de juiste toto voorspeld!</>,
                    prioriteit:Math.min(10, besteStreak.lengte*2),
                  });
                }

                // ── Detector 1b: Langste EXACTE-uitslag-reeks (2+ op rij) ──
                let besteExactStreak={naam:null,lengte:0,deelnemer:null};
                ctx.participants.forEach(p=>{
                  const predGroep=ctx.predictions[p.id]||{};
                  const predKO=ctx.koPredictions[p.id]||{};
                  let streak=0,maxStreak=0;
                  gespeeldeMids.forEach(({mid,isKO,result:r})=>{
                    const pp=(isKO?predKO:predGroep)[mid];
                    if(!pp||pp.home===undefined||pp.home===null){streak=0;return;}
                    const exact=parseInt(pp.home)===parseInt(r.home)&&parseInt(pp.away)===parseInt(r.away);
                    if(exact){streak++;maxStreak=Math.max(maxStreak,streak);}else{streak=0;}
                  });
                  if(maxStreak>besteExactStreak.lengte){
                    besteExactStreak={naam:`${p.first_name} ${p.last_name}`,lengte:maxStreak,deelnemer:p};
                  }
                });
                if(besteExactStreak.lengte>=2){
                  kandidaten.push({
                    icon:"🎯",
                    tekst:<><InsightNaam p={besteExactStreak.deelnemer} onSelect={setSelectedInsight}/> voorspelde <strong>{besteExactStreak.lengte}</strong> wedstrijden op rij de EXACTE uitslag — knap precisiewerk!</>,
                    prioriteit:Math.min(10, 4 + besteExactStreak.lengte*2),
                  });
                }

                // ── Detector 1c: Gemiddeld aantal doelpunten t.o.v. WK 2022 ──
                // Telt nu ook KO-doelpunten mee (gespeeldeMids bevat sinds de
                // streak-fix hierboven objecten {mid,isKO,dt,result} i.p.v. kale
                // mid-strings, dus we lezen result direct i.p.v. via ctx.matchResults).
                const WK2022_GEM_GOALS=2.69; // bron: FIFA officieel, 172 goals / 64 wedstrijden
                const totaalGoals=gespeeldeMids.reduce((sum,item)=>{
                  return sum+parseInt(item.result.home)+parseInt(item.result.away);
                },0);
                if(gespeeldeMids.length>=10){
                  const gemHuidig=totaalGoals/gespeeldeMids.length;
                  const verschilPct=Math.round((gemHuidig-WK2022_GEM_GOALS)/WK2022_GEM_GOALS*100);
                  const richting=verschilPct>0?"meer":"minder";
                  kandidaten.push({
                    icon:"⚽",
                    tekst:<>Er vallen gemiddeld <strong>{gemHuidig.toFixed(2)}</strong> doelpunten per wedstrijd op dit WK — dat is <strong>{Math.abs(verschilPct)}% {richting}</strong> dan op WK 2022 ({WK2022_GEM_GOALS} per wedstrijd).</>,
                    prioriteit:Math.min(10, 3+Math.abs(verschilPct)/5),
                  });
                }
              })();

              // ── Detector 2: Grootste stijger/daler ooit in 1 dag ──
              (()=>{
                const perDeelnemerPerDag={};
                ctx.rankingSnapshot.forEach(r=>{
                  if(!r.speeldatum) return;
                  const key=`${r.participant_id}|${r.speeldatum}`;
                  if(!perDeelnemerPerDag[key]) perDeelnemerPerDag[key]={min:r.rank,max:r.rank};
                  perDeelnemerPerDag[key].min=Math.min(perDeelnemerPerDag[key].min,r.rank);
                  perDeelnemerPerDag[key].max=Math.max(perDeelnemerPerDag[key].max,r.rank);
                });
                let grootsteSprong={naam:null,verschil:0,datum:null,deelnemer:null};
                Object.entries(perDeelnemerPerDag).forEach(([key,{min,max}])=>{
                  const verschil=max-min;
                  if(verschil>grootsteSprong.verschil){
                    const[pid,datum]=key.split("|");
                    const p=ctx.participants.find(pp=>pp.id===pid);
                    if(p) grootsteSprong={naam:`${p.first_name} ${p.last_name}`,verschil,datum,deelnemer:p};
                  }
                });
                if(grootsteSprong.verschil>=10){
                  kandidaten.push({
                    icon:"🚀",
                    tekst:<><InsightNaam p={grootsteSprong.deelnemer} onSelect={setSelectedInsight}/> steeg op één dag maar liefst <strong>{grootsteSprong.verschil}</strong> plekken in het klassement!</>,
                    prioriteit:Math.min(10, 3 + grootsteSprong.verschil/8),
                  });
                }
              })();

              // ── Detector 3: Meest voorspelde kampioen (bonusvraag idx=4) ──
              (()=>{
                const kampioenAntwoorden=Object.entries(ctx.bonusAnswers)
                  .map(([pid,answers])=>answers[4])
                  .filter(Boolean);
                if(kampioenAntwoorden.length<5) return;

                const freq={};
                kampioenAntwoorden.forEach(ans=>{
                  const genNaam=Object.keys(NL_TO_EN_ALIAS).find(nl=>
                    ans.toLowerCase().trim().includes(nl.toLowerCase()) ||
                    nl.toLowerCase().includes(ans.toLowerCase().trim())
                  );
                  if(genNaam) freq[genNaam]=(freq[genNaam]||0)+1;
                });
                const top=Object.entries(freq).sort((a,b)=>b[1]-a[1])[0];
                if(top){
                  const[land,aantal]=top;
                  const pct=Math.round(aantal/kampioenAntwoorden.length*100);
                  kandidaten.push({
                    icon:"🏆",
                    tekst:<><strong>{land}</strong> is de populairste favoriet voor de wereldtitel — <strong>{pct}%</strong> van de deelnemers voorspelt deze winnaar.</>,
                    prioriteit:Math.min(10, pct/10),
                  });
                }
              })();

              // ── Detector 4: Perfecte dag (alle wedstrijden van 1 dag goed) ──
              (()=>{
                const perDag={};
                Object.entries(MATCH_SCHEDULE).forEach(([mid,sch])=>{
                  if(!perDag[sch.date]) perDag[sch.date]=[];
                  perDag[sch.date].push({mid,isKO:false});
                });
                // KO-wedstrijden ook meenemen, gegroepeerd op hun kalenderdatum (uit
                // kickoff). Voorheen keek deze detector alleen naar groepsfase-dagen
                // (MATCH_SCHEDULE), waardoor er sinds het einde van de groepsfase
                // geen nieuwe "perfecte dag" meer gevonden kon worden.
                const koById={};
                (ctx.koMatches||[]).forEach(m=>{
                  koById[m.id]=m;
                  if(!m.kickoff) return;
                  const dt=new Date(m.kickoff);
                  const datum=dt.toLocaleDateString("nl-NL",{day:"numeric",month:"short",timeZone:"Europe/Amsterdam"});
                  if(!perDag[datum]) perDag[datum]=[];
                  perDag[datum].push({mid:m.id,isKO:true});
                });
                let perfecteDagen=[];
                Object.entries(perDag).forEach(([datum,items])=>{
                  const gespeeld=items.filter(({mid,isKO})=>{
                    if(isKO){
                      const km=koById[mid];
                      return km&&km.home_goals!==null&&km.home_goals!==undefined;
                    }
                    return ctx.matchResults[mid]&&ctx.matchResults[mid].home!==null;
                  });
                  if(gespeeld.length<1) return;
                  ctx.participants.forEach(p=>{
                    const predGroep=ctx.predictions[p.id]||{};
                    const predKO=ctx.koPredictions[p.id]||{};
                    const alleGoed=gespeeld.every(({mid,isKO})=>{
                      if(isKO){
                        const km=koById[mid];
                        const pp=predKO[mid];
                        if(!pp||pp.home===undefined||pp.home===null) return false;
                        return calcToto(pp.home,pp.away)===calcToto(km.home_goals,km.away_goals);
                      }
                      const pp=predGroep[mid];const r=ctx.matchResults[mid];
                      if(!pp||pp.home===undefined||pp.home===null) return false;
                      return calcToto(pp.home,pp.away)===calcToto(r.home,r.away);
                    });
                    if(alleGoed) perfecteDagen.push({naam:`${p.first_name} ${p.last_name}`,datum,aantal:gespeeld.length,deelnemer:p});
                  });
                });
                if(perfecteDagen.length>0){
                  // Pak de dag met het hoogste aantal wedstrijden (meest indrukwekkend)
                  perfecteDagen.sort((a,b)=>b.aantal-a.aantal);
                  const beste=perfecteDagen[0];
                  kandidaten.push({
                    icon:"💯",
                    tekst:<><InsightNaam p={beste.deelnemer} onSelect={setSelectedInsight}/> had op <strong>{beste.datum}</strong> alle <strong>{beste.aantal}</strong> wedstrijden goed (toto)!</>,
                    prioriteit:Math.min(10, 2 + beste.aantal*1.5),
                  });
                }
              })();

              // ── Detector 5: Kampioen-voorspelling vs groepswinnaar-discrepantie ──
              // "Niemand voorspelt land X als kampioen, maar wel als groepswinnaar"
              (()=>{
                const kampioenAntwoorden=Object.entries(ctx.bonusAnswers)
                  .map(([pid,answers])=>answers[4])
                  .filter(Boolean);
                if(kampioenAntwoorden.length<5) return;

                // Genormaliseerde set van voorspelde kampioenen
                const kampioenenSet=new Set();
                kampioenAntwoorden.forEach(ans=>{
                  const genNaam=Object.keys(NL_TO_EN_ALIAS).find(nl=>
                    ans.toLowerCase().trim().includes(nl.toLowerCase()) ||
                    nl.toLowerCase().includes(ans.toLowerCase().trim())
                  );
                  if(genNaam) kampioenenSet.add(genNaam);
                });

                // BUGFIX (9 juli, gemeld door Wout): dit detecteert een patroon in
                // VOORSPELLINGEN, die bevroren zijn sinds 11 juni — zonder deze check
                // bleef een allang uitgeschakeld land (bijv. België, er in week 1 al
                // uit) hier wekenlang in staan, want de voorspeldata verandert niet.
                // Nu telt alleen mee wie NOG DAADWERKELIJK in het toernooi zit.
                function nogActiefInToernooi(land){
                  const en=NL_TO_EN_ALIAS[land]||land.toLowerCase();
                  if(!ctx.doorstootLanden||!ctx.doorstootLanden.includes(en)) return false; // nooit doorgestoten uit de groep
                  const verloren=(ctx.koMatches||[]).some(m=>{
                    if(m.home_goals===null||m.home_goals===undefined) return false; // nog niet gespeeld
                    if(m.home_team!==land&&m.away_team!==land) return false;
                    // Zelfde precedentie als elders in de app: strafschoppen > verlenging > 90 min.
                    let winnaar=null;
                    if(m.home_penalties!==null&&m.home_penalties!==undefined&&m.away_penalties!==null&&m.away_penalties!==undefined){
                      winnaar=m.home_penalties>m.away_penalties?m.home_team:m.away_team;
                    }else if(m.home_goals_et!==null&&m.home_goals_et!==undefined&&m.home_goals_et!==m.away_goals_et){
                      winnaar=m.home_goals_et>m.away_goals_et?m.home_team:m.away_team;
                    }else if(m.home_goals!==m.away_goals){
                      winnaar=m.home_goals>m.away_goals?m.home_team:m.away_team;
                    }
                    return winnaar&&winnaar!==land;
                  });
                  return !verloren;
                }

                // Tel hoe vaak elk (nog actief) land als groepswinnaar (1e plek) wordt voorspeld
                const groepswinnaarFreq={};
                ctx.participants.forEach(p=>{
                  const pred=ctx.predictions[p.id]||{};
                  Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
                    const stand=calcGroepsstandFromPred(grp,teams,pred);
                    if(stand[0]&&stand[0].gespeeld>0&&nogActiefInToernooi(stand[0].name)){
                      groepswinnaarFreq[stand[0].name]=(groepswinnaarFreq[stand[0].name]||0)+1;
                    }
                  });
                });

                // Zoek het land met de GROOTSTE discrepantie: vaak groepswinnaar,
                // maar door niemand als kampioen voorspeld
                const kandidatenLanden=Object.entries(groepswinnaarFreq)
                  .filter(([land])=>!kampioenenSet.has(land))
                  .sort((a,b)=>b[1]-a[1]);

                if(kandidatenLanden.length>0 && kandidatenLanden[0][1]>=3){
                  const[land,aantal]=kandidatenLanden[0];
                  kandidaten.push({
                    icon:"🤔",
                    tekst:<>Niemand voorspelt <strong>{land}</strong> als wereldkampioen, maar <strong>{aantal}</strong> deelnemers zien het land wel als groepswinnaar!</>,
                    prioriteit:Math.min(10, 3 + aantal/4),
                  });
                }
              })();

              // ── Detector 6: Finalisten vs. het veld ──
              // Dynamisch: pakt de 2 landen uit de daadwerkelijke finale (r1),
              // GEEN hardgecodeerde landnamen — werkt dus voor elk toernooi.
              // Vergelijkt hoe vaak de finalisten als kampioen zijn getipt met de
              // populairste land dat NIET de finale heeft gehaald (vaak leuker
              // contrast dan alleen de kale percentages van de finalisten).
              (()=>{
                const finaleMatch=(ctx.koMatches||[]).find(m=>m.round_id==="r1");
                if(!finaleMatch||!finaleMatch.home_team||!finaleMatch.away_team) return; // finalisten nog niet bekend
                if(finaleMatch.home_goals!==null&&finaleMatch.home_goals!==undefined) return; // finale al gespeeld — dan is dit geen actueel "wist je dat" meer

                const kampioenAntwoorden=Object.entries(ctx.bonusAnswers)
                  .map(([pid,answers])=>answers[4])
                  .filter(Boolean);
                if(kampioenAntwoorden.length<5) return;

                const freq={};
                kampioenAntwoorden.forEach(ans=>{
                  const genNaam=Object.keys(NL_TO_EN_ALIAS).find(nl=>
                    ans.toLowerCase().trim().includes(nl.toLowerCase()) ||
                    nl.toLowerCase().includes(ans.toLowerCase().trim())
                  );
                  if(genNaam) freq[genNaam]=(freq[genNaam]||0)+1;
                });
                const totaal=kampioenAntwoorden.length;
                const finalisten=[finaleMatch.home_team,finaleMatch.away_team];
                const pct=(land)=>Math.round((freq[land]||0)/totaal*100);
                const [fin1,fin2]=finalisten;
                const pct1=pct(fin1),pct2=pct(fin2);

                // Populairste land dat NIET in de finale staat, als contrast
                const contrast=Object.entries(freq)
                  .filter(([land])=>!finalisten.includes(land))
                  .sort((a,b)=>b[1]-a[1])[0];
                const contrastPct=contrast?Math.round(contrast[1]/totaal*100):0;

                let tekst;
                if(contrast&&contrastPct>Math.max(pct1,pct2)){
                  tekst=<>Met <strong>{fin1}</strong> en <strong>{fin2}</strong> in de finale: {fin1} werd door <strong>{pct1}%</strong> getipt als kampioen, {fin2} door <strong>{pct2}%</strong> — <strong>{contrast[0]}</strong>, allang uitgeschakeld, was met <strong>{contrastPct}%</strong> nog altijd populairder.</>;
                }else{
                  tekst=<>Met <strong>{fin1}</strong> en <strong>{fin2}</strong> in de finale: {fin1} werd door <strong>{pct1}%</strong> van de deelnemers getipt als kampioen, {fin2} door <strong>{pct2}%</strong>.</>;
                }
                kandidaten.push({icon:"🏁",tekst,prioriteit:9});
              })();

              if(kandidaten.length===0) return null;

              // Deterministische dagelijkse selectie: seed op vandaag's datum,
              // sorteer kandidaten op (prioriteit + dag-specifieke shuffle-component)
              const seed=seedHash(vandaag);
              const topInsights=kandidaten
                .map((k,i)=>({...k, sortKey: k.prioriteit*1000 + ((seed+i*37)%97)}))
                .sort((a,b)=>b.sortKey-a.sortKey)
                .slice(0,6);

              return(
                <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${C2.border}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:10}}>
                    <span style={{fontSize:12,fontWeight:700,color:C2.gray,textTransform:"uppercase",letterSpacing:0.5}}>Wist je dat...</span>
                    <Tooltip text="Een dagelijks wisselende selectie van bijzondere feiten uit de poule — gebaseerd op records, voorspelpatronen en prestaties. Verandert elke kalenderdag."/>
                  </div>
                  {topInsights.map((k,i)=>(
                    <div key={i} style={{
                      display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",
                      borderRadius:8,marginBottom:8,background:"#f9fffe",
                      border:`1px solid ${C2.border}`,
                    }}>
                      <span style={{fontSize:18,flexShrink:0}}>{k.icon}</span>
                      <span style={{fontSize:13,color:C2.dark,lineHeight:1.5}}>{k.tekst}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        );
      })()}

      {/* Lucky bastards / Pechvogels */}
      {(()=>{
        const {resultaten,aantalGekanteldeWedstrijden}=berekenGelukPech(ctx);
        if(aantalGekanteldeWedstrijden===0) return null;
        const lucky=[...resultaten].filter(r=>r.saldo>0||r.geluk>0)
          .sort((a,b)=>b.saldo-a.saldo||b.puntenSaldo-a.puntenSaldo).slice(0,15);
        const pech=[...resultaten].filter(r=>r.saldo<0||r.pech>0)
          .sort((a,b)=>a.saldo-b.saldo||a.puntenSaldo-b.puntenSaldo).slice(0,15);
        if(lucky.length===0&&pech.length===0) return null;
        const Lijst=({titel,icon,data,kleur})=>(
          <div style={{flex:"1 1 260px",minWidth:240}}>
            <div style={{fontWeight:800,fontSize:13,color:kleur,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
              <span>{icon}</span><span>{titel}</span>
            </div>
            {data.length===0?(
              <div style={{fontSize:12,color:COLORS.gray,fontStyle:"italic"}}>Nog niemand</div>
            ):data.map((r,i)=>(
              <div key={r.deelnemer.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:i<data.length-1?`1px solid ${COLORS.border}`:"none"}}>
                <span style={{fontSize:11,color:COLORS.gray,width:16,flexShrink:0}}>{i+1}.</span>
                <span style={{flex:1,fontSize:13,fontWeight:600,color:COLORS.dark}}>{r.deelnemer.first_name} {r.deelnemer.last_name}</span>
                <span style={{fontSize:11,color:COLORS.gray,whiteSpace:"nowrap"}}>🍀{r.geluk} ☔{r.pech}</span>
                <span style={{fontSize:13,fontWeight:800,color:r.saldo>0?COLORS.green:r.saldo<0?"#c62828":COLORS.gray,minWidth:24,textAlign:"right"}}>
                  {r.saldo>0?"+":""}{r.saldo}
                </span>
                <span style={{fontSize:11,color:COLORS.gray,minWidth:38,textAlign:"right",whiteSpace:"nowrap"}}>
                  ({r.puntenSaldo>0?"+":""}{r.puntenSaldo}pt)
                </span>
              </div>
            ))}
          </div>
        );
        return(
          <div style={S.card}>
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:14}}>
              <h2 style={{...S.h2,margin:0}}>🍀 Lucky bastards & ☔ Pechvogels</h2>
              <Tooltip text={`Gebaseerd op ${aantalGekanteldeWedstrijden} wedstrijd${aantalGekanteldeWedstrijden===1?"":"en"} die door een laat doelpunt (minuut 86+, reguliere speeltijd) van toto veranderde(n). Geluk = je kreeg daardoor toto-punten die je anders niet had gehad. Pech = je verloor daardoor toto-punten die je al te pakken had. Het puntensaldo tussen haakjes (3 pt/wedstrijd groepsfase, 6 pt/wedstrijd KO-fase) is een MINIMUM — exacte-score-punten die je door hetzelfde late doelpunt mogelijk ook kwijtraakte, zitten hier niet in.`}/>
            </div>
            <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              <Lijst titel="Lucky bastards" icon="🍀" data={lucky} kleur={COLORS.green}/>
              <Lijst titel="Pechvogels" icon="☔" data={pech} kleur="#c62828"/>
            </div>
          </div>
        );
      })()}

      
{/* Nieuwsfeed */}
      {ctx.newsItems&&ctx.newsItems.length>0&&(
        <div style={S.card}>
          <h2 style={{...S.h2,marginBottom:14}}>📢 Mededelingen van de beheerder</h2>
          {ctx.newsItems.map((n,i)=>(
            <div key={n.id} style={{
              padding:"12px 14px",borderRadius:8,
              border:`1px solid ${COLORS.border}`,
              borderLeft:`3px solid ${COLORS.green}`,
              marginBottom:i<ctx.newsItems.length-1?10:0,
              background:"#f9fffe"
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontWeight:700,fontSize:14,color:COLORS.dark}}>{n.title}</span>
                <span style={{fontSize:11,color:COLORS.gray}}>{new Date(n.created_at).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
              </div>
              <p style={{fontSize:13,color:COLORS.dark,lineHeight:1.6,margin:0}}>{n.message}</p>
            </div>
          ))}
        </div>
      )}


      
{/* VI WK Nieuws */}
      {ctx.rssItems&&ctx.rssItems.length>0&&(
        <div style={S.card}>
          <div style={{...S.row,marginBottom:14,justifyContent:"space-between",alignItems:"center"}}>
            <h2 style={{...S.h2,margin:0}}>📰 WK 2026 Nieuws</h2>
            <span style={{fontSize:11,color:COLORS.gray}}>Bron: VI.nl</span>
          </div>
          {ctx.rssItems.map((item,i)=>(
            <a key={i} href={item.link} target="_blank" rel="noopener noreferrer"
              style={{display:"block",padding:"10px 0",
                borderBottom:i<ctx.rssItems.length-1?`1px solid ${COLORS.border}`:"none",
                textDecoration:"none",color:"inherit"}}>
              <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <p style={{margin:"0 0 3px",fontSize:13,fontWeight:700,color:COLORS.dark,lineHeight:1.35}}>{item.title}</p>
                  {item.description&&<p style={{margin:"0 0 3px",fontSize:12,color:COLORS.gray,lineHeight:1.4}}>{item.description}</p>}
                  {item.pub_date&&<span style={{fontSize:11,color:COLORS.gray}}>
                    {new Date(item.pub_date).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                  </span>}
                </div>
                <span style={{color:COLORS.green,fontSize:18,flexShrink:0}}>›</span>
              </div>
            </a>
          ))}
          <div style={{textAlign:"right",marginTop:8}}>
            <a href="https://www.vi.nl/tag/wk-2026" target="_blank" rel="noopener noreferrer"
              style={{fontSize:12,color:COLORS.green,textDecoration:"none",fontWeight:700}}>
              Meer WK nieuws op VI.nl →
            </a>
          </div>
        </div>
      )}


{/* Prijzen */}
      <div style={{...S.card, padding:0, overflow:"hidden", marginBottom:14}}>
        <div style={{background:"#f0faf6", padding:"14px 20px", borderBottom:`1px solid ${COLORS.border}`}}>
          <div style={{color:COLORS.green, fontWeight:800, fontSize:15, letterSpacing:-0.3}}>Win mooie prijzen!</div>
          <div style={{color:COLORS.gray, fontSize:12, marginTop:2}}>Voor de nummers 1, 2 en 3 in het eindklassement · Open voor medewerkers, partners & kinderen</div>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:0}}>
          {/* 2e prijs links */}
          <div style={{padding:"20px 16px", display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", background:"#fff"}}>
            <div style={{fontSize:36, marginBottom:8}}>🥈</div>
            <div style={{fontSize:11, fontWeight:700, color:COLORS.gray, letterSpacing:1, textTransform:"uppercase", marginBottom:6}}>2e plaats</div>
            <div style={{fontSize:13, fontWeight:700, color:COLORS.dark, lineHeight:1.4, marginBottom:4}}>Rondleiding PSV Stadion</div>
            <div style={{fontSize:11, color:COLORS.gray, lineHeight:1.5}}>Inclusief kleedkamers, PSV museum & afsluitende lunch voor 2 personen</div>
          </div>
          {/* 1e prijs midden — uitgelicht */}
          <div style={{padding:"24px 16px", display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", background:"#e8f5ee", position:"relative", borderRight:`1px solid ${COLORS.border}`, borderLeft:`1px solid ${COLORS.border}`}}>
            <div style={{position:"absolute", top:0, left:0, right:0, height:3, background:COLORS.yellow}}/>
            <div style={{fontSize:44, marginBottom:8}}>🥇</div>
            <div style={{fontSize:11, fontWeight:800, color:COLORS.green, letterSpacing:1, textTransform:"uppercase", marginBottom:6}}>1e plaats</div>
            <div style={{fontSize:14, fontWeight:800, color:COLORS.dark, lineHeight:1.4, marginBottom:4}}>4 Kaartjes Efteling</div>
            <div style={{fontSize:11, color:COLORS.gray, lineHeight:1.5}}>Een onvergetelijke dag uit voor het hele gezin!</div>
          </div>
          {/* 3e prijs rechts */}
          <div style={{padding:"20px 16px", display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center", background:"#fff"}}>
            <div style={{fontSize:36, marginBottom:8}}>🥉</div>
            <div style={{fontSize:11, fontWeight:700, color:COLORS.gray, letterSpacing:1, textTransform:"uppercase", marginBottom:6}}>3e plaats</div>
            <div style={{fontSize:13, fontWeight:700, color:COLORS.dark, lineHeight:1.4, marginBottom:4}}>Dinerbon Mispelhoef</div>
            <div style={{fontSize:11, color:COLORS.gray, lineHeight:1.5}}>Ter waarde van €75 — een heerlijk diner voor 2</div>
          </div>
        </div>
        <div style={{padding:"10px 16px", background:"#f4f8f5", borderTop:`1px solid ${COLORS.border}`, textAlign:"center"}}>
          <span style={{fontSize:11, color:COLORS.gray}}>🎟️ Deelname staat open voor alle <strong style={{color:COLORS.green}}>Leeuwerik medewerkers</strong>, hun <strong style={{color:COLORS.green}}>partners</strong> en <strong style={{color:COLORS.green}}>kinderen</strong></span>
        </div>
      </div>


      
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={S.card}>
          <h2 style={S.h2}>Puntentelling</h2>
          <div style={{background:"#f0f0f0",borderRadius:5,padding:"4px 8px",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:800,color:COLORS.gray,textTransform:"uppercase",letterSpacing:0.5}}>Groepsfase</span>
          </div>
          <p style={{margin:"0 0 3px",fontSize:13}}>✅ Juiste toto: <strong>3 pt</strong></p>
          <p style={{margin:"0 0 3px",fontSize:13}}>🎯 Exacte uitslag: <strong>5 pt</strong></p>
          <p style={{margin:"0 0 10px",fontSize:13}}>🏆 Doorstoot naar 1/16: <strong>{DOORSTOOT_PTS} pt</strong>/land</p>
          <div style={{background:"#f0f0f0",borderRadius:5,padding:"4px 8px",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:800,color:COLORS.gray,textTransform:"uppercase",letterSpacing:0.5}}>Knock-out (na 90 min)</span>
          </div>
          <p style={{margin:"0 0 3px",fontSize:13}}>✅ Juiste toto: <strong>{KO_TOTO_PTS} pt</strong></p>
          <p style={{margin:"0 0 10px",fontSize:13}}>🎯 Exacte uitslag: <strong>{KO_EXACT_PTS} pt</strong></p>
          <div style={{background:"#f0f0f0",borderRadius:5,padding:"4px 8px",marginBottom:8}}>
            <span style={{fontSize:11,fontWeight:800,color:COLORS.gray,textTransform:"uppercase",letterSpacing:0.5}}>Bonusvragen</span>
          </div>
          {ctx.bonusQuestions.length===0
            ? <p style={{margin:0,fontSize:13}}>🎁 Punten per vraag: <strong>variabel</strong></p>
            : (()=>{
                const pts=ctx.bonusQuestions.map(q=>q.points??20);
                const min=Math.min(...pts),max=Math.max(...pts);
                return min===max
                  ? <p style={{margin:0,fontSize:13}}>🎁 Goed antwoord: <strong>{min} pt</strong></p>
                  : <p style={{margin:0,fontSize:13}}>🎁 Goed antwoord: <strong>{min}–{max} pt</strong> <span style={{fontSize:11,color:COLORS.gray}}>(per vraag)</span></p>;
              })()
          }
        </div>
        <div style={S.card}>
          <div style={{...S.row,marginBottom:0,justifyContent:"space-between"}}>
            <h2 style={{...S.h2,margin:0}}>Laatst toegevoegde deelnemers</h2>
            <button style={{...S.btn("green"),fontSize:12,padding:"6px 12px"}} onClick={()=>setView("standings")}>Bekijk alle deelnemers →</button>
          </div>
          <div style={{fontSize:36,fontWeight:800,color:COLORS.green}}>{ctx.participants.length}<span style={{fontSize:14,fontWeight:400,color:COLORS.gray}}></span></div>
          <div style={{fontSize:12,color:COLORS.gray,marginBottom:10}}>deelnemers aangemeld</div>
          {[...ctx.participants].reverse().slice(0,8).map(p=>(
            <div key={p.id} style={{fontSize:13,padding:"3px 0",borderBottom:`1px solid ${COLORS.border}`}}>{p.first_name} {p.last_name}</div>
          ))}
          {ctx.participants.length>8&&<div style={{fontSize:12,color:COLORS.gray,marginTop:4}}>…en {ctx.participants.length-8} anderen</div>}
        </div>
      </div>

    </div>
  );
}

// ─── REGISTER ────────────────────────────────────────────────────────────────
function RegisterView({setView,ctx}){
  const [firstName,setFirstName]=useState("");
  const [lastName,setLastName]=useState("");
  const [pin,setPin]=useState("");
  const [newPin,setNewPin]=useState("");
  const [newPin2,setNewPin2]=useState("");
  const [err,setErr]=useState("");
  const [saving,setSaving]=useState(false);
  const [confirmNew,setConfirmNew]=useState(false);
  const [step,setStep]=useState("name"); // "name" | "pin" | "newpin"

  // Na deadline alleen bestaande deelnemers laten inloggen, geen nieuwe registraties

  async function handleName(){
    if(!firstName.trim()||!lastName.trim()){setErr("Vul je voor- en achternaam in.");return;}
    const exists=ctx.participants.find(p=>
      p.first_name.toLowerCase()===firstName.toLowerCase().trim()&&
      p.last_name.toLowerCase()===lastName.toLowerCase().trim()
    );
    if(exists){
      // Known user - ask for pin
      setStep("pin");
      setErr("");
    } else {
      // Unknown user - block after deadline
      if(deadlinePassed()){
        setErr("De deadline is verstreken. Nieuwe aanmeldingen zijn niet meer mogelijk.");
        return;
      }
      setConfirmNew(true);
    }
  }

  async function handlePin(){
    const exists=ctx.participants.find(p=>
      p.first_name.toLowerCase()===firstName.toLowerCase().trim()&&
      p.last_name.toLowerCase()===lastName.toLowerCase().trim()
    );
    if(!exists) return;
    if(!pin||pin.length!==4||isNaN(pin)){setErr("Voer een geldige 4-cijferige pincode in.");return;}
    if(exists.pin!==pin){setErr("Pincode onjuist. Probeer opnieuw of neem contact op met de beheerder.");return;}
    ctx.setCurrentUser(exists);
    try{localStorage.setItem("wk_user_id",exists.id);}catch(e){}
    setView("predict");
  }

  async function confirmCreate(){
    if(deadlinePassed()){setErr("De deadline is verstreken. Aanmelden is niet meer mogelijk.");return;}
    if(!newPin||newPin.length!==4||isNaN(newPin)){setErr("Kies een 4-cijferige pincode.");return;}
    if(newPin!==newPin2){setErr("Pincodes komen niet overeen.");return;}
    if(ctx.participants.length>=MAX_PARTICIPANTS){setErr("Maximum deelnemers bereikt.");setConfirmNew(false);return;}
    setSaving(true);
    const res=await db.insert("participants",[{first_name:firstName.trim(),last_name:lastName.trim(),pin:newPin}]);
    if(res&&res[0]){
      ctx.setCurrentUser(res[0]);
      ctx.setParticipants(p=>[...p,res[0]]);
      try{localStorage.setItem("wk_user_id",res[0].id);}catch(e){}
      setView("predict");
    } else {setErr("Aanmelden mislukt, probeer opnieuw.");}
    setSaving(false);
    setConfirmNew(false);
  }

  // Step: enter pin for existing user
  if(step==="pin") return(
    <div style={{...S.card,maxWidth:400,margin:"0 auto"}}>
      <h2 style={S.h2}>Inloggen</h2>
      <p style={{fontSize:14,marginBottom:14,color:COLORS.gray}}>Welkom terug, <strong style={{color:COLORS.dark}}>{firstName.trim()} {lastName.trim()}</strong>!</p>
      {err&&<div style={{...S.alert("err"),marginBottom:10}}>{err}</div>}
      <div style={{marginBottom:16}}>
        <label style={S.label}>Pincode (4 cijfers)</label>
        <input style={{...S.input,letterSpacing:8,fontSize:20,textAlign:"center"}}
          type="password" inputMode="numeric" maxLength={4}
          value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}}
          placeholder="••••" onKeyDown={e=>e.key==="Enter"&&handlePin()}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button style={S.btn("green")} onClick={handlePin} disabled={saving}>Inloggen →</button>
        <button style={S.btn()} onClick={()=>{setStep("name");setPin("");setErr("");}}>← Terug</button>
      </div>
      <p style={{fontSize:11,color:COLORS.gray,marginTop:12}}>Pincode vergeten? Neem contact op met de beheerder.</p>
    </div>
  );

  // Step: choose pin for new user
  if(confirmNew) return(
    <div style={{...S.card,maxWidth:400,margin:"0 auto"}}>
      <h2 style={{...S.h2,marginBottom:8}}>Nieuwe deelnemer</h2>
      <div style={{...S.alert(""),marginBottom:14,fontSize:13,lineHeight:1.6}}>
        Welkom <strong>{firstName.trim()} {lastName.trim()}</strong>! Kies een 4-cijferige pincode om je account te beveiligen.
        <br/><span style={{fontSize:11,color:COLORS.gray}}>Onthoud deze goed — je hebt hem nodig bij het inloggen.</span>
      </div>
      {err&&<div style={{...S.alert("err"),marginBottom:10}}>{err}</div>}
      <div style={{marginBottom:10}}>
        <label style={S.label}>Pincode kiezen (4 cijfers)</label>
        <input style={{...S.input,letterSpacing:8,fontSize:20,textAlign:"center"}}
          type="password" inputMode="numeric" maxLength={4}
          value={newPin} onChange={e=>{setNewPin(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}}
          placeholder="••••"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={S.label}>Pincode herhalen</label>
        <input style={{...S.input,letterSpacing:8,fontSize:20,textAlign:"center"}}
          type="password" inputMode="numeric" maxLength={4}
          value={newPin2} onChange={e=>{setNewPin2(e.target.value.replace(/\D/g,"").slice(0,4));setErr("");}}
          placeholder="••••" onKeyDown={e=>e.key==="Enter"&&confirmCreate()}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button style={S.btn("green")} onClick={confirmCreate} disabled={saving}>
          {saving?"Bezig…":"✅ Aanmelden"}
        </button>
        <button style={S.btn()} onClick={()=>{setConfirmNew(false);setErr("");}}>← Terug</button>
      </div>
    </div>
  );

  // Step: enter name
  return(
    <div style={{...S.card,maxWidth:400,margin:"0 auto"}}>
      <h2 style={S.h2}>Aanmelden / Inloggen</h2>
      {deadlinePassed()?(
        <div style={{...S.alert("warn"),marginBottom:14,fontSize:13,lineHeight:1.6}}>
          🔒 <strong>Nieuwe aanmeldingen zijn gesloten.</strong><br/>
          Ben je al deelnemer? Log dan in met je naam en pincode.
        </div>
      ):(
        <div style={{...S.alert(""),marginBottom:14,fontSize:13,lineHeight:1.6}}>
          <strong>Eerste keer?</strong> Vul je naam in en kies een pincode.<br/>
          <strong>Al eerder aangemeld?</strong> Vul je naam en pincode in.
        </div>
      )}
      {err&&<div style={{...S.alert("err"),marginBottom:10}}>{err}</div>}
      <div style={{marginBottom:10}}>
        <label style={S.label}>Voornaam</label>
        <input style={S.input} value={firstName} onChange={e=>{setFirstName(e.target.value);setErr("");}} placeholder="Jan"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={S.label}>Achternaam</label>
        <input style={S.input} value={lastName} onChange={e=>{setLastName(e.target.value);setErr("");}} placeholder="Jansen" onKeyDown={e=>e.key==="Enter"&&handleName()}/>
      </div>
      <button style={S.btn("green")} onClick={handleName} disabled={saving}>Verder →</button>
    </div>
  );
}

// ─── PREDICT ────────────────────────────────────────────────────────────────
function PredictView({ctx}){
  const [tab,setTab]=useState("group");
  const [localPred,setLocalPred]=useState({});
  const [localBonus,setLocalBonus]=useState({});

  const [saved,setSaved]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editing,setEditing]=useState({});  // {mid: true} when in edit mode
  const user=ctx.currentUser;
  const dp=deadlinePassed();

  // Initialize localPred ONCE per user login - never overwrite after that
  // Uses two effects: one watches user, one watches predictions loading
  const initializedUserRef = useRef(null);

  function tryInitialize(userId, predictions, bonusAnswers){
    if(!userId) return;
    if(initializedUserRef.current===userId) return; // already done
    const predsLoaded = Object.keys(predictions).length > 0;
    if(!predsLoaded) return; // wait for data
    initializedUserRef.current = userId;
    setLocalPred(predictions[userId]||{});
    setLocalBonus(bonusAnswers[userId]||{});
    setEditing({});
  }

  useEffect(()=>{
    if(!user) { initializedUserRef.current=null; return; }
    tryInitialize(user.id, ctx.predictions, ctx.bonusAnswers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);

  useEffect(()=>{
    if(!user) return;
    if(initializedUserRef.current===user.id) return; // already initialized
    tryInitialize(user.id, ctx.predictions, ctx.bonusAnswers);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ctx.predictions]);

  if(!user) return <div style={S.card}><div style={S.alert("warn")}>Meld je eerst aan.</div></div>;

  const saveTimers = useRef({});

  async function autoSaveMatch(mid, scores){
    if(scores.home===undefined||scores.home===null||
       scores.away===undefined||scores.away===null) return;
    const h=parseInt(scores.home);
    const a=parseInt(scores.away);

    // Use DELETE + INSERT — most reliable approach
    // First delete any existing row for this participant+match
    await fetch(
      `${SUPABASE_URL}/rest/v1/predictions?participant_id=eq.${user.id}&match_id=eq.${mid}`,
      {method:"DELETE",
       headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"}}
    );
    // Then insert fresh
    await fetch(
      `${SUPABASE_URL}/rest/v1/predictions`,
      {method:"POST",
       headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,
         "Content-Type":"application/json",Prefer:"return=minimal"},
       body:JSON.stringify([{participant_id:user.id,match_id:mid,home_goals:h,away_goals:a}])}
    );

    ctx.setPredictions(p=>({...p,[user.id]:{...(p[user.id]||{}),[mid]:{home:h,away:a}}}));
    setEditing(e=>{const n={...e};delete n[mid];return n;});
  }

  async function resetMatchPred(mid){
    await fetch(`${SUPABASE_URL}/rest/v1/predictions?participant_id=eq.${user.id}&match_id=eq.${mid}`,{
      method:"DELETE",
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"},
    });
    setLocalPred(p=>{const n={...p};delete n[mid];return n;});
    ctx.setPredictions(p=>{
      const uid=p[user.id]||{};const n={...uid};delete n[mid];
      return {...p,[user.id]:n};
    });
    setEditing(e=>{const n={...e};delete n[mid];return n;});
  }

  function setScore(mid,field,val){
    setLocalPred(p=>{
      const cur=p[mid]||{home:null,away:null};
      return {...p,[mid]:{...cur,[field]:val}};
    });
    setSaved(false);
  }
  function startEdit(mid){
    const saved=ctx.predictions[user.id]?.[mid]||{};
    setLocalPred(p=>({...p,[mid]:{home:saved.home??null,away:saved.away??null}}));
    setEditing(e=>({...e,[mid]:true}));
  }
  function cancelEdit(mid){
    const saved=ctx.predictions[user.id]?.[mid]||{};
    setLocalPred(p=>({...p,[mid]:{home:saved.home??null,away:saved.away??null}}));
    setEditing(e=>{const n={...e};delete n[mid];return n;});
  }
  function setKoTeam(roundId,team,checked){
    setLocalKo(prev=>{
      const cur=prev[roundId]||[];const round=KO_ROUNDS.find(r=>r.id===roundId);
      if(checked&&cur.length>=round.teams)return prev;
      return{...prev,[roundId]:checked?[...cur,team]:cur.filter(t=>t!==team)};
    });setSaved(false);
  }

  // handleSave is no longer used - predictions are saved per-match via autoSaveMatch
  async function handleSave(){ setSaving(false); }

  let filled=0,total=0;
  Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
    teams.forEach((_,i)=>teams.slice(i+1).forEach((_,j)=>{
      const mid=getMatchId(grp,teams[i].name,teams[i+j+1].name);total++;
      const p=localPred[mid]||{};
      if(p.home!==undefined&&p.home!==""&&p.away!==undefined&&p.away!=="")filled++;
    }));
  });

  const tabs2=[{id:"group",label:"Groepsfase & Bonus",step:1,desc:dp?"🔒 Deadline verstreken":`Deadline: ${fmtDeadline()}`},{id:"ko",label:"Knock-out",step:2,desc:"Tot 1 min voor aanvang"}];
  return(
    <div>
      <div style={{...S.row,marginBottom:14}}>
        <h2 style={{...S.h2,margin:0}}>Voorspellingen — {user.first_name} {user.last_name}</h2>
        <span style={S.tag("green")}>Groepsfase: {filled}/{total}</span>
      </div>
      <div style={{display:"flex",gap:0,marginBottom:20,borderRadius:10,overflow:"hidden",border:`1px solid ${COLORS.border}`}}>
        {tabs2.map((t,i)=>{
          const active = tab===t.id;
          const done = t.id==="group"&&filled===total ? true : false;
          return(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1, padding:"12px 8px", border:"none", cursor:"pointer",
              borderRight: i<tabs2.length-1 ? `1px solid ${COLORS.border}` : "none",
              background: active ? COLORS.green : "#fff",
              color: active ? "#fff" : COLORS.dark,
              textAlign:"center", transition:"background 0.15s",
            }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:3}}>
                <span style={{
                  display:"inline-flex",alignItems:"center",justifyContent:"center",
                  width:22,height:22,borderRadius:"50%",fontSize:12,fontWeight:800,
                  background: active?"rgba(255,255,255,0.25)": done?COLORS.green:COLORS.yellow,
                  color: active?"#fff": done?"#fff":COLORS.dark,
                }}>{done?"✓":t.step}</span>
                <span style={{fontWeight:700,fontSize:13}}>{t.label}</span>
              </div>
              <div style={{fontSize:10,opacity:active?0.8:0.5}}>{t.desc}</div>
            </button>
          );
        })}
      </div>

      {tab==="group"&&(()=>{
        const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
        function matchDt(mid,sch){
          if(!sch) return new Date(2099,0,1);
          const [day,mon]=sch.date.split(" ");
          const [h,m]=sch.time.split(":");
          return new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));
        }
        return Object.entries(WK_GROUPS).map(([grp,teams])=>{
          // Build sorted match list for this group
          const matches=[];
          teams.forEach((t1,i)=>teams.slice(i+1).forEach((t2,j)=>{
            const mid=getMatchId(grp,t1.name,t2.name);
            const sch=MATCH_SCHEDULE[mid];
            matches.push({mid,t1,t2,dt:matchDt(mid,sch)});
          }));
          matches.sort((a,b)=>a.dt-b.dt);
          return(
            <div key={grp} style={S.card}>
              <h3 style={S.h3}>Groep {grp}</h3>
              {matches.map(({mid,t1,t2})=>{
                const savedCtx=ctx.predictions[user.id]?.[mid];
                // isSaved: row exists in DB (home can be 0, but not undefined/null)
                const isSaved=savedCtx!==undefined&&savedCtx!==null&&
                  savedCtx.home!==undefined&&savedCtx.home!==null&&
                  savedCtx.away!==undefined&&savedCtx.away!==null;
                if(mid==="F-Nederland-Zweden") console.log("DEBUG F-NL-ZW:",{mid,savedCtx,isSaved,userPreds:ctx.predictions[user.id]});
                const isEditing=!!editing[mid];
                // Displayed values: prefer localPred when editing, else DB values
                const dbHome=isSaved?(savedCtx.home??0):0;
                const dbAway=isSaved?(savedCtx.away??0):0;
                const lpHome=localPred[mid]?.home;
                const lpAway=localPred[mid]?.away;
                const activeHome=isEditing?(lpHome??dbHome):(isSaved?dbHome:(lpHome??0));
                const activeAway=isEditing?(lpAway??dbAway):(isSaved?dbAway:(lpAway??0));
                const activeSave={home:activeHome,away:activeAway};
                const official=ctx.matchResults[mid]&&ctx.matchResults[mid].home!==undefined&&ctx.matchResults[mid].home!==null?ctx.matchResults[mid]:null;
                return <MatchCard key={mid} grp={grp} t1={t1} t2={t2}
                  homeVal={activeHome} awayVal={activeAway} disabled={dp}
                  onHomeChange={v=>setScore(mid,"home",v)} onAwayChange={v=>setScore(mid,"away",v)}
                  isSaved={isSaved} isEditing={isEditing}
                  onSave={()=>autoSaveMatch(mid,activeSave)}
                  onEdit={()=>startEdit(mid)}
                  onCancel={()=>cancelEdit(mid)}
                  showActions={true}
                  officialResult={official}/>;
              })}
              <GroepsstandMini grp={grp} teams={teams} matchPredictions={{
                ...(ctx.predictions[user.id]||{}),
                ...Object.fromEntries(
                  Object.entries(localPred)
                    .filter(([mid,v])=>
                      editing[mid] &&
                      v.home!==null&&v.home!==undefined&&
                      v.away!==null&&v.away!==undefined
                    )
                )
              }}/>
              {/* Official standings if any match played */}
              {(()=>{
                const anyPlayed=teams.some((t1,i)=>teams.slice(i+1).some(t2=>{
                  const mid=getMatchId(grp,t1.name,t2.name);
                  const r=ctx.matchResults[mid];
                  return r&&r.home!==null&&r.home!==undefined;
                }));
                if(!anyPlayed) return null;
                return <OfficieleGroepsstandMini grp={grp} teams={teams} matchResults={ctx.matchResults}/>;
              })()}
            </div>
          );
        });
      })()}

      {tab==="group"&&ctx.bonusQuestions.length>0&&(
        <div>
          <div style={{...S.card,background:COLORS.green,color:"#fff",padding:"12px 18px",marginTop:8}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:700}}>🎁 Bonusvragen {(()=>{
              const pts=ctx.bonusQuestions.map(q=>q.points??20);
              if(pts.length===0) return null;
              const min=Math.min(...pts),max=Math.max(...pts);
              return <span style={{fontSize:12,fontWeight:400,opacity:0.85}}>— {min===max?`${min} pt per vraag`:`${min}–${max} pt per vraag`}</span>;
            })()}</h3>
          </div>
          {dp?(
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",marginBottom:4,fontSize:13,color:COLORS.gray,fontWeight:600}}>
              🔒 Deadline verstreken — antwoorden kunnen niet meer worden gewijzigd
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",marginBottom:4,fontSize:13,color:COLORS.green,fontWeight:600}}>
              ✓ Antwoorden worden automatisch opgeslagen
            </div>
          )}
          {ctx.bonusQuestions.map((q,i)=>(
            <div key={i} style={S.card}>
              <div style={{...S.h3,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span>Vraag {i+1}</span>
                <span style={{...S.tag("yellow")}}>{q.type==="open"?"Open":"MC"}</span>
                <span style={{...S.tag("green")}}>{q.points??20} pt</span>
                <Tooltip text={q.tooltip}/>
              </div>
              <p style={{fontSize:14,marginBottom:12}}>{q.question}</p>
              {q.type==="open"?(
                <textarea disabled={dp} style={{...S.input,minHeight:60}} value={localBonus[q.idx]||""}
                  onChange={e=>{
                    const val=e.target.value;
                    setLocalBonus(p=>({...p,[q.idx]:val}));
                    clearTimeout(saveTimers.current[`bonus_${q.idx}`]);
                    saveTimers.current[`bonus_${q.idx}`]=setTimeout(async()=>{
                      await fetch(`${SUPABASE_URL}/rest/v1/bonus_answers`,{
                        method:"POST",
                        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
                        body:JSON.stringify([{participant_id:user.id,question_idx:q.idx,answer:val}]),
                      });
                      ctx.setBonusAnswers(p=>({...p,[user.id]:{...p[user.id],[q.idx]:val}}));
                    },800);
                  }} placeholder="Jouw antwoord…"/>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {(q.options||[]).filter(o=>o.trim()).map((opt,oi)=>(
                    <label key={oi} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:6,border:`1px solid ${localBonus[q.idx]===opt?COLORS.green:COLORS.border}`,background:localBonus[q.idx]===opt?"#e8f5ee":"#fff",cursor:dp?"default":"pointer",fontSize:13}}>
                      <input disabled={dp} type="radio" name={`b${i}`} checked={localBonus[q.idx]===opt} onChange={async()=>{
                        setLocalBonus(p=>({...p,[q.idx]:opt}));
                        setSaved(false);
                        // DELETE + INSERT voor betrouwbare opslag
                        await fetch(`${SUPABASE_URL}/rest/v1/bonus_answers?participant_id=eq.${user.id}&question_idx=eq.${q.idx}`,{
                          method:"DELETE",
                          headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"},
                        });
                        await fetch(`${SUPABASE_URL}/rest/v1/bonus_answers`,{
                          method:"POST",
                          headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"return=minimal"},
                          body:JSON.stringify([{participant_id:user.id,question_idx:q.idx,answer:opt}]),
                        });
                        ctx.setBonusAnswers(p=>({...p,[user.id]:{...(p[user.id]||{}),[q.idx]:opt}}));
                      }}/>
                      {opt}
                    </label>
                  ))}
                </div>
              )}
              {ctx.bonusScores[user.id]?.[q.idx]!==undefined&&(
                <div style={{...S.alert(ctx.bonusScores[user.id][q.idx]?"green":"err"),marginTop:8}}>
                  {ctx.bonusScores[user.id][q.idx]?`✅ Goed — ${q.points??20} punten!`:"❌ Helaas, niet goed."}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="ko"&&(
        <KOPredictTab ctx={ctx} currentUser={user} saving={saving} setSaving={setSaving} saved={saved} setSaved={setSaved}/>
      )}




    </div>
  );
}

// ─── STANDINGS ───────────────────────────────────────────────────────────────

// ─── DEELNEMER DETAIL OVERLAY ─────────────────────────────────────────────────

// ─── RANKING LIJNGRAFIEK ──────────────────────────────────────────────────────
function RankingLijngrafiek({participantId, rankingSnapshot, totaalDeelnemers}){
  const chartId = `ranking_chart_${participantId}`.replace(/[^a-zA-Z0-9_]/g,"_");

  // Per matches_played-waarde (= per gespeelde wedstrijd) nemen we de LAATST
  // vastgelegde rang (op created_at) — dat is de definitieve stand zoals die
  // gold toen dat aantal wedstrijden was verwerkt, vóórdat de volgende wedstrijd
  // erbij kwam. Dit voorkomt dat een vluchtige tussenstand (door een handmatige
  // correctie of extra Apps Script run) als kunstmatige piek/dal in de grafiek
  // verschijnt, en houdt de lijn vloeiend en waarheidsgetrouw.
  const perWedstrijd = rankingSnapshot
    .filter(r=>r.participant_id===participantId && (r.matches_played??0)>0)
    .reduce((acc,r)=>{
      const mp=r.matches_played;
      if(!acc[mp] || new Date(r.created_at)>new Date(acc[mp].created_at)) acc[mp]=r;
      return acc;
    },{});
  const dataPunten = Object.values(perWedstrijd).sort((a,b)=>a.matches_played-b.matches_played);

  // Voor de tijdas: ALTIJD created_at gebruiken (exact tijdstip), nooit
  // speeldatum (die rondt af naar middernacht en geeft bij meerdere snapshots
  // op dezelfde dag identieke x-coördinaten — daardoor kan de lijn lijken
  // terug te lopen omdat de tekenvolgorde dan niet meer gegarandeerd is).
  function tsVan(p){
    return new Date(p.created_at).getTime();
  }

  React.useEffect(()=>{
    if(!window.Chart){
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      s.onload=()=>{ if(window._wkRankingChartsReady) window._wkRankingChartsReady(); };
      document.head.appendChild(s);
    }
  },[]);

  React.useEffect(()=>{
    if(dataPunten.length===0) return;
    if(!window.Chart){
      window._wkRankingChartsReady = () => renderChart();
      return;
    }
    renderChart();
    return ()=>{
      const existing = window._wkRankingCharts && window._wkRankingCharts[chartId];
      if(existing) existing.destroy();
    };

    function renderChart(){
      const existing = window._wkRankingCharts && window._wkRankingCharts[chartId];
      if(existing) existing.destroy();
      const canvas = document.getElementById(chartId);
      if(!canvas) return;

      // BUGFIX (10 juli, gemeld door Wout): wkStart/wkEind stonden hardgecodeerd
      // op 11 juni – 19 juli. Als de finale door verlenging pas op 20 juli
      // definitief wordt (en dus een ranking-snapshot met een created_at ná
      // 19 juli krijgt), viel dat laatste — en juist grootste — datapunt buiten
      // de x-as en werd het niet getekend. Nu dynamisch afgeleid uit de
      // daadwerkelijke datapunten van déze deelnemer, met wat padding zodat het
      // eerste/laatste punt niet precies op de rand van de grafiek valt. Werkt
      // zo automatisch door, ongeacht hoe laat de laatste wedstrijd uiteindelijk
      // definitief wordt — en ook meteen correct bij een volgend toernooi.
      const dataTimestamps = dataPunten.map(p=>tsVan(p));
      const dataMin = Math.min(...dataTimestamps);
      const dataMax = Math.max(...dataTimestamps);
      const dagInMs = 24*60*60*1000;
      const padding = Math.max((dataMax-dataMin)*0.03, dagInMs);
      const wkStart = dataMin - padding;
      const wkEind = dataMax + padding;

      const maanden=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
      function fmtDate(ts){
        const d=new Date(ts);
        return `${d.getDate()} ${maanden[d.getMonth()]}`;
      }

      const isDark=matchMedia("(prefers-color-scheme: dark)").matches;
      const lineColor=isDark?"#5DCAA5":"#0F6E56";
      const fillColor=isDark?"rgba(93,202,165,0.12)":"rgba(15,110,86,0.08)";
      const gridColor=isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)";
      const textColor=isDark?"#D3D1C7":"#5F5E5A";

      const yMin = -Math.max(1, Math.round(totaalDeelnemers*0.03));
      const yMax = totaalDeelnemers;

      const chartData = dataPunten.map(p=>({x:tsVan(p), y:p.rank}));

      const chart=new window.Chart(canvas,{
        type:"line",
        data:{
          datasets:[{
            label:"Positie",
            data:chartData,
            borderColor:lineColor,
            backgroundColor:fillColor,
            fill:true,
            tension:0.25,
            pointRadius:2,
            pointHoverRadius:6,
            pointBackgroundColor:lineColor,
            borderWidth:2,
          }]
        },
        options:{
          responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{
              callbacks:{
                title:(items)=>fmtDate(items[0].parsed.x),
                label:(item)=>"Positie #"+item.parsed.y,
              }
            }
          },
          scales:{
            x:{
              type:"linear",
              min:wkStart,max:wkEind,
              ticks:{
                color:textColor,font:{size:10},maxRotation:0,
                callback:(v)=>fmtDate(v),
                autoSkip:true,maxTicksLimit:8,
              },
              grid:{display:false},border:{display:false},
              title:{display:true,text:`Datum (WK ${fmtDate(dataMin)} – ${fmtDate(dataMax)})`,color:textColor,font:{size:11}},
            },
            y:{
              reverse:true,min:yMin,max:yMax,
              afterBuildTicks:(axis)=>{
                const step=Math.max(1,Math.ceil(totaalDeelnemers/7));
                const vals=[1];
                for(let v=step;v<totaalDeelnemers;v+=step) vals.push(v);
                if(vals[vals.length-1]!==totaalDeelnemers) vals.push(totaalDeelnemers);
                axis.ticks=vals.map(v=>({value:v}));
              },
              ticks:{
                color:textColor,font:{size:11},
                callback:v=>(v<1||v%1!==0)?"":"#"+v,
              },
              grid:{color:gridColor},border:{display:false},
              title:{display:true,text:"Positie in klassement",color:textColor,font:{size:11}},
            }
          }
        }
      });
      if(!window._wkRankingCharts) window._wkRankingCharts={};
      window._wkRankingCharts[chartId]=chart;
    }
  },[dataPunten.length, chartId]);

  if(dataPunten.length===0) return null;

  return(
    <div style={{marginTop:10,padding:"12px 14px",borderTop:`1px solid ${COLORS.border}`}}>
      <div style={{position:"relative",width:"100%",height:180}}>
        <canvas id={chartId} role="img" aria-label="Lijngrafiek van klassementspositie door het WK heen, één punt per gespeelde wedstrijd"/>
      </div>
    </div>
  );
}

function DeelnemerOverlay({p, ctx, onClose}){
  const C = COLORS;
  // De analyse van Louis: on-demand ophalen (1 rij, alleen voor deze deelnemer).
  // Button verschijnt alleen als er een verslag bestaat — vóór het genereren
  // (admin-knop, na de finale) ziet dus niemand iets.
  const [louisVerslag,setLouisVerslag]=useState(null);
  const [toonLouis,setToonLouis]=useState(false);
  useEffect(()=>{
    let actief=true;
    (async()=>{
      const rows=await db.get("eindverslagen",`participant_id=eq.${p.id}&select=verslag`);
      if(actief&&rows&&rows.length>0&&rows[0].verslag) setLouisVerslag(rows[0].verslag);
    })();
    return()=>{actief=false;};
  },[p.id]);
  // Alleen berekenen als het popup ook echt getoond wordt (63 deelnemers x alle
  // wedstrijden is geen zware berekening, maar hoeft niet bij elke render van
  // de overlay zelf — pas zodra iemand daadwerkelijk op de Louis-knop drukt).
  const louisSchema = toonLouis ? berekenLouisSchema(p, ctx) : null;
  const pred = ctx.predictions[p.id]||{};
  const koPred = ctx.koPredictions[p.id]||{};
  const bonusA = ctx.bonusAnswers[p.id]||{};
  const bonusS = ctx.bonusScores[p.id]||{};

  // Groepsfase: alle wedstrijden gesorteerd op datum+tijd
  const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
  function matchDt(mid){
    const s=MATCH_SCHEDULE[mid];if(!s)return new Date(2099,0,1);
    const[day,mon]=s.date.split(" ");const[h,m]=s.time.split(":");
    return new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));
  }

  const allGroupMatches=[];
  Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
    teams.forEach((t1,i)=>teams.slice(i+1).forEach((t2)=>{
      const mid=getMatchId(grp,t1.name,t2.name);
      const result=ctx.matchResults[mid];
      const hasResult=result&&result.home!==null&&result.home!==undefined;
      const pp=pred[mid];
      const hasPred=pp&&pp.home!==undefined&&pp.home!==null&&pp.away!==undefined&&pp.away!==null;
      let pts=null;
      if(hasPred&&hasResult){
        const exact=parseInt(pp.home)===parseInt(result.home)&&parseInt(pp.away)===parseInt(result.away);
        const toto=calcToto(pp.home,pp.away)===calcToto(result.home,result.away);
        pts=exact?5:toto?3:0;
      }
      allGroupMatches.push({mid,grp,t1,t2,result,hasResult,pp,hasPred,pts,dt:matchDt(mid)});
    }));
  });
  allGroupMatches.sort((a,b)=>a.dt-b.dt);

  const played=allGroupMatches.filter(m=>m.hasResult);
  const notPlayed=allGroupMatches.filter(m=>!m.hasResult&&m.hasPred);
  const totalPts=played.reduce((s,m)=>s+(m.pts||0),0);

  // KO-wedstrijden die nog te spelen zijn maar waar deze deelnemer al een voorspelling voor heeft.
  // Korte ronde-labels voor weergave vooraan (i.p.v. "Gr X").
  const KO_KORT={r16:"16e f",r8:"8e f",r4:"¼ f",r2:"½ f",r3:"Troost",r1:"Finale"};
  const notPlayedKO=(ctx.koMatches||[])
    .map(m=>{
      const kp=koPred[m.id];
      const hasPred=kp&&kp.home!==undefined&&kp.home!==null&&kp.away!==undefined&&kp.away!==null;
      const hasResult=m.home_goals!==null&&m.home_goals!==undefined;
      return {m,kp,hasPred,hasResult};
    })
    .filter(x=>x.hasPred&&!x.hasResult&&x.m.home_team&&x.m.away_team)
    .sort((a,b)=>{
      const ta=a.m.kickoff?new Date(a.m.kickoff).getTime():Infinity;
      const tb=b.m.kickoff?new Date(b.m.kickoff).getTime():Infinity;
      return ta-tb;
    });

  // Gespeelde KO-wedstrijden (met uitslag) → in hetzelfde format als poule-played,
  // maar met isKO-vlag en KO-puntendrempels (10 exact / 6 toto / 0).
  const playedKO=(ctx.koMatches||[])
    .filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.home_team&&m.away_team)
    .map(m=>{
      const kp=koPred[m.id];
      const hasPred=kp&&kp.home!==undefined&&kp.home!==null&&kp.away!==undefined&&kp.away!==null;
      let pts=null;
      if(hasPred){
        const exact=parseInt(kp.home)===parseInt(m.home_goals)&&parseInt(kp.away)===parseInt(m.away_goals);
        const toto=calcToto(kp.home,kp.away)===calcToto(m.home_goals,m.away_goals);
        pts=exact?KO_EXACT_PTS:toto?KO_TOTO_PTS:0;
      }
      return {
        isKO:true,
        mid:m.id,
        koLabel:KO_KORT[m.round_id]||"KO",
        t1:{name:m.home_team}, t2:{name:m.away_team},
        result:{home:m.home_goals,away:m.away_goals},
        pp:kp, hasPred, pts, koMatch:m,
        dt:m.kickoff?new Date(m.kickoff):new Date(2099,0,1),
      };
    });

  // Combineer poule + KO, chronologisch
  const playedAll=[...played.map(m=>({...m,isKO:false})),...playedKO].sort((a,b)=>a.dt-b.dt);

  // Bereken counts voor ratio's
  let gTotoCount=0,gExactCount=0;
  played.forEach(m=>{
    if(!m.hasPred) return;
    const exact=parseInt(m.pp.home)===parseInt(m.result.home)&&parseInt(m.pp.away)===parseInt(m.result.away);
    const toto=calcToto(m.pp.home,m.pp.away)===calcToto(m.result.home,m.result.away);
    if(exact){gTotoCount++;gExactCount++;}
    else if(toto){gTotoCount++;}
  });

  // KO counts
  let koTotoCount=0,koExactCount=0,koPlayed=0;
  ctx.koMatches.forEach(match=>{
    if(!match.home_team||!match.away_team) return;
    if(match.home_goals===null||match.home_goals===undefined) return;
    koPlayed++;
    const kp=koPred[match.id];
    if(!kp||kp.home===undefined||kp.home===null) return;
    const exact=parseInt(kp.home)===parseInt(match.home_goals)&&parseInt(kp.away)===parseInt(match.away_goals);
    const toto=calcToto(kp.home,kp.away)===calcToto(match.home_goals,match.away_goals);
    if(exact){koTotoCount++;koExactCount++;}
    else if(toto){koTotoCount++;}
  });

  // Bonus counts
  const bonusTotal=ctx.bonusQuestions.length;
  const bonusCorrect=Object.entries(bonusS).filter(([,v])=>v===true).length;
  const bonusAnswered=ctx.bonusQuestions.filter(q=>bonusA[q.idx]!==undefined&&bonusA[q.idx]!=="").length;

  // Punten berekening per categorie
  const ptsGroep=played.reduce((s,m)=>s+(m.pts||0),0);
  let ptsKO=0,ptsBonusTotal=0;
  ctx.koMatches.forEach(match=>{
    if(!match.home_team||!match.away_team||match.home_goals===null||match.home_goals===undefined) return;
    const kp=koPred[match.id];
    if(!kp||kp.home===undefined||kp.home===null) return;
    const exact=parseInt(kp.home)===parseInt(match.home_goals)&&parseInt(kp.away)===parseInt(match.away_goals);
    const toto=calcToto(kp.home,kp.away)===calcToto(match.home_goals,match.away_goals);
    if(exact) ptsKO+=KO_EXACT_PTS; else if(toto) ptsKO+=KO_TOTO_PTS;
  });
  Object.entries(bonusS).forEach(([qi,v])=>{
    if(v){const q=ctx.bonusQuestions.find(bq=>String(bq.idx)===String(qi));ptsBonusTotal+=(q?.points??20);}
  });

  // Hoogste en laagste stand — consistent met de grafiek: we nemen per
  // matches_played de LAATST vastgelegde rang (de definitieve stand op dat
  // moment), niet elke vluchtige tussenstand. Zo komt een kortstondige piek/dal
  // door een handmatige correctie niet als "hoogste/laagste ooit" naar voren,
  // en matchen deze cijfers exact met de punten in de grafiek.
  const allMySnapsRaw=ctx.rankingSnapshot.filter(r=>r.participant_id===p.id&&(r.matches_played??0)>=1);
  const allMySnapsPerWedstrijd=Object.values(allMySnapsRaw.reduce((acc,r)=>{
    const mp=r.matches_played;
    if(!acc[mp] || new Date(r.created_at)>new Date(acc[mp].created_at)) acc[mp]=r;
    return acc;
  },{}));
  const allMySnaps=allMySnapsPerWedstrijd;
  const hoogsteStand=allMySnaps.length>0?Math.min(...allMySnaps.map(r=>r.rank)):null;
  const laagsteStand=allMySnaps.length>0?Math.max(...allMySnaps.map(r=>r.rank)):null;

  // Datum (eerste keer) waarop de hoogste/laagste stand werd bereikt.
  // Gebruik speeldatum (de werkelijke speeldag), niet created_at (opslagmoment
  // van de Apps Script — kan door tijdzone/timing afwijken van de speeldag).
  function fmtSnapDate(snap){
    if(!snap) return "";
    // Gebruik speeldatum als die er is, anders created_at als fallback
    // (sommige snapshots missen speeldatum, bv. door handmatige correcties)
    let d;
    if(snap.speeldatum){
      const [jaar,maand,dag] = snap.speeldatum.split("-").map(Number);
      d = new Date(jaar, maand-1, dag);
    } else if(snap.created_at){
      d = new Date(snap.created_at);
    } else {
      return "";
    }
    const weekdagen=["zo","ma","di","wo","do","vr","za"];
    const wd=weekdagen[d.getDay()];
    const dd=String(d.getDate()).padStart(2,"0");
    const mm=String(d.getMonth()+1).padStart(2,"0");
    return `${wd} ${dd}-${mm}`;
  }
  // Sorteer op speeldatum waar aanwezig, anders created_at, om de eerste keer te vinden
  function sortKey(r){ return r.speeldatum || r.created_at || ""; }
  const hoogsteStandSnap = hoogsteStand!==null
    ? allMySnaps.filter(r=>r.rank===hoogsteStand).sort((a,b)=>sortKey(a).localeCompare(sortKey(b)))[0]
    : null;
  const laagsteStandSnap = laagsteStand!==null
    ? allMySnaps.filter(r=>r.rank===laagsteStand).sort((a,b)=>sortKey(a).localeCompare(sortKey(b)))[0]
    : null;
  const hoogsteStandDatum = fmtSnapDate(hoogsteStandSnap);
  const laagsteStandDatum = fmtSnapDate(laagsteStandSnap);

  // Doorstoot detail: welke landen voorspelde deze deelnemer als doorgestoten,
  // op basis van welke positie (1e, 2e, beste-3), en is dat land daadwerkelijk door?
  const doorstootDetail = (()=>{
    const rows = [];
    // Top 2 per groep
    Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
      const stand = calcGroepsstandFromPred(grp, teams, pred);
      if(stand[0]&&stand[0].gespeeld>0) rows.push({naam:stand[0].name, grp, positie:"1e"});
      if(stand[1]&&stand[1].gespeeld>0) rows.push({naam:stand[1].name, grp, positie:"2e"});
    });
    // Beste 8 nummers 3
    const nr3s = [];
    Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
      const stand = calcGroepsstandFromPred(grp, teams, pred);
      if(stand[2]&&stand[2].gespeeld>0) nr3s.push({...stand[2], grp});
    });
    const best8 = nr3s.sort((a,b)=>b.pts-a.pts||b.saldo-a.saldo||b.gv-a.gv).slice(0,8);
    best8.forEach(t=>rows.push({naam:t.name, grp:t.grp, positie:"beste 3e"}));

    // De landen die deze deelnemer als doorstoter voorspelde (NL-namen)
    const voorspeldeNamen = new Set(rows.map(r=>r.naam));

    const detail = rows.map(({naam,grp,positie})=>{
      const enNaam = NL_TO_EN_ALIAS[naam] || naam.toLowerCase();
      const isDoorgestoten = ctx.doorstootLanden && ctx.doorstootLanden.includes(enNaam);
      return { naam, grp, positie, doorgestoten: isDoorgestoten, gemist:false };
    });

    // GEMISTE doorstoters: landen die ECHT zijn doorgestoten maar die deze
    // deelnemer NIET als doorstoter voorspelde → 0 punten laten liggen.
    // Toon hoe de deelnemer dat land wél inschatte (positie in eigen groepsstand).
    if(ctx.doorstootLanden && ctx.doorstootLanden.length>0){
      const EN_TO_NL_DS = Object.fromEntries(Object.entries(NL_TO_EN_ALIAS).map(([nl,en])=>[en,nl]));
      ctx.doorstootLanden.forEach(enNaam=>{
        const nlNaam = EN_TO_NL_DS[enNaam] || enNaam;
        if(voorspeldeNamen.has(nlNaam)) return; // wél voorspeld → al in de lijst
        // Zoek groep + voorspelde positie van dit land
        let grpGevonden=null, positieGevonden="niet voorspeld";
        Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
          if(teams.some(t=>t.name===nlNaam)){
            grpGevonden=grp;
            const stand=calcGroepsstandFromPred(grp,teams,pred);
            const idx=stand.findIndex(s=>s.name===nlNaam);
            if(idx>=0 && stand[idx].gespeeld>0){
              positieGevonden = (idx===0?"1e":idx===1?"2e":idx===2?"3e":"4e");
            }
          }
        });
        if(grpGevonden){
          detail.push({ naam:nlNaam, grp:grpGevonden, positie:positieGevonden, doorgestoten:true, gemist:true });
        }
      });
    }

    // Eén alfabetische lijst; kleur (groen/rood/grijs) maakt het verschil
    return detail.sort((a,b)=>a.naam.localeCompare(b.naam,"nl"));
  })();
  const doorstootPuntenTotaal = doorstootDetail.filter(d=>d.doorgestoten && !d.gemist).length * DOORSTOOT_PTS;

  // ── Poule-breed gemiddelde + score van de koploper, per categorie ──
  // Op verzoek van Wout: achter elk puntenblokje "(gemiddeld: X, leider: Y)".
  // "Leider" = de score van de HUIDIGE KOPLOPER (hoogste totaal) in díe ene
  // categorie — zelfde interpretatie als de "Winnaar"-kolom in het Louis-schema
  // (berekenLouisSchema): het gaat om wat de koploper zelf scoorde in dit
  // onderdeel, niet per se het hoogste cijfer dat ooit in die categorie viel
  // (die twee kunnen verschillen — een ander dan de koploper kan toevallig de
  // meeste doorstootpunten hebben, maar toch niet bovenaan staan).
  const alleTotalenOverlay = berekenAllePuntenTotalen(ctx);
  let koploperOverlay=null, hoogsteTotaalOverlay=-Infinity;
  alleTotalenOverlay.forEach(t=>{ if(t.qTotaal>hoogsteTotaalOverlay){hoogsteTotaalOverlay=t.qTotaal;koploperOverlay=t;} });
  function gemLeider(fn){
    const waarden=alleTotalenOverlay.map(fn);
    const gem=waarden.length?Math.round(waarden.reduce((s,v)=>s+v,0)/waarden.length):0;
    const leiderWaarde=koploperOverlay?fn(koploperOverlay):0;
    return {gem,leiderWaarde};
  }
  const statGroep=gemLeider(t=>t.qGToto+t.qGExact);
  const statDoorstoot=gemLeider(t=>t.qGDoorstoot);
  const statKO=gemLeider(t=>t.qKoToto+t.qKoExact);
  const statBonus=gemLeider(t=>t.qBonus);

  // Van de gespeelde wedstrijden: hoeveel had deze deelnemer ook echt ingevuld
  // (i.p.v. leeg gelaten) — geeft een directe indicatie van wat is blijven liggen.
  const gespeeldTotaalVoorspeld = played.filter(m=>m.hasPred).length + playedKO.filter(m=>m.hasPred).length;

  // Sluit bij klik buiten overlay
  function handleBackdrop(e){if(e.target===e.currentTarget)onClose();}

  return(
    <div onClick={handleBackdrop} style={{
      position:"fixed",top:0,left:0,right:0,bottom:0,
      background:"rgba(0,0,0,0.55)",zIndex:9000,
      display:"flex",alignItems:"flex-start",justifyContent:"center",
      padding:"20px 12px",overflowY:"auto",
    }}>
      <div style={{
        background:"#fff",borderRadius:14,width:"100%",maxWidth:680,
        boxShadow:"0 8px 40px rgba(0,0,0,0.22)",
        marginBottom:20,
      }}>
        {/* Header */}
        <div style={{background:C.green,color:"#fff",padding:"16px 20px",borderRadius:"14px 14px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontWeight:800,fontSize:17}}>{p.first_name} {p.last_name}</div>
            <div style={{fontSize:12,opacity:0.8,marginTop:2}}>Detailweergave punten</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:14,fontWeight:700}}>✕ Sluiten</button>
        </div>

        <div style={{padding:"16px 20px"}}>

          {/* De analyse van Louis — alleen zichtbaar als er een verslag is */}
          {louisVerslag&&(
            <button onClick={()=>setToonLouis(true)} style={{
              width:"100%",marginBottom:16,padding:"12px 16px",borderRadius:10,
              background:"linear-gradient(135deg,#fec72f,#ffd863)",color:COLORS.dark,border:"none",
              fontWeight:800,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            }}>🎙 De analyse van Louis</button>
          )}

          {/* Scores en ranking */}
          <div style={{marginBottom:20,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
            {/* Subtitel Scores */}
            <div style={{background:"#f0faf6",padding:"8px 14px",borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:11,fontWeight:800,color:C.green,textTransform:"uppercase",letterSpacing:0.5}}>Scores</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:0}}>
              {[
                {label:"Gespeelde wedstrijden",val:played.length+ctx.koMatches.filter(m=>m.home_goals!==null&&m.home_goals!==undefined).length,sub:`(waarvan ${gespeeldTotaalVoorspeld} voorspeld)`,icon:"⚽"},
                {label:"Punten groepsfase",val:ptsGroep,sub:`(gemiddeld: ${statGroep.gem} punten, leider: ${statGroep.leiderWaarde} punten)`,icon:"⭐"},
                {label:"Punten doorstoot",val:doorstootPuntenTotaal,sub:`(gemiddeld: ${statDoorstoot.gem} punten, leider: ${statDoorstoot.leiderWaarde} punten)`,icon:"🏆"},
                {label:"Punten KO fase",val:ptsKO,sub:`(gemiddeld: ${statKO.gem} punten, leider: ${statKO.leiderWaarde} punten)`,icon:"⚡"},
                {label:"Punten bonusvragen",val:ptsBonusTotal,sub:`(gemiddeld: ${statBonus.gem} punten, leider: ${statBonus.leiderWaarde} punten)`,icon:"🎁"},
              ].map((item,i)=>(
                <div key={i} style={{
                  padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:10,
                  borderBottom:i<3?`1px solid ${C.border}`:"none",
                  borderRight:i%2===0?`1px solid ${C.border}`:"none",
                }}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:1}}>{item.icon}</span>
                  <div>
                    <div style={{fontSize:10,color:C.gray}}>{item.label}</div>
                    <div style={{fontSize:17,fontWeight:800,color:C.green}}>{item.val}</div>
                    {item.sub&&<div style={{fontSize:10,color:C.gray,marginTop:1}}>{item.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
            {/* Subtitel Ranking */}
            <div style={{background:"#f0faf6",padding:"8px 14px",borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
              <span style={{fontSize:11,fontWeight:800,color:C.green,textTransform:"uppercase",letterSpacing:0.5}}>Ranking</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:0}}>
              {[
                {label:"Hoogste stand ooit",val:hoogsteStand?`#${hoogsteStand}`:"-",datum:hoogsteStandDatum,icon:"📈",color:"#1b5e20"},
                {label:"Laagste stand ooit",val:laagsteStand?`#${laagsteStand}`:"-",datum:laagsteStandDatum,icon:"📉",color:"#b71c1c"},
              ].map((item,i)=>(
                <div key={i} style={{
                  padding:"12px 14px",display:"flex",alignItems:"center",gap:10,
                  borderRight:i===0?`1px solid ${C.border}`:"none",
                }}>
                  <span style={{fontSize:18,flexShrink:0}}>{item.icon}</span>
                  <div>
                    <div style={{fontSize:10,color:C.gray}}>{item.label}</div>
                    <div style={{fontSize:17,fontWeight:800,color:item.color}}>
                      {item.val}{item.datum&&<span style={{fontSize:11,fontWeight:400,color:C.gray,marginLeft:4}}>({item.datum})</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <RankingLijngrafiek participantId={p.id} rankingSnapshot={ctx.rankingSnapshot} totaalDeelnemers={ctx.participants.length}/>
          </div>

          {/* Ratio voortgangsbalken */}
          {played.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:13,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Nauwkeurigheid</div>
              {[
                {label:"Groep toto",count:gTotoCount,total:played.length,color:C.green},
                {label:"Groep exact",count:gExactCount,total:played.length,color:"#1565c0"},
                ...(koPlayed>0?[
                  {label:"KO toto",count:koTotoCount,total:koPlayed,color:C.green},
                  {label:"KO exact",count:koExactCount,total:koPlayed,color:"#1565c0"},
                ]:[]),
                ...(bonusTotal>0?[
                  {label:`Bonus (${bonusAnswered}/${bonusTotal} ingevuld)`,count:bonusCorrect,total:bonusTotal,color:"#e65100"},
                ]:[]),
              ].map((r,i)=>{
                const pct=r.total>0?Math.round(r.count/r.total*100):0;
                return(
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                      <span style={{fontWeight:600,color:C.dark}}>{r.label}</span>
                      <span style={{color:C.gray}}>{r.count}/{r.total} · <strong style={{color:r.color}}>{pct}%</strong></span>
                    </div>
                    <div style={{height:10,background:"#e8e8e8",borderRadius:6,overflow:"hidden"}}>
                      <div style={{
                        height:"100%",borderRadius:6,
                        background:r.color,
                        width:`${pct}%`,
                        transition:"width 0.6s ease",
                        minWidth:pct>0?"6px":"0",
                      }}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Gespeelde wedstrijden */}
          <div style={{fontWeight:700,fontSize:13,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Gespeelde wedstrijden</div>
          {playedAll.length===0&&<p style={{fontSize:13,color:C.gray}}>Nog geen gespeelde wedstrijden.</p>}
          {playedAll.map(({mid,grp,t1,t2,result,pp,hasPred,pts,isKO,koLabel,koMatch})=>{
            // Puntendrempels verschillen: KO = 10 exact / 6 toto, poule = 5 exact / 3 toto
            const exactPt=isKO?KO_EXACT_PTS:5;
            const totoPt=isKO?KO_TOTO_PTS:3;
            const koDisp=isKO?koScoreDisplay(koMatch):null;
            const ptsBg=pts===exactPt?"#e8f5ee":pts===totoPt?"#fff8e1":pts===0?"#fdecea":"#f5f5f5";
            const ptsColor=pts===exactPt?C.green:pts===totoPt?"#7c5800":pts===0?"#c62828":C.gray;
            const ptsLabel=pts===exactPt?`🎯 ${exactPt}pt`:pts===totoPt?`✅ ${totoPt}pt`:pts===0?"❌ 0pt":"—";
            const ptsBorder=pts===exactPt?"#b2dfdb":pts===totoPt?"#ffe082":pts===0?"#ef9a9a":"#eee";
            return(
              <div key={mid} style={{padding:"8px 10px",borderRadius:7,marginBottom:6,background:ptsBg,border:`1px solid ${ptsBorder}`}}>
                {/* Regel 1: groep-label + teamnamen */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{fontSize:10,color:isKO?C.green:C.gray,fontWeight:isKO?700:400,width:38,flexShrink:0}}>{isKO?koLabel:`Gr ${grp}`}</span>
                  <div style={{flex:1,fontSize:13,minWidth:0}}>
                    <span style={{fontWeight:600}}>{t1.name}</span>
                    <span style={{color:C.gray,margin:"0 4px"}}>vs</span>
                    <span style={{fontWeight:600}}>{t2.name}</span>
                  </div>
                </div>
                {/* Regel 2: uitslag / voorspelling / punten in vaste, gelijke kolommen */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",alignItems:"center",gap:8,paddingLeft:46}}>
                  <div style={{fontSize:12}}>
                    <div style={{color:C.gray,fontSize:10}}>Uitslag</div>
                    <div style={{fontWeight:700}}>
                      {koDisp?koDisp.main:`${result.home}–${result.away}`}
                      {koDisp?.mainSuffix&&<span style={{fontWeight:600,fontSize:10,color:C.gray,marginLeft:4}}>{koDisp.mainSuffix}</span>}
                    </div>
                  </div>
                  <div style={{fontSize:12}}>
                    <div style={{color:C.gray,fontSize:10}}>Voorspelling</div>
                    <div style={{fontWeight:700,color:hasPred?C.dark:C.gray}}>{hasPred?`${pp.home}–${pp.away}`:"—"}</div>
                  </div>
                  <div style={{minWidth:56,textAlign:"right"}}>
                    <span style={{fontSize:13,fontWeight:700,color:ptsColor,whiteSpace:"nowrap"}}>{ptsLabel}</span>
                  </div>
                </div>
                {koDisp?.caption&&(
                  <div style={{fontSize:11,color:C.gray,paddingLeft:46,marginTop:4}}>{koDisp.caption}</div>
                )}
              </div>
            );
          })}

          {/* Nog niet gespeeld maar wel voorspeld */}
          {(notPlayed.length>0||notPlayedKO.length>0)&&(
            <>
              <div style={{fontWeight:700,fontSize:13,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginTop:16,marginBottom:8}}>
                Nog te spelen (voorspelling)
              </div>
              {notPlayed.map(({mid,grp,t1,t2,pp})=>(
                <div key={mid} style={{padding:"7px 10px",borderRadius:7,marginBottom:5,background:"#f7f7f7",border:"1px solid #e0e0e0",opacity:0.75}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:10,color:C.gray,width:38,flexShrink:0}}>Gr {grp}</span>
                    <div style={{flex:1,fontSize:13,color:C.gray,minWidth:0}}>
                      <span>{t1.name}</span>
                      <span style={{margin:"0 4px"}}>vs</span>
                      <span>{t2.name}</span>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",alignItems:"center",gap:8,paddingLeft:46}}>
                    <div style={{fontSize:12}}>
                      <div style={{color:C.gray,fontSize:10}}>Voorspelling</div>
                      <div style={{fontWeight:600,color:C.gray}}>{pp.home}–{pp.away}</div>
                    </div>
                    <div style={{minWidth:56,textAlign:"right",fontSize:11,color:C.gray,whiteSpace:"nowrap"}}>nog open</div>
                  </div>
                </div>
              ))}
              {notPlayedKO.map(({m,kp})=>{
                const begonnen = m.kickoff ? new Date() >= new Date(m.kickoff) : false;
                return(
                <div key={m.id} style={{padding:"7px 10px",borderRadius:7,marginBottom:5,background:"#f7f7f7",border:"1px solid #e0e0e0",opacity:0.75}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                    <span style={{fontSize:10,color:C.green,fontWeight:700,width:38,flexShrink:0}}>{KO_KORT[m.round_id]||"KO"}</span>
                    <div style={{flex:1,fontSize:13,color:C.gray,minWidth:0}}>
                      <span>{m.home_team}</span>
                      <span style={{margin:"0 4px"}}>vs</span>
                      <span>{m.away_team}</span>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr auto",alignItems:"center",gap:8,paddingLeft:46}}>
                    <div style={{fontSize:12}}>
                      <div style={{color:C.gray,fontSize:10}}>Voorspelling</div>
                      {begonnen?(
                        <div style={{fontWeight:600,color:C.gray}}>{kp.home}–{kp.away}</div>
                      ):(
                        <div title="Zichtbaar zodra de wedstrijd is begonnen" style={{fontWeight:600,color:C.gray,filter:"blur(5px)",userSelect:"none",pointerEvents:"none",display:"inline-block"}}>{kp.home}–{kp.away}</div>
                      )}
                    </div>
                    <div style={{minWidth:56,textAlign:"right",fontSize:11,color:C.gray,whiteSpace:"nowrap"}}>
                      {begonnen?"nog open":"🔒 na aanvang"}
                    </div>
                  </div>
                </div>
                );
              })}
            </>
          )}

          {/* Doorstoot detail */}
          {doorstootDetail.length>0&&(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:16,marginBottom:8}}>
                <span style={{fontWeight:700,fontSize:13,color:C.gray,textTransform:"uppercase",letterSpacing:0.5}}>🏆 Doorstoot voorspelling</span>
                <span style={{fontSize:12,fontWeight:700,color:C.green}}>{doorstootPuntenTotaal} pt totaal</span>
              </div>
              <div style={{marginBottom:16}}>
                {doorstootDetail.map(({naam,grp,positie,doorgestoten,gemist})=>{
                  // Drie toestanden: groen (voorspeld + door), rood (gemist: door maar niet voorspeld), grijs (voorspeld, nog niet door)
                  const bg = gemist ? "#fdecea" : doorgestoten ? "#e8f5ee" : "#f7f7f7";
                  const border = gemist ? "#ef9a9a" : doorgestoten ? "#b2dfdb" : "#e0e0e0";
                  const naamKleur = gemist ? "#c62828" : doorgestoten ? C.dark : C.gray;
                  const puntKleur = gemist ? "#c62828" : doorgestoten ? C.green : C.gray;
                  const puntTekst = gemist ? "❌ 0pt" : doorgestoten ? `✅ +${DOORSTOOT_PTS}pt` : "⏳ nog niet";
                  return (
                    <div key={naam} style={{
                      display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:7,marginBottom:4,
                      background:bg, border:`1px solid ${border}`,
                    }}>
                      <span style={{fontSize:10,color:C.gray,width:32,flexShrink:0}}>Gr {grp}</span>
                      <FlagImg name={naam} size={16}/>
                      <span style={{flex:1,fontSize:13,fontWeight:600,color:naamKleur}}>{naam}</span>
                      <span style={{fontSize:11,color:C.gray,minWidth:60,textAlign:"center"}}>
                        voorspeld als {positie}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,color:puntKleur,minWidth:75,textAlign:"right"}}>
                        {puntTekst}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Bonusvragen */}
          {ctx.bonusQuestions.length>0&&(
            <>
              <div style={{fontWeight:700,fontSize:13,color:C.gray,textTransform:"uppercase",letterSpacing:0.5,marginTop:16,marginBottom:8}}>Bonusvragen</div>
              {ctx.bonusQuestions.map(q=>{
                const answer=bonusA[q.idx];
                const score=bonusS[q.idx];
                const bg=score===true?"#e8f5ee":score===false?"#fdecea":"#f7f7f7";
                const border=score===true?"#b2dfdb":score===false?"#ef9a9a":"#e0e0e0";
                return(
                  <div key={q.idx} style={{padding:"10px 12px",borderRadius:7,marginBottom:6,background:bg,border:`1px solid ${border}`}}>
                    <div style={{fontSize:12,color:C.gray,marginBottom:3}}>Vraag {q.idx+1} · {q.points??20} pt</div>
                    <div style={{fontSize:13,fontWeight:600,color:C.dark,marginBottom:4}}>{q.question}</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                      <span style={{fontSize:13,color:answer?C.dark:C.gray,fontStyle:answer?"normal":"italic"}}>
                        {answer||"Geen antwoord ingevuld"}
                      </span>
                      <span style={{fontSize:12,fontWeight:700,
                        color:score===true?C.green:score===false?"#c62828":C.gray}}>
                        {score===true?`✅ +${q.points??20} pt`:score===false?"❌ 0 pt":"⏳ Nog niet beoordeeld"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* Pop-up: De analyse van Louis */}
      {toonLouis&&louisVerslag&&(
        <div onClick={()=>setToonLouis(false)} style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,
          display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"40px 12px",overflowY:"auto",
        }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:"#fff",borderRadius:14,width:"100%",maxWidth:560,
            boxShadow:"0 8px 40px rgba(0,0,0,0.3)",
          }}>
            <div style={{background:"linear-gradient(135deg,#fec72f,#ffd863)",color:COLORS.dark,padding:"18px 22px",borderRadius:"14px 14px 0 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:800,fontSize:17}}>🎙 De analyse van Louis</div>
                <div style={{fontSize:12,opacity:0.75,marginTop:2}}>{p.first_name} {p.last_name}</div>
              </div>
              <button onClick={()=>setToonLouis(false)} style={{background:"rgba(0,0,0,0.12)",border:"none",color:COLORS.dark,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:14,fontWeight:700}}>✕</button>
            </div>
            <div style={{padding:"22px",fontSize:14,lineHeight:1.7,color:C.dark,whiteSpace:"pre-line"}}>
              {louisVerslag}
            </div>
            {louisSchema&&(
              <div style={{padding:"0 22px 22px"}}>
                <div style={{fontSize:11,fontWeight:800,color:C.green,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                  Onderdeel in cijfers
                </div>
                <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr 1fr",background:"#f0faf6",borderBottom:`1px solid ${C.border}`}}>
                    {["Onderdeel","Jouw score","Gemiddelde","Winnaar"].map((h,i)=>(
                      <div key={i} style={{padding:"8px 10px",fontSize:11,fontWeight:800,color:C.green,textTransform:"uppercase",letterSpacing:0.3}}>{h}</div>
                    ))}
                  </div>
                  {louisSchema.rijen.map((r,i)=>(
                    <div key={r.onderdeel} style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr 1fr",borderBottom:i<louisSchema.rijen.length-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{padding:"8px 10px",fontSize:13,fontWeight:600}}>{r.onderdeel}</div>
                      <div style={{padding:"8px 10px",fontSize:13,fontWeight:700}}>{r.zelf_pct!==null?`${r.zelf_pct}%`:"—"}</div>
                      <div style={{padding:"8px 10px",fontSize:13,color:"#666"}}>{r.gemiddelde_pct!==null?`${r.gemiddelde_pct}%`:"—"}</div>
                      <div style={{padding:"8px 10px",fontSize:13,color:"#666"}}>{r.winnaar_pct!==null?`${r.winnaar_pct}%`:"—"}</div>
                    </div>
                  ))}
                  {/* Geluk/pech: eigen rijopmaak, geen poulegemiddelde (zie tooltip elders in
                      de app — een saldo is voor de helft van de poule positief en voor de
                      andere helft negatief, dus een gemiddelde zegt hier weinig). */}
                  <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr 1fr 1fr",borderTop:`1px solid ${C.border}`}}>
                    <div style={{padding:"8px 10px",fontSize:13,fontWeight:600}}>{louisSchema.geluk_pech.onderdeel}</div>
                    <div style={{padding:"8px 10px",fontSize:13,fontWeight:700}}>{louisSchema.geluk_pech.zelf_ratio}</div>
                    <div style={{padding:"8px 10px",fontSize:13,color:"#bbb"}}>—</div>
                    <div style={{padding:"8px 10px",fontSize:13,color:"#666"}}>
                      {louisSchema.geluk_pech.winnaar_ratio}
                      <span style={{fontSize:11,color:"#999"}}> ({louisSchema.geluk_pech.verschil_punten})</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {louisSchema&&(()=>{
              // Platte-tekstversie van tabel + verslag, voor delen via WhatsApp/e-mail
              // (die renderen geen React-tabel, dus een simpele regel-per-onderdeel-lijst).
              const tabelTekst=[
                ...louisSchema.rijen.map(r=>`${r.onderdeel}: ${r.zelf_pct!==null?r.zelf_pct+"%":"—"} (gemiddelde ${r.gemiddelde_pct!==null?r.gemiddelde_pct+"%":"—"}, winnaar ${r.winnaar_pct!==null?r.winnaar_pct+"%":"—"})`),
                `${louisSchema.geluk_pech.onderdeel}: ${louisSchema.geluk_pech.zelf_ratio} (winnaar ${louisSchema.geluk_pech.winnaar_ratio}, verschil ${louisSchema.geluk_pech.verschil_punten} punten)`,
              ].join("\n");
              const deelTekst=`🎙 De analyse van Louis — ${p.first_name} ${p.last_name}\n\n${louisVerslag}\n\n📊 Onderdeel in cijfers\n${tabelTekst}\n\nBekijk de hele WK Poule Leeuwerik: https://v0-wk-poule-leeuwerik.vercel.app/`;
              return(
                <div style={{padding:"0 22px 22px",display:"flex",gap:8}}>
                  <a href={`https://wa.me/?text=${encodeURIComponent(deelTekst)}`} target="_blank" rel="noopener noreferrer"
                     style={{...S.btn("green"),textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}>
                    💬 Deel via WhatsApp
                  </a>
                  <a href={`mailto:?subject=${encodeURIComponent("De analyse van Louis — "+p.first_name+" "+p.last_name)}&body=${encodeURIComponent(deelTekst)}`}
                     style={{...S.btn(),textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6}}>
                    ✉️ Deel via e-mail
                  </a>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TOERNOOI-TIJDLIJN (homepage) ────────────────────────────────────────────
// Toont waar we ons in het toernooi bevinden: Start/Einde poulefase, Begin
// KO-fase, en elke KO-ronde. ALLE datums worden afgeleid uit echte data
// (MATCH_SCHEDULE voor de groepsfase, ko_matches.kickoff per ronde) — er staat
// bewust geen enkele datum hardgecodeerd in dit component. Dat betekent: bij
// een volgend toernooi (EK 2028) hoeft hier niets aangepast te worden — zodra
// het nieuwe wedstrijdschema is ingevoerd, klopt deze tijdlijn vanzelf, en een
// fase die nog geen bekende datum heeft (bijv. KO-rondes vlak na een reset)
// wordt gewoon nog niet getoond.
function TournamentTimeline({ctx}){
  const C=COLORS;
  const groepTimestamps=Object.values(MATCH_SCHEDULE).map(s=>parseWKDate(s.date).getTime()).filter(t=>!isNaN(t));
  const startPoule=groepTimestamps.length?new Date(Math.min(...groepTimestamps)):null;
  const eindePoule=groepTimestamps.length?new Date(Math.max(...groepTimestamps)):null;

  function tot0uur(d){const r=new Date(d);r.setHours(0,0,0,0);return r;}

  function minKickoffVoorRonde(roundId){
    const stamps=(ctx.koMatches||[])
      .filter(m=>m.round_id===roundId&&m.kickoff)
      .map(m=>new Date(m.kickoff).getTime());
    // BUGFIX (9 juli, gemeld door Wout): kickoff-tijden bevatten het exacte uur
    // (bijv. vandaag 21:00), terwijl 'now' hieronder wordt afgekapt tot
    // middernacht. Zonder deze tot0uur()-correctie werd een ronde daardoor pas
    // de DAG ERNA als "bereikt" gemarkeerd, niet op de speeldag zelf — precies
    // het probleem dat de tijdlijn nog "kwartfinales" toonde terwijl de eerste
    // halve finale al diezelfde avond gespeeld werd.
    return stamps.length?tot0uur(new Date(Math.min(...stamps))):null;
  }
  const alleKoStamps=(ctx.koMatches||[]).filter(m=>m.kickoff).map(m=>new Date(m.kickoff).getTime());
  const beginKo=alleKoStamps.length?tot0uur(new Date(Math.min(...alleKoStamps))):null;

  const stages=[
    {key:"start_poule",label:"Start poulefase",date:startPoule},
    {key:"einde_poule",label:"Einde poulefase",date:eindePoule},
    {key:"begin_ko",label:"Begin KO-fase",date:beginKo},
    {key:"r16",label:"Zestiende finales",date:minKickoffVoorRonde("r16")},
    {key:"r8",label:"Achtste finales",date:minKickoffVoorRonde("r8")},
    {key:"r4",label:"Kwartfinales",date:minKickoffVoorRonde("r4")},
    {key:"r2",label:"Halve finales",date:minKickoffVoorRonde("r2")},
    {key:"r3",label:"Troostfinale",date:minKickoffVoorRonde("r3")},
    {key:"r1",label:"Finale",date:minKickoffVoorRonde("r1")},
  ].filter(s=>s.date instanceof Date&&!isNaN(s.date));

  if(stages.length<2) return null; // te weinig data bekend (bijv. vlak na reset voor een nieuw toernooi)

  const now=tot0uur(new Date());

  // ── "Afgerond" per fase — BUGFIX (9 juli, gemeld door Wout): een fase bleef
  // voorheen "huidig" totdat de DATUM van de volgende fase aanbrak, ook als de
  // wedstrijden van de huidige fase al lang gespeeld waren (bijv. na de halve
  // finales zit er vaak een paar dagen gat tot de troostfinale/finale — in dat
  // gat bleef "Halve finales" dus ten onrechte oplichten als bezig, terwijl ze
  // al waren afgelopen). Nu: een KO-ronde is pas "afgerond" als ALLE
  // wedstrijden van die ronde een uitslag hebben (resultaat-gebaseerd, niet
  // datum-gebaseerd) — dat schuift de "huidige fase"-markering meteen door
  // zodra de laatste wedstrijd van een ronde is ingevuld, ongeacht hoeveel
  // dagen het nog duurt tot de volgende ronde begint.
  const groepWedstrijdenTotaal=Object.keys(MATCH_SCHEDULE).length;
  const groepWedstrijdenGespeeld=Object.values(ctx.matchResults||{}).filter(r=>r&&r.home!==null&&r.home!==undefined).length;
  function rondeAfgerond(roundId){
    const matches=(ctx.koMatches||[]).filter(m=>m.round_id===roundId);
    if(matches.length===0) return false;
    return matches.every(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.away_goals!==null&&m.away_goals!==undefined);
  }
  const afgerondMap={
    start_poule:now>=startPoule,
    einde_poule:groepWedstrijdenTotaal>0&&groepWedstrijdenGespeeld>=groepWedstrijdenTotaal,
    begin_ko:(ctx.koMatches||[]).some(m=>m.home_goals!==null&&m.home_goals!==undefined)||(beginKo&&now>=beginKo),
    r16:rondeAfgerond("r16"), r8:rondeAfgerond("r8"), r4:rondeAfgerond("r4"),
    r2:rondeAfgerond("r2"), r3:rondeAfgerond("r3"), r1:rondeAfgerond("r1"),
  };

  // "Huidig" = de EERSTE nog niet afgeronde fase (de grens tussen wel/niet klaar),
  // niet meer "de laatst afgeronde fase". Zijn alle fases al klaar (toernooi
  // afgelopen), dan blijft de laatste (Finale) als huidig/afgerond gemarkeerd.
  let huidigIndex=stages.findIndex(s=>!afgerondMap[s.key]);
  if(huidigIndex===-1) huidigIndex=stages.length-1;

  return(
    <div style={S.card}>
      <h2 style={{...S.h2,marginBottom:16,fontSize:16}}>📍 Waar staan we?</h2>
      <div style={{display:"flex",overflowX:"auto",paddingBottom:6}}>
        {stages.map((s,i)=>{
          const bereikt=afgerondMap[s.key]||i<=huidigIndex;
          const isHuidig=i===huidigIndex;
          const isLast=i===stages.length-1;
          const volgendeBereikt=stages[i+1]&&(afgerondMap[stages[i+1].key]||(i+1)<huidigIndex);
          return(
            <div key={s.key} style={{display:"flex",alignItems:"flex-start",flex:isLast?"0 0 auto":"1 1 0%"}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",minWidth:74}}>
                <div style={{
                  width:isHuidig?16:12,height:isHuidig?16:12,borderRadius:"50%",flexShrink:0,
                  background:bereikt?C.green:"#fff",
                  border:`2px solid ${bereikt?C.green:C.border}`,
                  boxShadow:isHuidig?"0 0 0 4px rgba(0,150,80,0.18)":"none",
                }}/>
                <div style={{fontSize:10,fontWeight:isHuidig?800:600,color:bereikt?C.dark:C.gray,textAlign:"center",marginTop:6,lineHeight:1.25,maxWidth:78}}>{s.label}</div>
                <div style={{fontSize:9,color:C.gray,marginTop:2,whiteSpace:"nowrap"}}>{s.date.toLocaleDateString("nl-NL",{day:"numeric",month:"short"})}</div>
              </div>
              {!isLast&&<div style={{flex:1,height:2,background:volgendeBereikt?C.green:C.border,minWidth:16,marginTop:5}}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── SPEELRONDE MAP ──────────────────────────────────────────────────────────
// Ronde 1 = 1e speeldag per groep, Ronde 2 = 2e, Ronde 3 = 3e (laatste groepswedstrijden)
// Per groep spelen 4 teams → 6 wedstrijden op 3 × 2 speeldagen
const SPEELRONDE_MAP = {
  // Groep A
  "A-Mexico-Zuid-Afrika":1, "A-Zuid-Korea-Tsjechië":1,
  "A-Zuid-Afrika-Tsjechië":2, "A-Mexico-Zuid-Korea":2,
  "A-Mexico-Tsjechië":3, "A-Zuid-Afrika-Zuid-Korea":3,
  // Groep B
  "B-Canada-Bosnië-Herzegovina":1, "B-Qatar-Zwitserland":1,
  "B-Bosnië-Herzegovina-Zwitserland":2, "B-Canada-Qatar":2,
  "B-Canada-Zwitserland":3, "B-Bosnië-Herzegovina-Qatar":3,
  // Groep C
  "C-Brazilië-Marokko":1, "C-Haïti-Schotland":1,
  "C-Marokko-Schotland":2, "C-Brazilië-Haïti":2,
  "C-Brazilië-Schotland":3, "C-Marokko-Haïti":3,
  // Groep D
  "D-VS-Paraguay":1, "D-Australië-Turkije":1,
  "D-Paraguay-Turkije":2, "D-VS-Australië":2,
  "D-VS-Turkije":3, "D-Paraguay-Australië":3,
  // Groep E
  "E-Duitsland-Curaçao":1, "E-Ivoorkust-Ecuador":1,
  "E-Duitsland-Ivoorkust":2, "E-Curaçao-Ecuador":2,
  "E-Duitsland-Ecuador":3, "E-Curaçao-Ivoorkust":3,
  // Groep F
  "F-Nederland-Japan":1, "F-Zweden-Tunesië":1,
  "F-Japan-Tunesië":2, "F-Nederland-Zweden":2,
  "F-Japan-Zweden":3, "F-Nederland-Tunesië":3,
  // Groep G
  "G-België-Egypte":1, "G-Iran-Nieuw-Zeeland":1,
  "G-België-Iran":2, "G-Egypte-Nieuw-Zeeland":2,
  "G-Egypte-Iran":3, "G-België-Nieuw-Zeeland":3,
  // Groep H
  "H-Spanje-Kaapverdië":1, "H-Saoedi-Arabië-Uruguay":1,
  "H-Spanje-Saoedi-Arabië":2, "H-Kaapverdië-Uruguay":2,
  "H-Kaapverdië-Saoedi-Arabië":3, "H-Spanje-Uruguay":3,
  // Groep I
  "I-Frankrijk-Senegal":1, "I-Irak-Noorwegen":1,
  "I-Frankrijk-Irak":2, "I-Senegal-Noorwegen":2,
  "I-Frankrijk-Noorwegen":3, "I-Senegal-Irak":3,
  // Groep J
  "J-Argentinië-Algerije":1, "J-Oostenrijk-Jordanië":1,
  "J-Argentinië-Oostenrijk":2, "J-Algerije-Jordanië":2,
  "J-Argentinië-Jordanië":3, "J-Algerije-Oostenrijk":3,
  // Groep K
  "K-Portugal-DR Congo":1, "K-Oezbekistan-Colombia":1,
  "K-Portugal-Oezbekistan":2, "K-DR Congo-Colombia":2,
  "K-Portugal-Colombia":3, "K-DR Congo-Oezbekistan":3,
  // Groep L
  "L-Engeland-Kroatië":1, "L-Ghana-Panama":1,
  "L-Engeland-Ghana":2, "L-Kroatië-Panama":2,
  "L-Engeland-Panama":3, "L-Kroatië-Ghana":3,
};

// ─── KO ROUND MAP ────────────────────────────────────────────────────────────
// Vertaalt de database-round_id (ko_matches.round_id) naar de filter-id die het
// klassement gebruikt in ALLE_RONDES/actieveRondes. Let op: de halve finale en
// finale heten in de database r2/r1, maar als filter r2ko/r1ko — omdat r1/r2 daar
// al "Ronde 1/2" van de groepsfase zijn. Zonder deze map crasht het klassement
// zodra de eerste KO-uitslag binnenkomt (KO_ROUND_MAP was niet gedefinieerd).
const KO_ROUND_MAP = {
  r16: "r16",   // zestiende finales
  r8:  "r8",    // achtste finales
  r4:  "r4",    // kwartfinales
  r2:  "r2ko",  // halve finales (db: r2 → filter: r2ko)
  r1:  "r1ko",  // finale (db: r1 → filter: r1ko)
  r3:  "r1ko",  // troostfinale valt onder de finale-filter
};

function StandingsView({ctx}){
  const [selectedP,setSelectedP]=React.useState(null);

  // Welke deelnemers al een "Analyse van Louis" hebben — lichte query (alleen
  // ID's), zodat we per rij een geel "Analyse"-badge kunnen tonen zonder 63
  // losse fetches te doen.
  const [verslagenIds,setVerslagenIds]=React.useState(null);
  React.useEffect(()=>{
    (async()=>{
      const rows=await db.get("eindverslagen","select=participant_id");
      setVerslagenIds(new Set((rows||[]).map(r=>r.participant_id)));
    })();
  },[]);

  // ─── FILTER STATE ──────────────────────────────────────────────────────────
  const ALLE_RONDES = [
    {id:"r1", label:"Ronde 1"},
    {id:"r2", label:"Ronde 2"},
    {id:"r3", label:"Ronde 3"},
    {id:"r16", label:"1/16"},
    {id:"r8", label:"1/8"},
    {id:"r4", label:"Kwart"},
    {id:"r2ko", label:"Halve"},
    {id:"r1ko", label:"Finale"},
  ];
  // Initieel alleen de rondes aan die al gespeeld zijn
  const [actieveRondes, setActieveRondes] = React.useState(()=>{
    const gespeeld = new Set();
    Object.keys(ctx.matchResults).forEach(mid=>{
      const ronde = SPEELRONDE_MAP[mid];
      if(ronde) gespeeld.add(`r${ronde}`);
    });
    ctx.koMatches.filter(m=>m.home_goals!==null&&m.home_goals!==undefined).forEach(m=>{
      const kid = KO_ROUND_MAP[m.round_id];
      if(kid) gespeeld.add(kid);
    });
    return gespeeld;
  });
  const [toonDoorstoot, setToonDoorstoot] = React.useState(
    ()=>ctx.doorstootLanden&&ctx.doorstootLanden.length>0
  );
  const [toonBonus, setToonBonus] = React.useState(
    ()=>ctx.bonusQuestions.some(q=>Object.values(ctx.bonusScores).some(s=>s[q.idx]!==undefined))
  );

  function toggleRonde(id){
    setActieveRondes(prev=>{
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  // Alle gespeelde rondes
  const gespeeldeRondeIds = React.useMemo(()=>{
    const gespeeld = new Set();
    Object.keys(ctx.matchResults).forEach(mid=>{
      const ronde = SPEELRONDE_MAP[mid];
      if(ronde) gespeeld.add(`r${ronde}`);
    });
    ctx.koMatches.filter(m=>m.home_goals!==null&&m.home_goals!==undefined).forEach(m=>{
      const kid = KO_ROUND_MAP[m.round_id];
      if(kid) gespeeld.add(kid);
    });
    return gespeeld;
  }, [ctx.matchResults, ctx.koMatches]);

  function allesAan(){
    setActieveRondes(new Set(gespeeldeRondeIds));
    setToonDoorstoot(ctx.doorstootLanden&&ctx.doorstootLanden.length>0);
    setToonBonus(ctx.bonusQuestions.some(q=>Object.values(ctx.bonusScores).some(s=>s[q.idx]!==undefined)));
  }
  const heeftDoorstootData = ctx.doorstootLanden&&ctx.doorstootLanden.length>0;
  const heeftBonusData = ctx.bonusQuestions.some(q=>Object.values(ctx.bonusScores).some(s=>s[q.idx]!==undefined));
  const isAllesAan = [...gespeeldeRondeIds].every(r=>actieveRondes.has(r)) &&
    (!heeftDoorstootData||toonDoorstoot) && (!heeftBonusData||toonBonus);



  function calcScore(uid){
    // gToto   = 3pts per wedstrijd met juiste toto (incl. exacte uitslagen)
    // gExact  = 2pts extra per wedstrijd met exacte uitslag
    // koToto  = KO_TOTO_PTS per KO-wedstrijd met juiste toto (incl. exact)
    // koExact = (KO_EXACT_PTS - KO_TOTO_PTS) extra per exacte KO-uitslag
    let gToto=0,gExact=0,gDoorstoot=0,koToto=0,koExact=0,bonus=0;
    let gTotoCount=0,gExactCount=0,koTotoCount=0,koExactCount=0; // voor tiebreaker (poule+finale samen, zie Help §8)
    const pred=ctx.predictions[uid]||{};
    const koPred=ctx.koPredictions[uid]||{};

    // Groepsfase punten — gefilterd op actieve rondes
    Object.entries(ctx.matchResults).forEach(([mid,result])=>{
      const ronde=SPEELRONDE_MAP[mid];
      const rondeId=ronde?`r${ronde}`:null;
      if(!rondeId||!actieveRondes.has(rondeId)) return;
      const p=pred[mid];
      if(!p||p.home===undefined||p.away===undefined||p.home===""||p.away==="")return;
      const exactOk=parseInt(p.home)===parseInt(result.home)&&parseInt(p.away)===parseInt(result.away);
      const totoOk=calcToto(p.home,p.away)===calcToto(result.home,result.away);
      if(exactOk){gToto+=3;gExact+=2;gTotoCount++;gExactCount++;}
      else if(totoOk){gToto+=3;gTotoCount++;}
    });

    // Doorstoot punten — alleen als toggle aan staat
    if(toonDoorstoot){
      const predAdv=calcDoorstootFromPredictions(pred);
      if(ctx.doorstootLanden&&ctx.doorstootLanden.length>0){
        predAdv.forEach(t=>{
          const enNaam=NL_TO_EN_ALIAS[t]||t.toLowerCase();
          if(ctx.doorstootLanden.includes(enNaam)) gDoorstoot+=DOORSTOOT_PTS;
        });
      }
    }

    // KO wedstrijd punten — gefilterd op actieve rondes
    ctx.koMatches.forEach(match=>{
      if(!match.home_team||!match.away_team) return;
      if(match.home_goals===null||match.home_goals===undefined) return;
      const koFilterId=KO_ROUND_MAP[match.round_id];
      if(!koFilterId||!actieveRondes.has(koFilterId)) return;
      const p=koPred[match.id];
      if(!p||p.home===undefined||p.home===null) return;
      const exactOk=parseInt(p.home)===parseInt(match.home_goals)&&parseInt(p.away)===parseInt(match.away_goals);
      const totoOk=calcToto(p.home,p.away)===calcToto(match.home_goals,match.away_goals);
      if(exactOk){koToto+=KO_TOTO_PTS;koExact+=(KO_EXACT_PTS-KO_TOTO_PTS);koTotoCount++;koExactCount++;}
      else if(totoOk){koToto+=KO_TOTO_PTS;koTotoCount++;}
    });

    // Bonus punten — alleen als toggle aan staat
    if(toonBonus){
      Object.entries(ctx.bonusScores[uid]||{}).forEach(([qi,v])=>{
        if(v){
          const q=ctx.bonusQuestions.find(bq=>String(bq.idx)===String(qi));
          bonus+=(q?.points??20);
        }
      });
    }
    const total=gToto+gExact+gDoorstoot+koToto+koExact+bonus;
    // Tiebreaker-aantallen: poulefase + finalefase SAMEN (zie Help §8, stap 2 en 3)
    const totoCountCombined=gTotoCount+koTotoCount;
    const exactCountCombined=gExactCount+koExactCount;
    return{gToto,gExact,gDoorstoot,koToto,koExact,bonus,total,gTotoCount,gExactCount,koTotoCount,koExactCount,totoCountCombined,exactCountCombined};
  }

  // Sorteer: totaal desc → toto-count desc → exact-count desc
  const rawRows=ctx.participants.map(p=>({...p,...calcScore(p.id)}));
  rawRows.sort((a,b)=>{
    if(b.total!==a.total) return b.total-a.total;
    if(b.totoCountCombined!==a.totoCountCombined) return b.totoCountCombined-a.totoCountCombined;
    if(b.exactCountCombined!==a.exactCountCombined) return b.exactCountCombined-a.exactCountCombined;
    if(b.bonus!==a.bonus) return b.bonus-a.bonus;
    return 0; // Volledig gelijk = gedeelde positie
  });
  // Ken rangnummers toe (gelijke stand = zelfde rang)
  const rows=rawRows.reduce((acc,p,i)=>{
    const prev=acc[i-1];
    const gelijk=prev&&p.total===prev.total&&p.totoCountCombined===prev.totoCountCombined&&p.exactCountCombined===prev.exactCountCombined&&p.bonus===prev.bonus;
    const rang=i===0?1:gelijk?prev.rang:i+1;
    acc.push({...p,rang});
    return acc;
  },[]);

  // Calculate trend: detecteer batches door snapshots te clusteren op tijdsverschil > 2 min
  const trendMap={};
  if(ctx.rankingSnapshot.length>0){
    // Groepeer snapshots op matches_played (robuust — onafhankelijk van tijdstip)
    const mpValues=[...new Set(ctx.rankingSnapshot.map(r=>r.matches_played??0))].sort((a,b)=>b-a);
    // Sla matches_played=0 over (nul-stand vóór eerste wedstrijd)
    const meaningful=mpValues.filter(mp=>mp>0);
    function dedupSnap2(rows){
      const map={};
      rows.forEach(r=>{
        if(!map[r.participant_id]||new Date(r.created_at)>new Date(map[r.participant_id].created_at)) map[r.participant_id]=r;
      });
      return Object.values(map);
    }
    if(meaningful.length>=2){
      const latestMp=meaningful[0];
      const prevMp=meaningful[1];
      const latest=dedupSnap2(ctx.rankingSnapshot.filter(r=>(r.matches_played??0)===latestMp));
      const prev=dedupSnap2(ctx.rankingSnapshot.filter(r=>(r.matches_played??0)===prevMp));
      latest.forEach(cur=>{
        const p=prev.find(x=>x.participant_id===cur.participant_id);
        if(p) trendMap[cur.participant_id]=p.rank-cur.rank;
      });
    }
  }

  function TrendBadge({uid}){
    const t=trendMap[uid];
    if(!t) return <span style={{color:COLORS.gray,fontSize:11}}>–</span>;
    if(t>0) return <span style={{color:COLORS.green,fontWeight:700,fontSize:12}}>↑{t}</span>;
    return <span style={{color:"#c62828",fontWeight:700,fontSize:12}}>↓{Math.abs(t)}</span>;
  }

  return(
    <div style={S.card}>
      {selectedP&&<DeelnemerOverlay p={selectedP} ctx={ctx} onClose={()=>setSelectedP(null)}/>}
      {/* Filter UI */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:700,color:COLORS.gray,textTransform:"uppercase",letterSpacing:0.5,flexShrink:0}}>Speelrondes:</span>
          {ALLE_RONDES.map(r=>{
            const heeftData = gespeeldeRondeIds.has(r.id);
            const aan = actieveRondes.has(r.id);
            return(
              <button key={r.id} onClick={()=>heeftData&&toggleRonde(r.id)}
                style={{
                  padding:"5px 10px",borderRadius:6,border:"none",cursor:heeftData?"pointer":"default",
                  fontWeight:700,fontSize:12,
                  background:!heeftData?"#f0f0f0":aan?COLORS.green:"#e0e0e0",
                  color:!heeftData?"#bbb":aan?"#fff":COLORS.dark,
                  opacity:!heeftData?0.5:1,
                }}
              >{r.label}</button>
            );
          })}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:11,fontWeight:700,color:COLORS.gray,textTransform:"uppercase",letterSpacing:0.5,flexShrink:0}}>Extra:</span>
          {[
            {id:"doorstoot",label:"🏆 Doorstoot",aan:toonDoorstoot,toggle:()=>setToonDoorstoot(v=>!v),
             heeftData:heeftDoorstootData},
            {id:"bonus",label:"🎁 Bonus",aan:toonBonus,toggle:()=>setToonBonus(v=>!v),
             heeftData:heeftBonusData},
          ].map(item=>(
            <button key={item.id} onClick={()=>item.heeftData&&item.toggle()}
              style={{
                padding:"5px 10px",borderRadius:6,border:"none",cursor:item.heeftData?"pointer":"default",
                fontWeight:700,fontSize:12,
                background:!item.heeftData?"#f0f0f0":item.aan?COLORS.green:"#e0e0e0",
                color:!item.heeftData?"#bbb":item.aan?"#fff":COLORS.dark,
                opacity:!item.heeftData?0.5:1,
              }}
            >{item.label}</button>
          ))}
          {!isAllesAan&&(
            <button onClick={allesAan} style={{
              padding:"5px 10px",borderRadius:6,border:`1px solid ${COLORS.border}`,
              background:"#fff",color:COLORS.green,fontWeight:700,fontSize:12,cursor:"pointer",
            }}>↺ Reset</button>
          )}
        </div>
        {!isAllesAan&&(
          <div style={{marginTop:6,fontSize:11,color:COLORS.gray,fontStyle:"italic"}}>
            Gefilterd klassement — niet alle rondes zijn geselecteerd
          </div>
        )}
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:16}}>
        <h2 style={{...S.h2,margin:0}}>Klassement</h2>
        {(()=>{
          // Laatste verwerkte wedstrijd + totaal aantal gespeelde wedstrijden.
          // Combineert groepswedstrijden (matchResults) én KO-wedstrijden (koMatches),
          // zodat het blokje meeloopt met de KO-fase i.p.v. te blijven hangen op de
          // laatste groepswedstrijd.
          const months2={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
          function matchDateTime(mid){
            const s=MATCH_SCHEDULE[mid];if(!s)return new Date(0);
            const[day,mon]=s.date.split(" ");const[h,m]=s.time.split(":");
            return new Date(2026,months2[mon],parseInt(day),parseInt(h),parseInt(m));
          }
          // Gespeelde groepswedstrijden → uniforme vorm
          const gespeeld=[];
          Object.keys(ctx.matchResults).filter(mid=>ctx.matchResults[mid]&&ctx.matchResults[mid].home!==null).forEach(mid=>{
            const r=ctx.matchResults[mid];
            gespeeld.push({
              dt:matchDateTime(mid),
              label:mid.replace(/^[A-Z]-/,"").replace(/-/g," – "),
              score:r.home+"–"+r.away,
              date:MATCH_SCHEDULE[mid]?MATCH_SCHEDULE[mid].date:null,
            });
          });
          // Gespeelde KO-wedstrijden → uniforme vorm
          (ctx.koMatches||[]).filter(m=>m.home_goals!==null&&m.home_goals!==undefined&&m.home_team&&m.away_team).forEach(m=>{
            const dt=m.kickoff?new Date(m.kickoff):new Date(0);
            gespeeld.push({
              dt,
              label:`${m.home_team} – ${m.away_team}`,
              score:m.home_goals+"–"+m.away_goals,
              date:m.kickoff?dt.toLocaleDateString("nl-NL",{day:"numeric",month:"short",timeZone:"Europe/Amsterdam"}):null,
            });
          });
          gespeeld.sort((a,b)=>a.dt-b.dt);
          const last=gespeeld[gespeeld.length-1];
          const totalPlayed=gespeeld.length;
          if(!last) return null;
          const lastLabel=last.label, lastScore=last.score, lastDate=last.date;
          return(
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,background:"#f4f9f6",border:`1px solid ${COLORS.green}22`,borderRadius:8,padding:"6px 14px"}}>
                <span style={{fontSize:16}}>⚽</span>
                <div>
                  <div style={{fontSize:10,color:COLORS.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:0.4}}>Stand t/m ({totalPlayed} wedstrijden)</div>
                  <div style={{fontSize:13,fontWeight:700,color:COLORS.dark}}>
                    {lastLabel} <span style={{color:COLORS.green}}>{lastScore}</span>
                    {lastDate&&<span style={{color:COLORS.gray,fontWeight:400,marginLeft:6,fontSize:12}}>{lastDate}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
      {rows.length===0&&<p style={{color:COLORS.gray,fontSize:13}}>Nog geen deelnemers.</p>}
      {rows.length>0&&(()=>{
        // Hoogste score per onderdeel bepalen (alleen markeren als >0, anders kleurt
        // een nog-niet-gespeeld onderdeel als KO/Bonus de hele kolom grijs).
        const maxToto=Math.max(0,...rows.map(p=>p.gToto||0));
        const maxExact=Math.max(0,...rows.map(p=>p.gExact||0));
        const maxDoorstoot=Math.max(0,...rows.map(p=>p.gDoorstoot||0));
        const maxKoToto=Math.max(0,...rows.map(p=>p.koToto||0));
        const maxKoExact=Math.max(0,...rows.map(p=>p.koExact||0));
        const maxBonus=Math.max(0,...rows.map(p=>p.bonus||0));
        const hi="#e0e0e0"; // licht grijs voor hoogste score
        const markeer=(val,max)=>(max>0&&val===max)?{background:hi,fontWeight:700}:{};
        const vlijn={borderRight:`1px solid ${COLORS.border}`}; // verticale scheidingslijn, zelfde stijl als horizontale
        return (
        <div style={{overflowX:"auto"}}>
          <table style={S.table}>
            <thead><tr>
              <th style={{...S.th,...vlijn}}>#</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>+/-</th>
              <th style={{...S.th,...vlijn}}>Naam</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>Groep toto</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>Groep exact</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>Doorstoot</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>KO toto</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>KO exact</th>
              <th style={{...S.th,textAlign:"center",...vlijn}}>Bonus</th>
              <th style={{...S.th,textAlign:"center",background:COLORS.dark}}>Totaal</th>
            </tr></thead>
            <tbody>
              {rows.map((p,i)=>(
                <tr key={p.id} style={{background:p.rang===1?"#fffde7":i%2===0?"#f9fffe":"#fff"}}>
                  <td style={{...S.td,...vlijn}}>{p.rang===1?"🥇":p.rang===2?"🥈":p.rang===3?"🥉":p.rang}</td>
                  <td style={{...S.tdc,...vlijn}}><TrendBadge uid={p.id}/></td>
                  <td style={{...S.td,fontWeight:600,cursor:"pointer",color:COLORS.green,...vlijn}} onClick={()=>setSelectedP(p)}>
                    {p.first_name} {p.last_name}
                    {verslagenIds&&verslagenIds.has(p.id)&&(
                      <span style={{marginLeft:6,background:"#fec72f",color:COLORS.dark,fontSize:10,fontWeight:800,
                        padding:"2px 7px",borderRadius:5,verticalAlign:"middle"}}>Analyse</span>
                    )}
                    {" "}<span style={{fontSize:12,opacity:0.6}}>›</span>
                  </td>
                  <td style={{...S.tdc,...markeer(p.gToto,maxToto),...vlijn}}>{p.gToto}</td>
                  <td style={{...S.tdc,...markeer(p.gExact,maxExact),...vlijn}}>{p.gExact}</td>
                  <td style={{...S.tdc,...markeer(p.gDoorstoot,maxDoorstoot),...vlijn}}>{p.gDoorstoot}</td>
                  <td style={{...S.tdc,...markeer(p.koToto,maxKoToto),...vlijn}}>{p.koToto}</td>
                  <td style={{...S.tdc,...markeer(p.koExact,maxKoExact),...vlijn}}>{p.koExact}</td>
                  <td style={{...S.tdc,...markeer(p.bonus,maxBonus),...vlijn}}>{p.bonus}</td>
                  <td style={S.tdc}><span style={S.badge}>{p.total}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,fontSize:12,color:COLORS.gray}}>
            <span style={{display:"inline-block",width:16,height:16,background:hi,borderRadius:3,border:`1px solid #ccc`,flexShrink:0}}/>
            <span>= hoogste score per onderdeel (kan door meerdere deelnemers gedeeld worden)</span>
          </div>
        </div>
        );
      })()}
    </div>
  );
}



// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function Tooltip({text}){
  const [show,setShow]=useState(false);
  if(!text) return null;
  return(
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",marginLeft:2,verticalAlign:"middle"}}>
      <span
        onMouseEnter={()=>setShow(true)}
        onMouseLeave={()=>setShow(false)}
        onClick={()=>setShow(s=>!s)}
        style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
          width:20,height:20,borderRadius:"50%",background:COLORS.green,color:"#fff",
          fontSize:11,fontWeight:700,cursor:"pointer",userSelect:"none",flexShrink:0}}>
        ⓘ
      </span>
      {show&&(
        <span style={{
          position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",
          background:COLORS.dark,color:"#fff",padding:"8px 12px",borderRadius:8,fontSize:13,
          zIndex:9999,width:280,lineHeight:1.5,
          boxShadow:"0 4px 16px rgba(0,0,0,0.25)",
          pointerEvents:"none",
          whiteSpace:"normal",
          wordBreak:"break-word",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}


// ─── SNAPSHOT HELPER ─────────────────────────────────────────────────────────
async function saveRankingSnapshot(participants, predictions, matchResults, koPredictions, koMatches, bonusScores, bonusQuestions, setRankingSnapshot) {
  // Calculate current scores
  function calcTotal(uid){
    let total=0;
    const pred=predictions[uid]||{};
    const koPred=koPredictions[uid]||{};
    Object.entries(matchResults).forEach(([mid,result])=>{
      const p=pred[mid];
      if(!p||p.home===undefined||p.away===undefined||p.home===""||p.away==="") return;
      const exactOk=parseInt(p.home)===parseInt(result.home)&&parseInt(p.away)===parseInt(result.away);
      const totoOk=calcToto(p.home,p.away)===calcToto(result.home,result.away);
      if(exactOk)total+=5;else if(totoOk)total+=3;
    });
    // saveRankingSnapshot gebruikt koMatches als fallback (server-side heeft geen doorstootLanden state)
    const predAdv=calcDoorstootFromPredictions(pred);
    const r16teams=[...new Set(koMatches.filter(m=>m.round_id==="r16"&&m.home_team&&m.away_team).flatMap(m=>[m.home_team,m.away_team]))];
    if(r16teams.length>0) predAdv.forEach(t=>{if(r16teams.includes(t))total+=DOORSTOOT_PTS;});
    koMatches.forEach(match=>{
      if(!match.home_team||!match.away_team||match.home_goals===null||match.home_goals===undefined) return;
      const p=koPred[match.id];
      if(!p||p.home===undefined||p.home===null) return;
      const exactOk=parseInt(p.home)===parseInt(match.home_goals)&&parseInt(p.away)===parseInt(match.away_goals);
      const totoOk=calcToto(p.home,p.away)===calcToto(match.home_goals,match.away_goals);
      if(exactOk)total+=KO_EXACT_PTS;else if(totoOk)total+=KO_TOTO_PTS;
    });
    Object.entries(bonusScores[uid]||{}).forEach(([qi,v])=>{
      if(v){const q=bonusQuestions.find(bq=>String(bq.idx)===String(qi));total+=(q?.points??20);}
    });
    return total;
  }

  const matchesPlayedNow=Object.keys(matchResults).length+
    koMatches.filter(m=>m.home_goals!==null&&m.home_goals!==undefined).length;

  const ranked=participants
    .map(p=>({id:p.id,total:calcTotal(p.id)}))
    .sort((a,b)=>b.total-a.total)
    .map((p,i)=>({participant_id:p.id,rank:i+1,total:p.total,matches_played:matchesPlayedNow}));

  // Debug: log wat we proberen op te slaan
  console.log("saveRankingSnapshot: opslaan", ranked.length, "rijen, matches_played:", matchesPlayedNow);
  const snapResp = await fetch(`${SUPABASE_URL}/rest/v1/rankings_snapshot`,{
    method:"POST",
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"return=minimal"},
    body:JSON.stringify(ranked),
  });
  console.log("saveRankingSnapshot HTTP:", snapResp.status, await snapResp.text());

  // Reload snapshot
  const snap=await fetch(`${SUPABASE_URL}/rest/v1/rankings_snapshot?select=*&order=created_at.desc&limit=200`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
  }).then(r=>r.json());
  if(snap) setRankingSnapshot(snap);
}

// ─── OFFICIËLE GROEPSSTAND ────────────────────────────────────────────────────
function calcOfficieleStand(grp, teams, matchResults) {
  const stand = teams.map(t=>({name:t.name,pts:0,gv:0,gt:0,saldo:0,gespeeld:0,wins:0,disc:0}));
  // Sla onderlinge uitslagen apart op voor tiebreaker
  const onderling = {}; // "TeamA|TeamB" -> {ptsA, ptsB, saldoA, gvA}
  teams.forEach((t1,i)=>teams.slice(i+1).forEach((t2,j)=>{
    const mid=getMatchId(grp,t1.name,t2.name);
    const r=matchResults[mid];
    if(!r||r.home===null||r.home===undefined||r.away===null||r.away===undefined) return;
    const h=parseInt(r.home),a=parseInt(r.away);
    if(isNaN(h)||isNaN(a)) return;
    const s1=stand.find(s=>s.name===t1.name),s2=stand.find(s=>s.name===t2.name);
    if(!s1||!s2) return;
    s1.gv+=h;s1.gt+=a;s1.saldo+=h-a;s1.gespeeld++;
    s2.gv+=a;s2.gt+=h;s2.saldo+=a-h;s2.gespeeld++;
    let ptsA=0, ptsB=0;
    if(h>a){s1.pts+=3;s1.wins++;ptsA=3;}else if(h<a){s2.pts+=3;s2.wins++;ptsB=3;}else{s1.pts+=1;s2.pts+=1;ptsA=1;ptsB=1;}
    onderling[`${t1.name}|${t2.name}`] = {ptsA, ptsB, saldoA:h-a, gvA:h};
    onderling[`${t2.name}|${t1.name}`] = {ptsA:ptsB, ptsB:ptsA, saldoA:a-h, gvA:a};
  }));

  // Onderling resultaat tiebreaker: alleen toepasbaar bij precies 2 teams gelijk
  // BUGFIX: als onderling ook volledig gelijk is (zoals 2-2), mag dit GEEN volgorde forceren —
  // anders ontstaat inconsistente sortering afhankelijk van a/b volgorde tijdens sort()
  function onderlingVergelijk(a, b){
    const key = `${a.name}|${b.name}`;
    const m = onderling[key];
    if(!m) return 0; // nog niet gespeeld tegen elkaar
    if(m.ptsA !== m.ptsB) return m.ptsB - m.ptsA; // meer onderlinge punten = beter
    if(m.saldoA !== 0) return -m.saldoA; // beter onderling doelsaldo
    // Bij gelijke punten EN gelijk saldo (bv. 2-2) is er geen onderling verschil — return 0
    return 0;
  }

  return stand.sort((a,b)=>{
    if(b.pts!==a.pts) return b.pts-a.pts;
    if(b.saldo!==a.saldo) return b.saldo-a.saldo;
    if(b.gv!==a.gv) return b.gv-a.gv;
    if(b.wins!==a.wins) return b.wins-a.wins;
    // Volledig gelijk op alle teamstatistieken → check onderling resultaat
    return onderlingVergelijk(a,b);
  });
}

function calcBesteDerdes(matchResults) {
  // Collect nr3 from each group (show if any team in group has played)
  const nr3s = [];
  Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
    const stand = calcOfficieleStand(grp, teams, matchResults);
    const anyPlayed = stand.some(t=>t.gespeeld>0);
    if(stand[2]&&anyPlayed){
      nr3s.push({...stand[2], grp});
    }
  });
  // Sort: punten → doelsaldo → doelpunten voor → overwinningen → disc (lager=beter)
  return nr3s.sort((a,b)=>
    b.pts-a.pts||b.saldo-a.saldo||b.gv-a.gv||b.wins-a.wins||a.disc-b.disc
  );
}

function OfficieleGroepsstandMini({grp, teams, matchResults, nr3Qualifiers=[]}) {
  const stand = calcOfficieleStand(grp, teams, matchResults);
  const C = COLORS;
  const anyPlayed = stand.some(t=>t.gespeeld>0);
  if(!anyPlayed) return null;
  return(
    <div style={{marginTop:10,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
      <div style={{background:C.green,color:"#fff",padding:"4px 10px",fontSize:11,fontWeight:700,letterSpacing:0.5}}>
        STAND GROEP {grp}
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:"#f0faf6"}}>
            <th style={{padding:"4px 6px",textAlign:"left",fontWeight:600,color:C.gray,width:20}}>#</th>
            <th style={{padding:"4px 8px",textAlign:"left",fontWeight:600,color:C.gray}}>Land</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>G</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>GV</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>GT</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>+/-</th>
            <th style={{padding:"4px 8px",textAlign:"center",fontWeight:700,color:C.dark}}>Pt</th>
          </tr>
        </thead>
        <tbody>
          {stand.map((t,i)=>{
            const isNr3Qual = i===2 && nr3Qualifiers.includes(t.name);
            const bg = i<2?"#e8f5ee":isNr3Qual?"#e8f5ee":i===2?"#fff8e1":"#fff";
            return(
              <tr key={t.name} style={{background:bg,borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:"4px 6px",fontWeight:700,color:i<2||isNr3Qual?C.green:C.gray,textAlign:"center"}}>{i+1}</td>
                <td style={{padding:"4px 8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <FlagImg name={t.name} size={14}/> {t.name}
                    {(i<2||isNr3Qual)&&<span style={{fontSize:10,color:C.green,fontWeight:700,marginLeft:2}}>✓</span>}
                  </div>
                </td>
                <td style={{padding:"4px 6px",textAlign:"center",color:C.gray}}>{t.gespeeld}</td>
                <td style={{padding:"4px 6px",textAlign:"center"}}>{t.gv}</td>
                <td style={{padding:"4px 6px",textAlign:"center"}}>{t.gt}</td>
                <td style={{padding:"4px 6px",textAlign:"center",color:t.saldo>0?C.green:t.saldo<0?"#c62828":C.gray}}>{t.saldo>0?"+":""}{t.saldo}</td>
                <td style={{padding:"4px 8px",textAlign:"center",fontWeight:800,color:C.dark}}>{t.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{fontSize:10,color:C.gray,padding:"3px 8px",background:"#f9fffe"}}>🟢 Gaat door</div>
    </div>
  );
}

function BesteDerdesStand({matchResults}) {
  const C = COLORS;
  const alle = calcBesteDerdes(matchResults);
  if(alle.length===0) return null;
  const top8 = alle.slice(0,8).map(t=>t.name);
  return(
    <div style={{borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
      <div style={{background:C.green,color:"#fff",padding:"4px 10px",fontSize:11,fontWeight:700,letterSpacing:0.5}}>
        STAND BESTE NUMMERS DRIE
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead>
          <tr style={{background:"#f0faf6"}}>
            <th style={{padding:"4px 6px",textAlign:"left",fontWeight:600,color:C.gray,width:20}}>#</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray,width:30}}>Grp</th>
            <th style={{padding:"4px 8px",textAlign:"left",fontWeight:600,color:C.gray}}>Land</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>G</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>GV</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>GT</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>+/-</th>
            <th style={{padding:"4px 6px",textAlign:"center",fontWeight:600,color:C.gray}}>W</th>
            <th style={{padding:"4px 8px",textAlign:"center",fontWeight:700,color:C.dark}}>Pt</th>
            <th style={{padding:"4px 8px",textAlign:"left",fontWeight:600,color:C.gray}}>Status</th>
          </tr>
        </thead>
        <tbody>
          {alle.map((t,i)=>{
            const through = i<8;
            return(
              <tr key={t.name} style={{background:through?"#e8f5ee":"#fff",borderTop:`1px solid ${C.border}`}}>
                <td style={{padding:"4px 6px",textAlign:"center",fontWeight:700,color:through?C.green:C.gray}}>{i+1}</td>
                <td style={{padding:"4px 6px",textAlign:"center",fontSize:11,color:C.gray,fontWeight:600}}>{t.grp}</td>
                <td style={{padding:"4px 8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <FlagImg name={t.name} size={14}/> {t.name}
                  </div>
                </td>
                <td style={{padding:"4px 6px",textAlign:"center",color:C.gray}}>{t.gespeeld}</td>
                <td style={{padding:"4px 6px",textAlign:"center"}}>{t.gv}</td>
                <td style={{padding:"4px 6px",textAlign:"center"}}>{t.gt}</td>
                <td style={{padding:"4px 6px",textAlign:"center",color:t.saldo>0?C.green:t.saldo<0?"#c62828":C.gray}}>{t.saldo>0?"+":""}{t.saldo}</td>
                <td style={{padding:"4px 6px",textAlign:"center"}}>{t.wins}</td>
                <td style={{padding:"4px 8px",textAlign:"center",fontWeight:800,color:C.dark}}>{t.pts}</td>
                <td style={{padding:"4px 8px"}}>
                  {through
                    ? <span style={{...S.tag("green"),fontSize:10}}>✓ Door</span>
                    : <span style={{...S.tag(""),fontSize:10,color:C.gray}}>Uitgeschakeld</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{fontSize:10,color:C.gray,padding:"3px 8px",background:"#f9fffe"}}>
        Rangschikking: punten → doelsaldo → doelpunten voor → overwinningen · 🟢 Gaat door
      </div>
    </div>
  );
}

// ─── DAG PROGRAMMA ───────────────────────────────────────────────────────────
const WK_DATES=(()=>{
  const m={};
  Object.entries(MATCH_SCHEDULE).forEach(([mid,info])=>{
    if(!m[info.date])m[info.date]=[];m[info.date].push({mid,...info});
  });return m;
})();
function parseWKDate(s){const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};const[d,mo]=s.split(" ");return new Date(2026,months[mo],parseInt(d));}
function weekdayNL(d){return["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"][d.getDay()];}


// ─── PREDICTIE UITKLAP (deelnemerslijst + staafdiagram per wedstrijd) ──────────
function PredictieUitklap({predRows,t1,t2,hasResult,mid,isKO=false,KO_EXACT_PTS=10,KO_TOTO_PTS=5,defaultOpen=false,onSelectDeelnemer}){
  const [open,setOpen]=React.useState(defaultOpen);
  const [selectedUitslag,setSelectedUitslag]=React.useState(null); // "home-away" key van aangeklikte balk
  const chartId=`chart_${mid.replace(/[^a-zA-Z0-9]/g,"_")}`;

  // Bouw frequentietabel van uitslag-combinaties + namen per uitslag
  const freqMap={};
  const namenMap={}; // key -> [{deelnemer-object}, ...]
  predRows.forEach(p=>{
    if(!p.hasPred) return;
    const key=`${p.pred.home}-${p.pred.away}`;
    freqMap[key]=(freqMap[key]||0)+1;
    if(!namenMap[key]) namenMap[key]=[];
    namenMap[key].push(p);
  });
  const freqData=Object.entries(freqMap).sort((a,b)=>b[1]-a[1]);
  const chartLabels=freqData.map(([k])=>k);
  const chartValues=freqData.map(([,v])=>v);
  const totalPred=predRows.filter(p=>p.hasPred).length;

  React.useEffect(()=>{
    if(!window.Chart){
      const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      s.onload=()=>setOpen(o=>o); // herrender na laden
      document.head.appendChild(s);
    }
  },[]);

  React.useEffect(()=>{
    if(!open||freqData.length===0) return;
    if(!window.Chart) return;
    const existing=window._wkCharts&&window._wkCharts[chartId];
    if(existing){existing.destroy();}
    const canvas=document.getElementById(chartId);
    if(!canvas) return;
    const isDark=matchMedia("(prefers-color-scheme: dark)").matches;
    const barColor=isDark?"#97C459":"#639922";
    const barFade=isDark?"rgba(150,196,89,0.3)":"rgba(99,153,34,0.25)";
    const gridColor=isDark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.07)";
    const textColor=isDark?"#D3D1C7":"#5F5E5A";
    const chart=new window.Chart(canvas,{
      type:"bar",
      data:{
        labels:chartLabels,
        datasets:[{
          label:"Voorspellingen",
          data:chartValues,
          backgroundColor:chartValues.map((_,i)=>i===0?barColor:barFade),
          borderColor:isDark?"#97C459":"#639922",
          borderWidth:1.5,
          borderRadius:4,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        onClick:(evt,elements)=>{
          if(elements&&elements.length>0){
            const idx=elements[0].index;
            const key=chartLabels[idx];
            setSelectedUitslag(prev=>prev===key?null:key);
          }
        },
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{
            label:ctx=>" "+ctx.raw+"× ("+Math.round(ctx.raw/totalPred*100)+"%)",
            afterLabel:ctx=>{
              const key=chartLabels[ctx.dataIndex];
              const namen=(namenMap[key]||[]).map(p=>`${p.first_name} ${p.last_name}`);
              if(namen.length===0) return "";
              const eerste=namen.slice(0,5);
              const rest=namen.length-eerste.length;
              const lijst=eerste.join("\n");
              return "\n"+lijst+(rest>0?`\n…+${rest} meer (tik balk)`:"");
            }
          }}
        },
        scales:{
          x:{ticks:{color:textColor,font:{size:12},autoSkip:false},grid:{display:false},border:{display:false}},
          y:{beginAtZero:true,ticks:{color:textColor,font:{size:11},stepSize:1,callback:v=>v===0?"":v+"×"},grid:{color:gridColor},border:{display:false}}
        }
      }
    });
    if(!window._wkCharts) window._wkCharts={};
    window._wkCharts[chartId]=chart;
    return()=>{chart.destroy();if(window._wkCharts) delete window._wkCharts[chartId];};
  },[open,chartId]);

  return(
    <div>
      <button
        onClick={()=>setOpen(o=>{if(o)setSelectedUitslag(null);return !o;})}
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:COLORS.light,border:`1px solid ${COLORS.border}`,borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:700,color:COLORS.dark}}
      >
        <span>⚽ Wat voorspelt Leeuwerik? ({totalPred} voorspellingen)</span>
        <span style={{transition:"transform 0.2s",display:"inline-block",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
      </button>
      {open&&(
        <div style={{marginTop:8}}>
          <div style={{overflowX:"auto",marginBottom:16}}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>Deelnemer</th>
                <th style={{...S.th,textAlign:"center"}}><FlagImg name={t1.name} size={14}/> {t1.name}</th>
                <th style={{...S.th,textAlign:"center"}}><FlagImg name={t2.name} size={14}/> {t2.name}</th>
                {!isKO&&<th style={{...S.th,textAlign:"center"}}>Toto</th>}
                {hasResult&&<th style={{...S.th,textAlign:"center",background:COLORS.dark}}>Punten</th>}
              </tr></thead>
              <tbody>
                {predRows.map((p,i)=>{
                  const toto=(!isKO&&p.hasPred)?calcToto(p.pred.home,p.pred.away):null;
                  const totoLabel=toto==="W"?t1.name:toto==="L"?t2.name:toto==="D"?"Gelijk":"—";
                  const ptsBg=isKO?(p.pts===KO_EXACT_PTS?COLORS.green:p.pts===KO_TOTO_PTS?COLORS.yellow:p.pts===0?"#eee":COLORS.gray):(p.pts===5?COLORS.green:p.pts===3?COLORS.yellow:p.pts===0?"#eee":COLORS.gray);
                  const ptsColor=isKO?(p.pts===KO_EXACT_PTS?"#fff":p.pts===KO_TOTO_PTS?COLORS.dark:"#999"):(p.pts===5?"#fff":p.pts===3?COLORS.dark:"#999");
                  return(
                    <tr key={p.id} style={{background:i%2===0?"#f9fffe":"#fff"}}>
                      <td style={{...S.td,fontWeight:600,cursor:"pointer",color:COLORS.green}} onClick={()=>onSelectDeelnemer&&onSelectDeelnemer(p)}>
                    {p.first_name} {p.last_name} <span style={{fontSize:12,opacity:0.6}}>›</span>
                  </td>
                      <td style={S.tdc}>{p.hasPred?p.pred.home:<span style={{color:COLORS.gray}}>—</span>}</td>
                      <td style={S.tdc}>{p.hasPred?p.pred.away:<span style={{color:COLORS.gray}}>—</span>}</td>
                      {!isKO&&<td style={S.tdc}>{p.hasPred?<span style={S.tag("green")}>{totoLabel}</span>:<span style={{color:COLORS.gray}}>—</span>}</td>}
                      {hasResult&&<td style={S.tdc}><span style={{...S.badge,background:ptsBg,color:ptsColor}}>{p.pts!==null?p.pts+"pt":"—"}</span></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {freqData.length>0&&(
            <div style={{marginTop:4}}>
              <div style={{fontSize:11,fontWeight:700,color:COLORS.gray,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Verdeling voorspellingen</div>
              <div style={{position:"relative",width:"100%",height:`${Math.max(180, freqData.length*36+60)}px`}}>
                <canvas id={chartId} role="img" aria-label={`Staafdiagram verdeling voorspellingen ${t1.name} - ${t2.name}`}/>
              </div>
              <div style={{fontSize:11,color:COLORS.gray,textAlign:"center",marginTop:4}}>Tik op een balk om te zien wie die uitslag voorspelde</div>
              {selectedUitslag&&namenMap[selectedUitslag]&&(
                <div style={{marginTop:10,padding:"12px 14px",background:"#f9fffe",border:`1px solid ${COLORS.border}`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:COLORS.dark}}>
                      Uitslag {selectedUitslag.replace("-"," – ")} · {namenMap[selectedUitslag].length}× voorspeld
                    </span>
                    <span onClick={()=>setSelectedUitslag(null)} style={{cursor:"pointer",fontSize:16,color:COLORS.gray,lineHeight:1,padding:"0 4px"}}>✕</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px 12px"}}>
                    {namenMap[selectedUitslag].map((p,i)=>(
                      <span key={p.id||i} onClick={()=>onSelectDeelnemer&&onSelectDeelnemer(p)} style={{fontSize:13,color:COLORS.green,fontWeight:600,cursor:"pointer",textDecoration:"underline",textDecorationStyle:"dotted"}}>
                        {p.first_name} {p.last_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DagProgrammaView({ctx, setView}){
  const dp=deadlinePassed();
  const [selectedP,setSelectedP]=React.useState(null);

  // Build combined date map: group matches + KO matches
  const allDatesMap=useMemo(()=>{
    const m={...WK_DATES};
    // Dedupliceer KO-wedstrijden op id (vangnet: mocht er ooit een duplicaat in
    // de state sluipen, dan toont het programma de wedstrijd toch maar één keer).
    const gezien=new Set();
    ctx.koMatches.forEach(match=>{
      if(!match.kickoff) return;
      if(gezien.has(match.id)) return;
      gezien.add(match.id);
      const dt=new Date(match.kickoff);
      // Format as "28 jun"
      const day=dt.getDate();
      const months=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
      const dateKey=`${day} ${months[dt.getMonth()]}`;
      const time=dt.toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Amsterdam"});
      if(!m[dateKey]) m[dateKey]=[];
      m[dateKey].push({mid:match.id,date:dateKey,time,city:match.city||"",isKO:true,match});
    });
    return m;
  },[ctx.koMatches]);

  const allDates=Object.keys(allDatesMap).sort((a,b)=>parseWKDate(a)-parseWKDate(b));
  const [selectedDate,setSelectedDate]=useState(()=>{
    // Gebruik navTarget datum als die er is
    if(ctx.navTarget?.date) return ctx.navTarget.date;
    const now=new Date();
    now.setHours(0,0,0,0);
    const months=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
    const todayKey=`${now.getDate()} ${months[now.getMonth()]}`;
    if(allDates.includes(todayKey)) return todayKey;
    // BUGFIX (8 juli, gemeld door Wout): geen wedstrijden vandaag betekende
    // voorheen een terugval op allDates[0] — altijd de allereerste toernooidag
    // (11 juni), ongeacht hoe ver het toernooi al gevorderd was. Nu: pak de
    // eerstvolgende datum ná vandaag met wedstrijden. Is het toernooi al
    // helemaal afgelopen (geen enkele datum meer in de toekomst), val dan terug
    // op de LAATSTE speeldag (meest recent), niet de eerste.
    const volgende=allDates.find(d=>parseWKDate(d)>=now);
    return volgende||allDates[allDates.length-1]||"";
  });
  // Auto-open het juiste match uitklap via navTarget
  const [autoOpenMid,setAutoOpenMid]=useState(ctx.navTarget?.matchId||null);
  // Reset navTarget na gebruik
  React.useEffect(()=>{
    if(ctx.navTarget){
      ctx.setNavTarget(null);
    }
  },[]);
  const dayMatches=(allDatesMap[selectedDate]||[]).slice().sort((a,b)=>{
    const[ah,am]=a.time.split(":").map(Number);const[bh,bm]=b.time.split(":").map(Number);return(ah*60+am)-(bh*60+bm);
  });
  function parseMid(mid){
    const parts=mid.split("-");const grp=parts[0];const groupTeams=WK_GROUPS[grp]||[];
    let t1=null,t2=null;
    for(let i=0;i<groupTeams.length;i++)for(let j=i+1;j<groupTeams.length;j++){
      if(`${grp}-${groupTeams[i].name}-${groupTeams[j].name}`===mid){t1=groupTeams[i];t2=groupTeams[j];}
    }
    return{grp,t1,t2};
  }
  const selDate=selectedDate?parseWKDate(selectedDate):null;
  const weekdag=selDate?weekdayNL(selDate):"";
  return(
    <div>
      {selectedP&&<DeelnemerOverlay p={selectedP} ctx={ctx} onClose={()=>setSelectedP(null)}/>}
      <div style={{...S.card,paddingBottom:12}}>
        <h2 style={{...S.h2,marginBottom:6}}>📅 Programma</h2>
        <p style={{fontSize:13,color:COLORS.gray,marginBottom:14}}>Kies een speeldag en zie alle wedstrijden + voorspellingen.</p>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <label style={{...S.label,margin:0}}>Kies datum:</label>
          <select style={{...S.input,width:"auto",minWidth:200}} value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}>
            {allDates.map(d=>{const dt=parseWKDate(d);const wd=weekdayNL(dt);return <option key={d} value={d}>{wd.charAt(0).toUpperCase()+wd.slice(1)} {d}</option>;})}
          </select>
        </div>
      </div>
      {selectedDate&&(
        <div>
          <h3 style={{...S.h3,fontSize:16,color:COLORS.green,marginBottom:14}}>{weekdag.charAt(0).toUpperCase()+weekdag.slice(1)} {selectedDate} — {dayMatches.length} wedstrijd{dayMatches.length!==1?"en":""}</h3>
          {dayMatches.length===0&&(
            <div style={{...S.card,textAlign:"center",color:COLORS.gray,padding:"24px 16px"}}>
              Geen wedstrijden op deze dag. Kies hierboven een andere speeldag.
            </div>
          )}
          {dayMatches.map((matchEntry)=>{
            const {mid,time,city,isKO,match:koMatch}=matchEntry;
            // KO match rendering
            if(isKO){
              const round=KO_ROUNDS.find(r=>r.id===koMatch?.round_id);
              const hasResult=koMatch&&koMatch.home_goals!==null&&koMatch.home_goals!==undefined;
              const koDisp=hasResult?koScoreDisplay(koMatch):null;
              const t1=koMatch?.home_team?{name:koMatch.home_team}:null;
              const t2=koMatch?.away_team?{name:koMatch.away_team}:null;
              const predRows=ctx.participants.map(p=>{
                const pred=ctx.koPredictions[p.id]?.[mid];
                const hasPred=pred&&pred.home!==undefined&&pred.home!==null;
                let pts=null;
                if(hasPred&&hasResult){
                  const exactOk=parseInt(pred.home)===parseInt(koMatch.home_goals)&&parseInt(pred.away)===parseInt(koMatch.away_goals);
                  const totoOk=calcToto(pred.home,pred.away)===calcToto(koMatch.home_goals,koMatch.away_goals);
                  pts=exactOk?KO_EXACT_PTS:totoOk?KO_TOTO_PTS:0;
                }
                return{...p,pred,hasPred,pts};
              }).sort((a,b)=>(`${a.first_name} ${a.last_name}`).localeCompare(`${b.first_name} ${b.last_name}`,"nl"));
              return(
                <div key={mid} style={{...S.card,marginBottom:16}}>
                  <div style={{borderBottom:`1px solid ${COLORS.border}`,paddingBottom:12,marginBottom:12}}>
                    <div style={{fontSize:11,color:COLORS.gray,marginBottom:8,display:"flex",gap:12}}>
                      <span>🕐 {time} CET</span><span>📍 {city}</span>
                      {round&&<span style={S.tag("yellow")}>{round.label}</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
                      <div style={{flex:1,minHeight:32,display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
                        {t1?<><span style={{fontWeight:700,fontSize:15}}>{t1.name}</span><FlagImg name={t1.name} size={22}/></>:<span style={{color:COLORS.gray,fontSize:13,fontStyle:"italic"}}>PM</span>}
                      </div>
                      {hasResult?(
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{minHeight:32,display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:22,fontWeight:900,color:COLORS.green}}>{koDisp.main.split("–")[0]}</span>
                            <span style={{fontWeight:700,color:COLORS.gray}}>–</span>
                            <span style={{fontSize:22,fontWeight:900,color:COLORS.green}}>{koDisp.main.split("–")[1]}</span>
                          </div>
                          {koDisp.mainSuffix&&<span style={{fontSize:10,color:COLORS.gray,fontWeight:600}}>{koDisp.mainSuffix}</span>}
                        </div>
                      ):(
                        <div style={{minHeight:32,padding:"6px 14px",background:COLORS.light,borderRadius:8,fontWeight:700,fontSize:14,color:COLORS.gray,display:"flex",alignItems:"center"}}>vs</div>
                      )}
                      <div style={{flex:1,minHeight:32,display:"flex",alignItems:"center",gap:6}}>
                        {t2?<><FlagImg name={t2.name} size={22}/><span style={{fontWeight:700,fontSize:15}}>{t2.name}</span></>:<span style={{color:COLORS.gray,fontSize:13,fontStyle:"italic"}}>PM</span>}
                      </div>
                    </div>
                    {koDisp?.caption&&(
                      <div style={{textAlign:"center",fontSize:11,color:COLORS.gray,marginTop:6}}>{koDisp.caption}</div>
                    )}
                  </div>
                  {(()=>{
                    const kickoff=koMatch?.kickoff?new Date(koMatch.kickoff):null;
                    const closed=kickoff?new Date()>=new Date(kickoff.getTime()-60000):false;
                    if(!closed) return(
                      <div style={{...S.alert("warn"),fontSize:12}}>🔒 Voorspellingen zichtbaar na aanvang van de wedstrijd.</div>
                    );
                    return <PredictieUitklap predRows={predRows} t1={t1||{name:"Thuis"}} t2={t2||{name:"Uit"}} hasResult={hasResult} mid={mid} isKO={true} KO_EXACT_PTS={KO_EXACT_PTS} KO_TOTO_PTS={KO_TOTO_PTS} onSelectDeelnemer={setSelectedP}/>;
                  })()}
                </div>
              );
            }
            // Group match rendering
            const{grp,t1,t2}=parseMid(mid);if(!t1||!t2)return null;
            const result=ctx.matchResults[mid];
            const hasResult=result&&result.home!==undefined&&result.home!==null&&result.away!==undefined&&result.away!==null;
            const predRows=ctx.participants.map(p=>{
              const pred=ctx.predictions[p.id]?.[mid];
              const hasPred=pred&&pred.home!==undefined&&pred.home!==null&&pred.away!==undefined&&pred.away!==null;
              let pts=null;
              if(hasPred&&hasResult){
                const exactOk=parseInt(pred.home)===parseInt(result.home)&&parseInt(pred.away)===parseInt(result.away);
                const totoOk=calcToto(pred.home,pred.away)===calcToto(result.home,result.away);
                pts=exactOk?5:totoOk?3:0;
              }
              return{...p,pred,hasPred,pts};
            }).sort((a,b)=>(`${a.first_name} ${a.last_name}`).localeCompare(`${b.first_name} ${b.last_name}`,"nl"));
            return(
              <div key={mid} style={{...S.card,marginBottom:16}}>
                <div style={{borderBottom:`1px solid ${COLORS.border}`,paddingBottom:12,marginBottom:12}}>
                  <div style={{fontSize:11,color:COLORS.gray,marginBottom:8,display:"flex",gap:12}}>
                    <span>🕐 {time} CET</span><span>📍 {city}</span><span style={S.tag("")}>Groep {grp}</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flex:1,justifyContent:"flex-end"}}>
                      <span style={{fontWeight:700,fontSize:15}}>{t1.name}</span><FlagImg name={t1.name} size={22}/>
                    </div>
                    {hasResult?(
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:22,fontWeight:900,color:COLORS.green}}>{result.home}</span>
                        <span style={{fontWeight:700,color:COLORS.gray}}>–</span>
                        <span style={{fontSize:22,fontWeight:900,color:COLORS.green}}>{result.away}</span>
                      </div>
                    ):(
                      <div style={{padding:"6px 14px",background:COLORS.light,borderRadius:8,fontWeight:700,fontSize:14,color:COLORS.gray}}>vs</div>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
                      <FlagImg name={t2.name} size={22}/><span style={{fontWeight:700,fontSize:15}}>{t2.name}</span>
                    </div>
                  </div>
                  {!hasResult&&<div style={{textAlign:"center",marginTop:8,fontSize:12,color:COLORS.gray}}>Uitslag nog niet ingevoerd</div>}
                </div>
                {!dp?(
                  <div style={{...S.alert("warn"),fontSize:12}}>🔒 Voorspellingen zichtbaar na de deadline ({fmtDeadline()}).</div>
                ):(
                  <PredictieUitklap predRows={predRows} t1={t1} t2={t2} hasResult={hasResult} mid={mid} defaultOpen={autoOpenMid===mid} onSelectDeelnemer={setSelectedP}/>
                )}
              </div>
            );
          })}

          {/* Groepsstanden voor gespeelde groepen op deze dag */}
          {(()=>{
            const grpsThisDay=[...new Set(dayMatches.map(m=>parseMid(m.mid).grp).filter(Boolean))];
            const nr3Quals=calcBesteDerdes(ctx.matchResults).slice(0,8).map(t=>t.name);
            return grpsThisDay.map(grp=>(
              <OfficieleGroepsstandMini key={grp} grp={grp} teams={WK_GROUPS[grp]||[]} matchResults={ctx.matchResults} nr3Qualifiers={nr3Quals}/>
            ));
          })()}
        </div>
      )}

      {/* Beste nummers 3-tabel en de link naar "Alle standen" zijn hier weggehaald
          (7-8 juli, op verzoek van Wout) — tijdens de KO-fase is dit niet meer de
          relevante plek om terug te kijken op de groepsfase. Die link staat nu op
          de homepage, direct onder "Top 5 klassement". */}
    </div>
  );
}



// ─── ALLE STANDEN PAGINA ──────────────────────────────────────────────────────
function AlleStandenView({ctx, setView}){
  const C = COLORS;
  const nr3Quals = calcBesteDerdes(ctx.matchResults).slice(0,8).map(t=>t.name);

  return(
    <div>
      <div style={{...S.card,paddingBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div>
            <h2 style={{...S.h2,marginBottom:4}}>📊 Alle standen</h2>
            <p style={{fontSize:13,color:C.gray,margin:0}}>Volledig overzicht van alle 12 groepen + de stand van de beste nummers 3.</p>
          </div>
          <button onClick={()=>setView("home")} style={{...S.btn(),fontSize:13}}>
            ← Terug naar Home
          </button>
        </div>
      </div>

      {/* Alle 12 groepen in een grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:14}}>
        {Object.entries(WK_GROUPS).map(([grp,teams])=>(
          <div key={grp}>
            <OfficieleGroepsstandMini grp={grp} teams={teams} matchResults={ctx.matchResults} nr3Qualifiers={nr3Quals}/>
          </div>
        ))}
      </div>

      {/* Beste nummers 3 — onderaan, na alle groepsstanden (op verzoek van Wout, 8 juli) */}
      {calcBesteDerdes(ctx.matchResults).length>=1&&(
        <div style={{marginTop:16}}>
          <BesteDerdesStand matchResults={ctx.matchResults}/>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN INSTELLINGEN ───────────────────────────────────────────────────────
function AdminInstellingen({ctx}){
  const C = COLORS;
  const [override,setOverride]=React.useState(()=>localStorage.getItem("deadlineOverride")==="true");
  const [liveForm,setLiveForm]=React.useState({home_team:"Nederland",away_team:"Duitsland",home_goals:1,away_goals:0,minute:67,status:"IN_PLAY"});
  const [liveSaving,setLiveSaving]=React.useState(false);
  const [liveMsg,setLiveMsg]=React.useState("");
  const [chatAan,setChatAan]=React.useState(true);
  const [chatBezig,setChatBezig]=React.useState(false);
  const [chatMsg,setChatMsg]=React.useState("");

  // Huidige chat-status ophalen
  React.useEffect(()=>{
    (async()=>{
      const rows=await db.get("app_settings","key=eq.chat_enabled&select=value");
      if(rows&&rows.length>0) setChatAan(rows[0].value==="true");
    })();
  },[]);

  async function toggleChat(){
    setChatBezig(true);
    const nieuw=!chatAan;
    // Upsert de instelling (update bestaande rij, of insert als 'ie er nog niet is)
    const bestaand=await db.get("app_settings","key=eq.chat_enabled&select=key");
    if(bestaand&&bestaand.length>0){
      await db.update("app_settings","key=eq.chat_enabled",{value:nieuw?"true":"false",updated_at:new Date().toISOString()});
    }else{
      await db.insert("app_settings",[{key:"chat_enabled",value:nieuw?"true":"false"}]);
    }
    setChatAan(nieuw);
    setChatBezig(false);
    setChatMsg(nieuw?"✅ Kletshoekje staat AAN voor alle deelnemers":"🔕 Kletshoekje staat UIT");
    setTimeout(()=>setChatMsg(""),4000);
  }

  function toggle(){
    const next=!override;
    if(next) localStorage.setItem("deadlineOverride","true");
    else localStorage.removeItem("deadlineOverride");
    setOverride(next);
  }

  async function setLiveOverride(){
    setLiveSaving(true);
    // Verwijder bestaande rij
    await fetch(`${SUPABASE_URL}/rest/v1/live_score?id=neq.00000000-0000-0000-0000-000000000000`,{
      method:"DELETE",
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"},
    });
    // Schrijf nep live score
    const row={
      match_id:null,
      home_team:liveForm.home_team,
      away_team:liveForm.away_team,
      home_goals:parseInt(liveForm.home_goals),
      away_goals:parseInt(liveForm.away_goals),
      minute:parseInt(liveForm.minute)||null,
      status:liveForm.status,
      updated_at:new Date().toISOString(),
    };
    await fetch(`${SUPABASE_URL}/rest/v1/live_score`,{
      method:"POST",
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"return=minimal"},
      body:JSON.stringify([row]),
    });
    ctx.setLiveScore(row);
    setLiveSaving(false);
    setLiveMsg("✅ Live score actief — check de homepage!");
    setTimeout(()=>setLiveMsg(""),4000);
  }

  async function clearLiveOverride(){
    setLiveSaving(true);
    await fetch(`${SUPABASE_URL}/rest/v1/live_score?id=neq.00000000-0000-0000-0000-000000000000`,{
      method:"DELETE",
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"},
    });
    ctx.setLiveScore(null);
    setLiveSaving(false);
    setLiveMsg("🗑 Live score gewist");
    setTimeout(()=>setLiveMsg(""),3000);
  }

  return(
    <div style={{maxWidth:520}}>
      {/* Kletshoekje aan/uit (geldt voor alle deelnemers) */}
      <div style={S.card}>
        <h3 style={{...S.h3,marginBottom:4}}>💬 Kletshoekje</h3>
        <p style={{fontSize:13,color:C.gray,marginBottom:16}}>Zet de chat aan of uit voor álle deelnemers. Bij uit blijft de chatknop zichtbaar, maar verschijnt de melding dat de chat niet beschikbaar is.</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:chatAan?"#e8f5ee":"#f9f9f9",border:`1px solid ${chatAan?C.green:C.border}`,borderRadius:8}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:C.dark}}>Kletshoekje {chatAan?"staat AAN":"staat UIT"}</div>
            <div style={{fontSize:12,color:C.gray,marginTop:2}}>{chatAan?"Deelnemers kunnen berichten plaatsen en lezen":"Berichten plaatsen is uitgeschakeld"}</div>
          </div>
          <button onClick={toggleChat} disabled={chatBezig} style={{...S.btn(chatAan?"yellow":"green"),minWidth:90}}>
            {chatBezig?"…":chatAan?"Uitzetten":"Aanzetten"}
          </button>
        </div>
        {chatMsg&&<div style={{fontSize:13,fontWeight:600,color:C.green,marginTop:10}}>{chatMsg}</div>}
      </div>

      {/* Deadline override */}
      <div style={S.card}>
        <h3 style={{...S.h3,marginBottom:4}}>🛠️ Testinstellingen</h3>
        <p style={{fontSize:13,color:C.gray,marginBottom:16}}>Alleen zichtbaar voor jou (opgeslagen in browser). Andere deelnemers worden niet beïnvloed.</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",background:override?"#fff8e1":"#f9f9f9",border:`1px solid ${override?C.yellow:C.border}`,borderRadius:8}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:C.dark}}>Deadline gesimuleerd als verstreken</div>
            <div style={{fontSize:12,color:C.gray,marginTop:2}}>Voorspellingen worden zichtbaar in Programma</div>
          </div>
          <button onClick={toggle} style={{...S.btn(override?"yellow":"green"),minWidth:80}}>
            {override?"Uitzetten":"Aanzetten"}
          </button>
        </div>
        {override&&(
          <div style={{...S.alert("warn"),marginTop:12,fontSize:12}}>
            ⚠️ Override actief — zet uit na het testen!
          </div>
        )}
      </div>

      {/* Live score override */}
      <div style={S.card}>
        <h3 style={{...S.h3,marginBottom:4}}>⚽ Live score testen</h3>
        <p style={{fontSize:13,color:C.gray,marginBottom:16}}>Simuleer een live wedstrijd om het Nu Live blok op de homepage te testen. Schrijft direct naar Supabase — zichtbaar voor alle gebruikers!</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center",marginBottom:10}}>
          <div>
            <label style={S.label}>Thuisteam</label>
            <input style={S.input} value={liveForm.home_team} onChange={e=>setLiveForm(f=>({...f,home_team:e.target.value}))} placeholder="Nederland"/>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,paddingTop:18}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input type="number" min="0" max="20" style={{...S.input,width:48,textAlign:"center",padding:"7px 4px"}}
                value={liveForm.home_goals} onChange={e=>setLiveForm(f=>({...f,home_goals:e.target.value}))}/>
              <span style={{fontWeight:800,color:C.gray}}>–</span>
              <input type="number" min="0" max="20" style={{...S.input,width:48,textAlign:"center",padding:"7px 4px"}}
                value={liveForm.away_goals} onChange={e=>setLiveForm(f=>({...f,away_goals:e.target.value}))}/>
            </div>
          </div>
          <div>
            <label style={S.label}>Uitteam</label>
            <input style={S.input} value={liveForm.away_team} onChange={e=>setLiveForm(f=>({...f,away_team:e.target.value}))} placeholder="Duitsland"/>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <div>
            <label style={S.label}>Minuut</label>
            <input type="number" min="1" max="120" style={S.input} value={liveForm.minute}
              onChange={e=>setLiveForm(f=>({...f,minute:e.target.value}))} placeholder="67"/>
          </div>
          <div>
            <label style={S.label}>Status</label>
            <select style={S.input} value={liveForm.status} onChange={e=>setLiveForm(f=>({...f,status:e.target.value}))}>
              <option value="IN_PLAY">IN_PLAY (bezig)</option>
              <option value="PAUSED">PAUSED (rust)</option>
            </select>
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button style={S.btn("green")} onClick={setLiveOverride} disabled={liveSaving}>
            {liveSaving?"Bezig…":"⚽ Live score activeren"}
          </button>
          <button style={{...S.btn(),background:"#fdecea",color:"#c62828"}} onClick={clearLiveOverride} disabled={liveSaving}>
            🗑 Live score wissen
          </button>
          {liveMsg&&<span style={{fontSize:13,fontWeight:600,color:C.green}}>{liveMsg}</span>}
        </div>
        <div style={{...S.alert("warn"),marginTop:12,fontSize:12}}>
          ⚠️ Dit schrijft naar de live database — zichtbaar voor alle deelnemers. Vergeet niet te wissen na het testen!
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────
function AdminView({ctx}){
  const [pw,setPw]=useState("");const [pwErr,setPwErr]=useState("");const [pwChecking,setPwChecking]=useState(false);
  const [tab,setTab]=useState(()=>localStorage.getItem("adminTab")||"results");
  const setAdminTab=(t)=>{localStorage.setItem("adminTab",t);setTab(t);};
  // Wachtwoord-check gebeurt nu server-side (app/api/admin-login/route.ts), tegen
  // een Vercel-omgevingsvariabele — niet meer tegen een string die in de client-
  // bundle stond. Wijzigen van het wachtwoord = alleen de env var aanpassen in
  // Vercel, geen code-wijziging of nieuwe deploy van dit bestand nodig.
  async function probeerInloggen(){
    if(!pw||pwChecking) return;
    setPwChecking(true);setPwErr("");
    try{
      const res=await fetch("/api/admin-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pw})});
      const data=await res.json();
      if(data.ok) ctx.setIsAdmin(true);
      else setPwErr(data.error||"Onjuist wachtwoord");
    }catch{
      setPwErr("Kon niet inloggen — probeer het opnieuw.");
    }
    setPwChecking(false);
  }
  if(!ctx.isAdmin) return(
    <div style={{...S.card,maxWidth:360,margin:"0 auto"}}>
      <h2 style={S.h2}>🔒 Beheerderspaneel</h2>
      <label style={S.label}>Wachtwoord</label>
      <input type="password" style={{...S.input,marginBottom:10}} value={pw} onChange={e=>setPw(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&probeerInloggen()} placeholder="••••••••" disabled={pwChecking}/>
      {pwErr&&<div style={S.alert("err")}>{pwErr}</div>}
      <button style={S.btn("green")} onClick={probeerInloggen} disabled={pwChecking}>{pwChecking?"Bezig...":"Inloggen"}</button>
    </div>
  );
  const tabs=[{id:"results",label:"📊 Uitslagen"},{id:"ko",label:"⚡ Knock-out"},{id:"doorstoot",label:"🏆 Doorstoot"},{id:"bonus",label:"🎁 Bonusvragen"},{id:"beoordeel",label:"✅ Beoordelen"},{id:"users",label:"Deelnemers"},{id:"news",label:"📢 Nieuws"},{id:"analyses",label:"🎙 Analyses"},{id:"scenarios",label:"🔮 Scenario's"},{id:"instellingen",label:"🛠️ Instellingen"}];
  return(
    <div>
      <div style={{...S.row,marginBottom:14}}><h2 style={{...S.h2,margin:0}}>⚙️ Beheerderspaneel</h2><span style={S.tag("green")}>Admin ingelogd</span></div>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>{tabs.map(t=><button key={t.id} style={S.navBtn(tab===t.id)} onClick={()=>setAdminTab(t.id)}>{t.label}</button>)}</div>
      {tab==="results"&&<AdminResults ctx={ctx}/>}
      {tab==="ko"&&<AdminKO ctx={ctx}/>}
      {tab==="doorstoot"&&<AdminDoorstoot ctx={ctx}/>}
      {tab==="bonus"&&<AdminBonus ctx={ctx}/>}
      {tab==="beoordeel"&&<AdminBeoordeel ctx={ctx}/>}
      {tab==="users"&&<AdminUsers ctx={ctx}/>}
      {tab==="news"&&<AdminNews ctx={ctx}/>}
      {tab==="analyses"&&<AdminAnalyses ctx={ctx}/>}
      {tab==="scenarios"&&<AdminScenarios ctx={ctx}/>}
      {tab==="instellingen"&&<AdminInstellingen ctx={ctx}/>}
    </div>
  );
}

// ─── ADMIN: SCENARIO-SIMULATOR ────────────────────────────────────────────────
// "Wie kan de poule nog winnen?" — simuleert de virtuele eindstand op basis van
// hypothetische uitkomsten voor de 2 resterende KO-wedstrijden (alleen toto,
// GEEN exacte score — die marge is bewust buiten beschouwing gelaten, op
// verzoek van Wout) en de 2 nog niet beoordeelde bonusvragen (rode kaarten,
// wereldkampioen). Bonusvragen tellen alleen mee voor deelnemers wiens
// antwoord nog NIET is beoordeeld — al beoordeelde antwoorden (de "zekere fout"
// die je al hebt ingevuld) zitten al correct verwerkt in de basis-punten.
//
// BUGFIX (9 juli, gemeld door Wout): toto-punten voor KO-wedstrijden zijn in
// deze poule gebaseerd op de UITSLAG NA 90 MINUTEN (zie berekenAllePuntenTotalen
// hierboven, regel met `calcToto(pp.home,pp.away)===calcToto(m.home_goals,
// m.away_goals)` — gebruikt uitsluitend home_goals/away_goals, nooit
// home_goals_et of strafschoppen). Wie er UITEINDELIJK doorgaat (na verlenging/
// strafschoppen) is voor de toto-punten irrelevant. De eerste versie van deze
// tool vroeg per ongeluk naar "wie wint de wedstrijd" (met verlenging/
// strafschoppen inbegrepen) i.p.v. naar de 90-minuten-uitslag, en had ook geen
// gelijkspel-optie — een gelijkspel na 90 minuten is echter een net zo geldige,
// apart te voorspellen uitkomst als een overwinning. Nu vraagt de tool
// rechtstreeks naar de 90-minuten-uitslag (thuis wint / gelijk / uit wint),
// met dezelfde W/D/L-codering als calcToto() zelf gebruikt — geen vertaalslag
// naar teamnamen meer nodig, dus ook geen ruimte meer voor deze fout.
function berekenScenarioStand(ctx, {troostUitslag, finaleUitslag, rodeKaarten, kampioen}){
  const alleTotalen=berekenAllePuntenTotalen(ctx); // alles wat al vaststaat
  const troostMatch=(ctx.koMatches||[]).find(m=>m.round_id==="r3");
  const finaleMatch=(ctx.koMatches||[]).find(m=>m.round_id==="r1");
  const rodeKaartenVraag=(ctx.bonusQuestions||[]).find(q=>/rode kaart/i.test(q.question||""));
  const kampioenVraag=(ctx.bonusQuestions||[]).find(q=>String(q.idx)==="4");

  return alleTotalen.map(t=>{
    const pid=t.participant.id;
    let extra=0;

    if(troostMatch&&troostUitslag){
      const pp=(ctx.koPredictions[pid]||{})[troostMatch.id];
      if(pp&&pp.home!==undefined&&pp.home!==null&&calcToto(pp.home,pp.away)===troostUitslag) extra+=KO_TOTO_PTS;
    }
    if(finaleMatch&&finaleUitslag){
      const pp=(ctx.koPredictions[pid]||{})[finaleMatch.id];
      if(pp&&pp.home!==undefined&&pp.home!==null&&calcToto(pp.home,pp.away)===finaleUitslag) extra+=KO_TOTO_PTS;
    }
    if(rodeKaartenVraag&&rodeKaarten!==""&&rodeKaarten!==null&&rodeKaarten!==undefined){
      const alBeoordeeld=(ctx.bonusScores[pid]||{})[rodeKaartenVraag.idx]!==undefined;
      if(!alBeoordeeld){
        const ans=(ctx.bonusAnswers[pid]||{})[rodeKaartenVraag.idx];
        if(ans!==undefined&&ans!==null&&ans!==""&&parseInt(ans,10)===parseInt(rodeKaarten,10)) extra+=(rodeKaartenVraag.points??20);
      }
    }
    if(kampioenVraag&&kampioen){
      const alBeoordeeld=(ctx.bonusScores[pid]||{})[kampioenVraag.idx]!==undefined;
      if(!alBeoordeeld){
        const ans=(ctx.bonusAnswers[pid]||{})[kampioenVraag.idx];
        const genNaam=ans?Object.keys(NL_TO_EN_ALIAS).find(nl=>
          ans.toLowerCase().trim().includes(nl.toLowerCase())||nl.toLowerCase().includes(ans.toLowerCase().trim())
        ):null;
        if(genNaam===kampioen) extra+=(kampioenVraag.points??20);
      }
    }

    return {participant:t.participant, basis:t.qTotaal, scenario:t.qTotaal+extra};
  }).sort((a,b)=>b.scenario-a.scenario);
}

function AdminScenarios({ctx}){
  const troostMatch=(ctx.koMatches||[]).find(m=>m.round_id==="r3");
  const finaleMatch=(ctx.koMatches||[]).find(m=>m.round_id==="r1");
  const rodeKaartenVraag=(ctx.bonusQuestions||[]).find(q=>/rode kaart/i.test(q.question||""));

  const [troostUitslag,setTroostUitslag]=useState(""); // "W"=thuis wint, "D"=gelijk, "L"=uit wint (90 min)
  const [finaleUitslag,setFinaleUitslag]=useState("");
  const [rodeKaarten,setRodeKaarten]=useState("");
  const [kampioen,setKampioen]=useState(""); // wereldkampioen-bonusvraag kijkt naar de UITEINDELIJKE winnaar, dus hier wél teamnamen (zie select hieronder) — dat is een andere vraag dan de toto-uitslag hierboven.

  if(!troostMatch||!troostMatch.home_team||!troostMatch.away_team||!finaleMatch||!finaleMatch.home_team||!finaleMatch.away_team){
    return(
      <div>
        <h3 style={S.h3}>🔮 Scenario-simulator</h3>
        <div style={S.alert("warn")}>Troostfinale en/of finale-teams zijn nog niet allebei bekend — deze tool werkt pas zodra beide bekend zijn.</div>
      </div>
    );
  }

  const stand=berekenScenarioStand(ctx,{troostUitslag,finaleUitslag,rodeKaarten,kampioen});
  const heeftScenario=troostUitslag||finaleUitslag||rodeKaarten!==""||kampioen;

  return(
    <div>
      <h3 style={S.h3}>🔮 Scenario-simulator: wie kan de poule nog winnen?</h3>
      <p style={{fontSize:13,color:"#666",marginBottom:14,lineHeight:1.5}}>
        Simuleert de virtuele eindstand op basis van hypothetische uitkomsten. Voor de troostfinale en finale telt de toto mee op basis van de <strong>uitslag na 90 minuten</strong> — verlenging en strafschoppen spelen voor de toto-punten geen rol (zo rekent de poule het ook echt uit), dus een gelijkspel na 90 minuten is hier een eigen, geldige optie. Exacte score telt sowieso niet mee, die marge is bewust buiten beschouwing gelaten. Bonusvragen tellen alleen mee voor deelnemers wiens antwoord <strong>nog niet is beoordeeld</strong>; al beoordeelde antwoorden staan al correct in de "Huidig"-kolom.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:20}}>
        <div>
          <label style={S.label}>Troostfinale — uitslag na 90 min</label>
          <select style={S.input} value={troostUitslag} onChange={e=>setTroostUitslag(e.target.value)}>
            <option value="">— kies —</option>
            <option value="W">{troostMatch.home_team} wint</option>
            <option value="D">Gelijkspel</option>
            <option value="L">{troostMatch.away_team} wint</option>
          </select>
        </div>
        <div>
          <label style={S.label}>Finale — uitslag na 90 min</label>
          <select style={S.input} value={finaleUitslag} onChange={e=>setFinaleUitslag(e.target.value)}>
            <option value="">— kies —</option>
            <option value="W">{finaleMatch.home_team} wint</option>
            <option value="D">Gelijkspel</option>
            <option value="L">{finaleMatch.away_team} wint</option>
          </select>
        </div>
        <div>
          <label style={S.label}>Aantal rode kaarten{rodeKaartenVraag?"":" (vraag niet gevonden — check de tekst van de bonusvraag)"}</label>
          <input type="number" style={S.input} value={rodeKaarten} onChange={e=>setRodeKaarten(e.target.value)} placeholder="bijv. 13"/>
        </div>
        <div>
          <label style={S.label}>Wereldkampioen</label>
          <select style={S.input} value={kampioen} onChange={e=>setKampioen(e.target.value)}>
            <option value="">— kies —</option>
            <option value={finaleMatch.home_team}>{finaleMatch.home_team}</option>
            <option value={finaleMatch.away_team}>{finaleMatch.away_team}</option>
          </select>
        </div>
      </div>

      {!heeftScenario?(
        <div style={S.alert("")}>Kies minstens één scenario-onderdeel hierboven om de virtuele eindstand te zien.</div>
      ):(
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:"#f0faf6"}}>
              <th style={{textAlign:"left",padding:8,fontSize:12}}>#</th>
              <th style={{textAlign:"left",padding:8,fontSize:12}}>Naam</th>
              <th style={{textAlign:"right",padding:8,fontSize:12}}>Huidig</th>
              <th style={{textAlign:"right",padding:8,fontSize:12}}>Scenario</th>
            </tr>
          </thead>
          <tbody>
            {stand.slice(0,10).map((r,i)=>(
              <tr key={r.participant.id} style={{borderTop:`1px solid ${COLORS.border}`,background:i<5?"#f9fffe":"transparent"}}>
                <td style={{padding:8,fontWeight:800,color:i<5?COLORS.green:"#999"}}>{i+1}</td>
                <td style={{padding:8}}>{r.participant.first_name} {r.participant.last_name}</td>
                <td style={{padding:8,textAlign:"right",color:"#999"}}>{r.basis}</td>
                <td style={{padding:8,textAlign:"right",fontWeight:800}}>{r.scenario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── ADMIN: DE ANALYSE VAN LOUIS ──────────────────────────────────────────────
// Genereert per deelnemer een eindverslag: feiten worden hard berekend in de app
// (berekenAnalyseFeiten), de tekst wordt geschreven via /api/analyse (Anthropic),
// en het resultaat wordt opgeslagen in de tabel `eindverslagen`. De button op de
// deelnemer-detailpagina verschijnt pas als er een verslag bestaat — dus vóór het
// genereren ziet niemand iets. Sequentieel (1 tegelijk) om rate limits te ontzien.
function AdminAnalyses({ctx}){
  const [bezig,setBezig]=useState(false);
  const [voortgang,setVoortgang]=useState(null); // {done,total,fouten:[]}
  const [bestaand,setBestaand]=useState(null);   // aantal bestaande verslagen

  // Test op 1 deelnemer: zelfde route, zelfde opslag — maar voor 1 persoon, zodat
  // je de toon kunt proeven vóórdat je alle 63 laat genereren (en betalen).
  const gesorteerd=[...ctx.participants].sort((a,b)=>`${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  const [testId,setTestId]=useState(gesorteerd[0]?.id||"");
  const [testBezig,setTestBezig]=useState(false);
  const [testResultaat,setTestResultaat]=useState(null); // {naam,verslag} of null
  const [testFout,setTestFout]=useState(null);

  async function testEenDeelnemer(){
    const p=ctx.participants.find(x=>x.id===testId);
    if(!p) return;
    setTestBezig(true);setTestFout(null);setTestResultaat(null);
    try{
      const feiten=berekenAnalyseFeiten(p,ctx);
      const resp=await fetch("/api/analyse",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({feiten}),
      });
      const data=await resp.json();
      if(!resp.ok||!data.verslag) throw new Error(data.error||"leeg antwoord");
      await db.delete("eindverslagen",`participant_id=eq.${p.id}`);
      await db.insert("eindverslagen",{participant_id:p.id,verslag:data.verslag});
      setTestResultaat({naam:`${p.first_name} ${p.last_name}`,verslag:data.verslag});
      telBestaand();
    }catch(e){
      setTestFout(e.message||String(e));
    }
    setTestBezig(false);
  }

  async function telBestaand(){
    const rows=await db.get("eindverslagen","select=participant_id");
    setBestaand(rows?rows.length:0);
  }
  useEffect(()=>{telBestaand();},[]);

  async function genereerAlles(){
    if(!window.confirm(`Analyses genereren voor alle ${ctx.participants.length} deelnemers?\n\nDit kost API-tegoed en duurt enkele minuten. Bestaande verslagen worden overschreven.`)) return;
    setBezig(true);
    const fouten=[];
    let done=0;
    for(const p of ctx.participants){
      try{
        const feiten=berekenAnalyseFeiten(p,ctx);
        const resp=await fetch("/api/analyse",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({feiten}),
        });
        const data=await resp.json();
        if(!resp.ok||!data.verslag) throw new Error(data.error||"leeg antwoord");
        // Upsert: verwijder eventueel bestaand verslag en schrijf het nieuwe
        await db.delete("eindverslagen",`participant_id=eq.${p.id}`);
        await db.insert("eindverslagen",{participant_id:p.id,verslag:data.verslag});
      }catch(e){
        fouten.push(`${p.first_name} ${p.last_name}: ${e.message||e}`);
      }
      done++;
      setVoortgang({done,total:ctx.participants.length,fouten:[...fouten]});
    }
    setBezig(false);
    telBestaand();
  }

  return(
    <div style={S.card}>
      <h3 style={{...S.h2,fontSize:17}}>🎙 De analyse van Louis</h3>
      <p style={{fontSize:13,color:COLORS.gray,lineHeight:1.5}}>
        Genereert per deelnemer een persoonlijk eindverslag (feiten uit de app, tekst via Louis).
        De knop "De analyse van Louis" verschijnt op ieders detailpagina zodra het verslag bestaat.
        Bedoeld om <strong>na de finale</strong> één keer te draaien.
      </p>
      <div style={{fontSize:13,marginBottom:10}}>
        Bestaande verslagen: <strong>{bestaand===null?"…":bestaand}</strong> van {ctx.participants.length}
      </div>

      {/* Test op 1 deelnemer */}
      <div style={{border:`1px solid ${COLORS.border}`,borderRadius:8,padding:"12px 14px",marginBottom:16,background:"#fafafa"}}>
        <div style={{fontSize:12,fontWeight:800,color:COLORS.gray,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Eerst proeven? Test op 1 deelnemer</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <select style={{...S.input,width:"auto",flex:"1 1 220px"}} value={testId} onChange={e=>setTestId(e.target.value)} disabled={testBezig}>
            {gesorteerd.map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}
          </select>
          <button style={S.btn("grey")} disabled={testBezig||!testId} onClick={testEenDeelnemer}>
            {testBezig?"Bezig…":"Test genereren"}
          </button>
        </div>
        {testFout&&<div style={{marginTop:8,color:"#c62828",fontSize:13}}>Mislukt: {testFout}</div>}
        {testResultaat&&(
          <div style={{marginTop:10,padding:"12px 14px",background:"#fff",border:`1px solid ${COLORS.border}`,borderRadius:8}}>
            <div style={{fontSize:12,fontWeight:700,color:COLORS.green,marginBottom:6}}>🎙 {testResultaat.naam}</div>
            <div style={{fontSize:13,lineHeight:1.6,whiteSpace:"pre-line"}}>{testResultaat.verslag}</div>
          </div>
        )}
      </div>

      <button style={S.btn("green")} disabled={bezig} onClick={genereerAlles}>
        {bezig?"Bezig met genereren…":"🎙 Genereer alle analyses"}
      </button>
      {voortgang&&(
        <div style={{marginTop:12,fontSize:13}}>
          <div>Voortgang: {voortgang.done}/{voortgang.total}</div>
          {voortgang.fouten.length>0&&(
            <div style={{marginTop:6,color:"#c62828"}}>
              Mislukt ({voortgang.fouten.length}):
              {voortgang.fouten.map((f,i)=><div key={i} style={{fontSize:12}}>• {f}</div>)}
            </div>
          )}
          {!bezig&&voortgang.fouten.length===0&&<div style={{color:COLORS.green,fontWeight:700,marginTop:6}}>✓ Alle verslagen gegenereerd</div>}
        </div>
      )}
    </div>
  );
}

function AdminResults({ctx}){
  const [local,setLocal]=useState({});

  // Sync local with ctx.matchResults ONLY on initial load
  const localInitialized = useRef(false);
  useEffect(()=>{
    if(localInitialized.current) return;
    if(Object.keys(ctx.matchResults).length===0) return;
    const init={};
    Object.entries(ctx.matchResults).forEach(([mid,r])=>{
      if(r.home!==null&&r.home!==undefined&&r.away!==null&&r.away!==undefined){
        init[mid]={home:r.home,away:r.away};
      }
    });
    setLocal(init);
    localInitialized.current=true;
  },[ctx.matchResults]);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [savedMid,setSavedMid]=useState(null);

  function setScore(mid,field,val){
    setLocal(p=>{
      const cur=p[mid]||{};
      const other=field==="home"?"away":"home";
      return {...p,[mid]:{
        [other]: cur[other]!==undefined&&cur[other]!==null&&cur[other]!==""?cur[other]:0,
        ...cur,
        [field]:val
      }};
    });
    setSaved(false);setSavedMid(null);
  }

  async function resetMatch(mid){
    setLocal(p=>{const n={...p};delete n[mid];return n;});
    await db.delete("match_results",`match_id=eq.${mid}`);
    ctx.setMatchResults(p=>{const n={...p};delete n[mid];return n;});
    setSavedMid(null);
  }

  async function saveMatch(mid){
    const r=local[mid]||ctx.matchResults[mid]||{};
    const homeOk=r.home!==undefined&&r.home!==null&&r.home!=="";
    const awayOk=r.away!==undefined&&r.away!==null&&r.away!=="";
    if(!homeOk||!awayOk){alert("Vul eerst beide scores in (gebruik + om te starten).");return;}
    setSaving(true);
    await fetch(`${SUPABASE_URL}/rest/v1/match_results`,{
      method:"POST",
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify([{match_id:mid,home_goals:parseInt(r.home),away_goals:parseInt(r.away)}]),
    });
    ctx.setMatchResults(p=>{
      const updated={...p,[mid]:{home:parseInt(r.home),away:parseInt(r.away)}};
      // Sla ook ranking snapshot op na elke individuele uitslag
      saveRankingSnapshot(ctx.participants,ctx.predictions,updated,ctx.koPredictions,ctx.koMatches,ctx.bonusScores,ctx.bonusQuestions,ctx.setRankingSnapshot);
      return updated;
    });
    setSaving(false);setSavedMid(mid);setTimeout(()=>setSavedMid(null),2000);
  }
  async function handleSave(){
    setSaving(true);
    const rows=[];
    Object.entries(local).forEach(([mid,r])=>{
      // Accept 0 as valid score - check for null/undefined only
      const homeOk = r.home!==undefined&&r.home!==null&&r.home!=="";
      const awayOk = r.away!==undefined&&r.away!==null&&r.away!=="";
      if(homeOk&&awayOk){
        rows.push({match_id:mid,home_goals:parseInt(r.home),away_goals:parseInt(r.away)});
      }
    });
    if(rows.length>0){
      await fetch(`${SUPABASE_URL}/rest/v1/match_results`,{
        method:"POST",
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify(rows),
      });
    } else {
      console.log("No rows to save - local state:", JSON.stringify(local).slice(0,200));
    }
    const mr=await db.get("match_results","select=*");
    if(mr){
      const m={};mr.forEach(r=>{m[r.match_id]={home:r.home_goals,away:r.away_goals,gekanteld:r.gekanteld,toto_voor_kanteling:r.toto_voor_kanteling};});
      ctx.setMatchResults(m);
      // Save ranking snapshot after results update
      await saveRankingSnapshot(ctx.participants,ctx.predictions,m,ctx.koPredictions,ctx.koMatches,ctx.bonusScores,ctx.bonusQuestions,ctx.setRankingSnapshot);
    }
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  }
  async function saveKanteling(mid,gekanteld,totoVoor){
    const payload={gekanteld, toto_voor_kanteling: gekanteld?totoVoor:null};
    await db.update("match_results",`match_id=eq.${mid}`,payload);
    ctx.setMatchResults(p=>({...p,[mid]:{...p[mid],...payload}}));
  }

  return(
    <div>
      <div style={S.alert("")}>Vul de officiële uitslagen in. Punten worden automatisch berekend.</div>
      {Object.entries(WK_GROUPS).map(([grp,teams])=>(
        <div key={grp} style={S.card}>
          <h3 style={S.h3}>Groep {grp}</h3>
          {(()=>{
            const months={jan:0,feb:1,mrt:2,apr:3,mei:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11};
            const matches=[];
            teams.forEach((t1,i)=>teams.slice(i+1).forEach((t2,j)=>{
              const mid=getMatchId(grp,t1.name,t2.name);
              const sch=MATCH_SCHEDULE[mid];
              let dt=new Date(2099,0,1);
              if(sch){const[day,mon]=sch.date.split(" ");const[h,m]=sch.time.split(":");dt=new Date(2026,months[mon],parseInt(day),parseInt(h),parseInt(m));}
              matches.push({mid,t1,t2,dt});
            }));
            matches.sort((a,b)=>a.dt-b.dt);
            return matches.map(({mid,t1,t2})=>{
            const r=local[mid]||ctx.matchResults[mid]||{};
            const isSaved=ctx.matchResults[mid]&&ctx.matchResults[mid].home!==undefined;
            const opgeslagenR=ctx.matchResults[mid]||{};
            return(
              <div key={mid} style={{marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{flex:1}}>
                    <MatchCard grp={grp} t1={t1} t2={t2} homeVal={r.home} awayVal={r.away} disabled={false}
                      onHomeChange={v=>setScore(mid,"home",v)} onAwayChange={v=>setScore(mid,"away",v)}
                      isSaved={isSaved}
                      gekanteld={opgeslagenR.gekanteld} totoVoorKanteling={opgeslagenR.toto_voor_kanteling}
                      onGekanteldChange={checked=>saveKanteling(mid,checked,opgeslagenR.toto_voor_kanteling||"D")}
                      onTotoVoorChange={v=>saveKanteling(mid,true,v)}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"center",minWidth:60}}>
                    <button style={{...S.btn("green"),padding:"6px 10px",fontSize:12}} onClick={()=>saveMatch(mid)} disabled={saving}>💾</button>
                    {isSaved&&<button style={{...S.btn(),padding:"4px 8px",fontSize:11,background:"#fdecea",color:"#c62828"}} onClick={()=>resetMatch(mid)}>✕ Wis</button>}
                    {savedMid===mid&&<span style={{fontSize:10,color:COLORS.green,fontWeight:700}}>✓ Opgeslagen</span>}
                  </div>
                </div>
              </div>
            );
          });})()}
        </div>
      ))}
      <div style={S.row}><button style={S.btn("green")} onClick={handleSave} disabled={saving}>{saving?"Opslaan…":"💾 Opslaan"}</button>{saved&&<span style={S.tag("green")}>✓ Opgeslagen!</span>}</div>
    </div>
  );
}


// ─── KO BRACKET POULE-AANDUIDINGEN ───────────────────────────────────────────
// Gebaseerd op het officiële FIFA-schema (kruisbevestigd via FIFA.com, NBC,
// CBS, Sky Sports, MLSSoccer). Toont wie tegen wie speelt vóórdat de
// daadwerkelijke landen bekend zijn (bijv. "Winnaar E" i.p.v. een blanco veld).
const KO_BRACKET_AANDUIDINGEN = {
  r16: {
    1:["Tweede A","Tweede B"], 2:["Winnaar E","Derde A/B/C/D/F"],
    3:["Winnaar F","Tweede C"], 4:["Winnaar C","Tweede F"],
    5:["Winnaar I","Derde C/D/F/G/H"], 6:["Tweede E","Tweede I"],
    7:["Mexico","Derde C/E/F/H/I"], 8:["Winnaar L","Derde E/H/I/J/K"],
    9:["Winnaar D","Derde B/E/F/I/J"], 10:["Winnaar G","Derde A/E/H/I/J"],
    11:["Tweede K","Tweede L"], 12:["Winnaar H","Tweede J"],
    13:["Winnaar B","Derde E/F/G/I/J"], 14:["Winnaar J","Tweede H"],
    15:["Winnaar K","Derde D/E/I/J/L"], 16:["Tweede D","Tweede G"],
  },
  r8: {
    1:["Winnaar 1/16 #2","Winnaar 1/16 #5"], 2:["Winnaar 1/16 #1","Winnaar 1/16 #3"],
    3:["Winnaar 1/16 #4","Winnaar 1/16 #6"], 4:["Winnaar 1/16 #7","Winnaar 1/16 #8"],
    5:["Winnaar 1/16 #11","Winnaar 1/16 #12"], 6:["Winnaar 1/16 #9","Winnaar 1/16 #10"],
    7:["Winnaar 1/16 #14","Winnaar 1/16 #16"], 8:["Winnaar 1/16 #13","Winnaar 1/16 #15"],
  },
  r4: {
    1:["Winnaar 1/8 #1","Winnaar 1/8 #2"], 2:["Winnaar 1/8 #5","Winnaar 1/8 #6"],
    3:["Winnaar 1/8 #3","Winnaar 1/8 #4"], 4:["Winnaar 1/8 #7","Winnaar 1/8 #8"],
  },
  r2: {
    1:["Winnaar Kwart #1","Winnaar Kwart #2"], 2:["Winnaar Kwart #3","Winnaar Kwart #4"],
  },
  r3: {
    1:["Verliezer Halve #1","Verliezer Halve #2"],
  },
  r1: {
    1:["Winnaar Halve #1","Winnaar Halve #2"],
  },
};

function getKOAanduiding(roundId, matchNum, isHome){
  const r = KO_BRACKET_AANDUIDINGEN[roundId];
  if(!r || !r[matchNum]) return isHome ? "Thuisland invoeren…" : "Uitland invoeren…";
  return r[matchNum][isHome?0:1];
}

function AdminKO({ctx}){
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [newMatch,setNewMatch]=useState({round_id:"r16",home_team:"",away_team:"",kickoff:"",city:""});

  async function addMatch(){
    if(!newMatch.home_team||!newMatch.away_team){alert("Vul beide landen in.");return;}
    setSaving(true);
    const row={
      round_id:newMatch.round_id,
      match_num:(ctx.koMatches.filter(m=>m.round_id===newMatch.round_id).length+1),
      home_team:newMatch.home_team,
      away_team:newMatch.away_team,
      kickoff:newMatch.kickoff?new Date(newMatch.kickoff).toISOString():null,
      city:newMatch.city||null,
      home_goals:null,away_goals:null,
    };
    const res=await db.insert("ko_matches",[row]);
    // Veilige merge op id: voorkomt dat een wedstrijd dubbel in de lijst komt
    // als 'ie er al in zat (blinde [...p,...res] append kon tijdelijk duplicaten geven).
    if(res) ctx.setKoMatches(p=>{
      const bestaandeIds=new Set(p.map(m=>m.id));
      const nieuwe=res.filter(m=>!bestaandeIds.has(m.id));
      return [...p,...nieuwe];
    });
    setNewMatch({round_id:"r16",home_team:"",away_team:"",kickoff:"",city:""});
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  }

  function setResult(matchId,field,val){
    ctx.setKoMatches(p=>p.map(m=>m.id===matchId?{...m,[field]:val===null||val===""?null:val}:m));
  }

  // Per-wedstrijd status: welke match wordt opgeslagen / net opgeslagen
  const [savingId,setSavingId]=useState(null);
  const [savedId,setSavedId]=useState(null);

  async function saveMatchResult(match){
    setSavingId(match.id);
    const update={};
    if(match.home_team!==undefined) update.home_team=match.home_team||null;
    if(match.away_team!==undefined) update.away_team=match.away_team||null;
    // Uitslag: behandel een nog-niet-aangeraakte stepper als 0 (consistent met wat
    // de stepper toont), net als bij de poulewedstrijden. Maar alleen opslaan als
    // er minstens één score is ingevuld — anders blijft de uitslag leeg (null).
    const heeftScore = (match.home_goals!==null&&match.home_goals!==undefined&&match.home_goals!=="")
                     ||(match.away_goals!==null&&match.away_goals!==undefined&&match.away_goals!=="");
    if(heeftScore){
      update.home_goals=(match.home_goals===null||match.home_goals===undefined||match.home_goals==="")?0:parseInt(match.home_goals);
      update.away_goals=(match.away_goals===null||match.away_goals===undefined||match.away_goals==="")?0:parseInt(match.away_goals);
      // Markeer als handmatig ingevoerd: het Apps Script-correctievenster (dat
      // API-geschreven uitslagen kort na afloop nog mag bijwerken) blijft hier
      // dan altijd vanaf.
      update.score_source="manual";
    }
    // Stand na verlenging (120 min) en strafschoppen — alleen opslaan als minstens
    // één kant is aangeraakt, net als bij de 90-minuten-uitslag. Blijft anders null
    // (= "geen verlenging"/"geen strafschoppen"), nooit een impliciete 0-0.
    const heeftET = (match.home_goals_et!==null&&match.home_goals_et!==undefined&&match.home_goals_et!=="")
                  ||(match.away_goals_et!==null&&match.away_goals_et!==undefined&&match.away_goals_et!=="");
    if(heeftET){
      update.home_goals_et=(match.home_goals_et===null||match.home_goals_et===undefined||match.home_goals_et==="")?0:parseInt(match.home_goals_et);
      update.away_goals_et=(match.away_goals_et===null||match.away_goals_et===undefined||match.away_goals_et==="")?0:parseInt(match.away_goals_et);
    }
    const heeftPen = (match.home_penalties!==null&&match.home_penalties!==undefined&&match.home_penalties!=="")
                   ||(match.away_penalties!==null&&match.away_penalties!==undefined&&match.away_penalties!=="");
    if(heeftPen){
      update.home_penalties=(match.home_penalties===null||match.home_penalties===undefined||match.home_penalties==="")?0:parseInt(match.home_penalties);
      update.away_penalties=(match.away_penalties===null||match.away_penalties===undefined||match.away_penalties==="")?0:parseInt(match.away_penalties);
    }
    if(Object.keys(update).length>0){
      await db.update("ko_matches",`id=eq.${match.id}`,update);
    }
    const kom=await db.get("ko_matches","select=*&order=match_num");
    if(kom) ctx.setKoMatches(kom);
    setSavingId(null);setSavedId(match.id);setTimeout(()=>setSavedId(s=>s===match.id?null:s),2000);
  }

  async function clearMatchResult(match){
    if(!window.confirm("Uitslag van deze wedstrijd wissen? (inclusief eventuele verlenging/strafschoppen)")) return;
    setSavingId(match.id);
    await db.update("ko_matches",`id=eq.${match.id}`,{home_goals:null,away_goals:null,home_goals_et:null,away_goals_et:null,home_penalties:null,away_penalties:null,score_source:null});
    const kom=await db.get("ko_matches","select=*&order=match_num");
    if(kom) ctx.setKoMatches(kom);
    setSavingId(null);
  }

  // Auto-save van één team-veld (vangnet naast de API). Slaat ALLEEN het team op,
  // niet de uitslag — die blijft ongemoeid. Lege waarde → null (verwijdert het land).
  // Wordt aangeroepen bij onBlur (veld verlaten), zodat we niet bij elke toetsaanslag
  // schrijven. Slaat alleen op als de waarde daadwerkelijk veranderd is t.o.v. de DB.
  async function saveTeam(match, veld, waarde){
    const nieuw = (waarde||"").trim();
    const huidig = match[veld]||"";
    if(nieuw===huidig) return; // niks veranderd → geen schrijfactie
    const val = nieuw===""?null:nieuw;
    await db.update("ko_matches",`id=eq.${match.id}`,{[veld]:val});
    const kom=await db.get("ko_matches","select=*&order=match_num");
    if(kom) ctx.setKoMatches(kom);
    setSavedId(match.id);setTimeout(()=>setSavedId(s=>s===match.id?null:s),1500);
  }

  async function deleteMatch(id){
    if(!window.confirm("Wedstrijd verwijderen?"))return;
    await db.delete("ko_matches",`id=eq.${id}`);
    ctx.setKoMatches(p=>p.filter(m=>m.id!==id));
  }

  // Wis beide landen van een wedstrijd (zet home_team + away_team op NULL).
  // Laat kickoff, stad en uitslag ongemoeid — de RIJ blijft dus bestaan, alleen de
  // teams worden leeggemaakt. Handig om een foute invulling te resetten: bij de
  // volgende API-sync worden de landen (indien bekend) opnieuw en correct ingevuld.
  async function wisLanden(match){
    if(!window.confirm(`Landen van deze wedstrijd wissen?\n(${match.home_team||"?"} – ${match.away_team||"?"})\n\nDe wedstrijd zelf blijft bestaan; alleen de landen worden leeggemaakt.`)) return;
    await db.update("ko_matches",`id=eq.${match.id}`,{home_team:null,away_team:null});
    const kom=await db.get("ko_matches","select=*&order=match_num");
    if(kom) ctx.setKoMatches(kom);
  }

  async function saveKantelingKO(matchId,gekanteld,totoVoor){
    const payload={gekanteld, toto_voor_kanteling: gekanteld?totoVoor:null};
    await db.update("ko_matches",`id=eq.${matchId}`,payload);
    ctx.setKoMatches(p=>p.map(m=>m.id===matchId?{...m,...payload}:m));
  }

  const matchesByRound=KO_ROUNDS.map(r=>({...r,
    matches:ctx.koMatches.filter(m=>m.round_id===r.id).sort((a,b)=>{
      if(a.kickoff&&b.kickoff) return new Date(a.kickoff)-new Date(b.kickoff);
      return a.match_num-b.match_num;
    })
  }));

  return(
    <div>
      <div style={{...S.alert(""),marginBottom:8,fontSize:12}}>
        Wedstrijden in database: <strong>{ctx.koMatches.length}</strong>
      </div>


      {/* Matches per round */}
      {matchesByRound.map(({id,label,matches})=>matches.length>0&&(
        <div key={id} style={S.card}>
          <h3 style={S.h3}>{label}</h3>
          {matches.map(match=>(
            <div key={match.id} style={{border:`1px solid ${COLORS.border}`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:11,color:COLORS.gray,display:"flex",gap:12,flexWrap:"wrap"}}>
                  <span><strong>#{match.match_num}</strong></span>
                  <span>{match.kickoff?new Date(match.kickoff).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" CET":""}</span>
                  <span>{match.city||""}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto 1fr auto",alignItems:"center",gap:8}}>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <input style={{...S.input,fontSize:12,padding:"5px 8px"}} value={match.home_team||""}
                      onChange={e=>setResult(match.id,"home_team",e.target.value)}
                      onBlur={e=>saveTeam(match,"home_team",e.target.value)}
                      placeholder={getKOAanduiding(match.round_id,match.match_num,true)}/>
                    {match.home_team
                      ? <div style={{display:"flex",alignItems:"center",gap:4,fontSize:12}}><FlagImg name={match.home_team} size={14}/> {match.home_team}</div>
                      : <div style={{fontSize:11,color:COLORS.gray,fontStyle:"italic"}}>{getKOAanduiding(match.round_id,match.match_num,true)}</div>}
                  </div>
                  <ScoreStepper value={match.home_goals??""} onChange={v=>setResult(match.id,"home_goals",v)} disabled={false}/>
                  <span style={{fontWeight:700,color:COLORS.gray}}>–</span>
                  <ScoreStepper value={match.away_goals??""} onChange={v=>setResult(match.id,"away_goals",v)} disabled={false}/>
                  <div style={{display:"flex",flexDirection:"column",gap:3}}>
                    <input style={{...S.input,fontSize:12,padding:"5px 8px"}} value={match.away_team||""}
                      onChange={e=>setResult(match.id,"away_team",e.target.value)}
                      onBlur={e=>saveTeam(match,"away_team",e.target.value)}
                      placeholder={getKOAanduiding(match.round_id,match.match_num,false)}/>
                    {match.away_team
                      ? <div style={{display:"flex",alignItems:"center",gap:4,fontSize:12}}><FlagImg name={match.away_team} size={14}/> {match.away_team}</div>
                      : <div style={{fontSize:11,color:COLORS.gray,fontStyle:"italic"}}>{getKOAanduiding(match.round_id,match.match_num,false)}</div>}
                  </div>
                  {(match.home_team||match.away_team)
                    ? <button title="Wis alleen de landen (wedstrijd blijft bestaan)" style={{...S.btn(),fontSize:11,padding:"4px 8px",whiteSpace:"nowrap"}} onClick={()=>wisLanden(match)}>Wis landen</button>
                    : <span style={{width:8}}/>}
                </div>
                {/* Verlenging & strafschoppen (optioneel, alleen relevant als er al een
                    90-minuten-uitslag is). Vult de API automatisch; dit is het
                    handmatige vangnet ernaast. */}
                {match.home_team&&match.away_team&&match.home_goals!==null&&match.home_goals!==undefined&&(()=>{
                  const preview=koScoreDisplay(match);
                  return(
                    <div style={{marginTop:8,padding:"8px 10px",background:"#fafafa",borderRadius:6,border:`1px dashed ${COLORS.border}`}}>
                      <div style={{fontSize:10,color:COLORS.gray,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,marginBottom:6}}>Verlenging / strafschoppen (indien van toepassing)</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,flexWrap:"wrap"}}>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:9,color:COLORS.gray,marginBottom:2}}>Stand na verlenging (120 min)</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <ScoreStepper value={match.home_goals_et??""} onChange={v=>setResult(match.id,"home_goals_et",v)} disabled={false}/>
                            <span style={{fontWeight:700,color:COLORS.gray}}>–</span>
                            <ScoreStepper value={match.away_goals_et??""} onChange={v=>setResult(match.id,"away_goals_et",v)} disabled={false}/>
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:9,color:COLORS.gray,marginBottom:2}}>Strafschoppen</div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <ScoreStepper value={match.home_penalties??""} onChange={v=>setResult(match.id,"home_penalties",v)} disabled={false}/>
                            <span style={{fontWeight:700,color:COLORS.gray}}>–</span>
                            <ScoreStepper value={match.away_penalties??""} onChange={v=>setResult(match.id,"away_penalties",v)} disabled={false}/>
                          </div>
                        </div>
                      </div>
                      {preview?.caption&&(
                        <div style={{textAlign:"center",fontSize:11,color:COLORS.green,fontWeight:600,marginTop:6}}>
                          Weergave: {preview.main}{preview.mainSuffix?` ${preview.mainSuffix}`:""}{preview.caption?` — ${preview.caption}`:""}
                        </div>
                      )}
                      {/* Gekanteld door laat doelpunt (min. 86, reguliere speeltijd) —
                          voor de "Lucky bastards / Pechvogels"-statistiek. */}
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,justifyContent:"center",flexWrap:"wrap"}}>
                        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:COLORS.gray,cursor:"pointer"}}>
                          <input type="checkbox" checked={!!match.gekanteld}
                            onChange={e=>saveKantelingKO(match.id,e.target.checked,match.toto_voor_kanteling||"D")}/>
                          Gekanteld door laat doelpunt (min. 86+)
                        </label>
                        {match.gekanteld&&(
                          <select style={{...S.input,width:"auto",padding:"2px 6px",fontSize:11}}
                            value={match.toto_voor_kanteling||"D"}
                            onChange={e=>saveKantelingKO(match.id,true,e.target.value)}>
                            <option value="W">Toto vóór: Thuis wint</option>
                            <option value="D">Toto vóór: Gelijkspel</option>
                            <option value="L">Toto vóór: Uit wint</option>
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Wint-label + per-wedstrijd opslaan/wissen */}
                {match.home_team&&match.away_team&&(()=>{
                  const h=(match.home_goals===null||match.home_goals===undefined||match.home_goals==="")?null:parseInt(match.home_goals);
                  const a=(match.away_goals===null||match.away_goals===undefined||match.away_goals==="")?null:parseInt(match.away_goals);
                  const filled=h!==null&&a!==null;
                  const hPen=(match.home_penalties===null||match.home_penalties===undefined||match.home_penalties==="")?null:parseInt(match.home_penalties);
                  const aPen=(match.away_penalties===null||match.away_penalties===undefined||match.away_penalties==="")?null:parseInt(match.away_penalties);
                  const hEt=(match.home_goals_et===null||match.home_goals_et===undefined||match.home_goals_et==="")?null:parseInt(match.home_goals_et);
                  const aEt=(match.away_goals_et===null||match.away_goals_et===undefined||match.away_goals_et==="")?null:parseInt(match.away_goals_et);
                  let wint=null;
                  // De WERKELIJKE winnaar (wie doorging): strafschoppen wegen het
                  // zwaarst, dan de stand na verlenging, en pas als laatste de
                  // 90-minuten-score. Zo toont dit label bij België-Senegal
                  // (2-2 na 90 min, 3-2 na verlenging) correct "België wint",
                  // niet "Gelijkspel".
                  if(hPen!==null&&aPen!==null) wint=hPen>aPen?`${match.home_team} wint`:hPen<aPen?`${match.away_team} wint`:null;
                  else if(hEt!==null&&aEt!==null) wint=hEt>aEt?`${match.home_team} wint`:hEt<aEt?`${match.away_team} wint`:"Gelijkspel (n.v.) — strafschoppen invullen";
                  else if(filled) wint=h>a?`${match.home_team} wint`:h<a?`${match.away_team} wint`:"Gelijkspel";
                  const heeftUitslag=match.home_goals!==null&&match.home_goals!==undefined;
                  return(
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                      {wint&&<span style={{background:"#e8f5ee",color:COLORS.green,border:"1px solid #b2dfdb",borderRadius:5,padding:"3px 10px",fontSize:12,fontWeight:700}}>{wint}</span>}
                      <button onClick={()=>saveMatchResult(match)} disabled={savingId===match.id} style={{
                        padding:"5px 14px",borderRadius:6,border:"none",cursor:"pointer",
                        background:COLORS.green,color:"#fff",fontSize:12,fontWeight:700,
                      }}>{savingId===match.id?"Opslaan…":"💾 Opslaan"}</button>
                      {savedId===match.id&&<span style={{fontSize:12,color:COLORS.green,fontWeight:700}}>✓ Opgeslagen</span>}
                      {heeftUitslag&&savedId!==match.id&&(
                        <button onClick={()=>clearMatchResult(match)} disabled={savingId===match.id} style={{
                          background:"none",border:`1px solid ${COLORS.gray}`,cursor:"pointer",
                          fontSize:11,color:COLORS.gray,padding:"4px 10px",borderRadius:5,
                        }}>🗑 Uitslag wissen</button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}



// ─── ADMIN DOORSTOOT ─────────────────────────────────────────────────────────
function AdminDoorstoot({ctx}){
  const C = COLORS;
  const [saving, setSaving] = React.useState({});

  // Genormaliseerde naam (lowercase, accenten weg) voor matching met doorstoot_landen
  function normalizeName(name){
    return name.toLowerCase()
      .replace(/[àáâãäå]/g,'a').replace(/[èéêë]/g,'e')
      .replace(/[ìíîï]/g,'i').replace(/[òóôõö]/g,'o')
      .replace(/[ùúûü]/g,'u').replace(/[ç]/g,'c')
      .replace(/[ñ]/g,'n').replace(/[ý]/g,'y')
      .replace(/[^a-z0-9 ]/g,'').trim();
  }

  // Map NL-namen naar genormaliseerde namen (zelfde als Apps Script alias map)
  async function toggleLand(nlNaam, isAan){
    const genNaam = NL_TO_EN_ALIAS[nlNaam] || normalizeName(nlNaam);
    setSaving(p=>({...p,[nlNaam]:true}));
    if(isAan){
      // Verwijderen uit doorstoot_landen
      await fetch(`${SUPABASE_URL}/rest/v1/doorstoot_landen?team_name=eq.${encodeURIComponent(genNaam)}`,{
        method:"DELETE",
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"},
      });
      ctx.setDoorstootLanden(p=>p.filter(t=>t!==genNaam));
    } else {
      // Toevoegen aan doorstoot_landen
      await fetch(`${SUPABASE_URL}/rest/v1/doorstoot_landen`,{
        method:"POST",
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify([{team_name:genNaam}]),
      });
      ctx.setDoorstootLanden(p=>[...p,genNaam]);
    }
    setSaving(p=>({...p,[nlNaam]:false}));
  }

  return(
    <div>
      <div style={{...S.alert(""),marginBottom:14,fontSize:13,lineHeight:1.6}}>
        <strong>Automatisch:</strong> de Apps Script checkt elke 5 minuten of de standings API een land als doorgestoten markeert. Let op: de API doet dit soms vertraagd of helemaal niet tijdens de groepsfase.<br/>
        <strong>Handmatig override (aanbevolen):</strong> vink een land zelf aan zodra het mathematisch of officieel zeker door is — wacht niet op de API.
        <br/><span style={{fontSize:11,color:C.gray}}>Aangevinkt = land staat in <code>doorstoot_landen</code> tabel en telt mee voor punten.</span>
      </div>
      <div style={{...S.card,marginBottom:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:13,fontWeight:700,color:C.green}}>{ctx.doorstootLanden.length} landen doorgestoten</span>
        <span style={{fontSize:12,color:C.gray}}>van maximaal 32 (top 2 per groep + 8 beste nummers 3)</span>
      </div>
      {Object.entries(WK_GROUPS).map(([grp,teams])=>(
        <div key={grp} style={{...S.card,marginBottom:10}}>
          <h3 style={{...S.h3,marginBottom:10}}>Groep {grp}</h3>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {teams.map(team=>{
              const genNaam = NL_TO_EN_ALIAS[team.name] || normalizeName(team.name);
              const isAan = ctx.doorstootLanden.includes(genNaam);
              const isSaving = saving[team.name];
              return(
                <div key={team.name} style={{
                  display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
                  borderRadius:8,border:`1px solid ${isAan?C.green:C.border}`,
                  background:isAan?"#e8f5ee":"#fff",
                  transition:"all 0.15s",
                }}>
                  <FlagImg name={team.name} size={20}/>
                  <span style={{flex:1,fontWeight:600,fontSize:13}}>{team.name}</span>
                  {isAan&&<span style={{...S.tag("green"),fontSize:11}}>✓ Doorgestoten</span>}
                  <button
                    onClick={()=>toggleLand(team.name,isAan)}
                    disabled={isSaving}
                    style={{
                      padding:"5px 14px",borderRadius:6,border:"none",cursor:isSaving?"wait":"pointer",
                      fontWeight:700,fontSize:12,
                      background:isAan?"#fdecea":C.green,
                      color:isAan?"#c62828":"#fff",
                      opacity:isSaving?0.6:1,
                    }}
                  >
                    {isSaving?"…":isAan?"✕ Verwijderen":"✓ Aanvinken"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminBonus({ctx}){
  const [questions,setQuestions]=useState(ctx.bonusQuestions.length>0?ctx.bonusQuestions:[]);
  const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(false);
  function addQ(){if(questions.length>=5)return;setQuestions(p=>[...p,{idx:p.length,question:"",type:"open",options:Array(10).fill(""),points:20,tooltip:""}]);setSaved(false);}
  function removeQ(i){setQuestions(p=>p.filter((_,x)=>x!==i).map((q,x)=>({...q,idx:x})));setSaved(false);}
  function setQField(i,f,v){setQuestions(p=>p.map((q,x)=>x===i?{...q,[f]:v}:q));setSaved(false);}
  function setOption(qi,oi,v){setQuestions(p=>p.map((q,x)=>x===qi?{...q,options:(q.options||Array(10).fill("")).map((o,y)=>y===oi?v:o)}:q));setSaved(false);}
  async function handleSave(){
    setSaving(true);
    await db.delete("bonus_questions","idx=gte.0");
    const rows=questions.map((q,i)=>({idx:i,question:q.question,type:q.type,options:JSON.stringify(q.options||[]),points:q.points??20,tooltip:q.tooltip||null}));
    if(rows.length>0) await db.insert("bonus_questions",rows);
    const bq=await db.get("bonus_questions","select=*&order=idx");
    if(bq) ctx.setBonusQuestions(bq.map(q=>({...q,options:Array.isArray(q.options)?q.options:(typeof q.options==="string"?JSON.parse(q.options):[])  })));
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  }
  return(
    <div>
      <div style={{...S.row,marginBottom:12}}>
        <h3 style={{...S.h3,margin:0}}>Bonusvragen ({questions.length}/5)</h3>
        {questions.length<5&&<button style={S.btn("yellow")} onClick={addQ}>+ Vraag toevoegen</button>}
      </div>
      {questions.map((q,i)=>(
        <div key={i} style={S.card}>
          <div style={{...S.row,marginBottom:10}}><h3 style={{...S.h3,margin:0}}>Vraag {i+1}</h3><button style={S.btn()} onClick={()=>removeQ(i)}>Verwijderen</button></div>
          <div style={{marginBottom:10}}>
            <label style={S.label}>Type</label>
            <select style={{...S.input,width:"auto"}} value={q.type} onChange={e=>setQField(i,"type",e.target.value)}>
              <option value="open">Open vraag</option><option value="mc">Multiple choice</option>
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <label style={S.label}>Vraag</label>
            <input style={S.input} value={q.question} onChange={e=>setQField(i,"question",e.target.value)} placeholder="Typ je vraag…"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:10,marginBottom:10}}>
            <div>
              <label style={S.label}>Punten bij goed antwoord</label>
              <input type="number" min="1" max="100" style={{...S.input,width:"auto",minWidth:80}} value={q.points??20} onChange={e=>setQField(i,"points",parseInt(e.target.value)||20)}/>
            </div>
            <div>
              <label style={S.label}>Toelichting (tooltip via ⓘ)</label>
              <input style={S.input} value={q.tooltip||""} onChange={e=>setQField(i,"tooltip",e.target.value)} placeholder="Optionele uitleg bij de vraag…"/>
            </div>
          </div>
          {q.type==="mc"&&(
            <div>
              <label style={S.label}>Antwoordopties (max 10 — lege opties worden niet getoond)</label>
              {(Array.isArray(q.options)?q.options:Array(10).fill("")).map((opt,oi)=>(
                <input key={oi} style={{...S.input,marginBottom:6}} value={opt} onChange={e=>setOption(i,oi,e.target.value)} placeholder={`Optie ${oi+1}`}/>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={S.row}><button style={S.btn("green")} onClick={handleSave} disabled={saving}>{saving?"Opslaan…":"💾 Opslaan"}</button>{saved&&<span style={S.tag("green")}>✓ Opgeslagen!</span>}</div>
    </div>
  );
}

function AdminBeoordeel({ctx}){
  const [localScores,setLocalScores]=useState(ctx.bonusScores||{});
  const [saving,setSaving]=useState({});
  const [saved,setSaved]=useState({});
  const [selectedP,setSelectedP]=useState(null);

  async function setScore(uid,idx,val){
    setLocalScores(p=>({...p,[uid]:{...(p[uid]||{}),[idx]:val}}));
    const key=`${uid}_${idx}`;
    setSaving(p=>({...p,[key]:true}));
    if(val===undefined){
      await fetch(`${SUPABASE_URL}/rest/v1/bonus_scores?participant_id=eq.${uid}&question_idx=eq.${idx}`,{
        method:"DELETE",
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,Prefer:"return=minimal"},
      });
      ctx.setBonusScores(p=>{
        const n={...p,[uid]:{...(p[uid]||{})}};
        delete n[uid][idx];
        return n;
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/bonus_scores`,{
        method:"POST",
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates"},
        body:JSON.stringify([{participant_id:uid,question_idx:parseInt(idx),correct:val}]),
      });
      ctx.setBonusScores(p=>({...p,[uid]:{...(p[uid]||{}),[idx]:val}}));
    }
    setSaving(p=>({...p,[key]:false}));
    setSaved(p=>({...p,[key]:true}));
    setTimeout(()=>setSaved(p=>({...p,[key]:false})),1500);
  }

  if(ctx.bonusQuestions.length===0) return <div style={S.alert("")}>Nog geen bonusvragen aangemaakt.</div>;
  if(ctx.participants.length===0) return <div style={S.alert("")}>Nog geen deelnemers.</div>;

  return(
    <div>
      {selectedP&&<DeelnemerOverlay p={selectedP} ctx={ctx} onClose={()=>setSelectedP(null)}/>}
      <div style={S.alert("")}>Beoordeel per vraag de antwoorden van alle deelnemers. Wordt direct opgeslagen.</div>
      {ctx.bonusQuestions.map(q=>(
        <div key={q.idx} style={S.card}>
          <div style={{marginBottom:14}}>
            <h3 style={{...S.h3,marginBottom:4}}>Vraag {q.idx+1} <span style={{...S.tag("green"),fontSize:11}}>{q.points??20} pt</span></h3>
            <p style={{fontSize:14,fontWeight:600,color:COLORS.dark}}>{q.question}</p>
            {q.tooltip&&<p style={{fontSize:12,color:COLORS.gray,marginTop:4,fontStyle:"italic"}}>ⓘ {q.tooltip}</p>}
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#f0faf6"}}>
                <th style={{...S.th,textAlign:"left"}}>Deelnemer</th>
                <th style={{...S.th,textAlign:"left"}}>Antwoord</th>
                <th style={{...S.th,textAlign:"center",width:260}}>Beoordeling</th>
              </tr>
            </thead>
            <tbody>
              {ctx.participants.map((p,i)=>{
                const answer=ctx.bonusAnswers[p.id]?.[q.idx];
                const score=localScores[p.id]?.[q.idx];
                const key=`${p.id}_${q.idx}`;
                const isSaving=saving[key];
                const isSaved=saved[key];
                return(
                  <tr key={p.id} style={{background:i%2===0?"#fff":"#f9fffe",borderTop:`1px solid ${COLORS.border}`}}>
                    <td style={{...S.td,fontWeight:600,cursor:"pointer",color:COLORS.green}} onClick={()=>setSelectedP(p)}>
                    {p.first_name} {p.last_name} <span style={{fontSize:12,opacity:0.6}}>›</span>
                  </td>
                    <td style={S.td}>
                      {answer
                        ? <strong>{answer}</strong>
                        : <span style={{color:COLORS.gray,fontStyle:"italic"}}>Niet ingevuld</span>}
                    </td>
                    <td style={{...S.td,textAlign:"center"}}>
                      {answer?(
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          <button onClick={()=>setScore(p.id,q.idx,true)} disabled={isSaving} style={{
                            padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                            background:score===true?COLORS.green:"#e8f5ee",
                            color:score===true?"#fff":COLORS.green,
                          }}>✅ Goed</button>
                          <button onClick={()=>setScore(p.id,q.idx,false)} disabled={isSaving} style={{
                            padding:"4px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                            background:score===false?"#c62828":"#fdecea",
                            color:score===false?"#fff":"#c62828",
                          }}>❌ Fout</button>
                          {score!==undefined&&<button onClick={()=>setScore(p.id,q.idx,undefined)} disabled={isSaving} style={{
                            background:"none",border:"none",cursor:"pointer",fontSize:11,color:COLORS.gray,textDecoration:"underline"
                          }}>↩ Wis</button>}
                          {isSaved&&<span style={{fontSize:11,color:COLORS.green}}>✓</span>}
                        </div>
                      ):(
                        <span style={{fontSize:12,color:COLORS.gray}}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}




function NewsItemEdit({n, ctx, onDelete}){
  const [editing,setEditing]=useState(false);
  const [title,setTitle]=useState(n.title);
  const [message,setMessage]=useState(n.message);
  const [saving,setSaving]=useState(false);

  async function saveEdit(){
    if(!title.trim()||!message.trim()) return;
    setSaving(true);
    await db.update("news_items",`id=eq.${n.id}`,{title:title.trim(),message:message.trim()});
    ctx.setNewsItems(p=>p.map(x=>x.id===n.id?{...x,title:title.trim(),message:message.trim()}:x));
    setSaving(false);
    setEditing(false);
  }

  if(editing) return(
    <div style={{padding:"12px 14px",borderRadius:8,border:`2px solid ${COLORS.green}`,marginBottom:10,background:"#f0faf6"}}>
      <div style={{marginBottom:8}}>
        <label style={S.label}>Titel</label>
        <input style={S.input} value={title} onChange={e=>setTitle(e.target.value)}/>
      </div>
      <div style={{marginBottom:10}}>
        <label style={S.label}>Bericht</label>
        <textarea style={{...S.input,minHeight:70}} value={message} onChange={e=>setMessage(e.target.value)}/>
      </div>
      <div style={S.row}>
        <button style={S.btn("green")} onClick={saveEdit} disabled={saving}>{saving?"Opslaan…":"💾 Opslaan"}</button>
        <button style={S.btn()} onClick={()=>{setEditing(false);setTitle(n.title);setMessage(n.message);}}>Annuleren</button>
      </div>
    </div>
  );

  return(
    <div style={{padding:"12px 14px",borderRadius:8,border:`1px solid ${COLORS.border}`,marginBottom:10,background:"#f9fffe"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1}}>
          <p style={{fontWeight:700,fontSize:14,marginBottom:3}}>{n.title}</p>
          <p style={{fontSize:12,color:COLORS.gray,marginBottom:6}}>{new Date(n.created_at).toLocaleString("nl-NL",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p>
          <p style={{fontSize:13,lineHeight:1.5}}>{n.message}</p>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button onClick={()=>setEditing(true)} style={{...S.btn(),fontSize:11,padding:"4px 10px"}}>✏️ Wijzig</button>
          <button onClick={()=>onDelete(n.id)} style={{...S.btn(),fontSize:11,padding:"4px 10px",background:"#fdecea",color:"#c62828"}}>✕</button>
        </div>
      </div>
    </div>
  );
}

function AdminNews({ctx}){
  const [title,setTitle]=useState("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  async function addNews(){
    if(!title.trim()||!message.trim()){alert("Vul een titel en bericht in.");return;}
    setSaving(true);
    const row={title:title.trim(),message:message.trim()};
    await db.insert("news_items",[row]);
    // Reload from DB to get correct created_at and id
    const fresh=await db.get("news_items","select=*&order=created_at.desc&limit=3");
    if(fresh) ctx.setNewsItems(fresh);
    setTitle("");setMessage("");
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  }

  async function deleteNews(id){
    await db.delete("news_items",`id=eq.${id}`);
    const fresh=await db.get("news_items","select=*&order=created_at.desc&limit=3");
    if(fresh!==null) ctx.setNewsItems(fresh);
  }

  return(
    <div>
      <div style={S.card}>
        <h3 style={S.h3}>📢 Nieuw bericht toevoegen</h3>
        <div style={{marginBottom:10}}>
          <label style={S.label}>Titel</label>
          <input style={S.input} value={title} onChange={e=>setTitle(e.target.value)} placeholder="bijv. Stand na speelronde 1"/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={S.label}>Bericht</label>
          <textarea style={{...S.input,minHeight:80}} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Typ hier je mededeling…"/>
        </div>
        <div style={S.row}>
          <button style={S.btn("green")} onClick={addNews} disabled={saving}>{saving?"Opslaan…":"📢 Publiceren"}</button>
          {saved&&<span style={S.tag("green")}>✓ Gepubliceerd!</span>}
        </div>
        <p style={{fontSize:12,color:COLORS.gray,marginTop:8}}>Maximum 3 berichten — oudste wordt automatisch vervangen.</p>
      </div>

      <div style={S.card}>
        <h3 style={S.h3}>Gepubliceerde berichten</h3>
        {ctx.newsItems.length===0&&<p style={{fontSize:13,color:COLORS.gray}}>Nog geen berichten.</p>}
        {ctx.newsItems.map(n=>(
          <NewsItemEdit key={n.id} n={n} ctx={ctx} onDelete={deleteNews}/>
        ))}
      </div>
    </div>
  );
}

function StatusDot({uid, type, ctx}){
  const C = COLORS;
  if(type==="group"){
    const pred = ctx.predictions[uid]||{};
    let filled=0, total=0;
    Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
      teams.forEach((_,i)=>teams.slice(i+1).forEach((_,j)=>{
        total++;
        const mid=getMatchId(grp,teams[i].name,teams[i+j+1].name);
        const pp=pred[mid];
        if(pp&&pp.home!==undefined&&pp.home!==null&&pp.away!==undefined&&pp.away!==null) filled++;
      }));
    });
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
        <span style={{fontSize:14}}>{filled===total?"✅":filled>0?"⚠️":"❌"}</span>
        <span style={{fontSize:10,color:C.gray}}>{filled}/{total}</span>
      </div>
    );
  }
  if(type==="ko"){
    const koP = ctx.koPredictions[uid]||{};
    const openMatches = ctx.koMatches.filter(m=>m.home_team&&m.away_team);
    if(openMatches.length===0) return <span style={{fontSize:13,color:C.gray}}>—</span>;
    const filled = openMatches.filter(m=>koP[m.id]!==undefined).length;
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
        <span style={{fontSize:14}}>{filled===openMatches.length?"✅":filled>0?"⚠️":"❌"}</span>
        <span style={{fontSize:10,color:C.gray}}>{filled}/{openMatches.length}</span>
      </div>
    );
  }
  if(type==="bonus"){
    const bonusA = ctx.bonusAnswers[uid]||{};
    const total = ctx.bonusQuestions.length;
    if(total===0) return <span style={{fontSize:13,color:C.gray}}>—</span>;
    const filled = ctx.bonusQuestions.filter(q=>bonusA[q.idx]!==undefined&&bonusA[q.idx]!=="").length;
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
        <span style={{fontSize:14}}>{filled===total?"✅":filled>0?"⚠️":"❌"}</span>
        <span style={{fontSize:10,color:C.gray}}>{filled}/{total}</span>
      </div>
    );
  }
  return null;
}

function DeelnemerDetail({p, ctx}){
  const C = COLORS;
  const pred = ctx.predictions[p.id] || {};
  const koP = ctx.koPredictions[p.id] || {};
  const bonusA = ctx.bonusAnswers[p.id] || {};
  const bonusS = ctx.bonusScores[p.id] || {};
  let filled = 0, total = 0;
  Object.entries(WK_GROUPS).forEach(([grp,teams])=>{
    teams.forEach((_,i)=>teams.slice(i+1).forEach((_,j)=>{
      total++;
      const mid = getMatchId(grp,teams[i].name,teams[i+j+1].name);
      const pp = pred[mid];
      if(pp&&pp.home!==undefined&&pp.home!==null&&pp.away!==undefined&&pp.away!==null) filled++;
    }));
  });
  return(
    <div style={{background:"#f9fffe",padding:"14px 18px",borderTop:`1px solid ${C.border}`}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        <div>
          <p style={{fontSize:12,fontWeight:700,color:C.gray,textTransform:"uppercase",marginBottom:8}}>Groepsfase ({filled}/{total})</p>
          {Object.entries(WK_GROUPS).map(([grp,teams])=>(
            <div key={grp} style={{marginBottom:8}}>
              <p style={{fontSize:11,fontWeight:700,color:C.green,margin:"0 0 3px"}}>Groep {grp}</p>
              {teams.map((t1,i)=>teams.slice(i+1).map((t2,j)=>{
                const mid = getMatchId(grp,t1.name,t2.name);
                const pp = pred[mid];
                const hasPred = pp&&pp.home!==undefined&&pp.home!==null&&pp.away!==undefined&&pp.away!==null;
                const result = ctx.matchResults[mid];
                const hasResult = result&&result.home!==undefined&&result.home!==null;
                let pts = null;
                if(hasPred&&hasResult){
                  const exact = parseInt(pp.home)===parseInt(result.home)&&parseInt(pp.away)===parseInt(result.away);
                  const toto = calcToto(pp.home,pp.away)===calcToto(result.home,result.away);
                  pts = exact?5:toto?3:0;
                }
                return(
                  <div key={mid} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,marginBottom:2,flexWrap:"wrap"}}>
                    <FlagImg name={t1.name} size={11}/> <span>{t1.name}</span>
                    <span style={{fontWeight:700,color:hasPred?C.green:C.gray}}>{hasPred?`${pp.home}–${pp.away}`:"—"}</span>
                    <FlagImg name={t2.name} size={11}/> <span>{t2.name}</span>
                    {pts!==null&&<span style={{...S.tag(pts>0?"green":""),fontSize:10,padding:"1px 4px"}}>{pts}pt</span>}
                  </div>
                );
              }))}
            </div>
          ))}
        </div>
        <div>
          <p style={{fontSize:12,fontWeight:700,color:C.gray,textTransform:"uppercase",marginBottom:8}}>Knock-out</p>
          {ctx.koMatches.filter(m=>m.home_team&&m.away_team).map(match=>{
            const pp = koP[match.id];
            const hasPred = pp&&pp.home!==undefined&&pp.home!==null;
            const hasResult = match.home_goals!==null&&match.home_goals!==undefined;
            let pts = null;
            if(hasPred&&hasResult){
              const exact=parseInt(pp.home)===parseInt(match.home_goals)&&parseInt(pp.away)===parseInt(match.away_goals);
              const toto=calcToto(pp.home,pp.away)===calcToto(match.home_goals,match.away_goals);
              pts=exact?KO_EXACT_PTS:toto?KO_TOTO_PTS:0;
            }
            const round = KO_ROUNDS.find(r=>r.id===match.round_id);
            return(
              <div key={match.id} style={{marginBottom:6,fontSize:11}}>
                <span style={{color:C.green,fontWeight:700}}>{round?.label}: </span>
                <FlagImg name={match.home_team} size={11}/> {match.home_team}
                <span style={{fontWeight:700,margin:"0 4px"}}>{hasPred?`${pp.home}–${pp.away}`:"—"}</span>
                <FlagImg name={match.away_team} size={11}/> {match.away_team}
                {pts!==null&&<span style={{...S.tag(pts>0?"green":""),fontSize:10,marginLeft:4}}>{pts}pt</span>}
              </div>
            );
          })}
          {ctx.koMatches.filter(m=>m.home_team&&m.away_team).length===0&&<p style={{fontSize:11,color:C.gray}}>Nog geen KO-wedstrijden.</p>}
        </div>
        <div>
          <p style={{fontSize:12,fontWeight:700,color:C.gray,textTransform:"uppercase",marginBottom:8}}>Bonusvragen</p>
          {ctx.bonusQuestions.length===0
            ? <p style={{fontSize:11,color:C.gray}}>Nog geen bonusvragen</p>
            : ctx.bonusQuestions.map(q=>{
              const answer = bonusA[q.idx];
              const score = bonusS[q.idx];
              return(
                <div key={q.idx} style={{marginBottom:10,padding:"8px 10px",background:"#fff",borderRadius:6,border:`1px solid ${C.border}`}}>
                  <p style={{fontSize:11,fontWeight:700,color:C.dark,margin:"0 0 3px"}}>V{q.idx+1}: {q.question}</p>
                  <p style={{fontSize:11,color:answer?C.dark:C.gray,margin:"0 0 3px"}}>{answer||"Niet ingevuld"}</p>
                  {score===true&&<span style={{...S.tag("green"),fontSize:10}}>✅ Goed</span>}
                  {score===false&&<span style={{fontSize:10,color:"#c62828"}}>❌ Fout</span>}
                  {score===undefined&&answer&&<span style={{fontSize:10,color:C.gray}}>Nog niet beoordeeld</span>}
                </div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
}


function PinCell({p, ctx}){
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState(false);
  const [newPin,setNewPin]=useState("");
  const [saving,setSaving]=useState(false);

  async function savePin(){
    if(!newPin||newPin.length!==4||isNaN(newPin)){alert("Voer een geldige 4-cijferige pincode in.");return;}
    setSaving(true);
    await db.update("participants",`id=eq.${p.id}`,{pin:newPin});
    ctx.setParticipants(ps=>ps.map(x=>x.id===p.id?{...x,pin:newPin}:x));
    setSaving(false);
    setEditing(false);
    setNewPin("");
    setShow(false);
  }

  if(editing) return(
    <div style={{display:"flex",alignItems:"center",gap:4}}>
      <input
        type="text" inputMode="numeric" maxLength={4}
        value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,4))}
        style={{width:60,padding:"3px 6px",border:`1px solid ${COLORS.border}`,borderRadius:4,fontSize:13,textAlign:"center",letterSpacing:4}}
        placeholder="1234" autoFocus/>
      <button onClick={savePin} disabled={saving} style={{...S.btn("green"),fontSize:11,padding:"3px 8px"}}>✓</button>
      <button onClick={()=>{setEditing(false);setNewPin("");}} style={{...S.btn(),fontSize:11,padding:"3px 8px"}}>✕</button>
    </div>
  );

  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
      <span style={{fontSize:13,fontFamily:"monospace",letterSpacing:2,minWidth:36}}>
        {show?(p.pin||"—"):"••••"}
      </span>
      <button onClick={()=>setShow(s=>!s)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:COLORS.gray}} title={show?"Verbergen":"Tonen"}>
        {show?"🙈":"👁"}
      </button>
      <button onClick={()=>{setEditing(true);setShow(false);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:COLORS.gray}} title="PIN wijzigen">
        ✏️
      </button>
    </div>
  );
}

function AdminUsers({ctx}){
  const [expanded,setExpanded]=useState(null);
  async function removeUser(id){
    if(!window.confirm("Deelnemer verwijderen?"))return;
    await db.delete("participants",`id=eq.${id}`);
    ctx.setParticipants(p=>p.filter(x=>x.id!==id));
    if(expanded===id) setExpanded(null);
  }
  function toggleExpand(id){ setExpanded(prev=>prev===id?null:id); }

  return(
    <div style={S.card}>
      <h3 style={S.h3}>Deelnemers ({ctx.participants.length})</h3>
      {ctx.participants.length===0&&<p style={{color:COLORS.gray,fontSize:13}}>Nog geen deelnemers.</p>}
      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>#</th>
          <th style={S.th}>Naam</th>
          <th style={S.th}>Aangemeld</th>
          <th style={{...S.th,textAlign:"center"}}>Groepsfase</th>
          <th style={{...S.th,textAlign:"center"}}>Knock-out</th>
          <th style={{...S.th,textAlign:"center"}}>Bonus</th>
          <th style={{...S.th,textAlign:"center"}}>PIN</th>
          <th style={S.th}></th>
        </tr></thead>
        <tbody>
          {ctx.participants.map((p,i)=>(
            <React.Fragment key={p.id}>
            <tr>
              <td style={S.td}>{i+1}</td>
              <td style={{...S.td,fontWeight:600}}>{p.first_name} {p.last_name}</td>
              <td style={S.td}>{new Date(p.created_at).toLocaleDateString("nl-NL")}</td>
              <td style={S.tdc}><StatusDot uid={p.id} type="group" ctx={ctx}/></td>
              <td style={S.tdc}><StatusDot uid={p.id} type="ko" ctx={ctx}/></td>
              <td style={S.tdc}><StatusDot uid={p.id} type="bonus" ctx={ctx}/></td>
              <td style={S.tdc}><PinCell p={p} ctx={ctx}/></td>
              <td style={S.td}>
                <div style={S.row}>
                  <button style={{...S.btn("green"),fontSize:12,padding:"6px 12px"}} onClick={()=>toggleExpand(p.id)}>{expanded===p.id?"▲ Sluiten":"▼ Bekijken"}</button>
                  <button style={S.btn()} onClick={()=>removeUser(p.id)}>Verwijderen</button>
                </div>
              </td>
            </tr>
            {expanded===p.id&&(
              <tr>
                <td colSpan={4} style={{padding:0,borderBottom:`1px solid ${COLORS.border}`}}>
                  <DeelnemerDetail p={p} ctx={ctx}/>
                </td>
              </tr>
            )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
