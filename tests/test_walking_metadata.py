import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[1]

class WalkingMetadata(unittest.TestCase):
    def test_copy_and_mtime_cannot_renew_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = ['scripts/build-walking-evidence.py', 'public/data/bus-network.json'] + [str(p.relative_to(ROOT)) for p in (ROOT / 'data/bus/walking-evidence').iterdir() if p.suffix in ('.jpg', '.osm') or p.name == 'acquisition.json']
            for name in files:
                (root / name).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, root / name)
            def generate():
                subprocess.run([sys.executable, str(root / files[0])], check=True, capture_output=True)
                return [(root / n).read_bytes() for n in ('data/bus/walking-links.json','public/data/walking-links.json','data/bus/walking-evidence/path-review.html')]
            baseline = generate()
            for stamp in (946684800, 2208988800):
                for name in files:
                    os.utime(root / name, (stamp, stamp))
                self.assertEqual(generate(), baseline)
            ledger = json.loads(baseline[0])
            self.assertEqual(ledger['links'], json.loads((ROOT / 'data/bus/walking-links.json').read_text())['links'])
            self.assertTrue(all(s['retrievedAt'] is None and s['legacyReportedRetrievedAt'] for s in ledger['sources']))
            (root / 'data/bus/walking-evidence/smrt-bugis-map.jpg').write_bytes(b'changed')
            with self.assertRaises(subprocess.CalledProcessError):
                generate()
