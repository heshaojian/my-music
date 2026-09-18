# Community Plugin Provenance

MyMusic includes reviewed snapshots of selected community plugins for private,
personal use. Their inclusion does not grant rights to copyrighted content,
guarantee provider availability, or authorize use that violates a provider's
terms. Users remain responsible for content access and local law.

The executable snapshots originate from
[`maotoumao/MusicFreePlugins`](https://github.com/maotoumao/MusicFreePlugins)
at commit `e88f5dea5ea7b2b60ccb3aae6823ca38ec71c5d0`, licensed under
`GPL-3.0`. The last source and endpoint review was 2026-09-17.

| Provider | Trust | Availability | Upstream path and original SHA-256 | MyMusic version | Review transformations and allowed hosts |
| --- | --- | --- | --- | --- | --- |
| 网易云 | Community | Bundled | `dist/netease/index.js`<br>`d7d2870acbcca6aaaff6e8d16853f1d3db8ff7342cc5a35cebbf79e20eceebce` | `0.2.4-mymusic.1` | Removed remote update metadata; HTTPS-only requests and media validation. Hosts: `music.163.com`, `music.126.net`. |
| QQ音乐 | Community | Unavailable | `dist/qq/index.js`<br>`983ec034fe343b3fba7d08defff2ee0f9f049291d93aa34bcf667b754fd4ca01` | N/A | No safe source: on 2026-09-17 live search worked, but no standard HTTPS playback URL on an approved host was returned. The snapshot remains only for provenance and audit; it is not registered for app execution or repairable. |
| 酷我 | Community | Bundled | `dist/kuwo/index.js`<br>`aef76a4fe81fa8bea8eda709666eadd6fe99df5137383978719ac5f925310096` | `0.1.8-mymusic.1` | Upgraded static endpoints; standard/free playback only; HTTPS-only media validation. Host: `kuwo.cn`. |
| 咪咕 | Community | Unavailable | `dist/migu/index.js`<br>`45a7d9be59b3fef7e2bc1c7fa2205a12b98776abf560dd5d287acb0b1103659f` | N/A | No safe source: on 2026-09-17 live search failed before returning usable data (`TypeError`, with provider details redacted). The snapshot remains only for provenance and audit; it is not registered for app execution or repairable. |
| 喜马拉雅 | Community | Unavailable | `dist/xmly/index.js`<br>`ab283d5544c4b40ee53ce9a984c3dcc3bfb39b7c66a443e2497cb6132de4cdce` | N/A | No safe source: on 2026-09-17 live search failed before returning usable data (`TypeError`, with provider details redacted). The snapshot remains only for provenance and audit; it is not registered for app execution or repairable. |
| 5sing | Community | Unavailable | Historical candidate<br>`552ba8baacee803db525a0fe76fb063f628a54fbb6c9c23fbc5062e712ca20d1` | N/A | No safe source: required search and service subdomains failed valid HTTPS certificate checks. No code is shipped or executed. |
| 酷狗 | Community | Unavailable | Historical candidate<br>`c4072abb655cba39ff1352982110131d2cdde89318a9dba81badd5c5a221f21a` | N/A | No safe source: required mobile search and ranking subdomains failed valid HTTPS certificate checks. No code is shipped or executed. |
| 汽水音乐 | Community | Unavailable | Community copies reviewed; no distributable licensed snapshot accepted | N/A | No safe source: candidates lacked a distributable license or required a plaintext third-party signing relay. No code is shipped or executed. |

Vendored sources are pinned, audited during generation, and contain no runtime
catalog or code download URL. Only entries marked Bundled are registered for
execution. Unavailable entries are informational reservations: they cannot be
repaired, installed from the catalog, executed, or replaced by a remote row with
the same provider name. A rejected snapshot may remain in the source tree solely
to preserve reproducible provenance and policy-test evidence.
