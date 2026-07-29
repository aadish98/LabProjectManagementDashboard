#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::secrets::{
    delete_session_secret, load_session_secret, store_session_secret, verify_session_secret_vault,
    verify_session_secret_vault_round_trip,
};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    thread,
    time::Duration,
};
use tauri::{Emitter, Window};

const SPREADSHEET_MIME_TYPE: &str = "application/vnd.google-apps.spreadsheet";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DrivePickerOptions {
    request_id: String,
    access_token: String,
    api_key: String,
    app_id: String,
    multiselect: bool,
    query: Option<String>,
    title: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PickedSpreadsheet {
    id: String,
    name: String,
    url: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DrivePickerResult {
    request_id: String,
    documents: Vec<PickedSpreadsheet>,
    error: Option<String>,
}

#[derive(Default)]
struct HttpRequest {
    method: String,
    path: String,
    body: String,
}

#[tauri::command]
fn open_drive_picker(window: Window, options: DrivePickerOptions) -> Result<u16, String> {
    if options.access_token.trim().is_empty() {
        return Err("Google needs a fresh sign-in before opening Drive Picker.".into());
    }
    if options.api_key.trim().is_empty() {
        return Err("Drive Picker is missing the Google API key.".into());
    }
    if options.app_id.trim().is_empty() {
        return Err("Drive Picker is missing the Google app ID.".into());
    }

    let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
        .map_err(|err| format!("Could not start the local Drive Picker server: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("Could not read the local Drive Picker port: {err}"))?
        .port();
    let url = format!("http://127.0.0.1:{port}/");

    thread::spawn(move || run_drive_picker_server(listener, window, options));
    open::that(&url)
        .map_err(|err| format!("Could not open Google Drive Picker in your browser: {err}"))?;

    Ok(port)
}

fn run_drive_picker_server(listener: TcpListener, window: Window, options: DrivePickerOptions) {
    for stream in listener.incoming().take(16) {
        match stream {
            Ok(mut stream) => {
                if handle_drive_picker_request(&mut stream, &window, &options) {
                    break;
                }
            }
            Err(err) => {
                emit_drive_picker_result(
                    &window,
                    DrivePickerResult {
                        request_id: options.request_id.clone(),
                        documents: Vec::new(),
                        error: Some(format!("Drive Picker server failed: {err}")),
                    },
                );
                break;
            }
        }
    }
}

fn handle_drive_picker_request(
    stream: &mut TcpStream,
    window: &Window,
    options: &DrivePickerOptions,
) -> bool {
    let request = match read_http_request(stream) {
        Ok(request) => request,
        Err(err) => {
            let _ = write_http_response(stream, 400, "text/plain", &err);
            return false;
        }
    };

    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/") => {
            let html = build_drive_picker_page(options);
            let _ = write_http_response(stream, 200, "text/html; charset=utf-8", &html);
            false
        }
        ("POST", "/picked") => {
            let result = parse_drive_picker_result(&options.request_id, &request.body);
            emit_drive_picker_result(window, result.clone());
            let html = if result.error.is_some() {
                "<html><body><h1>Drive Picker failed</h1><p>You can close this tab and return to Lab Workflow Desktop.</p></body></html>"
            } else {
                "<html><body><h1>Spreadsheet selected</h1><p>You can close this tab and return to Lab Workflow Desktop.</p></body></html>"
            };
            let _ = write_http_response(stream, 200, "text/html; charset=utf-8", html);
            true
        }
        ("GET", "/cancel") => {
            emit_drive_picker_result(
                window,
                DrivePickerResult {
                    request_id: options.request_id.clone(),
                    documents: Vec::new(),
                    error: None,
                },
            );
            let _ = write_http_response(
                stream,
                200,
                "text/html; charset=utf-8",
                "<html><body><h1>Drive Picker cancelled</h1><p>You can close this tab and return to Lab Workflow Desktop.</p></body></html>",
            );
            true
        }
        _ => {
            let _ = write_http_response(stream, 404, "text/plain", "Not found");
            false
        }
    }
}

fn emit_drive_picker_result(window: &Window, result: DrivePickerResult) {
    let _ = window.emit("drive-picker://result", result);
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];
    let mut header_end = None;

    for _ in 0..32 {
        let read = stream
            .read(&mut chunk)
            .map_err(|err| format!("Could not read local Picker request: {err}"))?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(index) = find_header_end(&buffer) {
            header_end = Some(index);
            break;
        }
    }

    let header_end =
        header_end.ok_or_else(|| "Local Picker request did not include headers.".to_string())?;
    let header_text = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = header_text.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "Local Picker request was empty.".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_string();
    let raw_path = request_parts.next().unwrap_or_default();
    let path = raw_path.split('?').next().unwrap_or(raw_path).to_string();

    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.trim().parse::<usize>().ok())
        .unwrap_or(0);

    let body_start = header_end + 4;
    while buffer.len().saturating_sub(body_start) < content_length {
        let read = stream
            .read(&mut chunk)
            .map_err(|err| format!("Could not read local Picker request body: {err}"))?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    let body_end = body_start.saturating_add(content_length).min(buffer.len());
    let body = String::from_utf8_lossy(&buffer[body_start..body_end]).to_string();

    Ok(HttpRequest { method, path, body })
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &str,
) -> std::io::Result<()> {
    let status_text = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "OK",
    };
    let response = format!(
        "HTTP/1.1 {status} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n{body}",
        body.as_bytes().len()
    );
    stream.write_all(response.as_bytes())?;
    stream.flush()
}

fn parse_drive_picker_result(request_id: &str, body: &str) -> DrivePickerResult {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BrowserResult {
        documents: Option<Vec<PickedSpreadsheet>>,
        error: Option<String>,
    }

    match serde_json::from_str::<BrowserResult>(body) {
        Ok(result) => DrivePickerResult {
            request_id: request_id.to_string(),
            documents: result.documents.unwrap_or_default(),
            error: result.error,
        },
        Err(err) => DrivePickerResult {
            request_id: request_id.to_string(),
            documents: Vec::new(),
            error: Some(format!("Could not parse Drive Picker result: {err}")),
        },
    }
}

fn build_drive_picker_page(options: &DrivePickerOptions) -> String {
    let config_json = serde_json::to_string(options).unwrap_or_else(|_| "{}".to_string());
    format!(
        r#"<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Choose Google Sheet</title>
  <style>
    body {{ background: #0b1020; color: #eef2ff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 48px; }}
    .card {{ background: #111827; border: 1px solid #273244; border-radius: 18px; margin: 0 auto; max-width: 680px; padding: 28px; }}
    button {{ background: #2563eb; border: 0; border-radius: 12px; color: white; cursor: pointer; font-size: 16px; font-weight: 700; padding: 12px 16px; }}
    .muted {{ color: #bac7dc; line-height: 1.55; }}
    .error {{ color: #fecaca; }}
  </style>
  <script src="https://apis.google.com/js/api.js"></script>
</head>
<body>
  <div class="card">
    <h1>Choose Google Sheet</h1>
    <p id="status" class="muted">Loading Google Drive Picker...</p>
    <button id="retry" style="display:none">Try again</button>
  </div>
  <script>
    const config = {config_json};
    const spreadsheetMimeType = {mime_type_json};

    function postResult(payload) {{
      return fetch('/picked', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify(payload)
      }});
    }}

    function done(documents) {{
      postResult({{ documents }}).finally(() => {{
        document.body.innerHTML = '<div class="card"><h1>Spreadsheet selected</h1><p class="muted">You can close this tab and return to Lab Workflow Desktop.</p></div>';
      }});
    }}

    function fail(message) {{
      document.getElementById('status').className = 'error';
      document.getElementById('status').textContent = message;
      document.getElementById('retry').style.display = 'inline-block';
      postResult({{ documents: [], error: message }}).catch(() => {{}});
    }}

    function buildSpreadsheetUrl(id) {{
      return `https://docs.google.com/spreadsheets/d/${{id}}/edit`;
    }}

    function openPicker() {{
      document.getElementById('status').className = 'muted';
      document.getElementById('status').textContent = 'Opening Google Drive Picker...';
      document.getElementById('retry').style.display = 'none';
      const pickerApi = window.google && window.google.picker;
      if (!pickerApi) {{
        fail('Google Picker API did not load. Confirm Google Picker API is enabled for this project.');
        return;
      }}

      const view = new pickerApi.DocsView(pickerApi.ViewId.SPREADSHEETS);
      view.setIncludeFolders(false);
      view.setMimeTypes(spreadsheetMimeType);
      view.setMode(pickerApi.DocsViewMode.LIST);
      if (config.query && typeof view.setQuery === 'function') view.setQuery(config.query);
      view.setSelectFolderEnabled(false);

      const builder = new pickerApi.PickerBuilder()
        .addView(view)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .setOrigin(window.location.protocol + '//' + window.location.host)
        .setCallback((data) => {{
          const action = data[pickerApi.Response.ACTION];
          if (action === pickerApi.Action.CANCEL) {{
            done([]);
            return;
          }}
          if (action !== pickerApi.Action.PICKED) return;
          const rawDocs = Array.isArray(data[pickerApi.Response.DOCUMENTS]) ? data[pickerApi.Response.DOCUMENTS] : [];
          const documents = rawDocs
            .map((doc) => {{
              const id = doc[pickerApi.Document.ID] || '';
              const name = doc[pickerApi.Document.NAME] || id;
              const url = doc[pickerApi.Document.URL] || (id ? buildSpreadsheetUrl(id) : '');
              return {{ id, name, url }};
            }})
            .filter((doc) => doc.id);
          done(documents);
        }});

      if (config.title) builder.setTitle(config.title);
      if (config.multiselect) builder.enableFeature(pickerApi.Feature.MULTISELECT_ENABLED);
      const picker = builder.build();
      picker.setVisible(true);
    }}

    document.getElementById('retry').addEventListener('click', openPicker);
    if (!window.gapi) {{
      fail('Google API loader did not initialize.');
    }} else {{
      window.gapi.load('picker', {{
        callback: openPicker,
        onerror: () => fail('Failed to load Google Picker.'),
        timeout: 15000,
        ontimeout: () => fail('Timed out loading Google Picker.')
      }});
    }}
  </script>
</body>
</html>"#,
        config_json = config_json,
        mime_type_json = serde_json::to_string(SPREADSHEET_MIME_TYPE).unwrap()
    )
}

fn main() {
    if std::env::args().any(|argument| argument == "--verify-credential-vault") {
        match verify_session_secret_vault_round_trip() {
            Ok(evidence) => {
                let output = serde_json::to_string(&evidence)
                    .expect("credential-vault evidence should serialize");
                println!("{output}");
                std::process::exit(0);
            }
            Err(error) => {
                eprintln!("Credential-vault verification failed: {error}");
                std::process::exit(1);
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            open_drive_picker,
            store_session_secret,
            load_session_secret,
            delete_session_secret,
            verify_session_secret_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
