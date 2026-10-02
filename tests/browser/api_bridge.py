"""JSON-lines TestClient bridge; does not listen on a port or manage app servers."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import sys
from threading import Lock

os.environ['Y17_SERVE_FRONTEND'] = '0'
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
from fastapi.testclient import TestClient
from app.main import app

output = Lock()


def respond(message):
    try:
        with TestClient(app) as client:
            response = client.request(message['method'], message['path'], json=message.get('body'))
        result = {'id': message['id'], 'status': response.status_code, 'body': response.text}
    except Exception as exc:
        result = {'id': message['id'], 'status': 500, 'body': json.dumps({'error': {'message': str(exc)}})}
    with output:
        print(json.dumps(result), flush=True)


with ThreadPoolExecutor(max_workers=4) as pool:
    for line in sys.stdin:
        pool.submit(respond, json.loads(line))
