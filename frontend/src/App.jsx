import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const API = "http://localhost:8000";

const LINE_COLORS = {
  "Expo": "#009CDE",
  "Millennium": "#FFC72C",
  "Canada": "#00A650",
  "99 B-Line": "#E8143C",
  "Broadway": "#E8143C",
  "Downtown Shuttle": "#E8143C",
  "R5 RapidBus": "#E8143C",
};

const ZONE_COLORS = { 1: "#00A3FF", 2: "#FF8C00", 3: "#FF3366" };
const ROUTE_PALETTE = ["#00F5FF", "#FF6B6B", "#B8FF57"];

function minuteToHHMM(m) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function parseHHMM(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

// ─── Leaflet hook ─────────────────────────────────────────
function useLeaflet(mapRef, stations, edges) {
  const leafletRef = useRef(null);
  const layersRef = useRef({ network: [], routes: [] });

  useEffect(() => {
    if (!mapRef.current || leafletRef.current) return;
    const map = L.map(mapRef.current, {
      center: [49.24, -123.02],
      zoom: 11,
      zoomControl: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    leafletRef.current = map;
    layersRef.current.routes.forEach(l => l.remove());
    layersRef.current.routes = [];
    return () => { map.remove(); leafletRef.current = null; };
  }, []);

  useEffect(() => {
    const map = leafletRef.current;
    if (!map || !edges.length || !stations.length) return;
    layersRef.current.network.forEach(l => l.remove());
    layersRef.current.network = [];
    edges.forEach(e => {
      const line = L.polyline(
        [[e.from_lat, e.from_lng], [e.to_lat, e.to_lng]],
        { color: LINE_COLORS[e.line] || "#888", weight: e.mode === "BUS" ? 2 : 3, opacity: 0.7, dashArray: e.mode === "BUS" ? "6 4" : null }
      ).addTo(map);
      layersRef.current.network.push(line);
    });
    stations.forEach(s => {
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 7, fillColor: ZONE_COLORS[s.zone] || "#fff",
        color: "#fff", weight: 2, fillOpacity: 1,
      })
        .bindTooltip(`<b>${s.name}</b><br>Zone ${s.zone}<br>${s.lines.join(" · ")}`, {
          className: "transit-tooltip", offset: [0, -8],
        })
        .addTo(map);
      layersRef.current.network.push(marker);
    });
  }, [stations, edges]);

  const drawRoutes = useCallback((routes, activeIdx) => {
    const map = leafletRef.current;
    if (!map) return;
    layersRef.current.routes.forEach(l => l.remove());
    layersRef.current.routes = [];
    routes.forEach((route, ri) => {
      const isActive = ri === activeIdx;
      const color = ROUTE_PALETTE[ri % ROUTE_PALETTE.length];
      const coords = route.coordinates.map(c => [c.lat, c.lng]);
      const glow = L.polyline(coords, { color, weight: isActive ? 16 : 6, opacity: isActive ? 0.2 : 0.05 }).addTo(map);
      const line = L.polyline(coords, { color, weight: isActive ? 5 : 3, opacity: isActive ? 0.95 : 0.4, dashArray: isActive ? null : "8 6" }).addTo(map);
      layersRef.current.routes.push(glow, line);
      if (isActive) {
        const iconFor = (label) => L.divIcon({
          html: `<div style="background:${color};color:#0a0a14;font-weight:700;font-size:11px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;font-family:monospace">${label}</div>`,
          className: "", iconAnchor: [13, 13],
        });
        layersRef.current.routes.push(
          L.marker(coords[0], { icon: iconFor("A") }).addTo(map),
          L.marker(coords[coords.length - 1], { icon: iconFor("B") }).addTo(map)
        );
        map.fitBounds(L.latLngBounds(coords), { padding: [60, 340] });
      }
    });
  }, []);

  return { drawRoutes };
}

// ─── Logo SVG ─────────────────────────────────────────────
function SkyTraceLogo() {
  return (
    <svg viewBox="0 0 560 240" style={{ width: 300, height: 143, display: "block", margin: "0 auto" }}>

      {/* Towers */}
      <rect x="195" y="42" width="10" height="148" fill="#0a1e3a"/>
      <polygon points="200,33 193,46 207,46" fill="#0a1e3a"/>
      <rect x="355" y="42" width="10" height="148" fill="#0a1e3a"/>
      <polygon points="360,33 353,46 367,46" fill="#0a1e3a"/>

      {/* Left side cable */}
      <path d="M105,190 C130,160 162,80 200,35" fill="none" stroke="#0a1e3a" strokeWidth="2.8" strokeLinecap="round"/>
      {/* Right side cable */}
      <path d="M455,190 C430,160 398,80 360,35" fill="none" stroke="#0a1e3a" strokeWidth="2.8" strokeLinecap="round"/>
      {/* Center U-cable */}
      <path d="M200,35 C240,195 320,195 360,35" fill="none" stroke="#0a1e3a" strokeWidth="2.8" strokeLinecap="round"/>

      {/* Suspenders - left approach */}
      <line x1="120" y1="190" x2="122" y2="178" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="138" y1="190" x2="141" y2="164" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="156" y1="190" x2="160" y2="145" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="174" y1="190" x2="179" y2="120" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      {/* Suspenders - center span */}
      <line x1="220" y1="190" x2="219" y2="173" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="238" y1="190" x2="237" y2="182" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="256" y1="190" x2="255" y2="187" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="304" y1="190" x2="305" y2="187" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="322" y1="190" x2="323" y2="182" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="340" y1="190" x2="341" y2="173" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      {/* Suspenders - right approach */}
      <line x1="386" y1="190" x2="381" y2="120" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="404" y1="190" x2="400" y2="145" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="422" y1="190" x2="419" y2="164" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>
      <line x1="440" y1="190" x2="438" y2="178" stroke="#0a1e3a" strokeWidth="0.8" strokeOpacity="0.45"/>

      {/* Road deck */}
      <rect x="100" y="188" width="360" height="5" fill="#0a1e3a" rx="1"/>

      {/* Pair A: tiny flat */}
      <rect x="106" y="174" width="12" height="14" fill="#0d2040" fillOpacity="0.85"/>
      <rect x="442" y="174" width="12" height="14" fill="#0d2040" fillOpacity="0.85"/>
      <rect x="108" y="176" width="3" height="3" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="113" y="176" width="3" height="3" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="444" y="176" width="3" height="3" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="449" y="176" width="3" height="3" fill="#a8d4f5" fillOpacity="0.5"/>

      {/* Pair B: narrow tall */}
      <rect x="121" y="164" width="10" height="24" fill="#061628" fillOpacity="0.9"/>
      <rect x="429" y="164" width="10" height="24" fill="#061628" fillOpacity="0.9"/>
      <rect x="123" y="167" width="3" height="3" fill="#a8d4f5" fillOpacity="0.55"/>
      <rect x="123" y="174" width="3" height="3" fill="#a8d4f5" fillOpacity="0.55"/>
      <rect x="431" y="167" width="3" height="3" fill="#a8d4f5" fillOpacity="0.55"/>
      <rect x="431" y="174" width="3" height="3" fill="#a8d4f5" fillOpacity="0.55"/>

      {/* Pair C: wide short */}
      <rect x="134" y="170" width="18" height="18" fill="#0a1e3a" fillOpacity="0.88"/>
      <rect x="408" y="170" width="18" height="18" fill="#0a1e3a" fillOpacity="0.88"/>
      <rect x="136" y="173" width="4" height="4" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="143" y="173" width="4" height="4" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="410" y="173" width="4" height="4" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="417" y="173" width="4" height="4" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="136" y="180" width="4" height="4" fill="#a8d4f5" fillOpacity="0.5"/>
      <rect x="410" y="180" width="4" height="4" fill="#a8d4f5" fillOpacity="0.5"/>

      {/* Pair D: narrow tall with antenna */}
      <rect x="155" y="152" width="11" height="36" fill="#061628" fillOpacity="0.93"/>
      <rect x="394" y="152" width="11" height="36" fill="#061628" fillOpacity="0.93"/>
      <rect x="157" y="155" width="3" height="3" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="157" y="163" width="3" height="3" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="157" y="171" width="3" height="3" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="396" y="155" width="3" height="3" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="396" y="163" width="3" height="3" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="396" y="171" width="3" height="3" fill="#a8d4f5" fillOpacity="0.6"/>
      <line x1="160" y1="152" x2="160" y2="146" stroke="#061628" strokeWidth="1.2"/>
      <line x1="399" y1="152" x2="399" y2="146" stroke="#061628" strokeWidth="1.2"/>

      {/* Pair E: wide stepped roof */}
      <rect x="169" y="160" width="20" height="28" fill="#0a1628" fillOpacity="0.92"/>
      <rect x="371" y="160" width="20" height="28" fill="#0a1628" fillOpacity="0.92"/>
      <rect x="173" y="154" width="12" height="6" fill="#0a1628" fillOpacity="0.85"/>
      <rect x="375" y="154" width="12" height="6" fill="#0a1628" fillOpacity="0.85"/>
      <rect x="171" y="163" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="180" y="163" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="171" y="172" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="180" y="172" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="371" y="163" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="380" y="163" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="371" y="172" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>
      <rect x="380" y="172" width="5" height="5" fill="#a8d4f5" fillOpacity="0.6"/>

      {/* Pair F: narrow tall just inside towers */}
      <rect x="208" y="136" width="13" height="52" fill="#07111f" fillOpacity="0.95"/>
      <rect x="339" y="136" width="13" height="52" fill="#07111f" fillOpacity="0.95"/>
      <rect x="210" y="139" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="210" y="148" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="210" y="157" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="210" y="166" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="210" y="175" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="341" y="139" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="341" y="148" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="341" y="157" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="341" y="166" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>
      <rect x="341" y="175" width="4" height="4" fill="#a8d4f5" fillOpacity="0.65"/>

      {/* Pair G: wide blocky with antenna */}
      <rect x="224" y="144" width="24" height="44" fill="#0a1e3a" fillOpacity="0.96"/>
      <rect x="312" y="144" width="24" height="44" fill="#0a1e3a" fillOpacity="0.96"/>
      <rect x="226" y="147" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="236" y="147" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="226" y="157" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="236" y="157" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="226" y="167" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="236" y="167" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="226" y="177" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="314" y="147" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="324" y="147" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="314" y="157" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="324" y="157" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="314" y="167" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="324" y="167" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <rect x="314" y="177" width="6" height="6" fill="#a8d4f5" fillOpacity="0.68"/>
      <line x1="236" y1="144" x2="236" y2="136" stroke="#0a1e3a" strokeWidth="1.5"/>
      <line x1="324" y1="144" x2="324" y2="136" stroke="#0a1e3a" strokeWidth="1.5"/>

      {/* Pair H: narrow tall with pointed roof */}
      <rect x="252" y="128" width="14" height="60" fill="#061628" fillOpacity="0.97"/>
      <rect x="294" y="128" width="14" height="60" fill="#061628" fillOpacity="0.97"/>
      <polygon points="259,120 252,132 266,132" fill="#061628" fillOpacity="0.97"/>
      <polygon points="301,120 294,132 308,132" fill="#061628" fillOpacity="0.97"/>
      <rect x="254" y="132" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="254" y="141" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="254" y="150" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="254" y="159" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="254" y="168" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="254" y="177" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="296" y="132" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="296" y="141" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="296" y="150" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="296" y="159" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="296" y="168" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>
      <rect x="296" y="177" width="4" height="5" fill="#a8d4f5" fillOpacity="0.7"/>

      {/* Center: tallest with antenna */}
      <rect x="272" y="116" width="16" height="72" fill="#040d1a" fillOpacity="0.99"/>
      <rect x="274" y="120" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="283" y="120" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="274" y="130" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="283" y="130" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="274" y="140" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="283" y="140" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="274" y="150" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="283" y="150" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="274" y="160" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="283" y="160" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="274" y="170" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="283" y="170" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <rect x="274" y="180" width="5" height="6" fill="#a8d4f5" fillOpacity="0.75"/>
      <line x1="280" y1="116" x2="280" y2="105" stroke="#040d1a" strokeWidth="2"/>
    </svg>
  );
}

// ─── Components ───────────────────────────────────────────
function StationSelect({ label, value, onChange, stations }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
        fontFamily: "Arial, sans-serif",
        color: value ? "rgba(10,22,40,0.65)" : "rgba(255,255,255,0.65)",
      }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.12)",
          border: "0.8px solid rgba(0,0,0,0.1)",
          color: value ? "#0a1628" : "rgba(255,255,255,0.5)",
          padding: "9px 12px",
          borderRadius: 8, fontSize: 13,
          fontFamily: "Arial, sans-serif",
          cursor: "pointer", outline: "none", width: "100%",
          appearance: "none", WebkitAppearance: "none",
        }}
      >
        <option value="">Select station…</option>
        {stations.map(s => (
          <option key={s.id} value={s.id} style={{ background: "#1a3a6e", color: "#fff" }}>
            {s.name} · Zone {s.zone}
          </option>
        ))}
      </select>
    </div>
  );
}

function RouteCard({ route, index, isActive, onClick }) {
  const color = ROUTE_PALETTE[index % ROUTE_PALETTE.length];
  return (
    <div onClick={onClick} style={{
      background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.07)",
      border: `0.8px solid ${isActive ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)"}`,
      borderRadius: 10, padding: "12px 14px", cursor: "pointer",
      transition: "all 0.2s ease", position: "relative", overflow: "hidden",
    }}>
      {isActive && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`
        }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: isActive ? `0 0 6px ${color}` : "none" }} />
          <span style={{ fontSize: 10, color, fontFamily: "Arial, sans-serif", letterSpacing: "0.08em" }}>
            ROUTE {index + 1}
          </span>
        </div>
        <span style={{ fontSize: 17, fontWeight: 700, color: "#ffffff", fontFamily: "Georgia, serif" }}>
          ${route.fare.toFixed(2)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
        {[["TIME", `${route.minutes} min`], ["ZONES", route.zones_crossed], ["MODE", route.mode]].map(([l, v]) => (
          <div key={l}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", fontFamily: "Arial, sans-serif" }}>{l}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.88)", fontFamily: "Arial, sans-serif" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {route.lines_used.map(line => (
          <span key={line} style={{
            background: `${LINE_COLORS[line] || "#888"}22`,
            border: `0.8px solid ${LINE_COLORS[line] || "#888"}66`,
            color: LINE_COLORS[line] || "#888",
            fontSize: 10, padding: "2px 8px", borderRadius: 20,
            fontFamily: "Arial, sans-serif",
          }}>{line}</span>
        ))}
      </div>
      {route.transfers.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: "Arial, sans-serif" }}>
          ⇄ Transfer at {route.transfers.map(t => t.name).join(", ")}
        </div>
      )}
    </div>
  );
}

function SegmentList({ route }) {
  if (!route) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {route.segments.map((seg, i) => (
        <div key={i} style={{
          padding: "7px 10px",
          background: "rgba(255,255,255,0.07)",
          borderRadius: 7,
          borderLeft: `2.5px solid ${LINE_COLORS[seg.line] || "#888"}`
        }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: "Arial, sans-serif" }}>
            {seg.from_name} → {seg.to_name}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "Arial, sans-serif", marginTop: 2 }}>
            {seg.line} · {seg.minutes} min
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionBadge({ session }) {
  if (!session) return null;
  return (
    <div style={{
      background: "rgba(0,166,80,0.15)",
      border: "0.8px solid rgba(0,166,80,0.4)",
      borderRadius: 7, padding: "7px 11px",
      fontSize: 11, fontFamily: "Arial, sans-serif", color: "#00c864"
    }}>
      ✓ Transfer window until {minuteToHHMM(session.start_minute + 60)} · {session.paid_zones} zone(s)
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────
export default function TransitApp() {
  const mapRef = useRef(null);
  const [stations, setStations] = useState([]);
  const [edges, setEdges] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [time, setTime] = useState("09:00");
  const [routes, setRoutes] = useState([]);
  const [activeRoute, setActiveRoute] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);
  const [showSegments, setShowSegments] = useState(false);

  const { drawRoutes } = useLeaflet(mapRef, stations, edges);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/stations`).then(r => r.json()),
      fetch(`${API}/edges`).then(r => r.json()),
    ]).then(([s, e]) => { setStations(s); setEdges(e); })
      .catch(() => setError("Could not connect to the API."));
  }, []);

  useEffect(() => {
    if (routes.length) drawRoutes(routes, activeRoute);
  }, [routes, activeRoute, drawRoutes]);

  const handleSearch = async () => {
    if (!from || !to) { setError("Please select both stations."); return; }
    if (from === to) { setError("Origin and destination must differ."); return; }
    setError(""); setLoading(true); setRoutes([]); setShowSegments(false);
    try {
      const res = await fetch(`${API}/routes/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_id: from, to_id: to, trip_time_minute: parseHHMM(time), session, max_alternatives: 3 }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "No routes found."); }
      const data = await res.json();
      setRoutes(data.routes);
      setActiveRoute(0);
      if (data.routes[0]?.session) setSession(data.routes[0].session);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const activeRouteData = routes[activeRoute] || null;

  // Dynamic text color: dark at top of gradient, white below
  const panelStyle = {
    position: "absolute",
    top: 20, left: 20, bottom: 20,
    width: 340,
    borderRadius: 16,
    background: "linear-gradient(to bottom, #a8d4f5 0%, #2a5fa8 35%, #060e1e 100%)",
    display: "flex", flexDirection: "column",
    overflowY: "auto", overflowX: "hidden",
    zIndex: 1000,
    boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
  };

  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", overflow: "hidden" }}>
      <style>{`
        .transit-tooltip { background: #0d1f3c !important; border: 1px solid #1a3a6e !important; color: #e8f4ff !important; font-family: Arial, sans-serif !important; font-size: 11px !important; border-radius: 6px !important; }
        .transit-tooltip::before { display: none !important; }
        .leaflet-container { background: #c8dff0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        select option { background: #0d2040; color: #fff; }
        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
      `}</style>

      {/* Full screen map */}
      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Floating panel */}
      <div style={panelStyle}>

        {/* Header */}
        <div style={{ padding: "24px 20px 16px", textAlign: "center", flexShrink: 0 }}>
          <SkyTraceLogo />
          <div style={{
            marginTop: 10,
            fontFamily: "Georgia, serif", fontSize: 22, fontWeight: 700,
            letterSpacing: "0.15em", color: "#0a1628",
          }}>
            SKYTRACE
          </div>
          <div style={{
            fontFamily: "Arial, sans-serif", fontSize: 9,
            letterSpacing: "0.18em", color: "rgba(10,22,40,0.55)",
            marginTop: 3,
          }}>
            VANCOUVER TRANSIT PLANNER
          </div>
          <div style={{ width: 80, height: 1, background: "rgba(10,22,40,0.15)", margin: "12px auto 0" }} />
        </div>

        {/* Controls */}
        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          <StationSelect label="From" value={from} onChange={setFrom} stations={stations} />

          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => { setFrom(to); setTo(from); }}
              style={{
                background: "rgba(255,255,255,0.15)", border: "0.8px solid rgba(0,0,0,0.1)",
                color: "rgba(10,22,40,0.7)", width: 30, height: 30, borderRadius: "50%",
                cursor: "pointer", fontSize: 14, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>⇅</button>
          </div>

          <StationSelect label="To" value={to} onChange={setTo} stations={stations} />

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "Arial, sans-serif", color: "rgba(255,255,255,0.65)" }}>
              Departure Time
            </label>
            <input
              type="time" value={time} onChange={e => setTime(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.12)", border: "0.8px solid rgba(0,0,0,0.1)",
                color: "#fff", padding: "9px 12px", borderRadius: 8,
                fontSize: 13, fontFamily: "Arial, sans-serif",
                outline: "none", width: "100%", boxSizing: "border-box",
              }}
            />
          </div>

          <SessionBadge session={session} />
          {session && (
            <button onClick={() => setSession(null)} style={{
              background: "transparent", border: "0.8px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.45)", padding: "6px", borderRadius: 7,
              fontSize: 11, fontFamily: "Arial, sans-serif", cursor: "pointer",
            }}>Clear transfer window</button>
          )}

          <button onClick={handleSearch} disabled={loading} style={{
            background: loading ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg, #1a4fa0, #0c2d6b)",
            border: "none", color: loading ? "rgba(255,255,255,0.3)" : "#fff",
            padding: "11px", borderRadius: 10, fontSize: 12, fontWeight: 700,
            fontFamily: "Arial, sans-serif", cursor: loading ? "default" : "pointer",
            letterSpacing: "0.1em",
            boxShadow: loading ? "none" : "0 4px 18px rgba(10,45,107,0.5)",
          }}>
            {loading ? "SEARCHING…" : "FIND ROUTES →"}
          </button>

          {error && (
            <div style={{
              background: "rgba(255,50,50,0.12)", border: "0.8px solid rgba(255,50,50,0.3)",
              borderRadius: 7, padding: "8px 11px", fontSize: 11,
              color: "#ff8888", fontFamily: "Arial, sans-serif"
            }}>{error}</div>
          )}
        </div>

        {/* Divider */}
        {routes.length > 0 && (
          <div style={{ margin: "14px 20px 0", height: 1, background: "rgba(255,255,255,0.1)" }} />
        )}

        {/* Route results */}
        {routes.length > 0 && (
          <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.35)", fontFamily: "Arial, sans-serif" }}>
              {routes.length} ROUTE{routes.length > 1 ? "S" : ""} FOUND
            </div>
            {routes.map((r, i) => (
              <RouteCard key={i} route={r} index={i} isActive={i === activeRoute} onClick={() => setActiveRoute(i)} />
            ))}
            {activeRouteData && (
              <div style={{ marginTop: 4 }}>
                <button onClick={() => setShowSegments(v => !v)} style={{
                  background: "transparent", border: "0.8px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.4)", width: "100%", padding: "7px",
                  borderRadius: 7, fontSize: 10, fontFamily: "Arial, sans-serif", cursor: "pointer",
                  letterSpacing: "0.08em"
                }}>
                  {showSegments ? "▲ HIDE" : "▼ SHOW"} SEGMENT BREAKDOWN
                </button>
                {showSegments && <div style={{ marginTop: 8 }}><SegmentList route={activeRouteData} /></div>}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div style={{ padding: "12px 20px 20px", marginTop: "auto", flexShrink: 0 }}>
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 12 }} />
          <div style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.25)", fontFamily: "Arial, sans-serif", marginBottom: 8 }}>LINES</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 10 }}>
            {Object.entries(LINE_COLORS).filter((_, i) => i < 4).map(([line, color]) => (
              <div key={line} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 14, height: 3, background: color, borderRadius: 1 }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "Arial, sans-serif" }}>{line}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {Object.entries(ZONE_COLORS).map(([z, c]) => (
              <div key={z} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "Arial, sans-serif" }}>Zone {z}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "Arial, sans-serif", letterSpacing: "0.1em" }}>
            SKYTRACE · VANCOUVER
          </div>
        </div>
      </div>
    </div>
  );
}