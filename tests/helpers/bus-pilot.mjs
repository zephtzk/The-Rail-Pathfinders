// Historical model arithmetic stays reproducible after R5 broadens the network.
// This fixture is a subset of real source patterns, not shipped coverage.
export function historicalBusPilot(network) {
  const patterns=network.patterns.filter(p=>['2','23','28'].includes(p.serviceNo));
  const used=new Set(patterns.flatMap(p=>p.stops.map(s=>s.stopId)));
  return {...network,patterns,stops:network.stops.filter(s=>used.has(s.id)),
    coverage:{...network.coverage,calendarMode:'legacy-pilot',weekdays:[1,2,3,4,5],earliestSeconds:34200,latestSeconds:59400},
    assumptions:{...network.assumptions,unverifiedBayStopCodes:['75009','52009','99009','10499']}};
}
