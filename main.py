from __future__ import annotations



import json
import heapq
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

#______________________________________________
# Models
#______________________________________________

@dataclass(frozen = True)
class Station:
    id: str
    name: str
    zone: int

@dataclass(frozen=True)
class Edge:
    to_id: str
    minutes: int
    line: str # e.g: Expo, Millenium, Canada
    mode: str # e.g: Bus, train, seaBus

# For tracking what user has already paid for in the current transfer window
@dataclass  
class FareSession:
    start_minute: int # mins since midnight when the paid window started
    paid_zones: int # max zones paid for within the window



#________________________________________________________
# Load Json data 
# _______________________________________________________

def load_network(data_dir: Path) -> Tuple[
    Dict[str, Station], 
    Dict[str, List[Edge]], 
    Dict[int, float], 
    float, 
    int
]:
    stations_path = data_dir / "stations.json"
    edges_path = data_dir / "edges.json"
    fares_path = data_dir / "fares.json"

    with stations_path.open("r", encoding = "utf-8") as f:
        station_rows = json.load(f)


    stations: Dict[str, Station] = {
        row["id"]: Station(row["id"], row["name"], int(row["zone"]))
        for row in station_rows
    }       

    graph: Dict[str, List[Edge]] = {sid: [] for sid in stations}

    with edges_path.open("r", encoding = "utf-8") as f:
        edge_rows = json.load(f)

    def link(a: str, b: str, minutes: int, line: str, mode: str) -> None:
        graph[a].append(Edge(b, minutes, line, mode))
        graph[b].append(Edge(a, minutes, line, mode))

    for row in edge_rows:
        a = row["from"]
        b = row["to"]
        if a not in stations or b not in stations:
            raise ValueError(f"Edge references unknown stations: {a} -> {b}")
        link(a, b, int(row["minutes"]), row["line"], row["mode"])

    with fares_path.open("r", encoding="utf-8") as f:
        fares = json.load(f)

    zone_fares = {int(k): float(v) for k, v in fares["zone_fares"].items()}
    bus_flat = float(fares["bus_flat_fare"])
    transfer_window_minutes = int(fares.get("transfer_window_minutes", 60))
    
    return stations, graph, zone_fares, bus_flat, transfer_window_minutes             


#_____________________________________________________________________
# Routing (Dijkstra: shortest time)
# ____________________________________________________________________

def dijkstra_path(
    graph: Dict[str, List[Edge]],
    start_id: str,
    goal_id: str
) -> Optional[Tuple[List[str], int]]:
    if start_id not in graph or goal_id not in graph:
        return None;

    dist: Dict[str, int] = {start_id: 0}
    prev: Dict[str, Optional[str]] = {start_id: None}
    pq: List[Tuple[int, str]] = [(0, start_id)]

    visited = set()

    while pq: 
        cur_dist, cur = heapq.heappop(pq)
        if cur in visited:
            continue
        visited.add(cur)

        if cur == goal_id:
            break

        for e in graph[cur]:
            nd = cur_dist + e.minutes
            if e.to_id not in dist or nd < dist[e.to_id]:
                dist[e.to_id] = nd
                prev[e.to_id] = cur
                heapq.heappush(pq, (nd, e.to_id))

    if goal_id not in dist:
        return None

    # Reconstruct path 

    path: List[str] = []
    cur: Optional[str] = goal_id

    while cur is not None:
        path.append(cur)
        cur = prev.get(cur)

    path.reverse()
    return path, dist[goal_id]


#_______________________________________________________________________
# Zone Fare logic   
# ______________________________________________________________________
"""
Fares_zone = {
    1: 2.50,
    2: 3.75,
    3: 4.90,
}
"""

def zones_crossed(stations: Dict[str, Station], path: List[str]) -> int:
    zones = [stations[sid].zone for sid in path]
    return max(zones) - min(zones) + 1

#_________________________________________________________________________
# Helper: infer mode (simple)
# ________________________________________________________________________

def infer_mode_for_path(graph: Dict[str, List[Edge]], path: List[str]) -> str:
    """     
    If ANY segment is TRAIN, treat the trip as TRAIN (zone-based).
    Only return BUS if ALL the segments are BUS.
    """
    if len(path) < 2:
        return "TRAIN"
    
    saw_train = False
    for a, b in zip(path, path[1: ]):
        e = edge_info(graph, a, b)
        if e.mode.upper() == "TRAIN":
            saw_train = True

    if saw_train == True:
        return "TRAIN"
    else:
        return "BUS"        


def compute_fare(zones: int, mode: str, zone_fares: Dict[int, float], bus_flat_fare: float) -> float:
    mode = mode.upper()
    if mode == "BUS":
        return bus_flat_fare
    return zone_fares.get(zones, zone_fares[max(zone_fares)])

def edge_info(graph: Dict[str, List[Edge]], a: str, b: str) -> Edge: 
    """
    Find the edge used between two consecutive stations in the chosen path.
    Assumes the graph contains an edge a -> b

    """
    for e in graph[a]: 
        if e.to_id == b:
            return e
    raise ValueError(f"No edge found from {a} to {b} (path is inconsistent with graph). ")


def segment_lines(graph: Dict[str, List[Edge]], path: List[str]) -> List[str]:
    """
    Returns a list of line names for each segment in the route.
    Example: path [A,B,C] -> lines ["Expo", "Expo"]
    """
    lines = []
    for a, b in zip(path, path[1:]):
        e = edge_info(graph, a, b)
        lines.append(e.line)
    return lines

def unique_lines_in_order(lines: List[str]) -> List[str]:
    """   
    Compress consecutive duplicates:
    ["Expo","Expo", "Millenium","Millenium", "Expo"] -> ["Expo", "Millenium", "Expo"]

    """
    if not lines:
        return []
    out = [lines[0]]
    for ln in lines[1:]:
        if ln != out[-1]:
            out.append(ln)
    return out

def transfer_stations(path: List[str], lines: List[str]) -> List[str]:
    """   
    Returns station IDs where a line change occurs.
    If lines [i - 1] != lines[i], transfer happens at path[i]
    """        

    transfers = []
    for i in range(1, len(lines)):
        if lines[i] != lines[i - 1]:
            transfers.append(path[i])
    return transfers        

def station_lines(graph: Dict[str, List[Edge]]) -> Dict[str, List[str]]:
    lines_by_station: Dict[str, set] = {sid: set() for sid in graph}
    for sid, edges in graph.items():
        for e in edges: 
            lines_by_station[sid].add(e.line)
    return {sid: sorted(list(s)) for sid, s in lines_by_station.items()}        


#____________________________________________________________________________________
# CLI helper functions

def print_stations(stations: Dict[str, Station]) -> None:
    print("\nAvailable stations: ")
    for sid in sorted(stations.keys()):
        print(f" {sid} - {stations[sid].name} (Zone {stations[sid].zone})")

def get_station_choice(prompt: str, stations: Dict[str, Station]) -> str:
    while True:
        s = input(prompt).strip().upper()
        if s in stations: 
            return s
        print("Invalid station ID. Please try again (example: WFR, CMB, LHG). ")

#____________________________________________________________________________________

def parse_hhmm_to_minute(s: str) -> int:
    """  
    Converting Hours:minutes into minutes since midnight.
    For example: '9:30' becomes 570
    """
    s = s.strip()
    parts = s.split(":")
    if len(parts) != 2:
        raise ValueError("Time must be in Hours:minutes format (e.g., 16:34).")
    hours = int(parts[0])
    minutes = int(parts[1])
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        raise ValueError("Invalid time. Use 00:00 to 23:59.")
    return hours * 60 + minutes

def get_time_minute(prompt: str) -> int:
    while True:
        try:
            return parse_hhmm_to_minute(input(prompt))
        except Exception as e:
            print(f"Invalid time: {e}")

def trip_required_zones(mode: str, zones_crossed: int) -> int:
    """     
    all travel in a bus will be considered 1 zone
    train travels in 3 zones
    """            
    mode = mode.upper()
    if mode == "BUS":
        return 1
    return zones_crossed

def fare_for_zones(required_zones: int, zone_fares: Dict[int, float]) -> float:
    return zone_fares.get(required_zones, zone_fares[max(zone_fares)])


def compute_fare_with_transfer_window(
        session: Optional[FareSession],
        trip_time_minute: int,
        required_zones: int,
        zone_fares: Dict[int, float],
        window_minutes: int
) -> Tuple[float, FareSession]:
    """
    Returns: (charge_amount, updated_session)

    Policy:
    - If no active session OR session expired -> charge full fare for required_zones, start new session.
    - If active session:
        - If required_zones <= paid_zones -> charge $0
        - If required_zones > paid_zones -> charge only the difference, and upgrade paid_zones
    """
    trip_cost = fare_for_zones(required_zones, zone_fares)

    if session is None or (trip_time_minute - session.start_minute) > window_minutes:
        # New session
        return trip_cost, FareSession(start_minute = trip_time_minute, paid_zones = required_zones)
    
    # Within transfer window
    already_paid_cost = fare_for_zones(session.paid_zones, zone_fares)

    if required_zones <= session.paid_zones:
        return 0.0, session
    
    # Upgrade fare (charge difference)

    return max(0.0, trip_cost - already_paid_cost), FareSession(
        start_minute = session.start_minute,
        paid_zones = required_zones

    )
 



#_____________________________________________________________________________
# Main demo
# ____________________________________________________________________________

def main() -> None: 
    data_dir = Path(__file__).parent / "data"
    stations, graph, zone_fares, bus_flat, window_minutes = load_network(data_dir)

    # This persists across trips, so transfer window works across multiple rides
    session: Optional[FareSession] = None

    while True:
        print_stations(stations)

        start = get_station_choice("\nEnter departure station ID: ", stations)
        goal = get_station_choice("Enter destination station ID: ", stations)
        trip_time = get_time_minute("Enter trip start time (Hours:Minutes): ")
        # Time is used for transfer window and fare logic, not travel duration. 

        
        if start == goal:
            print("\nNo travel - same origin and destination.")
            print("Fare: $0.00")
        else:
            result = dijkstra_path(graph, start, goal) 
            if not result:
                print("\nNo route found.")
            else:
                path, minutes = result

                lines_each_segment = segment_lines(graph, path)
                lines_used = unique_lines_in_order(lines_each_segment)
                transfers = transfer_stations(path, lines_each_segment)

                
                z = zones_crossed(stations, path)
                mode = infer_mode_for_path(graph, path)
                required = trip_required_zones(mode, z)

                charge, session = compute_fare_with_transfer_window(
                    session = session,
                    trip_time_minute= trip_time,
                    required_zones= required, 
                    zone_fares = zone_fares,
                    window_minutes= window_minutes
                )

                path_names = " -> ".join(stations[s].name for s in path)

                print("\n==================== TRIP SUMMARY ======================")
                print(f"From: {stations[start].name}")
                print(f"To: {stations[goal].name}")
                print("==========================================================")
                

                print("\nRoute: ")
                print(path_names)
                print(f"Total travel time: {minutes} min")

                print(f"Zones crossed: (route): {z}")
                print(f"Mode:(simple): {mode}")
                print(f"Required fare level: {required} zone(s)")
                print(f"Charged now: ${charge:.2f}")

                if session is not None:
                    expires_at = session.start_minute + window_minutes
                    print(f"Transfer window active until: {expires_at//60:02d}:{expires_at%60:02d}"
                          f" (paid up to {session.paid_zones} zone(s))")

                print("\nSegments: ")
                for a, b in zip(path, path[1:]):
                    e = edge_info(graph, a, b)
                    print(f" - {stations[a].name} -> {stations[b].name} ({e.line})")

                print("\nLines traveled: ")
                print(" -> ".join(lines_used))

                if transfers:
                    print("\nTransfers at: ")
                    for sid in transfers: 
                        print(f" - {stations[sid].name}")

        again = input("\nPlan another trip? (y/n): ").strip().lower()
        if again != "y":
            print("\nGoodbye!")
            break          

if __name__ == "__main__":
    main()