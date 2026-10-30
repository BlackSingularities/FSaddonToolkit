//! Wbudowana baza lotnisk (OurAirports, domena publiczna) – nazwy, kraje i współrzędne
//! dla lotnisk znalezionych w dodatkach, w pakietach oficjalnych i w planowaniu lotu.

use once_cell::sync::Lazy;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;

static RAW: &[u8] = include_bytes!("../data/airports.tsv.gz");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Airport {
    pub icao: String,
    /// L – duże, M – średnie, S – małe, H – lądowisko dla śmigłowców, W – wodne.
    pub kind: String,
    pub lat: f64,
    pub lon: f64,
    pub country: String,
    pub name: String,
    pub city: String,
}

static DB: Lazy<HashMap<String, Airport>> = Lazy::new(|| {
    let mut text = String::new();
    let _ = flate2::read::GzDecoder::new(RAW).read_to_string(&mut text);
    let mut map = HashMap::with_capacity(80_000);
    for line in text.lines() {
        let f: Vec<&str> = line.split('\t').collect();
        if f.len() < 7 {
            continue;
        }
        let (Ok(lat), Ok(lon)) = (f[2].parse(), f[3].parse()) else { continue };
        map.insert(
            f[0].to_string(),
            Airport { icao: f[0].into(), kind: f[1].into(), lat, lon, country: f[4].into(), name: f[5].into(), city: f[6].into() },
        );
    }
    map
});

pub fn get(icao: &str) -> Option<&'static Airport> {
    DB.get(&icao.trim().to_uppercase())
}

pub fn count() -> usize {
    DB.len()
}

/// Wyszukiwanie po kodzie, nazwie albo mieście (planowanie lotu).
pub fn search(query: &str, limit: usize) -> Vec<Airport> {
    let q = query.trim().to_uppercase();
    if q.len() < 2 {
        return vec![];
    }
    if let Some(a) = get(&q) {
        return vec![a.clone()];
    }
    let mut hits: Vec<&Airport> = DB
        .values()
        .filter(|a| a.icao.starts_with(&q) || a.name.to_uppercase().contains(&q) || a.city.to_uppercase().contains(&q))
        .collect();
    hits.sort_by_key(|a| (!a.icao.starts_with(&q), "LMSWH".find(&a.kind).unwrap_or(9), a.icao.len(), a.icao.clone()));
    hits.into_iter().take(limit).cloned().collect()
}

/// Słowa, które wyglądają jak kody ICAO, a w nazwach paczek znaczą coś innego.
const NOT_ICAO: &[&str] = &[
    "PACK", "CITY", "MESH", "FREE", "LITE", "DEMO", "MSFS", "FS20", "FS24", "PLUS", "BASE", "CORE", "MODS", "LIVE", "HIGH",
    "MEGA", "FALL", "PARK", "PORT", "LAND", "FIX", "BETA", "FULL", "TEST", "MISC", "INTL", "ASOB", "ASOBO", "NAVI", "DATA", "AREA",
    "PROJ", "HELI", "NEXT", "WORK", "BOAT", "SHIP", "AERO", "WING", "MODE", "VOL1", "VOL2", "VOL3", "PART", "MAIN", "ROAD",
    "TREE", "GRAS", "WATER", "LAKE", "BAY", "GATE", "CARS", "STAT", "TOWN", "TEXT", "PATH", "PLAN", "VIEW", "LOWS", "SPEC",
];

/// Kody lotnisk odgadnięte z nazwy paczki („lotnisko-epwa-chopin”, „fs24-asobo-airport-wx53”).
pub fn guess_from_name(name: &str) -> Vec<&'static Airport> {
    let upper = name.to_uppercase();
    let tokens: Vec<&str> = upper.split(|c: char| !c.is_ascii_alphanumeric()).filter(|t| !t.is_empty()).collect();
    // „…-airport-1wa6-fall-city”: kod stoi zaraz po słowie airport (także lokalne kody z cyfrą na początku).
    if let Some(i) = tokens.iter().position(|t| matches!(*t, "AIRPORT" | "AIRFIELD" | "HELIPORT" | "AIRBASE" | "AIRSTRIP" | "LOTNISKO")) {
        if let Some(a) = tokens.get(i + 1).filter(|t| (3..=4).contains(&t.len())).and_then(|t| get(t)) {
            return vec![a];
        }
    }
    let mut out: Vec<&'static Airport> = vec![];
    for token in tokens {
        let ok = token.len() == 4
            && token.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
            && token.chars().filter(|c| c.is_ascii_digit()).count() <= 2
            && !NOT_ICAO.contains(&token);
        if !ok {
            continue;
        }
        if let Some(a) = get(token) {
            if !out.iter().any(|o| o.icao == a.icao) {
                out.push(a);
            }
        }
    }
    out
}

/// Odległość po wielkim kole w kilometrach.
#[cfg(test)]
pub fn distance_km(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let dp = (lat2 - lat1).to_radians();
    let dl = (lon2 - lon1).to_radians();
    let a = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    6371.0 * 2.0 * a.sqrt().atan2((1.0 - a).sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_loads() {
        assert!(count() > 40_000);
        let wa = get("epwa").unwrap();
        assert_eq!(wa.country, "PL");
        assert!((wa.lat - 52.16).abs() < 0.1);
    }

    #[test]
    fn guesses() {
        let g = guess_from_name("flytampa-lotnisko-epwa-chopin");
        assert_eq!(g.first().map(|a| a.icao.as_str()), Some("EPWA"));
        assert!(guess_from_name("pms50-gtn750-free-pack").is_empty());
        assert_eq!(guess_from_name("orbx-airport-1wa6-fall-city").first().map(|a| a.icao.as_str()), Some("1WA6"));
        let d = distance_km(52.1657, 20.9671, 50.0777, 19.7848);
        assert!((d - 250.0).abs() < 20.0);
    }
}
