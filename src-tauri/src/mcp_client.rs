//! Client MCP stdio minimal untuk web-search-mcp.
//! Hanya mengimplementasikan bagian protokol yang dibutuhkan:
//! initialize → tools/call (JSON-RPC 2.0 line-delimited di stdin/stdout).

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

pub struct McpConfig {
    /// Path ke dist/index.js hasil build web-search-mcp.
    pub index_path: String,
    /// Perintah runtime (default: "node").
    pub node: String,
}

pub struct McpProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
    next_id: u64,
}

use std::process::ChildStdout;

impl McpProcess {
    pub fn spawn(config: &McpConfig) -> Result<McpProcess, String> {
        if !std::path::Path::new(&config.index_path).exists() {
            return Err(format!(
                "File MCP tidak ditemukan: {}\n\nPeriksa konfigurasi path di \
                 Pengaturan → Pencarian Web.",
                config.index_path
            ));
        }

        let mut cmd = Command::new(&config.node);
        cmd.arg(&config.index_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // MCP protocol uses stdout; diagnostics belong on stderr.
            .stderr(Stdio::inherit());
        cmd.env("DEFAULT_TIMEOUT", "8000");
        cmd.env("MAX_CONTENT_LENGTH", "12000");

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = cmd.spawn().map_err(|e| {
            format!("Gagal menjalankan Node.js ({e}).\n\nPastikan Node.js terpasang.")
        })?;

        let stdin = child.stdin.take();
        let stdout = child.stdout.take();
        let Some(stdin) = stdin else {
            let _ = child.kill();
            return Err("stdin MCP tidak tersedia.".into());
        };
        let Some(stdout) = stdout else {
            let _ = child.kill();
            return Err("stdout MCP tidak tersedia.".into());
        };

        Ok(McpProcess {
            child,
            stdin: Some(stdin),
            stdout: Some(BufReader::new(stdout)),
            next_id: 1,
        })
    }

    fn send_raw(&mut self, line: &str) -> Result<(), String> {
        let Some(stdin) = self.stdin.as_mut() else {
            return Err("MCP tidak berjalan.".into());
        };
        stdin
            .write_all(line.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("Gagal menulis ke MCP: {e}"))
    }

    fn read_response(&mut self, expect_id: u64) -> Result<Value, String> {
        let Some(reader) = self.stdout.as_mut() else {
            return Err("MCP tidak berjalan.".into());
        };
        loop {
            let mut line = String::new();
            let n = reader.read_line(&mut line).map_err(|e| e.to_string())?;
            if n == 0 {
                return Err("MCP server menutup koneksi.".into());
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            // Banner/log startup bisa menempel di baris yang sama —
            // ekstrak mulai karakter '{' pertama.
            let json_part = match trimmed.find('{') {
                Some(pos) => &trimmed[pos..],
                None => continue,
            };
            let Ok(value) = serde_json::from_str::<Value>(json_part) else {
                continue;
            };
            if value.get("id").and_then(Value::as_u64) == Some(expect_id) {
                return Ok(value);
            }
            // Notifikasi / respons lain diabaikan.
        }
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let line = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        })
        .to_string();
        self.send_raw(&line)?;
        let response = self.read_response(id)?;
        if let Some(err) = response.get("error") {
            let msg = err
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown error");
            return Err(format!("MCP error ({method}): {msg}"));
        }
        Ok(response
            .get("result")
            .cloned()
            .unwrap_or_else(|| Value::Null))
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
        let line = json!({ "jsonrpc": "2.0", "method": method, "params": params }).to_string();
        self.send_raw(&line)
    }

    pub fn initialize(&mut self) -> Result<(), String> {
        self.request(
            "initialize",
            json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "astra", "version": "0.1.0" }
            }),
        )?;
        self.notify("notifications/initialized", json!({}))
    }

    /// Jalankan tools/call dan gabungkan seluruh blok teks dari konten.
    pub fn call_tool(&mut self, name: &str, args: Value) -> Result<String, String> {
        let result = self.request("tools/call", json!({ "name": name, "arguments": args }))?;

        let is_error = result
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let text = result
            .get("content")
            .and_then(Value::as_array)
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|b| b.get("text").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("\n\n")
            })
            .unwrap_or_default();

        if is_error && text.is_empty() {
            return Err(format!("Tool {name} gagal dijalankan."));
        }
        Ok(text)
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    fn is_alive(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }
}

impl Drop for McpProcess {
    fn drop(&mut self) {
        self.kill();
    }
}

/// Slot proses MCP yang hidup sepanjang aplikasi (hemat startup Node).
#[derive(Clone, Default)]
pub struct McpSlot(Arc<Mutex<Option<(String, McpProcess)>>>);

fn config_fingerprint(config: &McpConfig) -> String {
    let path = std::path::Path::new(&config.index_path);
    let metadata = std::fs::metadata(path).ok();
    let length = metadata.as_ref().map(std::fs::Metadata::len).unwrap_or(0);
    let modified = metadata
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!(
        "{}|{}|{length}|{modified}",
        config.node,
        path.canonicalize()
            .unwrap_or_else(|_| path.to_path_buf())
            .display()
    )
}

/// Ambil proses sesuai konfigurasi; restart bila path, runtime, atau build berubah.
pub fn acquire(slot: &McpSlot, config: &McpConfig) -> Result<(), String> {
    let mut guard = slot.0.lock().map_err(|_| "MCP slot terkunci.")?;
    let fingerprint = config_fingerprint(config);
    let matches = guard
        .as_mut()
        .map(|(f, process)| *f == fingerprint && process.is_alive())
        .unwrap_or(false);
    if !matches {
        if let Some((_, old)) = guard.as_mut() {
            old.kill();
        }
        let mut proc = McpProcess::spawn(config)?;
        proc.initialize()?;
        *guard = Some((fingerprint, proc));
    }
    Ok(())
}

/// Akses &mut proses untuk pemanggilan tool.
pub fn with_client<T>(
    slot: &McpSlot,
    f: impl FnOnce(&mut McpProcess) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = slot.0.lock().map_err(|_| "MCP slot terkunci.")?;
    let Some((_, proc)) = guard.as_mut() else {
        return Err("MCP belum dikonfigurasi.".into());
    };
    f(proc)
}

/// Matikan proses saat aplikasi keluar.
pub fn shutdown(slot: &McpSlot) {
    if let Ok(mut guard) = slot.0.lock() {
        if let Some((_, proc)) = guard.as_mut() {
            proc.kill();
        }
        *guard = None;
    }
}

#[tauri::command]
pub async fn mcp_local_check(
    slot: tauri::State<'_, McpSlot>,
    index_path: String,
    node: String,
) -> Result<serde_json::Value, String> {
    let cfg = McpConfig {
        index_path: index_path.trim().to_string(),
        node: node.trim().to_string(),
    };
    if cfg.index_path.is_empty() {
        return Err("Path belum diisi.".into());
    }

    let task_slot = slot.inner().clone();
    let task = tauri::async_runtime::spawn_blocking(move || -> Result<usize, String> {
        acquire(&task_slot, &cfg)?;
        let tools = with_client(&task_slot, |client| {
            client.request("tools/list", serde_json::json!({}))
        })?;
        Ok(tools
            .get("tools")
            .and_then(Value::as_array)
            .map(|a| a.len())
            .unwrap_or(0))
    });

    match tokio::time::timeout(std::time::Duration::from_secs(20), task).await {
        Ok(Ok(Ok(count))) => Ok(serde_json::json!({ "tools": count })),
        Ok(Ok(Err(e))) => {
            shutdown(&slot);
            Err(e)
        }
        Ok(Err(e)) => {
            shutdown(&slot);
            Err(format!("Task gagal: {e}"))
        }
        Err(_) => {
            shutdown(&slot);
            Err("Timeout: server tidak merespons dalam 20 detik.".into())
        }
    }
}
