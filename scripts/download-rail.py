"""Acquire a versioned train schedule. Keys and signed URLs stay in process memory."""
import argparse
import datetime as dt
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import zipfile
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('audit_transport', ROOT/'scripts/audit-datamall.py')
transport = module_from_spec(spec)
spec.loader.exec_module(transport)

def acquire(key, directory):
    if not key:
        raise ValueError('DataMall key unavailable')
    payload, _ = transport.read_url(transport.BASE+'GTFSScheduleTrain', key)
    envelope = json.loads(payload)
    records = envelope.get('value', [])
    if len(records) != 1:
        raise ValueError('Unexpected metadata envelope')
    item = records[0]
    link = transport.download_link(item)
    if not link:
        raise ValueError('Download unavailable')
    blob, details = transport.safe_download(link)  # Never forwards AccountKey.
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        if 'stop_times.txt' not in archive.namelist():
            raise ValueError('Not a schedule archive')
    sha = hashlib.sha256(blob).hexdigest()
    stamp = dt.datetime.now(dt.timezone.utc).isoformat()
    stem = 'lta-train-'+stamp[:10]+'-'+sha[:12]
    directory.mkdir(parents=True, exist_ok=True)
    source = directory/(stem+'.zip')
    metadata_path = directory/(stem+'.json')
    if source.exists() or metadata_path.exists():
        raise ValueError('This immutable source version already exists; reuse it for import')
    metadata = dict(publisher='Land Transport Authority Singapore', dataset='GTFS Schedule (Train)',
        sourceUrl='https://datamall.lta.gov.sg/content/datamall/en/dynamic-data.html',
        endpoint='GTFSScheduleTrain', retrievedAt=stamp, sourceTimestamp=item.get('timestamp'),
        lastModified=details.get('lastModified'), version=sha, sha256=sha, bytes=len(blob),
        license='Singapore Open Data Licence v1.0', licenseUrl='https://data.gov.sg/open-data-licence',
        credentialPersisted=False, signedUrlRetained=False)
    source.write_bytes(blob)
    metadata_path.write_text(json.dumps(metadata, indent=2)+'\n', encoding='utf-8')
    return f'Saved {source.name} ({len(blob):,} bytes). SHA-256 {sha}. Validate before updating coverage.'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gui', action='store_true')
    parser.add_argument('--output-dir', type=Path, default=ROOT/'data/rail/sources')
    args = parser.parse_args()
    if args.gui:
        import tkinter as tk
        from tkinter import ttk
        import threading
        window = tk.Tk()
        window.title('Commute Copilot — secure schedule download')
        window.geometry('650x260')
        ttk.Label(window, text='DataMall API Access Key (memory only)').pack(pady=16)
        entry = ttk.Entry(window, show='\u2022', width=65)
        entry.pack()
        status = tk.StringVar(value='Download saves the licensed schedule and sanitised provenance, never the key or signed URL.')
        ttk.Label(window, textvariable=status, wraplength=600).pack(pady=15)
        def start():
            secret = entry.get().strip()
            entry.delete(0, tk.END)
            button.configure(state='disabled')
            status.set('Downloading one schedule snapshot…')
            def work():
                try:
                    message = acquire(secret, args.output_dir)
                except Exception as exc:
                    message = f'Download failed ({type(exc).__name__}); sensitive details omitted.'
                window.after(0, lambda: status.set(message))
            threading.Thread(target=work, daemon=True).start()
        button = ttk.Button(window, text='Download schedule', command=start)
        button.pack()
        window.mainloop()
        return
    key = os.environ.get('LTA_ACCOUNT_KEY')
    if not key:
        if not sys.stdin.isatty():
            parser.error('Use --gui or a real terminal for masked entry; never put a key in a command')
        key = getpass.getpass('DataMall API Access Key (hidden): ').strip()
    try:
        print(acquire(key, args.output_dir))
    except Exception as exc:
        print(f'Download failed ({type(exc).__name__}); sensitive details omitted.', file=sys.stderr)
        sys.exit(1)
    finally:
        key = None

if __name__ == '__main__':
    main()
