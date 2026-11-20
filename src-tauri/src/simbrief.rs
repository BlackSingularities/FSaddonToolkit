//! Ostatni plan lotu (OFP) z SimBrief – publiczny endpoint, bez klucza API.
//! https://developers.navigraph.com/docs/simbrief/fetching-ofp-data

use crate::airports;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FlightAirport {
    pub icao: String,
    pub name: String,
    pub city: String,
    pub country: String,
    pub lat: f64,
    pub lon: f64,
    /// "dep" – start, "arr" – cel, "alt" – zapasowe celu, "toalt" – zapasowe startu, "era" – zapasowe na trasie.
    pub role: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ofp {
    pub airports: Vec<FlightAirport>,
    pub callsign: String,
    pub aircraft_icao: String,
    pub aircraft_name: String,
    pub route: String,
    /// Czas wygenerowania planu (sekundy od 1970).
    pub generated: u64,
}

/// Pole jako tekst – SimBrief zwraca liczby raz jako tekst, raz jako liczby.
fn text(v: &Value, key: &str) -> String {
    match v.get(key) {
        Some(Value::String(s)) => s.trim().to_string(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// Obiekt albo tablica obiektów (np. kilka lotnisk zapasowych).
fn many(v: Option<&Value>) -> Vec<&Value> {
    match v {
        Some(Value::Array(a)) => a.iter().collect(),
        Some(o @ Value::Object(_)) => vec![o],
        _ => vec![],
    }
}

fn airport(v: &Value, role: &str) -> Option<FlightAirport> {
    let icao = text(v, "icao_code").to_uppercase();
    if icao.len() < 3 {
        return None;
    }
    // Współrzędne i nazwy z wbudowanej bazy (te same co w planowaniu ręcznym), a gdy jej brak – z planu.
    if let Some(a) = airports::get(&icao) {
        return Some(FlightAirport {
            icao,
            name: a.name.clone(),
            city: a.city.clone(),
            country: a.country.clone(),
            lat: a.lat,
            lon: a.lon,
            role: role.into(),
        });
    }
    let (lat, lon) = (text(v, "pos_lat").parse().ok()?, text(v, "pos_long").parse().ok()?);
    Some(FlightAirport { icao, name: text(v, "name"), city: String::new(), country: String::new(), lat, lon, role: role.into() })
}

pub fn parse(json: &Value) -> Result<Ofp, String> {
    let status = text(json.get("fetch").unwrap_or(&Value::Null), "status");
    if !status.is_empty() && !status.eq_ignore_ascii_case("success") {
        return Err(format!("SimBrief: {status}"));
    }
    let mut list: Vec<FlightAirport> = vec![];
    let mut push = |a: Option<FlightAirport>| {
        if let Some(a) = a {
            if !list.iter().any(|x| x.icao == a.icao) {
                list.push(a);
            }
        }
    };
    push(json.get("origin").and_then(|v| airport(v, "dep")));
    push(json.get("destination").and_then(|v| airport(v, "arr")));
    for v in many(json.get("alternate")) {
        push(airport(v, "alt"));
    }
    for v in many(json.get("takeoff_altn")) {
        push(airport(v, "toalt"));
    }
    for v in many(json.get("enroute_altn")) {
        push(airport(v, "era"));
    }
    if !list.iter().any(|a| a.role == "dep") {
        return Err(tr!("Plan SimBrief nie ma lotniska startu", "The SimBrief plan has no departure airport"));
    }
    let ac = json.get("aircraft").unwrap_or(&Value::Null);
    let general = json.get("general").unwrap_or(&Value::Null);
    let params = json.get("params").unwrap_or(&Value::Null);
    Ok(Ofp {
        airports: list,
        callsign: text(json.get("atc").unwrap_or(&Value::Null), "callsign"),
        aircraft_icao: text(ac, "icao_code").to_uppercase(),
        aircraft_name: text(ac, "name"),
        route: text(general, "route"),
        generated: text(params, "time_generated").parse().unwrap_or(0),
    })
}

/// `user` – nazwa pilota (alias Navigraph) albo numeryczny Pilot ID.
pub async fn fetch(user: &str) -> Result<Ofp, String> {
    let user = user.trim();
    if user.is_empty() {
        return Err(tr!("Podaj nazwę pilota albo Pilot ID SimBrief", "Enter a SimBrief username or Pilot ID"));
    }
    let key = if user.chars().all(|c| c.is_ascii_digit()) { "userid" } else { "username" };
    let url = format!("https://www.simbrief.com/api/xml.fetcher.php?{key}={}&json=v2", urlencoding::encode(user));
    let client = reqwest::Client::builder()
        .user_agent(concat!("FSAddonToolkit/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let r = client.get(&url).send().await.map_err(|e| format!("SimBrief: {e}"))?;
    if r.status().as_u16() == 400 {
        return Err(tr!("SimBrief nie zna tego pilota albo nie ma on jeszcze żadnego planu", "SimBrief does not know this pilot, or they have no plan yet"));
    }
    if !r.status().is_success() {
        return Err(format!("SimBrief: HTTP {}", r.status()));
    }
    let json: Value = r.json().await.map_err(|e| format!("SimBrief: {e}"))?;
    parse(&json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_single_and_multiple_alternates() {
        let one = json!({
            "fetch": { "status": "Success" },
            "origin": { "icao_code": "EPWA", "pos_lat": "52.16", "pos_long": "20.96", "name": "Chopin" },
            "destination": { "icao_code": "EPKK", "pos_lat": "50.07", "pos_long": "19.78" },
            "alternate": { "icao_code": "EPKT", "pos_lat": "50.47", "pos_long": "19.08" },
            "aircraft": { "icao_code": "b738", "name": "Boeing 737-800" },
            "atc": { "callsign": "LOT3901" },
            "params": { "time_generated": "1700000000" }
        });
        let o = parse(&one).unwrap();
        let roles: Vec<_> = o.airports.iter().map(|a| (a.icao.as_str(), a.role.as_str())).collect();
        assert_eq!(roles, [("EPWA", "dep"), ("EPKK", "arr"), ("EPKT", "alt")]);
        assert_eq!(o.aircraft_icao, "B738");
        assert_eq!(o.generated, 1_700_000_000);

        let many = json!({
            "origin": { "icao_code": "EPWA", "pos_lat": 52.16, "pos_long": 20.96 },
            "destination": { "icao_code": "EPKK", "pos_lat": 50.07, "pos_long": 19.78 },
            "alternate": [ { "icao_code": "EPKT", "pos_lat": "50.47", "pos_long": "19.08" }, { "icao_code": "EPKK" } ],
            "takeoff_altn": { "icao_code": "" }
        });
        let o = parse(&many).unwrap();
        // EPKK już jest celem – bez duplikatu; pusty takeoff_altn pominięty.
        assert_eq!(o.airports.len(), 3);
    }

    #[test]
    fn rejects_error_status() {
        assert!(parse(&json!({ "fetch": { "status": "Error: Unknown UserID" } })).is_err());
    }
}
