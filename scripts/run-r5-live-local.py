"""Masked local R5 credentials. Secrets stay in launcher/server process memory."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tkinter as tk
from tkinter import ttk

root = Path(__file__).resolve().parents[1]
window = tk.Tk()
window.title('R5 — secure local provider access')
window.geometry('640x430')
ttk.Label(window, text='R5 provider access · local testing only', font=('Segoe UI', 14)).pack(pady=(18, 10))
ttk.Label(window, text='Optional fields. Never paste credentials into chat. No secret file is written.', wraplength=600).pack()
entries = {}
for key, label in [('ONEMAP_TOKEN', 'OneMap ordinary access token (new address routing)'), ('LTA_ACCOUNT_KEY', 'LTA DataMall Account Key (bus arrivals; optional)')]:
    ttk.Label(window, text=label).pack(pady=(14, 4))
    entries[key] = ttk.Entry(window, show='\u2022', width=75)
    entries[key].pack()
ttk.Label(window, text='No OneMap password or BFA approval is needed in this window.\nExisting configured environment values are retained when a field is blank.').pack(pady=12)
status = tk.StringVar(value='Start when ready, then keep this window open during testing.')
ttk.Label(window, textvariable=status, wraplength=600).pack(pady=8)
child = None

def start():
    global child
    if not (root / 'dist/server/index.js').is_file():
        status.set('The R5 build is being prepared. Leave your entries here and retry shortly.')
        return
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 4195)) == 0:
            status.set('Port 4195 is already in use. Ask the R5 task to free its own preview port; R4 stays untouched.')
            return
    environment = os.environ.copy()
    for key, entry in entries.items():
        if entry.get().strip():
            environment[key] = entry.get().strip()
    environment.update(PORT='4195', HOST='127.0.0.1')
    try:
        child = subprocess.Popen([shutil.which('node') or r'C:\Program Files\nodejs\node.exe', 'scripts/serve.mjs'], cwd=root, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        evidence = root / 'test-results/r5/secure-session.json'
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(json.dumps({'port':4195,'serverPid':child.pid,'credentialPersisted':False,'configuredNames':[key for key in entries if environment.get(key)]}), encoding='utf-8')
        for entry in entries.values():
            entry.delete(0, tk.END)
            entry.configure(state='disabled')
        button.configure(state='disabled')
        status.set('R5 server starting at http://localhost:4195. Keep this window open.')
    except Exception:
        status.set('The server could not start. No secret file was written.')
    finally:
        for key in entries:
            environment.pop(key, None)

def close():
    if child and child.poll() is None:
        child.terminate()
    window.destroy()

def check():
    if child and child.poll() is not None:
        status.set('The R5 server stopped. No credential was saved. Close and reopen to retry.')
    window.after(1500, check)

button = ttk.Button(window, text='Start R5 local session', command=start)
button.pack(pady=8)
window.protocol('WM_DELETE_WINDOW', close)
entries['ONEMAP_TOKEN'].focus_set()
window.after(1500, check)
window.mainloop()
