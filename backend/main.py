from __future__ import annotations

import json
import heapq
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────

@dataclass(frozen=True)
class Station:
    id: str
    name: str
    zone: int
    lat: float
    lng: float

@dataclass(frozen=True)
class Edge:
    to_id: str
    minutes: int
    line: str
    mode: str

@dataclass
class FareSession:
    start_minute: int
    paid_zones: int

# ──────────────────────────────────────────────
# Load data
# ──────────────────────────────────────────────

DATA_DIR = Path(__file__).parent / "data"

def load_network():
    with (DATA_DIR / "stations.json").open(encoding="utf-8") as f:
        station_rows = json.load(f)

    stations: Dict[str, Station] = {
        r["id"]: Station(r["id"], r["name"], int(r["zone"]), float(r["lat"]), float(r["lng"]))
        for r in station_rows
    }

    graph: Dict[str, List[Edge]] = {sid: [] for sid in stations}

    with (DATA_DIR / "edges.json").open(encoding="utf-8") as f:
        edge_rows = json.load(f)

    for row in edge_rows:
        a, b = row["from"], row["to"]
        if a not in stations or b not in stations:
            raise ValueError(f"Unknown station in edge: {a} -> {b}")
        graph[a].append(Edge(b, int(row["minutes"]), row["line"], row["mode"]))
        graph[b].append(Edge(a, int(row["minutes"]), row["line"], row["mode"]))

    with (DATA_DIR / "fares.json").open(encoding="utf-8") as f:
        fares = json.load(f)

    zone_fares = {int(k): float(v) for k, v in fares["zone_fares"].items()}
    bus_flat = float(fares["bus_flat_fare"])
    window_minutes = int(fares.get("transfer_window_minutes", 60))

    return stations, graph, zone_fares, bus_flat, window_minutes

STATIONS, GRAPH, ZONE_FARES, BUS_FLAT, WINDOW_MINUTES = load_network()

# ──────────────────────────────────────────────
# Routing helpers
# ──────────────────────────────────────────────

def dijkstra(graph, start_id, goal_id, excluded_edges=None):
    excluded_edges = excluded_edges or set()

    dist: Dict[str, int] = {start_id: 0}
    prev: Dict[str, Optional[str]] = {start_id: None}
    pq = [(0, start_id)]
    visited = set()

    while pq:
        cur_dist, cur = heapq.heappop(pq)
        if cur in visited:
            continue
        visited.add(cur)
        if cur == goal_id:
            break
        for e in graph[cur]:
            if (cur, e.to_id) in excluded_edges:
                continue
            nd = cur_dist + e.minutes
            if e.to_id not in dist or nd < dist[e.to_id]:
                dist[e.to_id] = nd
                prev[e.to_id] = cur
                heapq.heappush(pq, (nd, e.to_id))

    if goal_id not in dist:
        return None

    path = []
    cur = goal_id
    while cur is not None:
        path.append(cur)
        cur = prev.get(cur)
    path.reverse()
    return path, dist[goal_id]


def edge_info(graph, a, b) -> Edge:
    for e in graph[a]:
        if e.to_id == b:
            return e
    raise ValueError(f"No edge {a} -> {b}")


def segment_lines(graph, path):
    return [edge_info(graph, a, b).line for a, b in zip(path, path[1:])]


def unique_lines(lines):
    if not lines:
        return []
    out = [lines[0]]
    for ln in lines[1:]:
        if ln != out[-1]:
            out.append(ln)
    return out


def transfer_stations(path, lines):
    return [path[i] for i in range(1, len(lines)) if lines[i] != lines[i - 1]]


def zones_crossed(stations, path):
    zones = [stations[sid].zone for sid in path]
    return max(zones) - min(zones) + 1


def infer_mode(graph, path):
    for a, b in zip(path, path[1:]):
        if edge_info(graph, a, b).mode.upper() == "TRAIN":
            return "TRAIN"
    return "BUS"


def trip_required_zones(mode, z):
    return 1 if mode == "BUS" else z


def fare_for_zones(required_zones, zone_fares):
    return zone_fares.get(required_zones, zone_fares[max(zone_fares)])


def compute_fare_with_session(session, trip_time_minute, required_zones, zone_fares, window_minutes):
    trip_cost = fare_for_zones(required_zones, zone_fares)

    if session is None or (trip_time_minute - session["start_minute"]) > window_minutes:
        return trip_cost, {"start_minute": trip_time_minute, "paid_zones": required_zones}

    already_paid = fare_for_zones(session["paid_zones"], zone_fares)

    if required_zones <= session["paid_zones"]:
        return 0.0, session

    return max(0.0, trip_cost - already_paid), {
        "start_minute": session["start_minute"],
        "paid_zones": required_zones
    }


def build_route_response(path, minutes, stations, graph, zone_fares, trip_time_minute, session):
    lines = segment_lines(graph, path)
    z = zones_crossed(stations, path)
    mode = infer_mode(graph, path)
    required = trip_required_zones(mode, z)
    charge, new_session = compute_fare_with_session(
        session, trip_time_minute, required, zone_fares, WINDOW_MINUTES
    )

    segments = []
    for a, b in zip(path, path[1:]):
        e = edge_info(graph, a, b)
        segments.append({
            "from_id": a,
            "from_name": stations[a].name,
            "to_id": b,
            "to_name": stations[b].name,
            "minutes": e.minutes,
            "line": e.line,
            "mode": e.mode,
        })

    transfer_ids = transfer_stations(path, lines)

    return {
        "path": path,
        "path_names": [stations[s].name for s in path],
        "coordinates": [{"id": s, "lat": stations[s].lat, "lng": stations[s].lng} for s in path],
        "minutes": minutes,
        "zones_crossed": z,
        "mode": mode,
        "required_zones": required,
        "fare": round(charge, 2),
        "full_fare": round(fare_for_zones(required, zone_fares), 2),
        "lines_used": unique_lines(lines),
        "transfers": [{"id": sid, "name": stations[sid].name} for sid in transfer_ids],
        "segments": segments,
        "session": new_session,
    }

# ──────────────────────────────────────────────
# FastAPI app
# ──────────────────────────────────────────────

app = FastAPI(title="Vancouver Transit API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request schemas ──

class RouteRequest(BaseModel):
    from_id: str
    to_id: str
    trip_time_minute: int = 0
    session: Optional[dict] = None

class AlternativesRequest(BaseModel):
    from_id: str
    to_id: str
    trip_time_minute: int = 0
    session: Optional[dict] = None
    max_alternatives: int = 3

# ── Endpoints ──

@app.get("/stations")
def get_stations():
    return [
        {
            "id": s.id,
            "name": s.name,
            "zone": s.zone,
            "lat": s.lat,
            "lng": s.lng,
            "lines": sorted({e.line for e in GRAPH[s.id]}),
        }
        for s in STATIONS.values()
    ]


@app.get("/edges")
def get_edges():
    seen = set()
    result = []
    for sid, edges in GRAPH.items():
        for e in edges:
            key = tuple(sorted([sid, e.to_id])) + (e.line,)
            if key not in seen:
                seen.add(key)
                result.append({
                    "from_id": sid,
                    "from_lat": STATIONS[sid].lat,
                    "from_lng": STATIONS[sid].lng,
                    "to_id": e.to_id,
                    "to_lat": STATIONS[e.to_id].lat,
                    "to_lng": STATIONS[e.to_id].lng,
                    "line": e.line,
                    "mode": e.mode,
                    "minutes": e.minutes,
                })
    return result


@app.post("/route")
def get_route(req: RouteRequest):
    if req.from_id not in STATIONS:
        raise HTTPException(400, f"Unknown station: {req.from_id}")
    if req.to_id not in STATIONS:
        raise HTTPException(400, f"Unknown station: {req.to_id}")
    if req.from_id == req.to_id:
        raise HTTPException(400, "Origin and destination must differ.")

    result = dijkstra(GRAPH, req.from_id, req.to_id)
    if not result:
        raise HTTPException(404, "No route found.")

    path, minutes = result
    return build_route_response(
        path, minutes, STATIONS, GRAPH, ZONE_FARES,
        req.trip_time_minute, req.session
    )


@app.post("/routes/alternatives")
def get_alternatives(req: AlternativesRequest):
    if req.from_id not in STATIONS:
        raise HTTPException(400, f"Unknown station: {req.from_id}")
    if req.to_id not in STATIONS:
        raise HTTPException(400, f"Unknown station: {req.to_id}")
    if req.from_id == req.to_id:
        raise HTTPException(400, "Origin and destination must differ.")

    # Always find the best route first
    result = dijkstra(GRAPH, req.from_id, req.to_id)
    if not result:
        raise HTTPException(404, "No routes found.")

    best_path, best_minutes = result
    best_route = build_route_response(
        best_path, best_minutes, STATIONS, GRAPH, ZONE_FARES,
        req.trip_time_minute, req.session
    )
    routes = [best_route]
    best_lines = set(best_route["lines_used"])

    # Only consider alternatives within 1.5x the best route time
    max_time = best_minutes * 1.5

    # Exclude edges from best path to force different routes
    excluded = set()
    for a, b in zip(best_path, best_path[1:]):
        excluded.add((a, b))
        excluded.add((b, a))

    for _ in range(req.max_alternatives - 1):
        result = dijkstra(GRAPH, req.from_id, req.to_id, excluded_edges=excluded)
        if not result:
            break

        path, minutes = result

        # Skip routes that are too slow to be useful
        if minutes > max_time:
            break

        route = build_route_response(
            path, minutes, STATIONS, GRAPH, ZONE_FARES,
            req.trip_time_minute, req.session
        )

        # Skip if it uses the exact same lines — not a real alternative
        if set(route["lines_used"]) == best_lines:
            for a, b in zip(path, path[1:]):
                excluded.add((a, b))
                excluded.add((b, a))
            continue

        routes.append(route)

        # Exclude this path's edges for the next iteration
        for a, b in zip(path, path[1:]):
            excluded.add((a, b))
            excluded.add((b, a))

    return {"routes": routes}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "stations": len(STATIONS),
        "edges": sum(len(v) for v in GRAPH.values()) // 2
    }