// Imported route colours take precedence. Aliases also cover saved / OneMap
// journeys whose service is a public line name instead of a timetable route ID.
const LINES=[
  {code:'EW',name:'East West Line',color:'#189E4A',aliases:['EW','EWL','CG','CGL','East West Line','Changi Airport Branch']},
  {code:'NS',name:'North South Line',color:'#D62821',aliases:['NS','NSL','North South Line']},
  {code:'NE',name:'North East Line',color:'#844184',aliases:['NE','NEL','North East Line']},
  {code:'CC',name:'Circle Line',color:'#F2AD27',aliases:['CC','CCL','CE','CEL','Circle Line']},
  {code:'DT',name:'Downtown Line',color:'#0354A6',aliases:['DT','DTL','Downtown Line']},
  {code:'TE',name:'Thomson-East Coast Line',color:'#9D5A25',aliases:['TE','TEL','Thomson East Coast Line']},
  {code:'BP',name:'Bukit Panjang LRT',color:'#6E8270',aliases:['BP','BPLRT','Bukit Panjang LRT']},
  {code:'SK',name:'Sengkang LRT',color:'#6E8270',aliases:['SK','SKLRT','SE','SW','Sengkang LRT']},
  {code:'PG',name:'Punggol LRT',color:'#6E8270',aliases:['PG','PGLRT','PE','PW','Punggol LRT']},
];
const normal=value=>String(value??'').trim().toUpperCase().replace(/[-–—\s]+/g,' ');
const hex=value=>typeof value==='string'&&/^#?[\da-f]{6}$/i.test(value)?'#'+value.replace(/^#/,''):null;
export function railLineStyle(routeId,routes=[]){
  const value=normal(routeId),prefix=value.split('_')[0];
  const line=LINES.find(line=>line.aliases.some(alias=>normal(alias)===value||normal(alias)===prefix));
  const metadata=routes.find(route=>normal(route.id)===value)
    ??routes.find(route=>[route.shortName,route.name].some(name=>normal(name)===value))
    ??(line&&routes.find(route=>line.aliases.some(alias=>normal(alias)===normal(route.shortName))));
  return {color:hex(metadata?.color)??line?.color??'#5F6368',label:line?.code??metadata?.shortName??String(routeId||'Train'),name:line?.name??metadata?.name??String(routeId||'Train')};
}

// Use the higher-contrast foreground for each validated service colour. This
// also keeps lighter Circle, East West and LRT badges readable at small sizes.
export function railBadgeColors(routeId,routes=[]){
  const {color:background}=railLineStyle(routeId,routes);
  const channels=background.slice(1).match(/../g).map(value=>{
    const channel=parseInt(value,16)/255;
    return channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
  });
  const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  const lightContrast=1.05/(luminance+.05),darkContrast=(luminance+.05)/.05;
  return {background,foreground:lightContrast>=darkContrast?'#FFFFFF':'#000000'};
}
export function railBadgeStyle(routeId,routes=[]){
  const {background,foreground}=railBadgeColors(routeId,routes);
  return `--service-fill:${background};--service-ink:${foreground}`;
}
