use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

pub fn validate_public_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "URL tidak valid.".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Hanya URL HTTP(S) yang boleh dibaca.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URL dengan kredensial tidak diizinkan.".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "URL tidak memiliki host.".to_string())?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err("Alamat lokal/private tidak boleh dibaca oleh tool web.".into());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if !is_public_ip(ip) {
            return Err("Alamat lokal/private tidak boleh dibaca oleh tool web.".into());
        }
    }
    Ok(parsed)
}

pub fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => is_public_ipv6(ip),
    }
}

pub fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    !(ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_unspecified()
        || ip.octets()[0] == 0
        || ip.octets()[0] >= 224)
}

pub fn is_public_ipv6(ip: Ipv6Addr) -> bool {
    !(ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_unique_local()
        || ip.is_unicast_link_local()
        || ip.segments()[0] & 0xffc0 == 0xfe80)
}

pub fn strip_obvious_prompt_injection(text: &str) -> String {
    const PATTERNS: [&str; 12] = [
        "ignore previous instructions",
        "ignore all previous",
        "abaikan instruksi sebelumnya",
        "abaikan semua instruksi",
        "system prompt:",
        "<|system|>",
        "assistant:",
        "verify you are human",
        "verification required",
        "enable javascript and cookies",
        "access denied",
        "captcha",
    ];
    text.lines()
        .filter(|line| {
            let lower = line.to_lowercase();
            !PATTERNS.iter().any(|pattern| lower.contains(pattern))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

