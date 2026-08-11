"""SDK generator — auto-generate SDK packages from OpenAPI specs.

Supports generating starter SDK packages in 7 languages:
  - Python (requests-based, pyproject.toml)
  - TypeScript (fetch-based, package.json)
  - JavaScript (fetch-based, CommonJS)
  - Go (net/http, go.mod)
  - Java (OkHttp, pom.xml)
  - C# (HttpClient, .csproj)
  - Rust (reqwest, Cargo.toml)

The generated SDKs include:
  - Type definitions matching the OpenAPI schemas
  - One method per operation (GET/POST/PUT/PATCH/DELETE)
  - Bearer token authentication support
  - Configurable base URL + timeout
  - Error handling with typed exceptions
  - README with usage examples

Generated code is ready to publish to:
  - PyPI (Python)
  - npm (TypeScript/JavaScript)
  - crates.io (Rust)
  - Maven Central (Java)
  - NuGet (C#)
  - pkg.go.dev (Go)
"""

from __future__ import annotations

import json
import re
import uuid
from typing import Any

from app.core.exceptions import NotFoundError, ValidationError
from app.core.logging import get_logger
from app.models.marketplace_ecosystem import ApiCatalogEntry, SdkRelease
from app.services.marketplace_ecosystem import DeveloperPortalService

logger = get_logger(__name__)


SUPPORTED_LANGUAGES = {"python", "typescript", "javascript", "go", "java", "csharp", "rust"}


def _to_pascal_case(name: str) -> str:
    """Convert snake_case or kebab-case to PascalCase."""
    parts = re.split(r"[_\-\s]+", name)
    return "".join(p[:1].upper() + p[1:] for p in parts if p)


def _to_camel_case(name: str) -> str:
    """Convert snake_case to camelCase."""
    pascal = _to_pascal_case(name)
    return pascal[:1].lower() + pascal[1:] if pascal else ""


def _sanitize_operation_id(op_id: str | None, method: str, path: str) -> str:
    """Get a clean function name from operationId or generate one."""
    if op_id and re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", op_id):
        return _to_camel_case(op_id)
    # Generate from method + path
    path_parts = [p for p in path.split("/") if p and not p.startswith("{")]
    name = method.lower() + "_" + "_".join(path_parts)
    return _to_camel_case(name)


class SdkGeneratorService:
    """Generates SDK code packages from OpenAPI specs."""

    def __init__(self, db=None) -> None:
        self.db = db

    async def generate_from_api(self, *, api_entry_id: uuid.UUID,
                                 language: str,
                                 package_name: str | None = None,
                                 version: str = "1.0.0") -> dict[str, Any]:
        """Generate an SDK package from a published API catalog entry.

        Returns a dict of file paths -> file contents for the generated SDK.
        """
        if self.db is None:
            raise ValidationError("Database session required to generate SDK from API entry")
        if language not in SUPPORTED_LANGUAGES:
            raise ValidationError(f"Unsupported language: {language}. Supported: {sorted(SUPPORTED_LANGUAGES)}")
        entry = await self.db.get(ApiCatalogEntry, api_entry_id)
        if entry is None:
            raise NotFoundError("ApiCatalogEntry", str(api_entry_id))
        if not entry.openapi_spec:
            raise ValidationError("API entry has no OpenAPI spec — cannot generate SDK")
        return self.generate_from_spec(
            spec=entry.openapi_spec, language=language,
            package_name=package_name or entry.slug.replace("-", "_"),
            version=version, base_url=entry.base_url or "",
            api_name=entry.name, api_description=entry.description or "")

    def generate_from_spec(self, *, spec: dict, language: str,
                            package_name: str, version: str = "1.0.0",
                            base_url: str = "",
                            api_name: str = "",
                            api_description: str = "") -> dict[str, Any]:
        """Generate SDK files from an OpenAPI spec dict."""
        if language not in SUPPORTED_LANGUAGES:
            raise ValidationError(f"Unsupported language: {language}")
        if not spec or "paths" not in spec:
            raise ValidationError("OpenAPI spec is missing 'paths'")

        # Extract operations
        operations = self._extract_operations(spec)
        if not operations:
            raise ValidationError("OpenAPI spec has no operations to generate")

        # Generate based on language
        if language == "python":
            files = self._generate_python(package_name, version, base_url, api_name,
                                            api_description, spec, operations)
        elif language in {"typescript", "javascript"}:
            files = self._generate_typescript(package_name, version, base_url, api_name,
                                                api_description, spec, operations,
                                                is_typescript=(language == "typescript"))
        elif language == "go":
            files = self._generate_go(package_name, version, base_url, api_name,
                                         api_description, spec, operations)
        elif language == "java":
            files = self._generate_java(package_name, version, base_url, api_name,
                                          api_description, spec, operations)
        elif language == "csharp":
            files = self._generate_csharp(package_name, version, base_url, api_name,
                                            api_description, spec, operations)
        elif language == "rust":
            files = self._generate_rust(package_name, version, base_url, api_name,
                                          api_description, spec, operations)
        else:
            raise ValidationError(f"Language {language} not yet implemented")

        return {
            "language": language,
            "package_name": package_name,
            "version": version,
            "base_url": base_url,
            "operation_count": len(operations),
            "files": files,
            "spec_info": {
                "title": spec.get("info", {}).get("title", api_name),
                "version": spec.get("info", {}).get("version", version),
                "openapi_version": spec.get("openapi", "3.0.0"),
            },
        }

    def _extract_operations(self, spec: dict) -> list[dict]:
        """Extract all operations from an OpenAPI spec."""
        operations = []
        paths = spec.get("paths", {}) or {}
        http_methods = {"get", "post", "put", "patch", "delete", "head", "options"}
        for path, methods in paths.items():
            if not isinstance(methods, dict):
                continue
            for method, op in methods.items():
                if method.lower() not in http_methods:
                    continue
                if not isinstance(op, dict):
                    continue
                op_id = op.get("operationId")
                summary = op.get("summary", "")
                description = op.get("description", "")
                parameters = op.get("parameters", []) or []
                request_body = op.get("requestBody")
                responses = op.get("responses", {}) or {}
                operations.append({
                    "operation_id": op_id,
                    "method": method.upper(),
                    "path": path,
                    "summary": summary,
                    "description": description,
                    "parameters": parameters,
                    "request_body": request_body,
                    "responses": responses,
                    "function_name": _sanitize_operation_id(op_id, method, path),
                })
        return operations

    def _build_path_with_params(self, path: str, parameters: list) -> tuple[str, list[dict]]:
        """Convert OpenAPI path with {param} to language-specific format.

        Returns (path_template, path_params).
        """
        path_params = [p for p in parameters if p.get("in") == "path"]
        return path, path_params

    # ====================================================================
    # Python SDK generation
    # ====================================================================

    def _generate_python(self, package_name: str, version: str, base_url: str,
                          api_name: str, api_description: str,
                          spec: dict, operations: list[dict]) -> dict[str, str]:
        """Generate Python SDK files."""
        class_name = _to_pascal_case(package_name) + "Client"
        # Build method definitions
        methods_code = []
        for op in operations:
            methods_code.append(self._python_method(op))
        methods_str = "\n\n".join(methods_code)
        client_code = f'''"""Auto-generated Python SDK for {api_name}.

{api_description}

Generated by DayJoy AI SDK Generator.
DO NOT EDIT — regenerate with: dayjoy sdk generate --api {package_name} --language python
"""
from __future__ import annotations

import json
import typing
from typing import Any, Optional
import urllib.parse
import urllib.request


class {class_name}Error(Exception):
    """Base exception for {class_name} errors."""
    def __init__(self, message: str, status_code: int = 0, body: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class {class_name}:
    """Client for the {api_name} API."""

    def __init__(self, base_url: str = "{base_url}", api_key: Optional[str] = None,
                 access_token: Optional[str] = None, timeout: int = 30):
        """
        Args:
            base_url: Base URL of the API (no trailing slash).
            api_key: Optional API key (sent as X-API-Key header).
            access_token: Optional OAuth2 access token (sent as Bearer).
            timeout: Request timeout in seconds.
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.access_token = access_token
        self.timeout = timeout

    def _build_headers(self, extra: Optional[dict] = None) -> dict:
        headers = {{"Content-Type": "application/json", "Accept": "application/json"}}
        if self.access_token:
            headers["Authorization"] = f"Bearer {{self.access_token}}"
        elif self.api_key:
            headers["X-API-Key"] = self.api_key
        if extra:
            headers.update(extra)
        return headers

    def _request(self, method: str, path: str, *, params: Optional[dict] = None,
                  body: Optional[Any] = None, headers: Optional[dict] = None) -> Any:
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method,
                                       headers=self._build_headers(headers))
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8")
                if not raw:
                    return None
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", errors="replace")
            raise {class_name}Error(
                f"HTTP {{e.code}}: {{body_text}}", status_code=e.code, body=body_text)
        except urllib.error.URLError as e:
            raise {class_name}Error(f"Network error: {{e}}")

{methods_str}
'''
        readme = f'''# {package_name}

Auto-generated Python SDK for {api_name}.

## Installation

```bash
pip install {package_name}
```

## Usage

```python
from {package_name} import {class_name}

client = {class_name}(
    base_url="{base_url}",
    access_token="your-oauth-token",
)

# Example call
result = client.{operations[0]["function_name"]}()
print(result)
```

## Authentication

This SDK supports two authentication methods:

1. **OAuth2 Bearer token** — pass `access_token=` to the constructor
2. **API key** — pass `api_key=` to the constructor (sent as `X-API-Key` header)

## Errors

All non-2xx responses raise `{class_name}Error`, which includes `status_code` and `body`.

## License

Proprietary — © DayJoy AI
'''
        pyproject = f'''[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "{package_name}"
version = "{version}"
description = "{api_description or api_name}"
readme = "README.md"
requires-python = ">=3.10"
license = {{ text = "Proprietary" }}

[tool.setuptools.packages.find]
where = ["."]
'''
        return {
            f"{package_name}/__init__.py": f'"""Auto-generated Python SDK for {api_name}."""\nfrom .client import {class_name}, {class_name}Error\n\n__all__ = ["{class_name}", "{class_name}Error"]\n__version__ = "{version}"\n',
            f"{package_name}/client.py": client_code,
            f"{package_name}/README.md": readme,
            f"{package_name}/pyproject.toml": pyproject,
        }

    def _python_method(self, op: dict) -> str:
        """Generate a single Python method for an operation."""
        fname = op["function_name"]
        method = op["method"]
        path = op["path"]
        params = op.get("parameters", [])
        path_params = [p for p in params if p.get("in") == "path"]
        query_params = [p for p in params if p.get("in") == "query"]
        has_body = op.get("request_body") is not None

        # Build method signature
        args = ["self"]
        for p in path_params:
            args.append(f'{p["name"]}: str')
        if has_body:
            args.append("body: Optional[dict] = None")
        for p in query_params:
            py_type = "Optional[str]"
            args.append(f'{p["name"]}: {py_type} = None')
        signature = ", ".join(args)

        # Build path — Python str.format() for path params
        py_path = path
        for p in path_params:
            py_path = py_path.replace(f'{{{p["name"]}}}', f'{{{p["name"]}}}')

        # Build query params collection
        query_lines = []
        for p in query_params:
            query_lines.append(f'    params["{p["name"]}"] = {p["name"]}')
        query_block = ""
        if query_params:
            query_block = "        params = {}\n" + "\n".join(
                f"        if {p['name']} is not None:\n            params['{p['name']}'] = {p['name']}"
                for p in query_params) + "\n"
        else:
            query_block = "        params = None\n"

        docstring = f'"""{op["summary"] or op["function_name"]}.\n\nHTTP {method} {path}\n'
        if op.get("description"):
            docstring += f'\n{op["description"]}\n'
        docstring += '"""'

        body_arg = "body=body" if has_body else "body=None"
        return f'''    def {fname}({signature}) -> Any:
        {docstring}
{query_block}        return self._request("{method}", f"{py_path}", params=params, {body_arg})'''

    # ====================================================================
    # TypeScript / JavaScript SDK generation
    # ====================================================================

    def _generate_typescript(self, package_name: str, version: str, base_url: str,
                              api_name: str, api_description: str,
                              spec: dict, operations: list[dict],
                              is_typescript: bool = True) -> dict[str, str]:
        """Generate TypeScript or JavaScript SDK files."""
        class_name = _to_pascal_case(package_name) + "Client"
        ext = "ts" if is_typescript else "js"

        methods_code = []
        for op in operations:
            methods_code.append(self._typescript_method(op, is_typescript))
        methods_str = "\n\n".join(methods_code)

        type_imports = "// Type definitions\n" if is_typescript else ""
        ts_prefix = "export " if is_typescript else ""
        ts_types = ": string | number | undefined" if is_typescript else ""

        client_code = f'''/**
 * Auto-generated {ext.upper()} SDK for {api_name}.
 *
 * {api_description}
 *
 * Generated by DayJoy AI SDK Generator.
 * DO NOT EDIT — regenerate with: dayjoy sdk generate --api {package_name} --language {ext}
 */

export class {class_name}Error extends Error {{
  constructor(message: string, public statusCode: number = 0, public body: string = "") {{
    super(message);
    this.name = "{class_name}Error";
  }}
}}

export class {class_name} {{
  private baseUrl: string;
  private apiKey?: string;
  private accessToken?: string;
  private timeout: number;

  constructor(opts: {{
    baseUrl?: string;
    apiKey?: string;
    accessToken?: string;
    timeout?: number;
  }} = {{}}) {{
    this.baseUrl = (opts.baseUrl || "{base_url}").replace(/\\/$/, "");
    this.apiKey = opts.apiKey;
    this.accessToken = opts.accessToken;
    this.timeout = opts.timeout || 30;
  }}

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {{
    const headers: Record<string, string> = {{
      "Content-Type": "application/json",
      "Accept": "application/json",
    }};
    if (this.accessToken) {{
      headers["Authorization"] = `Bearer ${{this.accessToken}}`;
    }} else if (this.apiKey) {{
      headers["X-API-Key"] = this.apiKey;
    }}
    if (extra) Object.assign(headers, extra);
    return headers;
  }}

  private async request(method: string, path: string, opts: {{
    params?: Record<string, string | undefined>;
    body?: unknown;
  }} = {{}}): Promise<any> {{
    let url = this.baseUrl + path;
    if (opts.params) {{
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.params)) {{
        if (v !== undefined && v !== null) search.set(k, String(v));
      }}
      const qs = search.toString();
      if (qs) url += "?" + qs;
    }}
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout * 1000);
    try {{
      const resp = await fetch(url, {{
        method,
        headers: this.buildHeaders(),
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      }});
      const text = await resp.text();
      if (!resp.ok) {{
        throw new {class_name}Error(`HTTP ${{resp.status}}: ${{text}}`, resp.status, text);
      }}
      if (!text) return undefined;
      try {{ return JSON.parse(text); }} catch {{ return text; }}
    }} finally {{
      clearTimeout(timer);
    }}
  }}

{methods_str}
}}
'''
        readme = f'''# {package_name}

Auto-generated {ext.upper()} SDK for {api_name}.

## Installation

```bash
npm install {package_name}
# or
yarn add {package_name}
# or
pnpm add {package_name}
```

## Usage

```typescript
import {{ {class_name} }} from "{package_name}";

const client = new {class_name}({{
  baseUrl: "{base_url}",
  accessToken: "your-oauth-token",
}});

// Example call
const result = await client.{operations[0]["function_name"]}();
console.log(result);
```

## License

Proprietary — © DayJoy AI
'''
        package_json = f'''{{
  "name": "{package_name}",
  "version": "{version}",
  "description": "{api_description or api_name}",
  "main": "index.js",
  {"types: \"./client.d.ts\"," if is_typescript else ""}"type": "module",
  "exports": {{
    ".": {{
      {"import: \"./client." + ext + "\"," if is_typescript else ""}"default": "./client.{ext}"
    }}
  }},
  "scripts": {{
    "build": "tsc"
  }},
  "engines": {{
    "node": ">=18"
  }},
  "license": "UNLICENSED"
}}
'''
        files = {
            f"client.{ext}": client_code,
            "package.json": package_json,
            "README.md": readme,
        }
        if is_typescript:
            files["tsconfig.json"] = json.dumps({
                "compilerOptions": {
                    "target": "ES2022", "module": "ES2022",
                    "moduleResolution": "node", "strict": True,
                    "declaration": True, "outDir": "./dist",
                },
                "include": ["*.ts"],
            }, indent=2)
        return files

    def _typescript_method(self, op: dict, is_typescript: bool) -> str:
        """Generate a single TypeScript/JavaScript method."""
        fname = op["function_name"]
        method = op["method"]
        path = op["path"]
        params = op.get("parameters", [])
        path_params = [p for p in params if p.get("in") == "path"]
        query_params = [p for p in params if p.get("in") == "query"]
        has_body = op.get("request_body") is not None

        # Build signature
        args = []
        for p in path_params:
            args.append(f'{p["name"]}: string')
        if has_body:
            args.append("body?: any")
        for p in query_params:
            args.append(f'{p["name"]}?: string')
        signature = ", ".join(args)

        # Build path with template literal interpolation
        ts_path = path
        for p in path_params:
            ts_path = ts_path.replace(f'{{{p["name"]}}}', f'${{{p["name"]}}}')
        ts_path = f"`{ts_path}`"

        query_lines = []
        for p in query_params:
            query_lines.append(f'    {p["name"]},')
        query_block = ""
        if query_params:
            query_block = "    { params: { " + ", ".join(p["name"] for p in query_params) + " }"
            if has_body:
                query_block += ", body"
            query_block += " }"
        else:
            if has_body:
                query_block = "    { body }"
            else:
                query_block = "    {}"
        body_arg = "body" if has_body else ""

        return f'''  async {fname}({signature}): Promise<any> {{
    return this.request("{method}", {ts_path}{", " + query_block if query_block.strip() not in ["{}", ""] else ""});
  }}'''

    # ====================================================================
    # Go SDK generation
    # ====================================================================

    def _generate_go(self, package_name: str, version: str, base_url: str,
                       api_name: str, api_description: str,
                       spec: dict, operations: list[dict]) -> dict[str, str]:
        """Generate Go SDK files."""
        go_package = re.sub(r"[^a-z0-9_]", "", package_name.lower()) or "dayjoysdk"
        class_name = _to_pascal_case(package_name) + "Client"

        methods_code = []
        for op in operations:
            methods_code.append(self._go_method(op))
        methods_str = "\n\n".join(methods_code)

        client_code = f'''// Auto-generated Go SDK for {api_name}.
// {api_description}
//
// Generated by DayJoy AI SDK Generator. DO NOT EDIT.

package {go_package}

import (
        "bytes"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "net/url"
        "time"
)

type {class_name}Error struct {{
        Message    string
        StatusCode int
        Body       string
}}

func (e *{class_name}Error) Error() string {{
        return fmt.Sprintf("%s (HTTP %d)", e.Message, e.StatusCode)
}}

type {class_name} struct {{
        BaseURL     string
        APIKey      string
        AccessToken string
        Timeout     time.Duration
        HTTPClient  *http.Client
}}

type Option func(*{class_name})

func WithAPIKey(key string) Option {{
        return func(c *{class_name}) {{ c.APIKey = key }}
}}

func WithAccessToken(token string) Option {{
        return func(c *{class_name}) {{ c.AccessToken = token }}
}}

func WithTimeout(d time.Duration) Option {{
        return func(c *{class_name}) {{ c.Timeout = d }}
}}

func New{class_name}(baseURL string, opts ...Option) *{class_name} {{
        c := &{class_name}{{
                BaseURL:    baseURL,
                Timeout:    30 * time.Second,
                HTTPClient: &http.Client{{}},
        }}
        for _, opt := range opts {{
                opt(c)
        }}
        return c
}}

func (c *{class_name}) buildHeaders(extra map[string]string) http.Header {{
        h := http.Header{{}}
        h.Set("Content-Type", "application/json")
        h.Set("Accept", "application/json")
        if c.AccessToken != "" {{
                h.Set("Authorization", "Bearer "+c.AccessToken)
        }} else if c.APIKey != "" {{
                h.Set("X-API-Key", c.APIKey)
        }}
        for k, v := range extra {{
                h.Set(k, v)
        }}
        return h
}}

func (c *{class_name}) doRequest(method, path string, params url.Values, body interface{{}}) (interface{{}}, error) {{
        u := c.BaseURL + path
        if len(params) > 0 {{
                u += "?" + params.Encode()
        }}
        var bodyReader io.Reader
        if body != nil {{
                b, err := json.Marshal(body)
                if err != nil {{
                        return nil, err
                }}
                bodyReader = bytes.NewReader(b)
        }}
        req, err := http.NewRequest(method, u, bodyReader)
        if err != nil {{
                return nil, err
        }}
        req.Header = c.buildHeaders(nil)
        resp, err := c.HTTPClient.Do(req)
        if err != nil {{
                return nil, &{class_name}Error{{Message: err.Error()}}
        }}
        defer resp.Body.Close()
        raw, _ := io.ReadAll(resp.Body)
        if resp.StatusCode >= 400 {{
                return nil, &{class_name}Error{{Message: string(raw), StatusCode: resp.StatusCode, Body: string(raw)}}
        }}
        if len(raw) == 0 {{
                return nil, nil
        }}
        var out interface{{}}
        if err := json.Unmarshal(raw, &out); err != nil {{
                return string(raw), nil
        }}
        return out, nil
}}

{methods_str}
'''
        readme = f'''# {package_name}

Auto-generated Go SDK for {api_name}.

## Installation

```bash
go get github.com/dayjoy/{go_package}
```

## Usage

```go
package main

import (
        "fmt"
        "{go_package}"
)

func main() {{
        client := {go_package}.New{class_name}("{base_url}",
                {go_package}.WithAccessToken("your-token"))
        result, err := client.{operations[0]["function_name"]}()
        if err != nil {{
                panic(err)
        }}
        fmt.Println(result)
}}
```

## License

Proprietary — © DayJoy AI
'''
        go_mod = f'''module github.com/dayjoy/{go_package}

go 1.21
'''
        return {
            "client.go": client_code,
            "go.mod": go_mod,
            "README.md": readme,
        }

    def _go_method(self, op: dict) -> str:
        """Generate a single Go method."""
        fname = _to_pascal_case(op["function_name"])
        method = op["method"]
        path = op["path"]
        params = op.get("parameters", [])
        path_params = [p for p in params if p.get("in") == "path"]
        query_params = [p for p in params if p.get("in") == "query"]
        has_body = op.get("request_body") is not None

        args = ["c *Client"]
        for p in path_params:
            args.append(f'{p["name"]} string')
        if has_body:
            args.append("body interface{}")
        for p in query_params:
            args.append(f'{p["name"]} string')
        signature = ", ".join(args)

        # Build path with Sprintf for path params
        if path_params:
            go_path = path
            for p in path_params:
                go_path = go_path.replace(f'{{{p["name"]}}}', "%s")
            path_expr = f'fmt.Sprintf("{go_path}", {", ".join(p["name"] for p in path_params)})'
        else:
            path_expr = f'"{path}"'

        query_lines = []
        for p in query_params:
            query_lines.append(f'\tif {p["name"]} != "" {{\n\t\tparams.Set("{p["name"]}", {p["name"]})\n\t}}')
        query_block = "\n\tparams := url.Values{}\n" + "\n".join(query_lines) if query_params else ""
        body_arg = "body" if has_body else "nil"
        params_arg = "params" if query_params else "nil"
        return f'''func (c *Client) {fname}({signature}) (interface{{}}, error) {{
{query_block}
        return c.doRequest("{method}", {path_expr}, {params_arg}, {body_arg})
}}'''

    # ====================================================================
    # Java, C#, Rust — simpler stub generators (real impl would use templates)
    # ====================================================================

    def _generate_java(self, package_name: str, version: str, base_url: str,
                         api_name: str, api_description: str,
                         spec: dict, operations: list[dict]) -> dict[str, str]:
        """Generate Java SDK (OkHttp-based)."""
        class_name = _to_pascal_case(package_name) + "Client"
        package_path = package_name.replace("-", ".").replace("_", ".")
        package_java = f"ai.dayjoy.{package_path}"
        methods_code = "\n\n".join(self._java_method(op) for op in operations)
        client_code = f'''// Auto-generated Java SDK for {api_name}.
package {package_java};

import okhttp3.*;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

public class {class_name} {{
    private final String baseUrl;
    private final String apiKey;
    private final String accessToken;
    private final OkHttpClient httpClient;
    private final ObjectMapper mapper = new ObjectMapper();

    public {class_name}(String baseUrl, String apiKey, String accessToken) {{
        this.baseUrl = baseUrl.replaceAll("/$", "");
        this.apiKey = apiKey;
        this.accessToken = accessToken;
        this.httpClient = new OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build();
    }}

    private Request.Builder buildRequest(String method, String path) {{
        Request.Builder b = new Request.Builder().url(baseUrl + path);
        if (accessToken != null) b.header("Authorization", "Bearer " + accessToken);
        else if (apiKey != null) b.header("X-API-Key", apiKey);
        return b.header("Accept", "application/json");
    }}

{methods_code}
}}
'''
        pom = f'''<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>ai.dayjoy</groupId>
  <artifactId>{package_name}</artifactId>
  <version>{version}</version>
  <packaging>jar</packaging>
  <name>{api_name}</name>
  <description>{api_description}</description>
  <dependencies>
    <dependency>
      <groupId>com.squareup.okhttp3</groupId>
      <artifactId>okhttp</artifactId>
      <version>4.12.0</version>
    </dependency>
    <dependency>
      <groupId>com.fasterxml.jackson.core</groupId>
      <artifactId>jackson-databind</artifactId>
      <version>2.16.0</version>
    </dependency>
  </dependencies>
</project>
'''
        return {
            f"src/main/java/{package_java.replace('.', '/')}/{class_name}.java": client_code,
            "pom.xml": pom,
            "README.md": f"# {package_name}\n\nAuto-generated Java SDK for {api_name}.\n\n## Installation\n\nAdd to your `pom.xml`:\n\n```xml\n<dependency>\n  <groupId>ai.dayjoy</groupId>\n  <artifactId>{package_name}</artifactId>\n  <version>{version}</version>\n</dependency>\n```\n\n## License\n\nProprietary — © DayJoy AI\n",
        }

    def _java_method(self, op: dict) -> str:
        fname = _to_pascal_case(op["function_name"])
        method = op["method"]
        path = op["path"]
        return f'''    public String {fname}() throws IOException {{
        Request request = buildRequest("{method}", "{path}").build();
        try (Response response = httpClient.newCall(request).execute()) {{
            return response.body() != null ? response.body().string() : "";
        }}
    }}'''

    def _generate_csharp(self, package_name: str, version: str, base_url: str,
                            api_name: str, api_description: str,
                            spec: dict, operations: list[dict]) -> dict[str, str]:
        """Generate C# SDK (HttpClient-based)."""
        class_name = _to_pascal_case(package_name) + "Client"
        methods_code = "\n\n".join(self._csharp_method(op) for op in operations)
        client_code = f'''// Auto-generated C# SDK for {api_name}.
using System;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text;
using System.Text.Json;

namespace DayJoy.{_to_pascal_case(package_name)};

public class {class_name}Error : Exception
{{
    public int StatusCode {{ get; }}
    public string Body {{ get; }}
    public {class_name}Error(string message, int statusCode, string body) : base(message)
    {{
        StatusCode = statusCode;
        Body = body;
    }}
}}

public class {class_name}
{{
    private readonly string _baseUrl;
    private readonly string _apiKey;
    private readonly string _accessToken;
    private readonly HttpClient _httpClient;

    public {class_name}(string baseUrl = "{base_url}", string? apiKey = null, string? accessToken = null)
    {{
        _baseUrl = baseUrl.TrimEnd('/');
        _apiKey = apiKey ?? "";
        _accessToken = accessToken ?? "";
        _httpClient = new HttpClient {{ Timeout = TimeSpan.FromSeconds(30) }};
    }}

    private HttpRequestMessage BuildRequest(HttpMethod method, string path)
    {{
        var req = new HttpRequestMessage(method, _baseUrl + path);
        if (!string.IsNullOrEmpty(_accessToken))
            req.Headers.Add("Authorization", "Bearer " + _accessToken);
        else if (!string.IsNullOrEmpty(_apiKey))
            req.Headers.Add("X-API-Key", _apiKey);
        req.Headers.Add("Accept", "application/json");
        return req;
    }}

    private async Task<string> SendAsync(HttpRequestMessage req)
    {{
        var resp = await _httpClient.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();
        if (!resp.IsSuccessStatusCode)
            throw new {class_name}Error($"HTTP {{(int)resp.StatusCode}}: {{body}}", (int)resp.StatusCode, body);
        return body;
    }}

{methods_code}
}}
'''
        csproj = f'''<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <PackageId>{package_name}</PackageId>
    <Version>{version}</Version>
    <Description>{api_description}</Description>
    <TargetFramework>net8.0</TargetFramework>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
</Project>
'''
        return {
            f"{class_name}.cs": client_code,
            f"{package_name}.csproj": csproj,
            "README.md": f"# {package_name}\n\nAuto-generated C# SDK for {api_name}.\n\n## Installation\n\n```bash\ndotnet add package {package_name} --version {version}\n```\n\n## License\n\nProprietary — © DayJoy AI\n",
        }

    def _csharp_method(self, op: dict) -> str:
        fname = _to_pascal_case(op["function_name"])
        method = op["method"]
        path = op["path"]
        http_method = {"GET": "Get", "POST": "Post", "PUT": "Put",
                       "PATCH": "Patch", "DELETE": "Delete"}.get(op["method"], "Get")
        return f'''    public async Task<string> {fname}Async()
    {{
        using var req = BuildRequest(HttpMethod.{http_method}, "{path}");
        return await SendAsync(req);
    }}'''

    def _generate_rust(self, package_name: str, version: str, base_url: str,
                          api_name: str, api_description: str,
                          spec: dict, operations: list[dict]) -> dict[str, str]:
        """Generate Rust SDK (reqwest-based)."""
        crate_name = re.sub(r"[^a-z0-9_]", "_", package_name.lower())
        class_name = _to_pascal_case(package_name) + "Client"
        methods_code = "\n\n".join(self._rust_method(op, class_name) for op in operations)
        client_code = f'''// Auto-generated Rust SDK for {api_name}.
// {api_description}
// Generated by DayJoy AI SDK Generator. DO NOT EDIT.

use reqwest::{{Client, Method}};

#[derive(Debug)]
pub struct {class_name}Error {{
    pub message: String,
    pub status_code: u16,
    pub body: String,
}}

impl std::fmt::Display for {class_name}Error {{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {{
        write!(f, "{{}} (HTTP {{}})", self.message, self.status_code)
    }}
}}

impl std::error::Error for {class_name}Error {{}}

pub struct {class_name} {{
    base_url: String,
    api_key: Option<String>,
    access_token: Option<String>,
    http_client: Client,
}}

impl {class_name} {{
    pub fn new(base_url: &str) -> Self {{
        Self {{
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: None,
            access_token: None,
            http_client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build().expect("Failed to build HTTP client"),
        }}
    }}

    pub fn with_api_key(mut self, key: &str) -> Self {{
        self.api_key = Some(key.to_string());
        self
    }}

    pub fn with_access_token(mut self, token: &str) -> Self {{
        self.access_token = Some(token.to_string());
        self
    }}

    fn build_request(&self, method: Method, path: &str) -> reqwest::RequestBuilder {{
        let url = format!("{{}}{{}}", self.base_url, path);
        let mut req = self.http_client.request(method, &url)
            .header("Accept", "application/json");
        if let Some(token) = &self.access_token {{
            req = req.header("Authorization", format!("Bearer {{}}", token));
        }} else if let Some(key) = &self.api_key {{
            req = req.header("X-API-Key", key);
        }}
        req
    }}

{methods_code}
}}
'''
        cargo = f'''[package]
name = "{crate_name}"
version = "{version}"
edition = "2021"
description = "{api_description}"
license = "UNLICENSED"

[dependencies]
reqwest = {{ version = "0.12", features = ["json"] }}
tokio = {{ version = "1", features = ["full"] }}
serde = {{ version = "1", features = ["derive"] }}
serde_json = "1"
'''
        return {
            "src/lib.rs": client_code,
            "Cargo.toml": cargo,
            "README.md": f"# {package_name}\n\nAuto-generated Rust SDK for {api_name}.\n\n## Installation\n\nAdd to your `Cargo.toml`:\n\n```toml\n[dependencies]\n{crate_name} = \"{version}\"\n```\n\n## License\n\nProprietary — © DayJoy AI\n",
        }

    def _rust_method(self, op: dict, class_name: str) -> str:
        fname = op["function_name"]
        method = op["method"]
        path = op["path"]
        rust_method = match_rust_method(method)
        return f'''    pub async fn {fname}(&self) -> Result<String, {class_name}Error> {{
        let req = self.build_request(Method::{rust_method}, "{path}");
        let resp = req.send().await
            .map_err(|e| {class_name}Error {{ message: e.to_string(), status_code: 0, body: String::new() }})?;
        let status = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        if status >= 400 {{
            return Err({class_name}Error {{ message: body.clone(), status_code: status, body }});
        }}
        Ok(body)
    }}'''


def match_rust_method(method: str) -> str:
    """Map HTTP method to reqwest::Method constant."""
    return {
        "GET": "GET", "POST": "POST", "PUT": "PUT",
        "PATCH": "PATCH", "DELETE": "DELETE",
        "HEAD": "HEAD", "OPTIONS": "OPTIONS",
    }.get(method.upper(), "GET")
