import pytest

from test_dummy_repository import client, database, query, search


@pytest.mark.parametrize('program', ['acell', 'arc'])
@pytest.mark.parametrize('field', ['datetime', 'transaction_name', 'sequence', 'elapsed_ms', 'log_type'])
@pytest.mark.parametrize('direction', ['asc', 'desc'])
def test_global_sort_and_cursor_ties(client, program, field, direction):
    body = query(program, page_size=4, sort={'field': field, 'direction': direction})
    baseline = search(client, query(program, page_size=100))['items']
    def key(row):
        value = int(row[field]) if field == 'sequence' else row[field]
        return value, int(row['id'].removeprefix('demo-'))
    expected = sorted(baseline, key=key, reverse=direction == 'desc')
    result = search(client, body)
    items = list(result['items'])
    assert result['total_pages'] == 8
    while result['next_cursor']:
        result = search(client, {**body, 'cursor': result['next_cursor']})
        items.extend(result['items'])
    assert [row['id'] for row in items] == [row['id'] for row in expected]


@pytest.mark.parametrize('program', ['acell', 'arc'])
def test_direct_jump_and_size(client, program):
    body = query(program)
    first = search(client, body)
    all_rows = search(client, query(program, page_size=100))['items']
    fifth = search(client, {**body, 'page': 5, 'cursor': first['current_cursor']})
    assert fifth['page'] == 5 and fifth['items'] == all_rows[20:25]
    sixth = search(client, {**body, 'page': 6, 'cursor': fifth['next_cursor']})
    assert sixth['items'] == all_rows[25:] and sixth['next_cursor'] is None
    assert search(client, {**body, 'page': 5, 'cursor': fifth['current_cursor']})['items'] == fifth['items']
    assert search(client, {**body, 'page': 999})['page'] == 6
    assert search(client, {**body, 'page_size': 10})['total_pages'] == 3
    assert client.post('/api/logs/search', json={**body, 'page': 0}).status_code == 422


@pytest.mark.parametrize('program', ['acell', 'arc'])
def test_counts_and_filter_cover_all_pages(client, program):
    body = query(program)
    all_rows = search(client, {**body, 'page_size': 100})['items']
    selected = all_rows[0]
    highlight = {'transaction_name': selected['transaction_name'], 'column': 'log_type', 'value': selected['log_type'], 'row_id': selected['id']}
    expected = {
        'transaction': [r for r in all_rows if r['transaction_name'] == selected['transaction_name']],
        'cell': [r for r in all_rows if r['id'] == selected['id']],
        'any': [r for r in all_rows if r['transaction_name'] == selected['transaction_name'] or r['id'] == selected['id']],
    }
    first = search(client, body)
    counted = search(client, {**body, 'highlight': highlight, 'count_only': True, 'cursor': first['current_cursor']})
    assert counted['items'] == []
    assert counted['highlight_counts'] == {key: len(value) for key, value in expected.items()}
    for mode, matching in expected.items():
        filtered_body = {**body, 'highlight': highlight, 'highlight_mode': mode, 'page_size': 2}
        result = search(client, filtered_body)
        assert result['base_total'] == len(all_rows) and result['total'] == len(matching)
        items = list(result['items'])
        while result['next_cursor']:
            result = search(client, {**filtered_body, 'cursor': result['next_cursor']})
            items.extend(result['items'])
        assert [r['id'] for r in items] == [r['id'] for r in matching]
    empty = search(client, {**body, 'highlight': {'transaction_name': 'absent'}, 'highlight_mode': 'transaction'})
    assert empty['items'] == [] and empty['total_pages'] == 0


def test_single_cell_identity_and_validation(client):
    body = query()
    selected = search(client, body)['items'][0]
    for field in ['message', 'datetime', 'elapsed_ms', 'log_type']:
        result = search(client, {**body, 'highlight': {'column': field, 'row_id': selected['id']}, 'highlight_mode': 'cell'})
        assert result['highlight_counts']['cell'] == 1
        assert [r['id'] for r in result['items']] == [selected['id']]
    for row_id in [None, 'absent', 'demo-999999', 'demo-99999999999999999999999999']:
        result = search(client, {**body, 'highlight': {'column': 'message', 'row_id': row_id}, 'count_only': True})
        assert result['highlight_counts']['cell'] == 0
    result = search(client, {**body, 'filters': {'systems': ['EAP']}, 'highlight': {'column': 'log_type', 'row_id': selected['id']}, 'highlight_mode': 'cell'})
    assert result['items'] == [] and result['highlight_counts']['cell'] == 0
    for extra in [
        {'sort': {'field': 'id; DROP TABLE logs'}}, {'sort': {'direction': 'random'}},
        {'highlight': {'column': 'message = ? --'}},
    ]:
        assert client.post('/api/logs/search', json={**body, **extra}).status_code == 422


def test_page_fetch_does_not_repeat_highlight_aggregation(client):
    body = query()
    selected = search(client, body)['items'][0]
    result = search(client, {**body, 'highlight': {'transaction_name': selected['transaction_name'], 'column': 'message', 'row_id': selected['id']}})
    assert result['highlight_counts'] is None


def test_name_index_has_safe_fallback(client, database, monkeypatch):
    from app.dummy_repository import DummyRepository
    from app.models import SearchRequest
    monkeypatch.setattr('app.dummy_repository.NAME_INDEX_MIN_ROWS', 0)
    repository = DummyRepository(database[0])
    body = SearchRequest(**query(sort={'field': 'transaction_name', 'direction': 'asc'}))
    indexed = repository.search_sync(body)
    repository.has_name_index = False
    fallback = repository.search_sync(body)
    assert indexed.items == fallback.items
