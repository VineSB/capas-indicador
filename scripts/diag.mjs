const UA = "capas-indicador/1.0 (https://github.com/VineSB/capas-indicador)";
const urls = [
 "https://itunes.apple.com/search?term=nobody&media=movie&limit=5",
 "https://itunes.apple.com/search?term=nobody&entity=movie&limit=5",
 "https://itunes.apple.com/search?term=nobody&media=movie&entity=movie&country=us&limit=5",
 "https://itunes.apple.com/search?term=edge+of+tomorrow&media=movie&country=us",
 "https://itunes.apple.com/search?term=matrix&media=movie&limit=1",
 "https://itunes.apple.com/us/search?term=nobody&media=movie",
 "https://pt.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=Anonimo%20filme%20Bob%20Odenkirk&gsrlimit=5&prop=pageimages&piprop=thumbnail&pithumbsize=500&format=json&formatversion=2",
 "https://pt.wikipedia.org/w/api.php?action=query&titles=Nobody%20(filme)|Edge%20of%20Tomorrow|No%20Limite%20do%20Amanh%C3%A3|Wind%20River|Red%20Sparrow|O%20Contador|Kate%20(filme)&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=300&format=json&formatversion=2",
];
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    const t = await r.text();
    console.log(r.status, u.slice(0, 110), "\n   ", t.slice(0, 400).replace(/\s+/g, " "));
  } catch (e) { console.log("ERRO", u.slice(0, 80), e.message); }
}
