"""Start the local application with a masked DataMall key, kept only in process memory."""
import argparse
import getpass
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=4173)
parser.add_argument('--gui', action='store_true', help='Use a masked desktop entry window')
args = parser.parse_args()
if not args.gui and not sys.stdin.isatty():
    parser.error('A real local terminal is required for masked entry')
if not 1024 <= args.port <= 65535:
    parser.error('Use a local port between 1024 and 65535')
root = Path(__file__).resolve().parents[1]
node = shutil.which('node') or r'C:\Program Files\nodejs\node.exe'
if not (root / 'dist/server/index.js').is_file():
    parser.error('Run npm run build first')
if args.gui:
    import tkinter as tk
    from tkinter import ttk
    window = tk.Tk()
    window.title('Commute Copilot — secure local DataMall entry')
    window.geometry('590x270')
    ttk.Label(window, text='Replacement DataMall API Access Key', font=('Segoe UI', 12)).pack(pady=(18, 8))
    ttk.Label(window, text='Memory only. No chat, file, Git or hosting configuration.').pack()
    entry = ttk.Entry(window, show='\u2022', width=65)
    entry.pack(pady=12)
    status = tk.StringVar(value='Enter the key here, then start the local server.')
    ttk.Label(window, textvariable=status, wraplength=550).pack(pady=8)
    live_child = None
    def launch():
        global live_child
        secret = entry.get().strip()
        if not secret:
            status.set('Enter the key in the masked field; never in chat.')
            return
        process_env = os.environ.copy()
        process_env.update(LTA_ACCOUNT_KEY=secret, PORT=str(args.port), HOST='127.0.0.1')
        try:
            live_child = subprocess.Popen([node, 'scripts/serve.mjs'], cwd=root, env=process_env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                          creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            entry.delete(0, tk.END)
            entry.configure(state='disabled')
            start_button.configure(state='disabled')
            status.set(f'Local server starting at http://localhost:{args.port}. Keep this window open during live testing.')
            evidence = root / 'test-results' / 'phase1' / 'local-session.json'
            evidence.parent.mkdir(parents=True, exist_ok=True)
            evidence.write_text(json.dumps({'serverPid': live_child.pid, 'port': args.port, 'credentialPersisted': False}), encoding='utf-8')
        except Exception:
            status.set('Could not start the local server. No credential was saved.')
        finally:
            process_env.pop('LTA_ACCOUNT_KEY', None)
            secret = None
    def close():
        if live_child and live_child.poll() is None:
            live_child.terminate()
        window.destroy()
    def check():
        if live_child:
            status.set(f'Local server running at http://localhost:{args.port}. Close this window to stop it.' if live_child.poll() is None else 'Local server stopped. No credential file was created.')
        window.after(1000, check)
    start_button = ttk.Button(window, text='Start local live session', command=launch)
    start_button.pack(pady=8)
    window.protocol('WM_DELETE_WINDOW', close)
    entry.focus_set()
    window.after(1000, check)
    window.mainloop()
    sys.exit(0)
key = getpass.getpass('Replacement DataMall API key (hidden, memory only): ').strip()
if not key:
    parser.error('No key entered; nothing was saved')
env = os.environ.copy()
env.update(LTA_ACCOUNT_KEY=key, PORT=str(args.port), HOST='127.0.0.1')
child = None
try:
    child = subprocess.Popen([node, 'scripts/serve.mjs'], cwd=root, env=env)
    print('Local live session only; no credential file or hosted configuration was created.', flush=True)
    print('Close this terminal or press Ctrl+C to end the session.', flush=True)
    child.wait()
except KeyboardInterrupt:
    pass
finally:
    if child and child.poll() is None:
        child.terminate()
        child.wait(timeout=10)
    env.pop('LTA_ACCOUNT_KEY', None)
    key = None
