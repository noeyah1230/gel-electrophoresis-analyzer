#!/usr/bin/env python3
"""Heuristic pre-publication screen. Reports filenames, never matched secrets."""
from pathlib import Path
import argparse
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write-manifest', action='store_true')
args = parser.parse_args()

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

patterns = {
    'private home path': re.compile(rb'/(?:Users|home)/[a-zA-Z0-9_.-]+/'),
    'private build path': re.compile(rb'/private/tmp/gel-[a-zA-Z0-9_-]+'),
    'private key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'access token': re.compile(rb'\b(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[A-Z0-9]{16}|sk-[a-zA-Z0-9]{24,})'),
    'assigned credential': re.compile(rb'''(?i)(?:api[_-]?key|password|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][a-zA-Z0-9_+/=-]{12,}["']'''),
    'credential in URL': re.compile(rb'https?://[^\s/:]+:[^\s/@]+@'),
}
files = sorted(set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0')) - {''})
manifest = 'docs/PUBLICATION_FILES.txt'
if args.write_manifest:
    files = sorted(set(files) | {manifest})
    (ROOT / manifest).write_text('\n'.join(files) + '\n')
errors = []
for name in files:
    path = ROOT / name
    if path.is_symlink():
        errors.append((name, 'symbolic link needs manual review'))
        continue
    if not path.is_file():
        errors.append((name, 'tracked file is missing'))
        continue
    # Ignore rules do not protect files that were already tracked.
    if subprocess.run(['git','-C',str(ROOT),'check-ignore','--no-index','-q',name]).returncode == 0:
        errors.append((name, 'tracked file matches publication exclusions'))
    data = path.read_bytes()
    for label, pattern in patterns.items():
        if pattern.search(data): errors.append((name, label))
    if path.suffix.lower() == '.png':
        pos = 8
        while pos + 12 <= len(data):
            size = int.from_bytes(data[pos:pos+4], 'big')
            kind = data[pos+4:pos+8]
            if kind in [b'eXIf', b'tEXt', b'zTXt', b'iTXt']:
                errors.append((name, 'embedded PNG metadata needs review'))
            pos += size + 12
    if name.endswith(('.env','.pem','.key','.db','.sqlite','.csv','.jpg','.jpeg','.tif','.tiff','.dmg','.zip')):
        errors.append((name,'sensitive or unapproved data format'))

reachable = set(line.split()[0] for line in git('rev-list','--objects','--all').decode().splitlines())
object_rows = git('cat-file','--batch-all-objects','--batch-check=%(objectname) %(objecttype)').decode().splitlines()
unreachable = []
for row in object_rows:
    oid, kind = row.split()
    if kind not in ('blob','commit','tag'): continue
    data = git('cat-file',kind,oid)
    labels = [label for label,p in patterns.items() if p.search(data)]
    if labels:
        item = (f'Git {kind} {oid[:12]}', ', '.join(labels))
        (errors if oid in reachable else unreachable).append(item)

print(f'Candidate upload set: {len(files)} files')
for name in files: print(f'  {name}')
for name, label in unreachable: print(f'LOCAL UNREACHABLE OBJECT (not in branch history): {name}: {label}')
for name, label in errors: print(f'REVIEW REQUIRED: {name}: {label}')
if errors:
    print('FAIL: resolve candidate/history findings before publication.')
    sys.exit(1)
print('PASS: no configured sensitive patterns or disallowed data files detected in the candidate set or reachable history.')
print('This does not replace human review of content, images, provenance, or new changes.')
