"""Read-only gateway smoke checks. Never seeds accounts or patient information."""
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://localhost:8080'
for path, expected in [('/', 200), ('/api/health', 200), ('/api/patients', 401), ('/api/records', 401), ('/api/transfers', 401), ('/api/audit', 401)]:
    try:
        response = urllib.request.urlopen(base + path, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == expected, f'{path}: expected {expected}, received {response.status}'
        if path.startswith('/api/'):
            assert response.headers.get('Cache-Control') == 'no-store'
        else:
            assert response.headers.get('X-Frame-Options') == 'DENY'
            assert response.headers.get('Content-Security-Policy')
    print(f'OK {path}: {expected}')
