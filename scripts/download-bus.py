"""Masked local entry for the versioned bus downloader; secret stays in memory."""
import argparse
import getpass
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def acquire(secret):
    environment = os.environ.copy()
    environment['LTA_ACCOUNT_KEY'] = secret
    try:
        result = subprocess.run([shutil.which('node') or r'C:\Program Files\nodejs\node.exe',
                                 str(ROOT/'scripts/acquire-bus.mjs'), str(ROOT/'data/bus/sources')],
                                cwd=ROOT, env=environment, capture_output=True, text=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode:
            raise RuntimeError('Acquisition failed; credential details omitted')
        return result.stdout.strip()
    finally:
        environment.pop('LTA_ACCOUNT_KEY', None)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gui', action='store_true')
    args = parser.parse_args()
    if args.gui:
        import tkinter as tk
        from tkinter import ttk
        import threading
        window = tk.Tk()
        window.title('Commute Copilot — secure bus-data download')
        window.geometry('700x280')
        ttk.Label(window,text='DataMall key (memory only; never enter it in chat)').pack(pady=16)
        entry=ttk.Entry(window,show='\u2022',width=70)
        entry.pack()
        status=tk.StringVar(value='Downloads all 3 static bus feeds sequentially, with bounded pagination.')
        ttk.Label(window,textvariable=status,wraplength=660).pack(pady=16)
        def start():
            secret=entry.get().strip()
            if not secret:
                status.set('Enter the key in this masked local field.')
                return
            entry.delete(0,tk.END)
            button.configure(state='disabled')
            status.set('Downloading bus metadata; this may take a few minutes.')
            def work():
                try:
                    result=acquire(secret)
                    message='Download complete. Inspect data/bus/sources, then review validation rules before import.'
                except Exception:
                    message='Acquisition failed. Sensitive details omitted; no credential file was saved.'
                window.after(0,lambda:status.set(message))
            threading.Thread(target=work,daemon=True).start()
        button=ttk.Button(window,text='Download versioned bus data',command=start)
        button.pack()
        entry.focus_set()
        window.mainloop()
        return
    if not sys.stdin.isatty():
        parser.error('Use --gui or a real terminal for masked input; never place a key in a command')
    secret=getpass.getpass('DataMall key (hidden, memory only): ').strip()
    if not secret:
        parser.error('No key entered')
    try:
        print(acquire(secret))
    except Exception:
        print('Bus download failed; credential details omitted.',file=sys.stderr)
        sys.exit(1)
    finally:
        secret=None

if __name__=='__main__':
    main()
