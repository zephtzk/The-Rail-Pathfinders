// Official numerical fare bands. Approximate journey distances are kept separately.
export const FARE_VERSION={id:'ptc-2025-12-27.review-2026-09-19',effectiveFrom:'2025-12-27',effectiveUntil:null,reviewedAt:'2026-09-19',source:'https://www.ptc.gov.sg/fares/public-transport-fares-and-passes/',openDataSource:'https://data.gov.sg/datasets/d_2ca29f673b89e0cfddbb7c74516fa4d3/view',rulesSource:'https://www.ptc.gov.sg/fares/distance-fares-and-transfer-rules/',discountsSource:'https://www.ptc.gov.sg/fares/morning-pre-peak-fares/'};
export const ADULT_CENTS=[128,138,149,159,168,175,182,186,190,194,198,202,207,211,215,220,224,227,230,233,236,238,240,242,243,244,245,246,247,248,249,250,251,252,253,254,255,256,257];
export const CONCESSION_CENTS={senior:[69,79,87,94,100,107],pwd:[69,79,87,94,100,107],student:[52,60,66,71,74,78]};
export const RAIL_FARE_DISTANCES=[
 {id:'lta-paya-lebar-bugis-2026-09-18',from:'EW8',to:'EW12',metres:4800,adultCents:149},
 {id:'lta-tampines-bugis-2026-09-18',from:'EW2',to:'EW12',metres:14100,adultCents:202}
].map(r=>({...r,kind:'official-fare-distance',source:'https://www.lta.gov.sg/content/ltagov/en/map/fare-calculator.html',reviewedAt:'2026-09-18',method:'Manual public calculator query; Adult / MRT-LRT / listed boarding and alighting station. One continuous paid-area rail journey; direction-specific query.'}));
export const BUS_SOURCE_VERSION='439b6cf16c91eb85e11f90dfb44bd477127842c1204bdc1139c35d8048cb181e';
