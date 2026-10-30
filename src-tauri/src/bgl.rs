//! Odczyt lotnisk z plików BGL scenerii (format FSX/P3D/MSFS).
//!
//! Czytamy tylko nagłówek, tablicę sekcji i rekordy lotnisk – bez wczytywania całego pliku,
//! bo pliki terenu potrafią mieć setki megabajtów. Każdy odczytany rekord jest sprawdzany
//! (poprawny identyfikator, współrzędne w zakresie), więc nieznane warianty formatu
//! po prostu nie dają wyników zamiast śmieci.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

const MAGIC: u32 = 0x1992_0201;
const SECTION_AIRPORT: u32 = 0x0003;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BglAirport {
    pub icao: String,
    pub lat: f64,
    pub lon: f64,
}

/// Identyfikator zapisany w bazie 38 (spacja, cyfry, litery), jak w rekordach lotnisk.
pub fn decode_ident(raw: u32) -> Option<String> {
    let mut v = raw >> 5;
    let mut chars = vec![];
    while v > 0 {
        let c = v % 38;
        v /= 38;
        chars.push(match c {
            0 => ' ',
            2..=11 => (b'0' + (c - 2) as u8) as char,
            12..=37 => (b'A' + (c - 12) as u8) as char,
            _ => return None,
        });
    }
    chars.reverse();
    let s: String = chars.into_iter().collect::<String>().trim().to_string();
    let ok = (2..=8).contains(&s.len()) && s.chars().all(|c| c.is_ascii_alphanumeric());
    ok.then_some(s)
}

pub fn lon_of(raw: u32) -> f64 {
    raw as f64 * (360.0 / (3.0 * 268_435_456.0)) - 180.0
}

pub fn lat_of(raw: u32) -> f64 {
    90.0 - raw as f64 * (180.0 / (2.0 * 268_435_456.0))
}

fn u32_at(b: &[u8], o: usize) -> Option<u32> {
    b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
}

fn read_at(f: &mut File, offset: u64, len: usize) -> Option<Vec<u8>> {
    f.seek(SeekFrom::Start(offset)).ok()?;
    let mut buf = vec![0u8; len];
    f.read_exact(&mut buf).ok()?;
    Some(buf)
}

/// Rekordy lotnisk z bloku danych podsekcji.
pub fn parse_airport_records(data: &[u8]) -> Vec<BglAirport> {
    let mut out = vec![];
    let mut o = 0usize;
    while o + 0x30 <= data.len() {
        let size = u32_at(data, o + 2).unwrap_or(0) as usize;
        if size < 0x30 || o + size > data.len() {
            break;
        }
        let lon = u32_at(data, o + 0x0C).map(lon_of);
        let lat = u32_at(data, o + 0x10).map(lat_of);
        let icao = u32_at(data, o + 0x28).and_then(decode_ident);
        if let (Some(lon), Some(lat), Some(icao)) = (lon, lat, icao) {
            if (-90.0..=90.0).contains(&lat) && (-180.0..=180.0).contains(&lon) {
                out.push(BglAirport { icao, lat: (lat * 1e5).round() / 1e5, lon: (lon * 1e5).round() / 1e5 });
            }
        }
        o += size;
    }
    out
}

/// Lotniska zapisane w jednym pliku BGL.
pub fn airports_in(path: &Path) -> Vec<BglAirport> {
    let Ok(mut f) = File::open(path) else { return vec![] };
    let Some(header) = read_at(&mut f, 0, 0x38) else { return vec![] };
    if u32_at(&header, 0) != Some(MAGIC) {
        return vec![];
    }
    let file_len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let sections = u32_at(&header, 0x14).unwrap_or(0).min(512) as usize;
    let Some(table) = read_at(&mut f, 0x38, sections * 20) else { return vec![] };
    let mut out = vec![];
    for i in 0..sections {
        let s = &table[i * 20..i * 20 + 20];
        let (kind, flag) = (u32_at(s, 0).unwrap_or(0), u32_at(s, 4).unwrap_or(0));
        if kind != SECTION_AIRPORT {
            continue;
        }
        let count = u32_at(s, 8).unwrap_or(0).min(4096) as usize;
        let offset = u32_at(s, 12).unwrap_or(0) as u64;
        let entry = (((flag & 0x10000) | 0x40000) >> 0x0E) as usize;
        if entry != 16 && entry != 20 {
            continue;
        }
        let Some(subs) = read_at(&mut f, offset, count * entry) else { continue };
        for j in 0..count {
            let e = &subs[j * entry..(j + 1) * entry];
            let base = entry - 12;
            let (data_offset, data_size) = (u32_at(e, base + 4).unwrap_or(0) as u64, u32_at(e, base + 8).unwrap_or(0) as usize);
            if data_size == 0 || data_size > 32 * 1024 * 1024 || data_offset + data_size as u64 > file_len {
                continue;
            }
            if let Some(data) = read_at(&mut f, data_offset, data_size) {
                out.extend(parse_airport_records(&data));
            }
        }
    }
    out.sort_by(|a, b| a.icao.cmp(&b.icao));
    out.dedup_by(|a, b| a.icao == b.icao);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode_ident(s: &str) -> u32 {
        let mut v: u32 = 0;
        for c in s.chars() {
            let d = match c {
                '0'..='9' => c as u32 - '0' as u32 + 2,
                'A'..='Z' => c as u32 - 'A' as u32 + 12,
                _ => 0,
            };
            v = v * 38 + d;
        }
        v << 5
    }

    fn record(icao: &str, lat: f64, lon: f64) -> Vec<u8> {
        let mut r = vec![0u8; 0x38];
        r[0..2].copy_from_slice(&0x003Cu16.to_le_bytes());
        r[2..6].copy_from_slice(&(0x38u32).to_le_bytes());
        let lon_raw = ((lon + 180.0) * (3.0 * 268_435_456.0) / 360.0) as u32;
        let lat_raw = ((90.0 - lat) * (2.0 * 268_435_456.0) / 180.0) as u32;
        r[0x0C..0x10].copy_from_slice(&lon_raw.to_le_bytes());
        r[0x10..0x14].copy_from_slice(&lat_raw.to_le_bytes());
        r[0x28..0x2C].copy_from_slice(&encode_ident(icao).to_le_bytes());
        r
    }

    #[test]
    fn ident_roundtrip() {
        assert_eq!(decode_ident(encode_ident("EPWA")).as_deref(), Some("EPWA"));
        assert_eq!(decode_ident(encode_ident("K00")).as_deref(), Some("K00"));
        assert_eq!(decode_ident(0), None);
    }

    #[test]
    fn full_file() {
        // Nagłówek + jedna sekcja lotnisk + jedna podsekcja (16 bajtów) + dwa rekordy.
        let mut recs = record("EPWA", 52.1657, 20.9671);
        recs.extend(record("EPKK", 50.0777, 19.7848));
        let mut f = vec![0u8; 0x38];
        f[0..4].copy_from_slice(&MAGIC.to_le_bytes());
        f[0x14..0x18].copy_from_slice(&1u32.to_le_bytes());
        let sub_offset = 0x38 + 20;
        let data_offset = sub_offset + 16;
        let mut section = vec![];
        for v in [SECTION_AIRPORT, 0, 1, sub_offset as u32, 16] {
            section.extend(v.to_le_bytes());
        }
        f.extend(section);
        for v in [0u32, 2, data_offset as u32, recs.len() as u32] {
            f.extend(v.to_le_bytes());
        }
        f.extend(recs);
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("apt.bgl");
        std::fs::write(&p, f).unwrap();
        let got = airports_in(&p);
        assert_eq!(got.len(), 2);
        let wa = got.iter().find(|a| a.icao == "EPWA").unwrap();
        assert!((wa.lat - 52.1657).abs() < 1e-3 && (wa.lon - 20.9671).abs() < 1e-3);
    }
}
