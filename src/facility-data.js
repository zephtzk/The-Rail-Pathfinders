// Real coverage and authored examples are deliberately different datasets.
// No fixture coordinates are placed on the geographic map.
export const FACILITY_SCHEMA_VERSION = 1;
export const COVERAGE_REGISTRY = {
  schemaVersion: FACILITY_SCHEMA_VERSION,
  reviewedAt: '2026-09-18',
  accessibleDoorToDoor: false,
  limitation: 'No complete, independently checked indoor step-free corridor or toilet entrance path is available. Existing exterior OSM traces do not establish lift, gate, floor or doorway connectivity.',
  stations: [
    {id:'tampines',codes:['EW2','DT32'],name:'Tampines',coverage:'unknown',nodes:[],edges:[],toilets:[]},
    {id:'payalebar',codes:['EW8','CC9'],name:'Paya Lebar',coverage:'incomplete',nodes:[],edges:[],toilets:[]},
    {id:'promenade',codes:['CC4','DT15'],name:'Promenade',coverage:'unknown',nodes:[],edges:[],toilets:[]},
    {id:'bugis',codes:['EW12','DT14'],name:'Bugis',coverage:'incomplete',nodes:[],edges:[],toilets:[{
      id:'osm-node-7103685386',name:'OSM toilet near Bugis (entrance unverified)',stationId:'bugis',venue:'Near Bugis; venue unverified',
      position:{lat:1.3014362,lng:103.8571167},floor:null,entrance:null,nodeId:null,paidArea:null,access:null,openingHours:null,feeCents:null,
      wheelchair:null,seated:null,grabRails:null,verification:'incomplete',verifiedAt:null,reviewedAt:'2026-09-18',report:null,
      source:{name:'OpenStreetMap contributors',url:'https://www.openstreetmap.org/node/7103685386',license:'ODbL 1.0',licenseUrl:'https://www.openstreetmap.org/copyright',sourceTime:'2020-01-03T03:08:24Z',fetchedAt:null,archivedBy:'2026-09-18T22:04:33+08:00',archive:'data/bus/walking-evidence/osm-bugis.osm'},
      limitations:['Only amenity=toilets and position are present in the retained OSM record.','No checked entrance, floor, access, hours, fee, wheelchair provision or walking path. This is a candidate, not a suitable accessible recommendation.']
    }]}
  ]
};

const fixtureSource={name:'Authored training fixture',license:'Project code licence',url:null,reviewedAt:'2026-09-18',verification:'fixture'};
const node=(id,label,floor,x,y,type='passage',paidArea=true)=>({id,label,floor,x,y,type,paidArea,verification:'fixture',source:fixtureSource,position:null});
const edge=(id,from,to,seconds,options={})=>({id,from,to,seconds,walkingSeconds:seconds,kind:'passage',stepFree:true,accessibleGate:true,bidirectional:true,verification:'fixture',source:fixtureSource,...options});
const toilet=(id,nodeId,name,options={})=>({id,nodeId,name,stationId:'fixture-interchange',venue:'Training interchange · fictional',position:null,floor:'B1',entrance:nodeId,paidArea:true,access:'passengers',openingHours:{timezone:'Asia/Singapore',always:true},feeCents:0,wheelchair:true,seated:true,grabRails:true,verification:'fixture',verifiedAt:null,reviewedAt:'2026-09-18',source:fixtureSource,report:null,...options});
export const FIXTURE_LAYOUT={
  schemaVersion:1,id:'fixture-interchange',name:'Training interchange · fictional',codes:['FIXTURE'],fixture:true,coverage:'fixture',source:fixtureSource,
  warning:'Authored test geometry and times. This is not the layout of a real station and must not guide real travel.',
  floors:[{id:'B2',label:'B2 · platforms'},{id:'B1',label:'B1 · concourse and toilets'},{id:'L1',label:'L1 · street entrances'}],
  defaultFrom:'platform',defaultTo:'street-a',
  nodes:[
    node('platform','Platform · toward destination','B2',90,130,'platform'),node('a-bottom','Lift A · platform','B2',235,130,'lift'),node('b-bottom','Lift B · platform','B2',490,130,'lift'),
    node('stairs-bottom','Stairs · platform','B2',340,220,'stairs'),node('escalator-bottom','Escalator · platform','B2',110,220,'escalator'),
    node('a-top','Lift A · concourse','B1',235,145,'lift'),node('b-top','Lift B · concourse','B1',490,145,'lift'),
    node('toilet-a','Toilet A · paid','B1',95,60,'toilet'),node('toilet-b','Toilet B · paid','B1',490,60,'toilet'),
    node('stairs-top','Stairs · concourse','B1',320,200,'stairs'),node('escalator-top','Escalator · concourse','B1',95,235,'escalator'),
    node('gate-paid','Wide gate · paid side','B1',220,340,'gate'),node('gate-unpaid','Wide gate · unpaid side','B1',390,340,'gate',false),
    node('exit-lift-bottom','Lift C · street access','B1',515,280,'lift',false),node('staff','Station assistance','B1',515,210,'landmark',false),
    node('street-a','Exit A · destination entrance','L1',240,130,'exit',false),node('street-b','Exit B · shares Lift C','L1',490,130,'exit',false),node('toilet-outside','Toilet C · street','L1',480,260,'toilet',false)
  ],
  edges:[
    edge('platform-a','platform','a-bottom',20),edge('platform-b','platform','b-bottom',100),
    edge('lift-a','a-bottom','a-top',40,{kind:'lift',facilityId:'fixture-lift-a',walkingSeconds:10}),
    edge('lift-b','b-bottom','b-top',60,{kind:'lift',facilityId:'fixture-lift-b',walkingSeconds:10}),
    edge('toilet-a-link','a-top','toilet-a',20),edge('toilet-b-link','b-top','toilet-b',25),
    // No A-B concourse connection is asserted: fixture A depends on A, B on B.
    edge('a-gate','a-top','gate-paid',50,{bidirectional:false,description:'Training one-way passage toward gates'}),edge('b-gate','b-top','gate-paid',85),
    edge('wide-gate','gate-paid','gate-unpaid',15,{kind:'gate',facilityId:'fixture-gate',crossesFareGate:true}),
    edge('gate-exit-lift','gate-unpaid','exit-lift-bottom',35),edge('street-lift','exit-lift-bottom','street-a',45,{kind:'lift',facilityId:'fixture-lift-c',walkingSeconds:10}),
    edge('staff-link','gate-unpaid','staff',25),edge('street-toilet','street-a','toilet-outside',50),edge('second-exit','street-a','street-b',60),
    edge('stairs-approach','platform','stairs-bottom',25),edge('stairs','stairs-bottom','stairs-top',35,{kind:'stairs',stepFree:false,facilityId:'fixture-stairs'}),edge('stairs-gate','stairs-top','gate-paid',20),
    edge('escalator-approach','platform','escalator-bottom',10),edge('escalator','escalator-bottom','escalator-top',20,{kind:'escalator',stepFree:false,facilityId:'fixture-escalator'}),edge('escalator-gate','escalator-top','gate-paid',20)
  ],
  facilities:[
    {id:'fixture-lift-a',kind:'lift',label:'Lift A',stationCode:'FIXTURE',providerLiftId:'A'},
    {id:'fixture-lift-b',kind:'lift',label:'Lift B',stationCode:'FIXTURE',providerLiftId:'B'},
    {id:'fixture-lift-c',kind:'lift',label:'Lift C',stationCode:'FIXTURE',providerLiftId:'C'},
    {id:'fixture-escalator',kind:'escalator',label:'Escalator',stationCode:'FIXTURE'},
    {id:'fixture-stairs',kind:'stairs',label:'Stairs',stationCode:'FIXTURE'},
    {id:'fixture-gate',kind:'gate',label:'Wide gate',stationCode:'FIXTURE'}
  ],
  toilets:[toilet('fixture-toilet-a','toilet-a','Toilet A · training fixture'),toilet('fixture-toilet-b','toilet-b','Toilet B · training fixture'),toilet('fixture-toilet-c','toilet-outside','Toilet C · training fixture',{floor:'L1',paidArea:false,access:'public'})]
};
export const FACILITY_SCENARIOS=[
  {id:'none',label:'Training: no injected outage',closed:[]},
  {id:'lift-outage',label:'Training: closest toilet lift A unavailable',closed:['fixture-lift-a']},
  {id:'escalator-outage',label:'Training: escalator unavailable (walking profile)',closed:['fixture-escalator']},
  {id:'ambiguous',label:'Training: ambiguous lift notice',closed:[],unresolved:true},
  {id:'shared-lift',label:'Training: both apparent exits need failed lift C',closed:['fixture-lift-c']},
  {id:'no-accessible-exit',label:'Training: no supported accessible street exit',closed:['fixture-lift-a','fixture-lift-b','fixture-lift-c']}
];
export function fixtureStatuses(scenario='none',now=Date.now()){
  const selected=FACILITY_SCENARIOS.find(s=>s.id===scenario)??FACILITY_SCENARIOS[0],states={};
  for(const facility of FIXTURE_LAYOUT.facilities)states[facility.id]={status:selected.closed.includes(facility.id)?'reported-unavailable':'verified-available',evidence:'fixture',sourceTime:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString(),validUntil:new Date(now+86400000).toISOString()};
  if(selected.unresolved)for(const f of FIXTURE_LAYOUT.facilities.filter(f=>f.kind==='lift'))states[f.id]={status:'unknown',evidence:'fixture',reason:'An ambiguous maintenance notice cannot identify a lift.'};
  return states;
}

export function stationLayout(id){
  const normalized=String(id??'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(normalized==='fixtureinterchange')return structuredClone(FIXTURE_LAYOUT);
  const item=COVERAGE_REGISTRY.stations.find(s=>s.id===normalized||s.codes.some(c=>c.toLowerCase()===normalized));
  return item?{...structuredClone(item),floors:[],facilities:[],fixture:false,warning:COVERAGE_REGISTRY.limitation}:null;
}
