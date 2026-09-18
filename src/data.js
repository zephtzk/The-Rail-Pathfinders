// Coordinates are WGS84 [latitude, longitude]. Geometry provenance: public/data/sources.json.
export const STATIONS = {
  tampines: {name:'Tampines',code:'EW2',lat:1.3534,lng:103.9451},
  simei: {name:'Simei',code:'EW3',lat:1.3432,lng:103.9534},
  tanahmerah: {name:'Tanah Merah',code:'EW4',lat:1.3272,lng:103.9464},
  bedok: {name:'Bedok',code:'EW5',lat:1.3239,lng:103.9290},
  kembangan: {name:'Kembangan',code:'EW6',lat:1.3211,lng:103.9129},
  eunos: {name:'Eunos',code:'EW7',lat:1.3198,lng:103.9033},
  payalebar: {name:'Paya Lebar',code:'EW8 / CC9',lat:1.3178,lng:103.8928},
  aljunied: {name:'Aljunied',code:'EW9',lat:1.3164,lng:103.8829},
  kallang: {name:'Kallang',code:'EW10',lat:1.3115,lng:103.8714},
  lavender: {name:'Lavender',code:'EW11',lat:1.3074,lng:103.8628},
  bugis: {name:'Bugis',code:'EW12 / DT14',lat:1.3005,lng:103.8559},
  dakota: {name:'Dakota',code:'CC8',lat:1.3085,lng:103.8886},
  mountbatten: {name:'Mountbatten',code:'CC7',lat:1.3062,lng:103.8825},
  stadium: {name:'Stadium',code:'CC6',lat:1.3028,lng:103.8754},
  nicoll: {name:'Nicoll Highway',code:'CC5',lat:1.2998,lng:103.8636},
  promenade: {name:'Promenade',code:'CC4 / DT15',lat:1.2934,lng:103.8611}
};
export const EW_EAST = ['tampines','simei','tanahmerah','bedok','kembangan','eunos','payalebar'];
export const EW_WEST = ['payalebar','aljunied','kallang','lavender','bugis'];
export const CC = ['payalebar','dakota','mountbatten','stadium','nicoll','promenade'];
export const DT = ['promenade','bugis'];
export const DEFAULT_INPUT = {origin:'tampines',destination:'bugis',date:'2026-09-19',departure:'08:10',deadline:'09:00',walkingLimit:12,preference:'fastest',detourLimit:10};
export function demoEvent(kind,date='2026-09-19') {
  if (!['planned','disruption'].includes(kind)) return [];
  return [{id:`replay-${kind}-1`,revision:1,kind,source:'replay',line:'EW',direction:'west',from:'payalebar',to:'aljunied',startsAt:`${date}T08:00:00+08:00`,endsAt:`${date}T10:00:00+08:00`,closed:kind==='planned',delayMinutes:kind==='disruption'?22:0,title:kind==='planned'?'Planned track works':'Signal fault after Paya Lebar',description:kind==='planned'?'Westbound service is suspended between Paya Lebar and Aljunied, 08:00–10:00.':'A simulated 22-minute delay affects westbound travel from Paya Lebar to Aljunied.'}];
}
