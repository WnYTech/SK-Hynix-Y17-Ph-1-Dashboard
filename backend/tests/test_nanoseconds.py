from datetime import datetime, timezone
import sqlite3

import pytest
from app.models import SearchRequest, TimeRange
from test_dummy_repository import client, database, query, search


def iso_ns(value):
    seconds, fraction = divmod(value, 1_000_000_000)
    return datetime.fromtimestamp(seconds, timezone.utc).strftime('%Y-%m-%dT%H:%M:%S') + f'.{fraction:09d}Z'


def test_nanoseconds_survive_timezone_normalization_and_serialization():
    interval = TimeRange(start='2026-01-02T00:00:00.123456788+09:00', end='2026-01-01T15:00:00.123456789Z')
    assert interval.end_ns - interval.start_ns == 1
    assert interval.model_dump()['start'] == '2026-01-01T15:00:00.123456788Z'
    restored = TimeRange.model_validate_json(interval.model_dump_json())
    assert restored.start_ns == interval.start_ns and restored.end_ns == interval.end_ns
    assert TimeRange.model_validate(interval).start_ns == interval.start_ns
    for start, end in [('123456789', '123456788'), ('123456789', '123456789'), ('1234567890', '1234567891')]:
        with pytest.raises(ValueError):
            TimeRange(start=f'2026-01-01T15:00:00.{start}Z', end=f'2026-01-01T15:00:00.{end}Z')


@pytest.mark.parametrize('program,correlate', [('acell', False), ('arc', False), ('arc', True)])
@pytest.mark.parametrize('lower,upper,found', [(-1, 0, True), (0, 1, True), (-2, -1, False), (1, 2, False)])
def test_nanosecond_boundaries_do_not_round_in_outside_logs(client, database, program, correlate, lower, upper, found):
    with sqlite3.connect(database[0]) as connection:
        log_id, time_us = connection.execute("SELECT id,time_us FROM logs WHERE system='MES' ORDER BY time_us DESC LIMIT 1").fetchone()
    timestamp = time_us * 1000
    body = query(program, correlate=correlate, time_range={'start': iso_ns(timestamp + lower), 'end': iso_ns(timestamp + upper)})
    response = search(client, body)
    assert [row['id'] for row in response['items']] == ([f'demo-{log_id}'] if found else [])


def test_cursor_fingerprint_includes_sub_microsecond_time(client):
    body = query()
    interval = SearchRequest(**body).time_range
    body['time_range'] = interval.model_dump()
    first = search(client, body)
    assert search(client, {**body, 'cursor': first['next_cursor']})['page'] == 2
    body['time_range']['start'] = iso_ns(interval.start_ns + 1)
    response = client.post('/api/logs/search', json={**body, 'cursor': first['next_cursor']})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'INVALID_CURSOR'
