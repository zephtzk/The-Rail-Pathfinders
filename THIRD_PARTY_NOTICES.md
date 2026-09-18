# Third-party data and evidence

The application code is MIT licensed. That licence does not replace the following rights.

Publication update: the owner confirmed written redistribution permission for the two operator maps on 18 September 2026; see [the authorization record](docs/PUBLICATION_AUTHORIZATION.md). The agent has not independently reviewed that document. Original copyright notices remain and no broad relicensing is claimed. This supersedes the earlier missing-permission finding below.

| Material | Attribution / licence | Included use |
| --- | --- | --- |
| Rail GTFS, bus directories and DataMall-derived data | Land Transport Authority (LTA), Singapore; [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence) | Pinned snapshots, compiled routing data and sanitised evidence; retrieval and hashes in manifests. No endorsement implied. |
| Corridor geometry, archived walking `.osm` extracts and derived walking data | © OpenStreetMap contributors; [copyright notice](https://www.openstreetmap.org/copyright), [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Source extracts and derived data retained with their source ledger and applicable database licence. |
| `data/bus/walking-evidence/smrt-bugis-map.jpg` and `smrt-paya-lebar-map.jpg` | Maps obtained from SMRT locality-map pages; images carry © Land Transport Authority and retain original rights. | Archived topology evidence. No redistribution permission is recorded. They are in the unpublished Git history, but are not copied into the application's client assets or Worker. Review before making that history public; deleting current files would not remove historical copies. |
| Leaflet 1.9.4 | BSD-2-Clause | Licence copied to `/vendor/leaflet-LICENSE.txt` in the build. |

The walking acquisition ledger is `data/bus/walking-evidence/acquisition.json`; path sources and hashes are in `data/bus/walking-links.json`. Attribution is not permission to relicense the operator maps. This readiness pass preserves history and records the unresolved evidence-rights item for publication review.

Research documentation retains public provenance references. Product pages use plain-text LTA credit and the data.gov.sg licence link; the recorded account-specific direct DataMall hyperlink question remains a separate follow-up.

## QR Code Generator

`qrcode-generator` 2.0.4 by Kazuhiko Arase (MIT) creates sharing QR codes entirely in the browser. Source: https://github.com/kazuhikoarase/qrcode-generator. The installed distribution retains its copyright and MIT permission notice; the build ships that distribution. No trip link is sent to a QR service.
