// Operator location facts are advisory records, never routing nodes or edges.
const reviewedAt='2026-09-19';
const source=code=>({name:'SBS Transit station information',url:`https://www.sbstransit.com.sg/Service/TrainInformation?Station=${code}&TrainLine=DTL`,reviewedAt,sourceUpdatedAt:null,method:'Official web page desk review',evidenceClass:'operator-documented'});
export const STATION_FACTS=Object.freeze([
  {id:'bugis',name:'Bugis',codes:['EW12','DT14'],scope:'Downtown Line station facilities',source:source('BGS'),facts:[{kind:'lift',text:'Street-to-concourse lifts: exits D and E. A lift connects the concourse and platform.'},{kind:'toilet',text:'The operator lists toilets on the concourse near Exit E.'}],limitations:['Existing exterior paths at exits A/B do not connect to the documented D/E lifts in a verified graph.']},
  {id:'tampines',name:'Tampines',codes:['EW2','DT32'],scope:'Downtown Line station facilities',source:source('TAM'),facts:[{kind:'lift',text:'The operator lists lifts at exits D and E, plus a lift between concourse and platform.'},{kind:'toilet',text:'Toilets are listed on the concourse.'}],limitations:['An exit description linking the rail lines does not establish a checked interchange corridor.']},
  {id:'promenade',name:'Promenade',codes:['CC4','DT15'],scope:'Downtown Line station facilities',source:source('PMN'),facts:[{kind:'lift',text:'Street-to-concourse lifts: exits A and C. Lift access between concourse and platforms is documented.'},{kind:'toilet',text:'The operator locates toilets on the concourse near Exit A.'}],limitations:[]},
]);
// Empty deliberately: a lift location or station diagram cannot establish a
// complete, permitted doorway/gate/floor/platform/toilet corridor in both ways.
export const VERIFIED_INDOOR_CORRIDORS=Object.freeze([]);
export const INDOOR_COVERAGE=Object.freeze({reviewedAt,verifiedRealCorridors:0,fieldSurveyPerformed:false,title:'Work in progress — indoor guidance',message:'The entrance, gate, lift or interchange path for this step has not been verified. Follow station signs and ask staff to check the route.',dependency:'Permitted, inspectable corridor evidence connecting the entrance, gates, floor and lift transitions, platform and toilet doorway, including both directions and access conditions.'});
const normal=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function stationFacts(value){const raw=normal(value),publicCode=String(value??'').trim().toUpperCase().replace(/_[A-Z0-9]+$/,'');return STATION_FACTS.find(s=>s.id===raw||s.codes.includes(publicCode)||raw===normal(s.name))??null;}
export function isRailStation(value){return /^(?:CC|CE|EW|CG|NS|NE|DT|TE|BP|SE|SW|PE|PW)\d+(?:_|$)/i.test(String(value??''))||!!stationFacts(value);}
export function indoorCoverageForStep(step,{fixture=false,detour=false}={}){
  if(!step)return null;
  if(fixture)return {kind:'fixture',title:'Training station — fictional',message:'These indoor directions are a rehearsal and must not guide travel in a real station.'};
  const source=step.source??step,type=step.type??source.type;
  const from=step.fromStopId??source.fromStopId,to=step.toStopId??source.toStopId;
  const busOnly=[from,to].filter(Boolean).length>0&&[from,to].filter(Boolean).every(id=>String(id).startsWith('bus:'));
  const enclosed=source.indoor===true||step.indoor===true||detour||(['access','transfer','exit'].includes(type)&&!busOnly&&(source.mode==='rail'||[from,to,step.stationId,source.station].some(isRailStation)));
  if(!enclosed)return null;
  return {kind:'work-in-progress',title:INDOOR_COVERAGE.title,message:INDOOR_COVERAGE.message};
}
