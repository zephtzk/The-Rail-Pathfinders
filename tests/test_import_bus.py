"""Synthetic adversarial bus import cases and pinned real-source reproduction."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('import_bus', ROOT/'scripts/import-bus.py')
bus = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bus)

def fixture():
    stops=[{'BusStopCode':code,'Description':name,'RoadName':'Fixture Road','Latitude':1.3,'Longitude':103.8}
           for code,name in [('01001','Alpha'),('01002','Beta'),('01003','Opposite Beta')]]
    service={'ServiceNo':'2A','Operator':'TEST','Direction':1,'OriginCode':'01001','DestinationCode':'01001','LoopDesc':'Beta'}
    service.update({field:'05-12' for field in bus.FREQUENCIES})
    routes=[]
    for seq,code in enumerate(('01001','01002','01001'),1):
        row={'ServiceNo':'2A','Operator':'TEST','Direction':1,'StopSequence':seq,'BusStopCode':code,'Distance':seq-1}
        for day in bus.DAYS:
            row.update({day+'_FirstBus':'0600',day+'_LastBus':'0030'})
        routes.append(row)
    rules={'sourceVersion':'fixture','serviceNumbers':['2A'],'coverage':{'earliestSeconds':34200,'latestSeconds':59400},'assumptions':{'waitField':'AM_Offpeak_Freq'}}
    return {'BusStops':stops,'BusServices':[service],'BusRoutes':routes},{'version':'fixture','retrievedAt':'2026-09-18T00:00:00Z'},rules

class BusImportTests(unittest.TestCase):
    def test_variant_and_repeated_stop_occurrences_are_preserved(self):
        network,audit=bus.compile_records(*fixture())
        pattern=network['patterns'][0]
        self.assertEqual(pattern['id'],'2A:TEST:1')
        self.assertTrue(pattern['loop'])
        self.assertEqual([row['visitNumber'] for row in pattern['stops']],[1,1,2])
        self.assertEqual(pattern['stops'][0]['stopId'],'01001')
        self.assertEqual(audit['acceptedCounts']['BusStops'],2)
        self.assertEqual(audit['repeatedStopOccurrences'],1)

    def test_variant_never_falls_back_to_parent_service(self):
        data,metadata,rules=fixture()
        rules['serviceNumbers']=['2']
        with self.assertRaisesRegex(ValueError,'absent'):
            bus.compile_records(data,metadata,rules)

    def test_midnight_and_rollover_audit(self):
        self.assertEqual(bus.hhmm('2400'),86400)
        self.assertEqual(bus.first_last('0600','0030'),([21600,88200],True))
        self.assertEqual(bus.first_last('-','-'),(None,False))
        for value in ('0060','2401','2500','6:00',600):
            with self.subTest(value=value),self.assertRaises(ValueError):
                bus.hhmm(value)
        with self.assertRaises(ValueError):
            bus.first_last('-','2300')

    def test_duplicate_identifier_with_conflicting_content_fails(self):
        data,metadata,rules=fixture()
        duplicate=copy.deepcopy(data['BusRoutes'][0])
        duplicate['Distance']=99
        data['BusRoutes'].append(duplicate)
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            bus.compile_records(data,metadata,rules)

    def test_orphan_stop_and_service_fail(self):
        for endpoint in ('BusStops','BusServices'):
            data,metadata,rules=fixture()
            data[endpoint]=data[endpoint][1:]
            with self.subTest(endpoint=endpoint),self.assertRaises(ValueError):
                bus.compile_records(data,metadata,rules)

    def test_gaps_and_boundary_truncation_fail(self):
        for index in (0,1,2):
            data,metadata,rules=fixture()
            del data['BusRoutes'][index]
            with self.subTest(index=index),self.assertRaises(ValueError):
                bus.compile_records(data,metadata,rules)

    def test_wrong_direction_not_reinterpreted(self):
        data,metadata,rules=fixture()
        data['BusServices'][0]['Direction']=2
        with self.assertRaises(ValueError):
            bus.compile_records(data,metadata,rules)

    def test_decreasing_distance_and_numeric_stop_code_fail(self):
        for field,value in [('Distance',-1),('BusStopCode',1002)]:
            data,metadata,rules=fixture()
            data['BusRoutes'][1][field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):
                bus.compile_records(data,metadata,rules)

    def test_missing_or_invalid_headways_fail(self):
        for value in ('-','0-5','12-5','often','2-181'):
            data,metadata,rules=fixture()
            data['BusServices'][0]['AM_Offpeak_Freq']=value
            with self.subTest(value=value),self.assertRaises(ValueError):
                bus.compile_records(data,metadata,rules)

    def test_no_service_or_late_start_rejects_window(self):
        for start,end in [('-','-'),('1100','2300'),('0600','1500')]:
            data,metadata,rules=fixture()
            data['BusRoutes'][1].update(WD_FirstBus=start,WD_LastBus=end)
            with self.subTest(start=start),self.assertRaises(ValueError):
                bus.compile_records(data,metadata,rules)

    def test_pinned_full_source_is_reproducible(self):
        source=ROOT/'data/bus/sources/lta-bus-2026-09-18-439b6cf16c91'
        with tempfile.TemporaryDirectory() as directory:
            output,manifest=Path(directory)/'network.json',Path(directory)/'manifest.json'
            result=bus.build(source,ROOT/'data/bus/validation.json',output,manifest)
            self.assertEqual(output.read_bytes(),(ROOT/'public/data/bus-network.json').read_bytes())
            self.assertEqual(manifest.read_bytes(),(ROOT/'public/data/bus-manifest.json').read_bytes())
            self.assertEqual(result['audit']['acceptedCounts'],{'BusStops':261,'BusRoutes':291,'BusServices':5})
            compiled=json.loads(output.read_bytes())
            self.assertEqual(compiled['assumptions']['unverifiedBayStopCodes'],['75009','52009','99009','10499'])
            self.assertIn('different alighting and boarding bays',compiled['assumptions']['unverifiedBayReason'])

    def test_pagination_tampering_and_unpinned_version_fail(self):
        data,_,_=fixture()
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory)
            metadata={'version':bus.digest(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()),'datasets':{}}
            for endpoint,rows in data.items():
                (base/endpoint).mkdir()
                pages=[]
                for index,values in enumerate((rows,[])):
                    blob=json.dumps({'value':values},ensure_ascii=False,separators=(',',':')).encode()
                    name=f'{endpoint}/{index*500:06d}.json'
                    (base/name).write_bytes(blob)
                    pages.append({'skip':index*500,'count':len(values),'file':name,'sha256':bus.digest(blob)})
                metadata['datasets'][endpoint]={'pageSize':500,'paginationComplete':True,'terminalEmptyPage':True,'rawCount':len(rows),'pages':pages}
            # The source hash canonical endpoint order is fixed, independent of fixture insertion order.
            metadata['version']=bus.digest(json.dumps({e:data[e] for e in bus.ENDPOINTS},ensure_ascii=False,separators=(',',':')).encode())
            (base/'metadata.json').write_bytes(bus.encoded(metadata))
            self.assertEqual(bus.read_source(base)[0],data)
            for change in ('missing-terminal','wrong-offset','wrong-total','wrong-hash','wrong-version'):
                altered=copy.deepcopy(metadata)
                spec=altered['datasets']['BusStops']
                if change=='missing-terminal':spec['pages'].pop()
                if change=='wrong-offset':spec['pages'][0]['skip']=500
                if change=='wrong-total':spec['rawCount']+=1
                if change=='wrong-hash':spec['pages'][0]['sha256']='0'*64
                if change=='wrong-version':altered['version']='0'*64
                (base/'metadata.json').write_bytes(bus.encoded(altered))
                with self.subTest(change=change),self.assertRaises(ValueError):
                    bus.read_source(base)

if __name__=='__main__':
    unittest.main()
