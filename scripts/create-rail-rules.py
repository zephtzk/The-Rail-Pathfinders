"""Materialise reviewed platform pairs; never infer interchange paths from coordinates."""
import csv
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAP = 'https://www.lta.gov.sg/content/dam/ltagov/getting_around/public_transport/rail_network/pdf/SM_EN_(Ver210726)_CCL6.pdf'
# Individually reviewed STANDARD interchange codes on SM-26-01-EN, 21 July 2026.
# These codes establish interchange topology, not a surveyed path or minimum duration.
# Newton, Tampines and Bukit Panjang tap-out interchanges intentionally omitted.
GROUPS = [
 ('Jurong East','NS1 EW24',300), ('Woodlands','NS9 TE2',420),
 ('Bishan','NS17 CC15',300), ('Orchard','NS22 TE14',420),
 ('Dhoby Ghaut','NS24 NE6 CC1',480), ('City Hall','NS25 EW13',300),
 ('Raffles Place','NS26 EW14',300), ('Marina Bay','NS27 CC33 TE20',480),
 ('Tanah Merah','EW4 CG',300), ('Paya Lebar','EW8 CC9',240),
 ('Bugis','EW12 DT14',420), ('Outram Park','EW16 NE3 TE17',480),
 ('Buona Vista','EW21 CC22',300), ('Expo','CG1 DT35',420),
 ('HarbourFront','NE1 CC29',300), ('Chinatown','NE4 DT19',300),
 ('Little India','NE7 DT12',300), ('Serangoon','NE12 CC13',300),
 ('Sengkang','NE16 STC',300), ('Punggol','NE17 PTC',300),
 ('Promenade','CC4 DT15',240), ('MacPherson','CC10 DT26',300),
 ('Caldecott','CC17 TE9',420), ('Botanic Gardens','CC19 DT9',420),
 ('Bayfront','CC34 DT16',300), ('Stevens','DT10 TE11',420),
 ('Choa Chu Kang','NS4 BP1',420),
]

def main():
 with zipfile.ZipFile(ROOT/'data/rail/sources/lta-train-2026-09-18.zip') as z:
  stops=list(csv.DictReader(io.TextIOWrapper(z.open('stops.txt'),encoding='utf-8-sig')))
  routes=list(csv.DictReader(io.TextIOWrapper(z.open('routes.txt'),encoding='utf-8-sig')))
  used={r['stop_id'] for r in csv.DictReader(io.TextIOWrapper(z.open('stop_times.txt'),encoding='utf-8-sig'))}
 byid={r['stop_id']:r for r in stops}
 transfers=[]
 for stop in sorted(used):
  transfers.append(dict(fromStopId=stop,toStopId=stop,seconds=60,walkSeconds=0,
    provenance='GTFS identical stop_id: remain at the same boarding platform. One-minute reboarding allowance is assumed.',assumed=True))
 for name,codes,seconds in GROUPS:
  ids=[code+'_'+direction for code in codes.split() for direction in ['A','B']]
  for stop in ids:
   assert stop in byid and stop in used, f'{name}: missing used platform {stop}'
   assert byid[stop]['stop_name']==name, f'{name}: changed platform identity {stop}'
  for a in ids:
   for b in ids:
    if a==b:continue
    transfers.append(dict(fromStopId=a,toStopId=b,seconds=seconds,walkSeconds=seconds,
     provenance=f'{MAP} ; standard interchange {name}, codes {codes}; reviewed 2026-09-18. Platform membership checked against source GTFS. Follow station signs; duration assumed.',assumed=True))
 rules=dict(schemaVersion=1,timeZone='Asia/Singapore',includeRouteIds=sorted(r['route_id'] for r in routes),
  excludedRoutes={},excludedTrips={'CCL_Clockwise_Loop_WD_1':'Source zero-second ride CC10_B to CC9_B at 07:06:40; whole trip quarantined without invented timing.'},transfers=transfers,assumptions=dict(accessSeconds=120,exitSeconds=120),
  reviewedAt='2026-09-18',validationStartDate='2026-09-18',validationEndDate='2026-12-31',topologySource=MAP,
  transferPolicy='Only the listed standard interchange platform pairs and identical-stop reboarding. No proximity, name or common-parent inferred transfer.',
  unsupportedConnections=[
   {'station':'Newton','codes':['NS21','DT11'],'reason':'Tap-out walking connection not validated'},
   {'station':'Tampines','codes':['EW2','DT32'],'reason':'Tap-out walking connection not validated'},
   {'station':'Bukit Panjang','codes':['BP6','DT1'],'reason':'Tap-out walking connection not validated'},
  ],geometryPolicy='GTFS platform coordinates support rail schematics only; no shapes or pedestrian geometry provided.',
  accessPolicy='Station-to-station planning starts at an unspecified station access point, with assumed 2-minute access and exit. Entrance selection and accessibility are unsupported.')
 (ROOT/'data/rail/validation.json').write_text(json.dumps(rules,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f'Wrote {len(transfers)} directed transfer rules across {len(GROUPS)} standard interchanges.')

if __name__=='__main__':main()
