# Transit Fare System (Inspired by TransLink)

An interactive Python-based transit route and fare planner that models a
zone-based metropolitan transit system inspired by Vancouver’s TransLink.

The system computes shortest routes between stations, detects line transfers,
and applies realistic fare rules including zone-based pricing and a transfer
window where fares are only charged once and upgraded only when additional
zones are crossed.

---

## Motivation & Idea Behind the Project

After moving to Vancouver, I became interested in understanding how large-scale
transit systems like TransLink work behind the scenes.

As a daily user of public transit, I was curious about questions such as:
- How are transit networks structured internally?
- How do systems determine routes and travel time?
- How do fare zones, transfers, and time windows actually work in practice?

This project started as a way to explore the **architecture and logic** of a
real-world transit system by building a simplified but realistic model in code.

Rather than focusing on a graphical interface, the goal of this project is to
understand and implement the **core system design**: routing, fares, transfers,
and policy rules.

---

## Features

- Graph-based transit network (stations and connections)
- Shortest-path routing using Dijkstra’s algorithm
- Multiple transit lines (Expo, Millennium, Canada)
- Detection of line transfers at shared stations
- Zone-based fare calculation
- Flat-fare bus logic (1-zone fare)
- Transfer window logic:
  - fares are charged only once within the transfer window
  - fare is upgraded only when additional zones are crossed
- Interactive command-line interface
- JSON-driven configuration:
  - stations
  - network connections
  - fare rules

---

## How the System Works (High Level)

- Stations are modeled as nodes in a graph.
- Connections between stations store:
  - travel time
  - transit line
  - transit mode (train or bus)
- Dijkstra’s algorithm is used to compute the shortest route between two stations.
- The fare engine:
  - determines how many zones a trip requires,
  - tracks what the user has already paid within a transfer window,
  - charges $0 for trips covered by the existing fare,
  - charges only the difference when a trip requires additional zones.

This mirrors how real-world transit fare systems apply transfer and zone rules.

---

## How to Run the Project

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/transit_fare_system.git

2. Navigate into the project folder: 
    cd transit_fare_system

3. Run the Program:
    python main.py

4. Follow the prompts to:
    -> select a departure station
    -> select a destination station
    -> Enter the trip time (hours: minutes)

The program will display the route, lines travelled, transfers, zones crossed and the fare charged.        

Future Improvements:

Station search by name (instead of station IDs)
Daily fare caps
More detailed transfer and time-based rules
Refactoring into multiple modules
Optional graphical or web-based interface

Disclaimer

This project is a learning-focused system design exercise inspired by
TransLink. It is not an exact replica of TransLink’s real-world network or
fare policies.

