#!/usr/bin/env python3
"""Rebuild web_live/index.html embedded data block: add nav & premium series."""
import re, base64, gzip, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(ROOT, 'web_live', 'index.html')

def load_block(raw: bytes):
    m = re.search(rb'<script id="wufuDataGz" type="text/plain">', raw)
    tag_end = m.end()
    end = raw.index(b'</script>', tag_end)
    b64 = raw[tag_end:end].strip()
    obj = json.loads(gzip.decompress(base64.b64decode(b64)))
    return m.start(), tag_end, end, b64, obj

def read_kv_csv(path):
    d = {}
    with open(path) as f:
        lines = f.read().splitlines()
    for line in lines[1:]:
        if not line.strip():
            continue
        dt, val = line.split(',')[:2]
        d[dt] = float(val)
    return d

def main():
    raw = open(HTML, 'rb').read()
    file_size_before = len(raw)
    mstart, tag_end, end, b64_old, obj = load_block(raw)
    calendar = obj['calendar']
    cal_index = {d: i for i, d in enumerate(calendar)}
    print(f'calendar len={len(calendar)} {calendar[0]}..{calendar[-1]}')

    nav_dir = os.path.join(ROOT, 'data', 'nav')
    prem_dir = os.path.join(ROOT, 'data', 'premium')

    # stats
    added = 0
    missing_days = {}  # code -> count of nulls
    dropped_dates = {}  # code -> count of csv dates not in calendar
    sample_check = {}

    for code, sdict in obj['series'].items():
        nav_path = os.path.join(nav_dir, code + '.csv')
        prem_path = os.path.join(prem_dir, code + '.csv')
        if not (os.path.exists(nav_path) and os.path.exists(prem_path)):
            continue  # skip 8841431.WI and other instruments without nav/premium
        nav_csv = read_kv_csv(nav_path)
        prem_csv = read_kv_csv(prem_path)

        nav_arr = [None] * len(calendar)
        prem_arr = [None] * len(calendar)
        miss_n = 0
        drop_n = 0
        for dt, v in nav_csv.items():
            i = cal_index.get(dt)
            if i is None:
                drop_n += 1
                continue
            nav_arr[i] = v
        for dt, v in prem_csv.items():
            i = cal_index.get(dt)
            if i is None:
                continue
            prem_arr[i] = round(v / 100.0, 6)
        # count nulls (days in calendar with no csv value)
        miss_n = sum(1 for x in nav_arr if x is None)
        missing_days[code] = miss_n
        dropped_dates[code] = drop_n

        # rebuild dict with nav/premium inserted after raw_close
        new_dict = {}
        for k, v in sdict.items():
            new_dict[k] = v
            if k == 'raw_close':
                new_dict['nav'] = nav_arr
                new_dict['premium'] = prem_arr
        obj['series'][code] = new_dict
        added += 1
        sample_check[code] = (nav_arr[-1], prem_arr[-1])

    print(f'series codes processed (got nav+premium): {added}')

    # serialize
    new_json = json.dumps(obj, separators=(',', ':'), ensure_ascii=False)
    new_bytes = new_json.encode('utf-8')
    old_bytes = gzip.decompress(base64.b64decode(b64_old))
    print(f'json bytes old={len(old_bytes)} new={len(new_bytes)} delta={len(new_bytes)-len(old_bytes):+d}')

    new_gz = gzip.compress(new_bytes, compresslevel=9)
    new_b64 = base64.b64encode(new_gz)
    print(f'b64 old={len(b64_old)} new={len(new_b64)} delta={len(new_b64)-len(b64_old):+d}')

    # reassemble
    new_raw = raw[:tag_end] + new_b64 + raw[end:]
    open(HTML, 'wb').write(new_raw)
    print(f'html size old={file_size_before} new={len(new_raw)} delta={len(new_raw)-file_size_before:+d}')

    # write stats
    worst = sorted(missing_days.items(), key=lambda x: -x[1])[:5]
    print('top missing-day counts:', worst)
    with open(os.path.join(ROOT, '_navprem_stats.json'), 'w') as f:
        json.dump({
            'added': added,
            'missing_days': missing_days,
            'dropped_dates': dropped_dates,
            'size_before': file_size_before,
            'size_after': len(new_raw),
            'b64_before': len(b64_old),
            'b64_after': len(new_b64),
        }, f)

if __name__ == '__main__':
    main()
