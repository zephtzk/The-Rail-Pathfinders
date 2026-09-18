// Rebuild shipped data from independently validated OSM extracts supplied with engineering evidence.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const input=process.argv[2];if(!input)throw Error('Usage: node scripts/import-corridor.mjs PATH_TO_RESEARCH_DATA');
const read=async name=>JSON.parse(await readFile(`${input}/${name}`,'utf8'));
const ids={EW2:'tampines',EW3:'simei',EW4:'tanahmerah',EW5:'bedok',EW6:'kembangan',EW7:'eunos',EW8:'payalebar',EW9:'aljunied',EW10:'kallang',EW11:'lavender',EW12:'bugis',CC9:'payalebar',CC8:'dakota',CC7:'mountbatten',CC6:'stadium',CC5:'nicoll',CC4:'promenade',DT15:'promenade',DT14:'bugis'};
const rails=await read('corridor-rails.geojson'),transfers=await read('corridor-transfer-connectors.geojson'),stations=await read('corridor-stations.json');
for(const f of rails.features){f.properties.fromCode=f.properties.from;f.properties.toCode=f.properties.to;f.properties.from=ids[f.properties.from];f.properties.to=ids[f.properties.to];}
for(const f of transfers.features){f.properties.kind='interchange';f.properties.name=f.properties.station;}
const result={...rails,features:[...rails.features,...transfers.features],stations:stations.stations};
await mkdir('public/data',{recursive:true});await writeFile('public/data/corridor.json',JSON.stringify(result));
console.log(`Imported ${rails.features.length} rail segments, ${transfers.features.length} illustrative interchange connections, ${stations.stations.length} directional station positions.`);
