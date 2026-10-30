# capas-indicador

Capas de filmes, séries e animes do Indicador de Mídia.

- `pedidos.json`: lista de títulos (`t`, `tp` = anime/serie/filme, `q` busca, `wq` busca na Wikipedia, `s` slug opcional).
- Ao mudar `pedidos.json`, o GitHub Actions roda `scripts/buscar.mjs`, baixa as capas que faltam em `capas/<slug>.jpg` (360x540) e faz commit.
- `manifest.json` diz de onde veio cada capa; `faltando.json` lista o que não foi encontrado.
- Para refazer uma capa: apague `capas/<slug>.jpg` ou coloque `"refazer": true` no pedido.
