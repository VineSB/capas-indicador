// Busca capas para os títulos de pedidos.json e salva em capas/<slug>.jpg (360x540).
// Roda no GitHub Actions (internet livre). Só baixa o que ainda não existe.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "capas");
const UA = "capas-indicador/1.0 (https://github.com/VineSB/capas-indicador)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nz = (x) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const slug = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

async function getJson(url, opt = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { ...opt, headers: { "User-Agent": UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(20000) });
    if (r.status === 429 || r.status === 403) { await sleep(4000 * (i + 1)); continue; }
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.json();
  }
  throw new Error("limite de requisições: " + url);
}

const fAnilist = async (q) => {
  const j = await getJson("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: "query($s:String){Media(search:$s,type:ANIME){title{romaji english} coverImage{extraLarge large}}}", variables: { s: q } }) });
  const m = j.data && j.data.Media; return m && m.coverImage ? { url: m.coverImage.extraLarge || m.coverImage.large, matched: (m.title.english || m.title.romaji) + " (AniList)" } : null;
};
const fKitsu = async (q) => {
  const j = await getJson("https://kitsu.io/api/edge/anime?filter%5Btext%5D=" + encodeURIComponent(q) + "&page%5Blimit%5D=1", { headers: { Accept: "application/vnd.api+json" } });
  const d = j.data && j.data[0]; const a = d && d.attributes; const img = a && a.posterImage; return img ? { url: img.large || img.original || img.medium, matched: (a.titles.en || a.titles.en_jp || a.canonicalTitle) + " (Kitsu)" } : null;
};
const fTvmaze = async (q) => {
  const j = await getJson("https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(q)); const d = j[0] && j[0].show;
  return d && d.image ? { url: d.image.original || d.image.medium, matched: d.name + " (TVmaze)" } : null;
};
const fItunes = async (q) => {
  const j = await getJson("https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&country=br&media=movie&entity=movie&limit=8");
  const rs = (j.results || []).filter((x) => x.artworkUrl100), nq = nz(q);
  const bons = rs.filter((x) => nz(x.trackName).startsWith(nq));
  const d = bons.length ? bons.sort((x, y) => String(x.releaseDate).localeCompare(String(y.releaseDate)))[0] : rs[0];
  return d ? { url: d.artworkUrl100.replace("100x100bb", "400x600bb"), matched: d.trackName + " (iTunes)" } : null;
};
const fWiki = async (q, lang) => {
  const j = await getJson("https://" + lang + ".wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=" + encodeURIComponent(q) + "&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&formatversion=2");
  const ps = ((j.query && j.query.pages) || []).filter((x) => x.thumbnail).sort((a, b) => a.index - b.index);
  const nq = nz(q.replace(/ (film|filme)$/i, "")), bom = ps.find((x) => nz(x.title).includes(nq)) || ps[0];
  return bom ? { url: bom.thumbnail.source, matched: bom.title + " (Wikipedia " + lang + ")" } : null;
};
const tryAll = async (fns) => { for (const f of fns) { try { const r = await f(); if (r) return r; } catch (e) { console.log("   fonte falhou:", String(e.message).slice(0, 120)); } } return null; };

export async function achar(it) {
  const q = it.q || it.t;
  if (it.tp === "anime") return tryAll([() => fAnilist(q), () => fKitsu(q), () => fTvmaze(q)]);
  if (it.tp === "serie") return tryAll([() => fTvmaze(q), () => fWiki(q + " série", "pt"), () => fWiki(q + " TV series", "en")]);
  const wq = it.wq;
  if (wq) return tryAll([() => fWiki(wq, "en"), () => fWiki(wq, "pt"), () => fItunes(q)]);
  return tryAll([() => fItunes(q), () => fWiki(q + " filme", "pt"), () => fWiki(q + " film", "en")]);
}

async function salvar(url, file) {
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error("imagem HTTP " + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  let sharp = null; try { sharp = (await import("sharp")).default; } catch {}
  if (sharp) fs.writeFileSync(file, await sharp(buf).resize(360, 540, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer());
  else fs.writeFileSync(file, buf);
}

async function main() {
  const pedidos = JSON.parse(fs.readFileSync(path.join(ROOT, "pedidos.json"), "utf8"));
  fs.mkdirSync(OUT, { recursive: true });
  const mf = path.join(ROOT, "manifest.json");
  const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
  const wait = { anime: 800, serie: 500, filme: 1200 };
  let ok = 0, falta = [];
  for (const it of pedidos) {
    const s = it.s || slug(it.t), file = path.join(OUT, s + ".jpg");
    if (fs.existsSync(file) && !it.refazer) { ok++; continue; }
    try {
      const f = await achar(it);
      if (!f) { falta.push(it.t); console.log("não achei:", it.t); }
      else { await salvar(f.url, file); manifest[s] = { titulo: it.t, achou: f.matched }; ok++; console.log("ok:", it.t, "->", f.matched); }
    } catch (e) { falta.push(it.t); console.log("erro:", it.t, String(e.message).slice(0, 160)); }
    await sleep(wait[it.tp] || 800);
  }
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
  fs.writeFileSync(path.join(ROOT, "faltando.json"), JSON.stringify(falta, null, 1));
  console.log(`Pronto. Com capa: ${ok}. Sem capa: ${falta.length}${falta.length ? " (" + falta.join(", ") + ")" : ""}`);
}
if (process.argv[1] && process.argv[1].endsWith("buscar.mjs")) main();
