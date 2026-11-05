// Notas do público (IMDb, MyAnimeList, AniList) para os títulos de titulos.json -> notas.json
// Roda no GitHub Actions (internet livre).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { Readable } from "node:stream";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const UA = "capas-indicador/1.0 (https://github.com/VineSB/capas-indicador)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nz = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

async function getJson(url, opt = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { ...opt, headers: { "User-Agent": UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(25000) });
    if (r.status === 429 || r.status === 403) { await sleep(3000 * (i + 1)); continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.json();
  }
  throw new Error("limite de requisições: " + url);
}

const base = (t) => String(t || "").replace(/\s+(S\d+|season\s*\d+|temporada\s*\d+)$/i, "").trim();

/* IMDb: acha o código do título e, depois, a nota no arquivo oficial de notas */
async function imdbId(it) {
  const nomes = [it.imdb, it.q, it.alt, base(it.t)].filter(Boolean).map(base);
  const quer = it.tp === "serie" ? /tvSeries|tvMiniSeries/ : /movie|tvMovie|video/;
  for (const nome of [...new Set(nomes)]) {
    const t = nz(nome).replace(/ /g, "_"); if (!t) continue;
    let j; try { j = await getJson("https://v2.sg.media-imdb.com/suggestion/" + t[0] + "/" + encodeURIComponent(t) + ".json"); } catch (e) { continue; }
    const ds = ((j && j.d) || []).filter((x) => x.id && /^tt/.test(x.id) && quer.test(x.qid || ""));
    const nq = nz(nome);
    const exatos = ds.filter((x) => nz(x.l) === nq && (!it.ano || Math.abs(Number(x.y) - Number(it.ano)) <= 1));
    const d = exatos[0] || ds.find((x) => nz(x.l) === nq);
    if (d) return { id: d.id, achou: d.l + " (" + (d.y || "?") + ")", exato: true };
    if (it.strict) continue;
    if (ds[0]) { console.log("   aprox:", it.t, "->", ds[0].l, ds[0].y); return { id: ds[0].id, achou: ds[0].l + " (" + (ds[0].y || "?") + ")", exato: false }; }
  }
  return null;
}

async function carregarNotasImdb(ids) {
  const mapa = new Map();
  const r = await fetch("https://datasets.imdbws.com/title.ratings.tsv.gz", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("datasets.imdbws.com HTTP " + r.status);
  const rl = readline.createInterface({ input: Readable.fromWeb(r.body).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const ln of rl) { const [id, nota, votos] = ln.split("\t"); if (ids.has(id)) mapa.set(id, { nota: Number(nota), votos: Number(votos) }); }
  return mapa;
}

/* anime: AniList (nota 0-100) e MyAnimeList via Jikan (nota 0-10) */
async function anilist(q) {
  const j = await getJson("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: "query($s:String){Media(search:$s,type:ANIME){id idMal title{romaji english} averageScore popularity seasonYear format}}", variables: { s: q } }) });
  return (j && j.data && j.data.Media) || null;
}
async function jikan(idMal) {
  const j = await getJson("https://api.jikan.moe/v4/anime/" + idMal);
  const d = j && j.data; return d && d.score ? { nota: d.score, votos: d.scored_by || 0 } : null;
}
async function kitsu(romaji, ingles) {
  const q = romaji || ingles;
  const j = await getJson("https://kitsu.io/api/edge/anime?filter%5Btext%5D=" + encodeURIComponent(q) + "&page%5Blimit%5D=5", { headers: { Accept: "application/vnd.api+json" } });
  const ds = (j && j.data) || [], nq = nz(q), nq2 = nz(ingles);
  const d = ds.find((x) => { const t = x.attributes.titles || {}; return [t.en, t.en_jp, x.attributes.canonicalTitle].some((n) => n && (nz(n) === nq || nz(n) === nq2)); }) || ds[0];
  const a = d && d.attributes; return a && a.averageRating ? { nota: Math.round(Number(a.averageRating)) / 10, votos: a.userCount || 0, achou: a.canonicalTitle } : null;
}
async function tvmaze(q) {
  const j = await getJson("https://api.tvmaze.com/singlesearch/shows?q=" + encodeURIComponent(q));
  return j && j.rating && j.rating.average ? { nota: j.rating.average } : null;
}

let jikanOk = 0;
async function main() {
  const titulos = JSON.parse(fs.readFileSync(path.join(ROOT, "titulos.json"), "utf8"));
  const file = path.join(ROOT, "notas.json");
  const notas = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const ids = new Set();
  for (const it of titulos) {
    const s = it.s, n = (notas[s] = notas[s] || { t: it.t, tp: it.tp });
    n.t = it.t; n.tp = it.tp;
    try {
      if (it.tp === "anime") {
        if (n.kitsu !== undefined) continue;
        const nomes = [...new Set([it.q, it.alt, base(it.t)].filter(Boolean))];
        let m = null;
        for (const nome of nomes) { m = await anilist(nome); if (m) break; await sleep(700); }
        if (m) {
          n.achou = (m.title.english || m.title.romaji) + (m.seasonYear ? " (" + m.seasonYear + ")" : "") + " (AniList)";
          n.anilist = m.averageScore ? { nota: Math.round(m.averageScore) / 10 } : null;
          if (m.idMal && jikanOk > -3) { await sleep(1100); try { n.mal = await jikan(m.idMal); if (n.mal) n.mal.id = m.idMal; jikanOk = 0; } catch (e) { n.mal = null; jikanOk--; console.log("   jikan falhou:", String(e.message).slice(0, 80), e.cause ? String(e.cause.code || e.cause.message).slice(0, 80) : ""); } } else n.mal = null;
          try { n.kitsu = await kitsu(m.title.romaji, m.title.english); } catch (e) { n.kitsu = null; console.log("   kitsu falhou:", String(e.message).slice(0, 80)); }
        } else { n.anilist = null; n.mal = null; n.kitsu = null; n.achou = null; }
        console.log("anime:", it.t, "->", n.achou, "| AniList", n.anilist && n.anilist.nota, "| MAL", n.mal && n.mal.nota, "| Kitsu", n.kitsu && n.kitsu.nota);
        await sleep(800);
      } else {
        if (n.imdb !== undefined && n.imdb !== null) continue;
        const r = await imdbId(it);
        if (r) { n.imdb = { id: r.id, exato: r.exato }; n.achou = r.achou + " (IMDb)"; ids.add(r.id); }
        else { n.imdb = null; n.achou = null; }
        if (!r && it.tp === "serie") { try { const tv = await tvmaze(it.q || it.alt || base(it.t)); if (tv) n.tvmaze = tv; } catch (e) {} }
        console.log(it.tp + ":", it.t, "->", n.achou);
        await sleep(450);
      }
    } catch (e) { console.log("erro:", it.t, String(e.message).slice(0, 120)); }
  }
  const todos = new Set(Object.values(notas).filter((n) => n.imdb && n.imdb.id).map((n) => n.imdb.id));
  const mapa = await carregarNotasImdb(todos);
  for (const n of Object.values(notas)) if (n.imdb && n.imdb.id) { const x = mapa.get(n.imdb.id); if (x) { n.imdb.nota = x.nota; n.imdb.votos = x.votos; } }
  for (const [s, n] of Object.entries(notas)) { if (!titulos.some((t) => t.s === s)) delete notas[s]; }
  fs.writeFileSync(file, JSON.stringify(notas, null, 1));
  const com = Object.values(notas).filter((n) => (n.imdb && n.imdb.nota) || (n.mal && n.mal.nota) || (n.kitsu && n.kitsu.nota) || (n.anilist && n.anilist.nota) || n.tvmaze).length;
  console.log(`Pronto. Com nota: ${com} de ${Object.keys(notas).length}`);
}
main();
