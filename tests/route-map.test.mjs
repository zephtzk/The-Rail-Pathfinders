import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {railLineStyle,routeModeStyle,journeyMapSegments,drawRouteSegments,routeLegendHTML} from '../src/route-map.js';

const routes=JSON.parse(await readFile(new URL('../public/data/rail-network.json',import.meta.url),'utf8')).routes;
const network={routes,stops:[
  {id:'A',lat:1.30,lon:103.80},{id:'B',lat:1.31,lon:103.81},
  {id:'C',lat:1.32,lon:103.82},{id:'D',lat:1.33,lon:103.83},
  {id:'unknown',lat:null,lon:null},
]};
const points=[[1.30,103.80],[1.31,103.81]];
const deepFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;};

test('every imported rail service keeps its published line colour, including branch variants',()=>{
  assert.ok(routes.some(route=>route.id==='CCL_LOOP'));
  assert.ok(routes.some(route=>route.id==='EWL_CGL'));
  for(const route of routes){
    assert.equal(railLineStyle(route.id,routes).color.toUpperCase(),'#'+route.color.toUpperCase(),route.id);
  }
  assert.equal(railLineStyle('CCL_LOOP',routes).label,'CC');
  assert.equal(railLineStyle('EWL_CGL',routes).label,'EW');
});

test('external short names and public names resolve to the same rail colours without a loaded network',()=>{
  const aliases=[
    ['CCL_BLY_PMN_1ST_TRAIN','CCL_LOOP'],['CE','CCL_LOOP'],['Circle Line','CCL_LOOP'],
    ['CG','EWL'],['East-West Line','EWL'],[' Changi Airport Branch ','EWL'],
    ['NS','NSL'],['North South Line','NSL'],['NE','NEL'],['North-East Line','NEL'],
    ['DT','DTL'],['Downtown Line','DTL'],['TE','TEL'],['Thomson–East Coast Line','TEL'],
    ['BPLRT','BP'],['SW','SK'],['Sengkang LRT','SK'],['PE','PG'],['Punggol LRT','PG'],
  ];
  for(const [alias,id] of aliases)assert.equal(railLineStyle(alias).color,railLineStyle(id,routes).color,alias);
});

test('valid imported colours take precedence and malformed values fall back safely',()=>{
  assert.equal(railLineStyle('CCL_LOOP',[{id:'CCL_LOOP',shortName:'CC',color:'#123aBc'}]).color,'#123aBc');
  assert.equal(railLineStyle('special',[{id:'special',shortName:'S',name:'Special service',color:'a1B2c3'}]).color,'#a1B2c3');
  for(const color of ['red','123','12345678','#123456;fill:red','url(javascript:alert(1))',null,undefined,123456]){
    assert.equal(railLineStyle('unlisted',[{id:'unlisted',color}]).color,'#5F6368',String(color));
    assert.equal(railLineStyle('EWL',[{id:'EWL',color}]).color,railLineStyle('EWL').color,String(color));
  }
  assert.deepEqual(railLineStyle(null),{color:'#5F6368',label:'Train',name:'Train'});
});

test('walking transitions override inherited transit modes while buses and rail retain different visual patterns',()=>{
  for(const type of ['walk','transfer','access','exit','interchange']){
    const style=routeModeStyle({type,source:{mode:'rail',routeId:'EWL'}},routes);
    assert.equal(style.mode,'walk',type);
    assert.equal(style.dashArray,'1 9',type);
  }
  const bus=routeModeStyle({type:'ride',source:{mode:'bus',serviceNo:'23A'}},routes);
  const rail=routeModeStyle({type:'ride',mode:'rail',routeId:'DTL'},routes);
  assert.equal(bus.mode,'bus');assert.equal(bus.label,'Bus 23A');assert.equal(bus.dashArray,null);
  assert.equal(rail.mode,'rail');assert.equal(rail.color,railLineStyle('DTL',routes).color);
  assert.notEqual(bus.color,rail.color);assert.notEqual(bus.weight,rail.weight);
});

test('local segments draw access, transfer and exit as walking and omit stationary allowances and waits',()=>{
  const route={legs:[
    {type:'access',fromStopId:'A',toStopId:'B'},
    {type:'wait',fromStopId:'B',toStopId:'B'},
    {type:'ride',mode:'rail',routeId:'EWL',stopIds:['B','C']},
    {type:'transfer',mode:'rail',fromStopId:'C',toStopId:'D',pathId:'reviewed'},
    {type:'ride',mode:'bus',serviceNo:'23A',stopIds:['D','C']},
    {type:'exit',fromStopId:'C',toStopId:'B'},
    {type:'access',fromStopId:'B',toStopId:'B'},
  ]};
  const walking={links:[{id:'reviewed',path:{waypoints:[{lat:1.32,lng:103.82},{lat:1.325,lon:103.825},{lat:1.33,lng:103.83}]}}]};
  const segments=journeyMapSegments(route,{network,walking});
  assert.deepEqual(segments.map(segment=>segment.mode),['walk','rail','walk','bus','walk']);
  assert.equal(segments[2].schematic,false);assert.equal(segments[2].points.length,3);
  assert.ok(segments.filter((_,i)=>i!==2).every(segment=>segment.schematic));
  assert.deepEqual(journeyMapSegments({legacyRoute:route},{network,walking}),segments);
  assert.deepEqual(journeyMapSegments({steps:route.legs.map(source=>({type:source.type,source}))},{network,walking}),segments);
});

test('missing intermediate coordinates cannot turn a route into a false straight shortcut',()=>{
  const route={legs:[
    {type:'ride',mode:'rail',routeId:'EWL',stopIds:['A','unknown','D']},
    {type:'ride',mode:'bus',serviceNo:'1',stopIds:['A','missing','D']},
    {type:'transfer',fromStopId:'A',toStopId:'D',pathId:'broken'},
  ]};
  const walking={links:[{id:'broken',path:{waypoints:[{lat:1.3,lon:103.8},{lat:NaN,lon:103.82},{lat:1.33,lon:103.83}]}}]};
  assert.deepEqual(journeyMapSegments(route,{network,walking}),[]);
});

test('external geometry uses canonical stepIndex through inserted waits without changing accepted geometry',()=>{
  const route=deepFreeze({steps:[
    {type:'walk',source:{mode:'walk'}},{type:'wait'},
    {type:'ride',source:{mode:'bus',serviceNo:'23A'}},{type:'wait'},
    {type:'ride',source:{mode:'rail',routeId:'Circle Line'}},
  ],geometry:[
    {stepIndex:0,kind:'provider',points:structuredClone(points)},
    {stepIndex:2,kind:'schematic',points:[[1.31,103.81],[1.32,103.82]]},
    {stepIndex:4,kind:'provider',points:[[1.32,103.82],[1.33,103.83]]},
  ]});
  const before=JSON.stringify(route),segments=journeyMapSegments(route,{network});
  assert.deepEqual(segments.map(segment=>segment.mode),['walk','bus','rail']);
  assert.deepEqual(segments.map(segment=>segment.schematic),[false,true,false]);
  assert.equal(segments[1].label,'Bus 23A');assert.equal(segments[2].color,railLineStyle('CCL_LOOP',routes).color);
  assert.deepEqual(segments.map(segment=>segment.points),route.geometry.map(segment=>segment.points));
  const drawn=[],layer={},leaflet={polyline:(coords,options)=>({addTo:target=>{assert.equal(target,layer);drawn.push({coords,options});}})};
  const result=drawRouteSegments(layer,segments,{leaflet,markers:false});
  assert.equal(result.schematic,true);assert.deepEqual(result.points,route.geometry.flatMap(segment=>segment.points));
  assert.equal(JSON.stringify(route),before);
  const lines=drawn.filter(item=>item.options.className.startsWith('journey-route-line'));
  assert.deepEqual(lines.map(item=>item.options.color),segments.map(segment=>segment.color));
  assert.equal(lines[0].options.dashArray,'1 9');assert.equal(lines[1].options.dashArray,null);assert.equal(lines[2].options.dashArray,null);
  assert.equal(drawn.filter(item=>item.options.className==='journey-bus-detail').length,1);
  assert.ok(drawn.slice(0,segments.length).every(item=>item.options.className.startsWith('journey-route-halo')));
  assert.ok(drawn.every(item=>item.options.interactive===false));
});

test('malformed external geometry is ignored rather than drawn against an unrelated instruction',()=>{
  const route={steps:[{type:'ride',source:{mode:'rail',routeId:'EWL'}}],geometry:[
    {stepIndex:8,kind:'provider',points},
    {stepIndex:0,kind:'provider',points:[[1.3,103.8],[null,103.9]]},
    {stepIndex:0,kind:'provider',points:[[1.3,103.8]]},
  ]};
  assert.deepEqual(journeyMapSegments(route,{network}),[]);
});

test('legend groups repeated modes, keeps rail lines distinct and escapes provider labels',()=>{
  const unsafe='<img src=x onerror="alert(1)">';
  const segments=[
    routeModeStyle({type:'walk'}),routeModeStyle({type:'transfer'}),
    routeModeStyle({type:'ride',mode:'bus',serviceNo:'23A'}),routeModeStyle({type:'ride',mode:'bus',serviceNo:'99'}),
    routeModeStyle({type:'ride',mode:'rail',routeId:'EW'}),routeModeStyle({type:'ride',mode:'rail',routeId:'EWL_CGL'}),
    routeModeStyle({type:'ride',mode:'rail',routeId:'DT'}),
    routeModeStyle({type:'ride',mode:'rail',routeId:unsafe},[{id:unsafe,color:'red;--route-color:url(x)',name:unsafe}]),
  ];
  const html=routeLegendHTML(segments);
  assert.equal((html.match(/class="map-route-key /g)??[]).length,5);
  assert.match(html,/Walking/);assert.match(html,/>Bus</);assert.match(html,/>EW</);assert.match(html,/>DT</);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(html,/<img|url\(x\)|red;--route-color/);
  assert.equal(routeLegendHTML([]),'');
});
