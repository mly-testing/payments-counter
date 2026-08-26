"""Заглушка Google-таблицы для локальной разработки.

Повторяет протокол скрипта из apps-script/Code.gs, но держит записи в файле
рядом с собой. Позволяет проверять приложение, не трогая настоящую таблицу
и не имея интернета.

Запуск:  python tools/mock_sheet_server.py
Затем в js/config.js укажите:
    url: 'http://localhost:8765/'
    token: 'dev-token'
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8765
TOKEN = 'dev-token'
STATE_FILE = Path(__file__).resolve().parent / 'mock_sheet_data.json'

METHODS = {'qr', 'card', 'cash'}


def load_payments():
    if not STATE_FILE.exists():
        return []
    try:
        return json.loads(STATE_FILE.read_text('utf-8'))
    except (json.JSONDecodeError, OSError):
        return []


def save_payments(payments):
    STATE_FILE.write_text(json.dumps(payments, ensure_ascii=False, indent=2), 'utf-8')


def handle(request):
    if not isinstance(request, dict) or request.get('token') != TOKEN:
        return {'ok': False, 'error': 'unauthorized'}

    action = request.get('action')
    payments = load_payments()

    if action == 'list':
        payments.sort(key=lambda item: item['createdAt'], reverse=True)
        return {'ok': True, 'payments': payments}

    if action == 'add':
        method = request.get('method')
        amount = request.get('amount')
        if method not in METHODS:
            return {'ok': False, 'error': 'unknown-method'}
        if not isinstance(amount, int) or amount <= 0:
            return {'ok': False, 'error': 'bad-amount'}

        payment = {
            'id': str(uuid.uuid4()),
            'method': method,
            'amount': amount,
            'createdAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        }
        payments.append(payment)
        save_payments(payments)
        return {'ok': True, 'payment': payment}

    if action == 'delete':
        target = request.get('id')
        remaining = [item for item in payments if item['id'] != target]
        save_payments(remaining)
        return {'ok': True, 'deleted': len(remaining) != len(payments)}

    return {'ok': False, 'error': 'unknown-action'}


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _send(self, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send({'ok': True})

    def do_GET(self):
        from urllib.parse import parse_qs, urlparse

        params = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
        if 'amount' in params:
            params['amount'] = int(params['amount'])
        self._send(handle(params))

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        try:
            request = json.loads(self.rfile.read(length) or b'{}')
        except json.JSONDecodeError:
            request = None
        self._send(handle(request))

    def log_message(self, fmt, *args):
        print(f'{self.command} {self.path} — {fmt % args}')


def main():
    print(f'Заглушка таблицы слушает http://localhost:{PORT}/  (токен: {TOKEN})')
    print(f'Записи сохраняются в {STATE_FILE.name}')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
